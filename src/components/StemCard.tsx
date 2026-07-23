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
  sourceFileName: string | null;
}

/**
 * One output node of the split-flow diagram. Starts as a quiet placeholder,
 * shows a percentage while its stem is being separated, and becomes a
 * player + download once the audio is ready.
 */
export function StemCard({
  ref,
  stem,
  progress,
  result,
  sourceFileName,
}: StemCardProps) {
  const theme = STEM_THEMES[stem];
  const baseName = sourceFileName?.replace(/\.[^.]+$/, "") ?? "track";
  const isActive = progress > 0 && !result;

  return (
    <div
      ref={ref}
      className="rounded-xl border bg-white p-3 shadow-sm transition-all duration-300"
      style={{
        borderColor: result || isActive ? theme.color : "#e2e8f0", // slate-200
        backgroundColor: result ? theme.tint : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium capitalize text-slate-800">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: theme.color }}
          />
          {stem}
        </span>
        {isActive && (
          <span className="text-xs tabular-nums text-slate-400">
            {Math.round(progress * 100)}%
          </span>
        )}
        {result && (
          <a
            href={result.wavUrl}
            download={`${baseName} - ${stem}.wav`}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: theme.color }}
          >
            Download
          </a>
        )}
      </div>
      {result && (
        <audio
          controls
          src={result.wavUrl}
          className="mt-2 h-9 w-full"
          preload="metadata"
        />
      )}
    </div>
  );
}
