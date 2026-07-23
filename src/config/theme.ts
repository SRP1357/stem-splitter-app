import type { StemName } from "./constants";

/**
 * Visual identity for each stem, used by the split-flow diagram for path
 * strokes, node accents and badges. Kept separate from constants.ts, which
 * is pipeline configuration.
 */
export interface StemTheme {
  /** Path stroke / accent color (hex, works on the light background). */
  color: string;
  /** Very light tint used as the finished card's background wash. */
  tint: string;
}

export const STEM_THEMES: Record<StemName, StemTheme> = {
  drums: { color: "#f59e0b", tint: "#fffbeb" }, // amber
  bass: { color: "#8b5cf6", tint: "#f5f3ff" }, // violet
  other: { color: "#10b981", tint: "#ecfdf5" }, // emerald
  vocals: { color: "#0ea5e9", tint: "#f0f9ff" }, // sky
  guitar: { color: "#f43f5e", tint: "#fff1f2" }, // rose
  piano: { color: "#ec4899", tint: "#fdf2f8" }, // pink
};

/** Neutral stroke for paths that have not received any progress yet. */
export const IDLE_PATH_COLOR = "#94a3b8"; // slate-400

/** Resolution of the precomputed waveform (bars per track lane). */
export const WAVEFORM_BUCKETS = 600;

/** Waveform bar color for the not-yet-played portion of a track. */
export const WAVEFORM_IDLE_COLOR = "#cbd5e1"; // slate-300

/**
 * Hex alpha suffix for the unplayed portion of a finished waveform: the
 * stem's color at ~35% opacity, so the played portion clearly stands out.
 */
export const WAVEFORM_UNPLAYED_ALPHA = "59";
