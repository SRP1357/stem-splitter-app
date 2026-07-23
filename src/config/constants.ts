/**
 * Central configuration for the stem separation pipeline.
 *
 * The model is HT-Demucs v4 (`htdemucs`), exported to ONNX by the demucs-onnx
 * project and mirrored as a GitHub Release asset of this repository so the
 * site has no third-party runtime dependencies.
 */

/** Where the browser downloads the ONNX model from (a Release of this repo). */
export const MODEL_URL =
  "https://github.com/SRP1357/stem-splitter-app/releases/download/models-v1/htdemucs_fp16weights.onnx";

/** Cache API bucket used to persist the model across visits. */
export const MODEL_CACHE_NAME = "stem-splitter-model-cache-v1";

/** Demucs operates exclusively on 44.1 kHz stereo audio. */
export const MODEL_SAMPLE_RATE = 44100;
export const CHANNEL_COUNT = 2;

/**
 * The exported ONNX graph has its segment length baked in: it accepts exactly
 * 7.8 seconds of audio per inference call (input tensor shape [1, 2, 343980]).
 * Longer tracks are processed with overlapping windows that are then blended
 * back together (overlap-add).
 */
export const SEGMENT_SECONDS = 7.8;
export const SEGMENT_SAMPLES = Math.round(SEGMENT_SECONDS * MODEL_SAMPLE_RATE); // 343,980

/**
 * Consecutive segments overlap by a quarter of a segment, and a triangular
 * cross-fade window blends them. These values mirror the reference
 * implementation in the demucs-onnx browser documentation.
 */
export const OVERLAP_SAMPLES = Math.floor(SEGMENT_SAMPLES / 4);
export const STRIDE_SAMPLES = SEGMENT_SAMPLES - OVERLAP_SAMPLES;

/** Tensor names in the exported ONNX graph. */
export const MODEL_INPUT_NAME = "mix";
export const MODEL_OUTPUT_NAME = "stems";

/** Output rows of the model, in the order the graph emits them. */
export const STEM_NAMES = ["drums", "bass", "other", "vocals"] as const;
export type StemName = (typeof STEM_NAMES)[number];

/** Guards against division by ~zero when normalising overlap-add weights. */
export const WEIGHT_EPSILON = 1e-8;
