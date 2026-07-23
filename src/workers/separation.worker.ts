/**
 * Web Worker that runs the entire stem separation pipeline off the main
 * thread: model download (with caching), ONNX Runtime session creation
 * (WebGPU with WASM fallback), and the chunked overlap-add inference loop.
 *
 * A model variant may consist of several ONNX files (the fine-tuned bag is
 * four specialist models). Files are processed one at a time — only one
 * session is alive at once, which keeps peak memory bounded — and each
 * file's stems are posted back as soon as they are finished.
 */
import * as ort from "onnxruntime-web";

import {
  CHANNEL_COUNT,
  MODEL_INPUT_NAME,
  MODEL_OUTPUT_NAME,
  MODEL_VARIANTS,
  OVERLAP_SAMPLES,
  SEGMENT_SAMPLES,
  STRIDE_SAMPLES,
  WEIGHT_EPSILON,
} from "../config/constants";
import type { ModelVariantId } from "../config/constants";
import { fetchModelWithCache } from "../lib/model/fetchModel";
import {
  countChunks,
  makeTransitionWindow,
  normalizeByWeights,
} from "../lib/separation/overlapAdd";
import type {
  InferenceBackend,
  SeparatedStem,
  WorkerRequest,
  WorkerResponse,
} from "../types/messages";

/** Typed wrapper around the worker-scoped postMessage. */
function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  (self.postMessage as (m: WorkerResponse, t?: Transferable[]) => void)(
    message,
    transfer,
  );
}

const MAX_WASM_THREADS = 8;

function configureRuntimeEnvironment(): void {
  // The .wasm/.mjs runtime files are copied into public/ort/ at build time
  // (see scripts/copy-runtime-assets.mjs) so everything is served first-party.
  ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;

  // Multi-threading requires cross-origin isolation (SharedArrayBuffer).
  ort.env.wasm.numThreads = self.crossOriginIsolated
    ? Math.min(self.navigator.hardwareConcurrency || 1, MAX_WASM_THREADS)
    : 1;
}

interface CreatedSession {
  session: ort.InferenceSession;
  backend: InferenceBackend;
  /**
   * Rejects if the GPU device is lost mid-run (e.g. Windows' watchdog kills
   * a long-running dispatch with DXGI_ERROR_DEVICE_HUNG). Undefined for WASM.
   * Without this, a lost device leaves session.run() pending forever.
   */
  deviceLost?: Promise<never>;
}

/**
 * Remembers a failed WebGPU attempt so multi-file variants (the fine-tuned
 * bag creates four sessions) don't pay the failure cost repeatedly.
 */
let webGpuKnownUnusable = false;

/**
 * Graph optimization must stay off for these models. The Demucs exports
 * store their weights as fp16 initializers followed by Cast-to-fp32 nodes;
 * ONNX Runtime's optimizer (at every level, including "basic")
 * constant-folds those casts, materializing a second full-precision copy
 * of all weights inside the WASM heap. For a ~160 MB model that exhausts
 * the heap and session creation dies with "std::bad_alloc".
 */
const SESSION_OPTIONS: ort.InferenceSession.SessionOptions = {
  graphOptimizationLevel: "disabled",
};

/**
 * Creates a session preferring WebGPU, falling back to (multi-threaded)
 * WASM. Trying the providers separately lets us report which backend
 * actually ended up running.
 */
async function createSession(
  modelBytes: Uint8Array,
  allowWebGpu: boolean,
): Promise<CreatedSession> {
  const supportsWebGpu =
    allowWebGpu && "gpu" in self.navigator && !webGpuKnownUnusable;
  if (supportsWebGpu) {
    try {
      const session = await ort.InferenceSession.create(modelBytes, {
        ...SESSION_OPTIONS,
        executionProviders: ["webgpu"],
      });
      const device = await ort.env.webgpu.device;
      const deviceLost = device.lost.then((info): never => {
        throw new Error(`WebGPU device lost: ${info.message}`);
      });
      return { session, backend: "webgpu", deviceLost };
    } catch {
      // Fall through to WASM: WebGPU may be present but unusable
      // (unsupported ops, driver issues, ...).
      webGpuKnownUnusable = true;
    }
  }
  const session = await ort.InferenceSession.create(modelBytes, {
    ...SESSION_OPTIONS,
    executionProviders: ["wasm"],
  });
  return { session, backend: "wasm" };
}

/**
 * Precomputes the overlap-add weight profile for the whole track. It is
 * identical for every model file, so it is built once up front.
 */
function buildWeightProfile(
  totalSamples: number,
  totalChunks: number,
  window: Float32Array,
): Float32Array {
  const weights = new Float32Array(totalSamples);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * STRIDE_SAMPLES;
    const end = Math.min(start + SEGMENT_SAMPLES, totalSamples);
    for (let sample = 0; sample < end - start; sample++) {
      weights[start + sample] += window[sample];
    }
  }
  return weights;
}

/** Everything a single model file's inference pass needs. */
interface FilePassContext {
  channels: Float32Array[];
  totalSamples: number;
  totalChunks: number;
  totalUnits: number;
  window: Float32Array;
  chunkBuffer: Float32Array;
  fileIndex: number;
  fileCount: number;
  outputRows: number[];
}

