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
async function createSession(modelBytes: Uint8Array): Promise<CreatedSession> {
  const supportsWebGpu = "gpu" in self.navigator && !webGpuKnownUnusable;
  if (supportsWebGpu) {
    try {
      const session = await ort.InferenceSession.create(modelBytes, {
        ...SESSION_OPTIONS,
        executionProviders: ["webgpu"],
      });
      return { session, backend: "webgpu" };
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

async function separate(
  modelId: ModelVariantId,
  left: Float32Array,
  right: Float32Array,
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

  let backendReported = false;
  let completedUnits = 0;

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

    const { session, backend } = await createSession(modelBytes);
    if (!backendReported) {
      backendReported = true;
      post({ type: "backend-selected", backend });
    }

    // Accumulators only for the rows this file contributes.
    const accumulators = file.outputRows.map(() =>
      channels.map(() => new Float32Array(totalSamples)),
    );

    try {
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
        const results = await session.run({ [MODEL_INPUT_NAME]: inputTensor });

        // Output tensor shape: (1, rows, channels, samples), flattened.
        const stems = results[MODEL_OUTPUT_NAME].data as Float32Array;

        for (let rowSlot = 0; rowSlot < file.outputRows.length; rowSlot++) {
          const row = file.outputRows[rowSlot];
          for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
            const sourceOffset =
              (row * CHANNEL_COUNT + channel) * SEGMENT_SAMPLES;
            const target = accumulators[rowSlot][channel];
            for (let sample = 0; sample < chunkLength; sample++) {
              target[start + sample] +=
                stems[sourceOffset + sample] * window[sample];
            }
          }
        }

        completedUnits++;
        post({
          type: "separation-progress",
          completedUnits,
          totalUnits,
          passIndex: fileIndex,
          passCount: variant.files.length,
        });
      }
    } finally {
      await session.release();
    }

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
    separate(request.modelId, request.left, request.right).catch(
      (error: unknown) => {
        post({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }
};
