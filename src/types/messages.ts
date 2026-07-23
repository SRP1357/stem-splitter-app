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
  /** Skip the WebGPU attempt entirely (set after a GPU device loss). */
  forceWasm: boolean;
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
  /**
   * The GPU device was lost mid-run (e.g. Windows' watchdog reset). The
   * WASM runtime inside this worker is left wedged — any further run throws
   * "session already started" — so the main thread must terminate this
   * worker and retry in a fresh one with forceWasm.
   */
  | { type: "webgpu-device-lost" }
  | { type: "error"; message: string };

/** Request to the MP3 encoder worker: 16-bit stereo PCM at the model rate. */
export interface Mp3Request {
  requestId: number;
  left: Int16Array;
  right: Int16Array;
}

/** Reply from the MP3 encoder worker. */
export interface Mp3Response {
  requestId: number;
  blob?: Blob;
  error?: string;
}
