import type { StemName } from "../config/constants";

/** One separated stem: stereo PCM at the model sample rate. */
export interface SeparatedStem {
  name: StemName;
  left: Float32Array;
  right: Float32Array;
}

/** Which execution provider ONNX Runtime ended up using. */
export type InferenceBackend = "webgpu" | "wasm";

/** Messages the main thread sends to the separation worker. */
export type WorkerRequest = {
  type: "separate";
  left: Float32Array;
  right: Float32Array;
};

/** Messages the separation worker sends back to the main thread. */
export type WorkerResponse =
  | { type: "model-download-progress"; loadedBytes: number; totalBytes: number }
  | { type: "backend-selected"; backend: InferenceBackend }
  | { type: "separation-progress"; completedChunks: number; totalChunks: number }
  | { type: "done"; stems: SeparatedStem[] }
  | { type: "error"; message: string };
