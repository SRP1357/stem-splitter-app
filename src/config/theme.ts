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
export const IDLE_PATH_COLOR = "#cbd5e1"; // slate-300
