import type { ModelVariantId, StemName } from "../config/constants";

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
  modelId: ModelVariantId;
  left: Float32Array;
  right: Float32Array;
};

/** Messages the separation worker sends back to the main thread. */
export type WorkerResponse =
  | {
      type: "model-download-progress";
      fileIndex: number;
      fileCount: number;
      loadedBytes: number;
      totalBytes: number;
    }
  | { type: "backend-selected"; backend: InferenceBackend }
  | {
      type: "separation-progress";
      completedUnits: number;
      totalUnits: number;
      passIndex: number;
      passCount: number;
    }
  /** Emitted as soon as one model file's stems are fully separated. */
  | { type: "stems-ready"; stems: SeparatedStem[] }
  | { type: "done" }
  | { type: "error"; message: string };
