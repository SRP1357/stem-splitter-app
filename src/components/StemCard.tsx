import type { Ref } from "react";

import type { StemName } from "../config/constants";
import { STEM_THEMES } from "../config/theme";
import type { StemResult } from "../hooks/useStemSeparation";

interface StemCardProps {
  ref: Ref<HTMLDivElement>;
  stem: StemName;
  /** 0..1 separation progress for this stem (1 once its audio is ready). */
  progress: number;
  result: StemResult | null;
}

/**
 * One output node of the split-flow diagram: a status box showing the
 * stem's separation progress. Playback and downloads live in the track
 * deck below the diagram (StemTracks).
 */
export function StemCard({ ref, stem, progress, result }: StemCardProps) {
  const theme = STEM_THEMES[stem];
  const isActive = progress > 0 && !result;

  return (
    <div
      ref={ref}
      className="border bg-slate-50 p-3 transition-all duration-300"
      style={{
        borderColor: result || isActive ? theme.color : "#cbd5e1", // slate-300
        backgroundColor: result ? theme.tint : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-800">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2"
            style={{ backgroundColor: theme.color }}
          />
          {stem}
        </span>
        {isActive && (
          <span className="text-[11px] tabular-nums text-slate-400">
            {Math.round(progress * 100)}%
          </span>
        )}
        {result && (
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: theme.color }}
          >
            Ready
          </span>
        )}
      </div>
    </div>
  );
}
