/**
 * Central configuration for the stem separation pipeline.
 *
 * The models are the official HT-Demucs v4 family, exported to ONNX by the
 * demucs-onnx project and mirrored as GitHub Release assets of this
 * repository so the site has no third-party runtime dependencies.
 */

/** All model binaries are attached to this GitHub Release of this repo. */
const MODEL_RELEASE_BASE_URL =
  "https://github.com/SRP1357/stem-splitter-app/releases/download/models-v1";

/** Cache API bucket used to persist downloaded models across visits. */
export const MODEL_CACHE_NAME = "stem-splitter-model-cache-v1";

/** Demucs operates exclusively on 44.1 kHz stereo audio. */
export const MODEL_SAMPLE_RATE = 44100;
export const CHANNEL_COUNT = 2;

/**
 * The exported ONNX graphs have their segment length baked in: they accept
 * exactly 7.8 seconds of audio per inference call (input shape
 * [1, 2, 343980]). Longer tracks are processed with overlapping windows that
 * are then blended back together (overlap-add).
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

/** Tensor names shared by every exported ONNX graph in the family. */
export const MODEL_INPUT_NAME = "mix";
export const MODEL_OUTPUT_NAME = "stems";

/** Guards against division by ~zero when normalising overlap-add weights. */
export const WEIGHT_EPSILON = 1e-8;

export const FOUR_STEM_NAMES = ["drums", "bass", "other", "vocals"] as const;
export const SIX_STEM_NAMES = [
  "drums",
  "bass",
  "other",
  "vocals",
  "guitar",
  "piano",
] as const;
export type StemName = (typeof SIX_STEM_NAMES)[number];

export type ModelVariantId = "htdemucs" | "htdemucs_ft" | "htdemucs_6s";

/** One ONNX file within a variant and the output rows it contributes. */
export interface ModelFileSpec {
  url: string;
  /**
   * Indices into the file's output tensor rows that this file contributes to
   * the final result. The fine-tuned specialists emit all four rows but only
   * their own specialty row is meaningful, so each contributes exactly one.
   * Row order always matches the variant's `stemNames` order.
   */
  outputRows: number[];
}

export interface ModelVariantSpec {
  id: ModelVariantId;
  label: string;
  description: string;
  /** Ordered stem names; indices correspond to output tensor rows. */
  stemNames: readonly StemName[];
  files: ModelFileSpec[];
  /** Approximate total download, for display before the user commits. */
  approximateDownloadMb: number;
}

const ALL_FOUR_ROWS = [0, 1, 2, 3];

export const MODEL_VARIANTS: Record<ModelVariantId, ModelVariantSpec> = {
  htdemucs: {
    id: "htdemucs",
    label: "Standard",
    description: "4 stems, single model — the fastest option.",
    stemNames: FOUR_STEM_NAMES,
    files: [
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_fp16weights.onnx`,
        outputRows: ALL_FOUR_ROWS,
      },
    ],
    approximateDownloadMb: 158,
  },
  htdemucs_ft: {
    id: "htdemucs_ft",
    label: "Highest quality",
    description:
      "4 stems from four fine-tuned specialist models — best results, roughly 4× slower.",
    stemNames: FOUR_STEM_NAMES,
    files: [
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_ft_drums_fp16weights.onnx`,
        outputRows: [0],
      },
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_ft_bass_fp16weights.onnx`,
        outputRows: [1],
      },
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_ft_other_fp16weights.onnx`,
        outputRows: [2],
      },
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_ft_vocals_fp16weights.onnx`,
        outputRows: [3],
      },
    ],
    approximateDownloadMb: 632,
  },
  htdemucs_6s: {
    id: "htdemucs_6s",
    label: "6 stems",
    description:
      "Adds guitar and piano stems — experimental model, quality varies.",
    stemNames: SIX_STEM_NAMES,
    files: [
      {
        url: `${MODEL_RELEASE_BASE_URL}/htdemucs_6s_fp16weights.onnx`,
        outputRows: [0, 1, 2, 3, 4, 5],
      },
    ],
    approximateDownloadMb: 130,
  },
};

export const DEFAULT_MODEL_VARIANT_ID: ModelVariantId = "htdemucs";