/**
 * Runs the chunked overlap-add inference loop for one model file and returns
 * per-row/per-channel accumulators. Each run is raced against the GPU
 * device-lost promise so a hung device rejects instead of pending forever.
 */
async function runFilePass(
  { session, deviceLost }: CreatedSession,
  context: FilePassContext,
): Promise<Float32Array[][]> {
  const {
    channels,
    totalSamples,
    totalChunks,
    totalUnits,
    window,
    chunkBuffer,
    fileIndex,
    fileCount,
    outputRows,
  } = context;

  // Accumulators only for the rows this file contributes.
  const accumulators = outputRows.map(() =>
    channels.map(() => new Float32Array(totalSamples)),
  );

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * STRIDE_SAMPLES;
    const end = Math.min(start + SEGMENT_SAMPLES, totalSamples);
    const chunkLength = end - start;

    // Zero-pad the final partial chunk.
    chunkBuffer.fill(0);
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      chunkBuffer
        .subarray(
          channel * SEGMENT_SAMPLES,
          channel * SEGMENT_SAMPLES + chunkLength,
        )
        .set(channels[channel].subarray(start, end));
    }

    const inputTensor = new ort.Tensor("float32", chunkBuffer, [
      1,
      CHANNEL_COUNT,
      SEGMENT_SAMPLES,
    ]);
    const runPromise = session.run({ [MODEL_INPUT_NAME]: inputTensor });
    const results = deviceLost
      ? await Promise.race([runPromise, deviceLost])
      : await runPromise;

    // Output tensor shape: (1, rows, channels, samples), flattened.
    const stems = results[MODEL_OUTPUT_NAME].data as Float32Array;

    for (let rowSlot = 0; rowSlot < outputRows.length; rowSlot++) {
      const row = outputRows[rowSlot];
      for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
        const sourceOffset = (row * CHANNEL_COUNT + channel) * SEGMENT_SAMPLES;
        const target = accumulators[rowSlot][channel];
        for (let sample = 0; sample < chunkLength; sample++) {
          target[start + sample] +=
            stems[sourceOffset + sample] * window[sample];
        }
      }
    }

    post({
      type: "separation-progress",
      completedUnits: fileIndex * totalChunks + chunkIndex + 1,
      totalUnits,
      passIndex: fileIndex,
      passCount: fileCount,
    });
  }

  return accumulators;
}

async function separate(
  modelId: ModelVariantId,
  left: Float32Array,
  right: Float32Array,
  forceWasm: boolean,
): Promise<void> {
  const variant = MODEL_VARIANTS[modelId];
  configureRuntimeEnvironment();

  const totalSamples = left.length;
  const totalChunks = countChunks(totalSamples, STRIDE_SAMPLES);
  const totalUnits = variant.files.length * totalChunks;
  const window = makeTransitionWindow(SEGMENT_SAMPLES, OVERLAP_SAMPLES);
  const weights = buildWeightProfile(totalSamples, totalChunks, window);
  const channels = [left, right];
  const chunkBuffer = new Float32Array(CHANNEL_COUNT * SEGMENT_SAMPLES);

  let reportedBackend: InferenceBackend | null = null;
  const reportBackend = (backend: InferenceBackend): void => {
    if (backend !== reportedBackend) {
      reportedBackend = backend;
      post({ type: "backend-selected", backend });
    }
  };

  for (let fileIndex = 0; fileIndex < variant.files.length; fileIndex++) {
    const file = variant.files[fileIndex];

    const modelBytes = await fetchModelWithCache(
      file.fileName,
      (loadedBytes, totalBytes) =>
        post({
          type: "model-download-progress",
          fileIndex,
          fileCount: variant.files.length,
          loadedBytes,
          totalBytes,
        }),
    );

    const context: FilePassContext = {
      channels,
      totalSamples,
      totalChunks,
      totalUnits,
      window,
      chunkBuffer,
      fileIndex,
      fileCount: variant.files.length,
      outputRows: file.outputRows,
    };

    const created = await createSession(modelBytes, !forceWasm);
    reportBackend(created.backend);

    let accumulators: Float32Array[][];
    try {
      accumulators = await runFilePass(created, context);
    } catch (error) {
      if (created.backend !== "webgpu") throw error;
      // The GPU died mid-run (typically Windows' watchdog killing a
      // long-running dispatch). The WASM runtime in this worker is now
      // wedged — the hung GPU call never settles and blocks all further
      // runs — so recovery needs a brand-new worker. The main thread
      // handles that when it sees this message.
      post({ type: "webgpu-device-lost" });
      return;
    }
    await created.session.release();

    const finishedStems: SeparatedStem[] = file.outputRows.map(
      (row, rowSlot) => {
        for (const samples of accumulators[rowSlot]) {
          normalizeByWeights(samples, weights, WEIGHT_EPSILON);
        }
        return {
          name: variant.stemNames[row],
          left: accumulators[rowSlot][0],
          right: accumulators[rowSlot][1],
        };
      },
    );

    post(
      { type: "stems-ready", stems: finishedStems },
      finishedStems.flatMap((stem) => [stem.left.buffer, stem.right.buffer]),
    );
  }

  post({ type: "done" });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "separate") {
    separate(
      request.modelId,
      request.left,
      request.right,
      request.forceWasm,
    ).catch(
      (error: unknown) => {
        post({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }
};
