/**
 * Web Worker that runs the entire stem separation pipeline off the main
 * thread: model download (with caching), ONNX Runtime session creation
 * (WebGPU with WASM fallback), and the chunked overlap-add inference loop.
 */
import * as ort from "onnxruntime-web";

import {
  CHANNEL_COUNT,
  MODEL_INPUT_NAME,
  MODEL_OUTPUT_NAME,
  MODEL_URL,
  OVERLAP_SAMPLES,
  SEGMENT_SAMPLES,
  STEM_NAMES,
  STRIDE_SAMPLES,
  WEIGHT_EPSILON,
} from "../config/constants";
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
  (
    self.postMessage as (m: WorkerResponse, t?: Transferable[]) => void
  )(message, transfer);
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

let sessionPromise: Promise<{
  session: ort.InferenceSession;
  backend: InferenceBackend;
}> | null = null;

/**
 * Creates the inference session exactly once, preferring WebGPU and falling
 * back to (multi-threaded) WASM on the CPU. Trying the providers separately
 * lets us report which backend actually ended up running.
 */
function getSession() {
  sessionPromise ??= (async () => {
    configureRuntimeEnvironment();

    const modelBytes = await fetchModelWithCache(
      MODEL_URL,
      (loadedBytes, totalBytes) =>
        post({ type: "model-download-progress", loadedBytes, totalBytes }),
    );

    const supportsWebGpu = "gpu" in self.navigator;
    if (supportsWebGpu) {
      try {
        const session = await ort.InferenceSession.create(modelBytes, {
          executionProviders: ["webgpu"],
        });
        return { session, backend: "webgpu" as const };
      } catch {
        // Fall through to WASM: WebGPU may be present but unusable
        // (unsupported ops, driver issues, ...).
      }
    }

    const session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ["wasm"],
    });
    return { session, backend: "wasm" as const };
  })();
  return sessionPromise;
}

async function separate(left: Float32Array, right: Float32Array) {
  const { session, backend } = await getSession();
  post({ type: "backend-selected", backend });

  const totalSamples = left.length;
  const totalChunks = countChunks(totalSamples, STRIDE_SAMPLES);
  const window = makeTransitionWindow(SEGMENT_SAMPLES, OVERLAP_SAMPLES);
  const channels = [left, right];

  // Accumulators for the weighted overlap-add blend.
  const stemOutputs = STEM_NAMES.map(() =>
    channels.map(() => new Float32Array(totalSamples)),
  );
  const weights = new Float32Array(totalSamples);

  const chunkBuffer = new Float32Array(CHANNEL_COUNT * SEGMENT_SAMPLES);

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

    // Output tensor shape: (1, stems, channels, samples), flattened.
    const stems = results[MODEL_OUTPUT_NAME].data as Float32Array;

    for (let stemIndex = 0; stemIndex < STEM_NAMES.length; stemIndex++) {
      for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
        const sourceOffset =
          (stemIndex * CHANNEL_COUNT + channel) * SEGMENT_SAMPLES;
        const target = stemOutputs[stemIndex][channel];
        for (let sample = 0; sample < chunkLength; sample++) {
          target[start + sample] +=
            stems[sourceOffset + sample] * window[sample];
        }
      }
    }
    for (let sample = 0; sample < chunkLength; sample++) {
      weights[start + sample] += window[sample];
    }

    post({
      type: "separation-progress",
      completedChunks: chunkIndex + 1,
      totalChunks,
    });
  }

  for (const channelPair of stemOutputs) {
    for (const samples of channelPair) {
      normalizeByWeights(samples, weights, WEIGHT_EPSILON);
    }
  }

  const separatedStems: SeparatedStem[] = STEM_NAMES.map(
    (name, stemIndex) => ({
      name,
      left: stemOutputs[stemIndex][0],
      right: stemOutputs[stemIndex][1],
    }),
  );

  post(
    { type: "done", stems: separatedStems },
    separatedStems.flatMap((stem) => [stem.left.buffer, stem.right.buffer]),
  );
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "separate") {
    separate(request.left, request.right).catch((error: unknown) => {
      post({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
};
