import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { MODEL_VARIANTS } from "../config/constants";
import type { ModelVariantId, StemName } from "../config/constants";
import { IDLE_PATH_COLOR, STEM_THEMES } from "../config/theme";
import type { SeparationState } from "../hooks/useStemSeparation";
import { FileDropZone } from "./FileDropZone";
import { StemCard } from "./StemCard";

interface SplitFlowProps {
  state: SeparationState;
  /** Variant selected in the picker; used for placeholders before a run. */
  selectedModel: ModelVariantId;
  disabled: boolean;
  onFileSelected: (file: File) => void;
}

/** Geometry of one source→stem connector, in container pixel coordinates. */
interface Connector {
  stem: StemName;
  path: string;
}

/** Fraction of the path length covered by one dash and one gap. */
const DASH_FRACTION = 0.03;
const GAP_FRACTION = 0.018;

/**
 * Builds a stroke-dasharray that paints a dashed pattern over exactly the
 * first `progress` fraction of a pathLength=1 path, leaving the rest empty.
 */
function dashArrayForProgress(progress: number): string {
  const parts: number[] = [];
  let remaining = Math.max(0, Math.min(1, progress));
  while (remaining > 0) {
    const dash = Math.min(DASH_FRACTION, remaining);
    parts.push(dash);
    remaining -= dash;
    const gap = Math.min(GAP_FRACTION, remaining);
    if (gap > 0) {
      parts.push(gap);
      remaining -= gap;
    }
  }
  // Terminate with a gap longer than the path so nothing repeats past the
  // covered fraction.
  if (parts.length % 2 === 1) parts.push(2);
  else parts.push(0, 2);
  return parts.map((value) => value.toFixed(4)).join(" ");
}

/**
 * Per-stem separation progress (0..1). Model files run sequentially and
 * each contributes specific stems, so a stem is done once its file's pass
 * is done, filling while its file is the active pass.
 */
function stemProgress(state: SeparationState, stem: StemName): number {
  if (state.stems.some((result) => result.name === stem)) return 1;
  if (state.phase !== "separating" && state.phase !== "done") return 0;

  const variant = state.modelId ? MODEL_VARIANTS[state.modelId] : null;
  if (!variant) return 0;
  const row = variant.stemNames.indexOf(stem);
  const fileIndex = variant.files.findIndex((file) =>
    file.outputRows.includes(row),
  );
  if (fileIndex === -1) return 0;

  const activeIndex = state.currentFile - 1;
  if (fileIndex < activeIndex) return 1;
  if (fileIndex > activeIndex) return 0;
  // Overall progress is uniform across files; recover this file's fraction.
  return Math.max(0, Math.min(1, state.progress * state.fileCount - fileIndex));
}

/**
 * The heart of the UI: the source (drop zone) on the left, one card per
 * stem on the right, and curved connectors that fill with each stem's color
 * as separation progresses.
 */
export function SplitFlow({
  state,
  selectedModel,
  disabled,
  onFileSelected,
}: SplitFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const stemRefs = useRef(new Map<StemName, HTMLDivElement>());
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const stemNames = (
    state.modelId ? MODEL_VARIANTS[state.modelId] : MODEL_VARIANTS[selectedModel]
  ).stemNames;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const source = sourceRef.current;
    if (!container || !source) return;

    const containerBox = container.getBoundingClientRect();
    const sourceBox = source.getBoundingClientRect();
    const startX = sourceBox.right - containerBox.left;
    const startY = sourceBox.top + sourceBox.height / 2 - containerBox.top;

    const next: Connector[] = [];
    for (const stem of stemNames) {
      const node = stemRefs.current.get(stem);
      if (!node) continue;
      const box = node.getBoundingClientRect();
      const endX = box.left - containerBox.left;
      const endY = box.top + box.height / 2 - containerBox.top;
      const bend = (endX - startX) / 2;
      next.push({
        stem,
        path:
          `M ${startX} ${startY} ` +
          `C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
      });
    }
    setConnectors(next);
  }, [stemNames]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const isSeparating = state.phase === "separating";

  return (
    <div
      ref={containerRef}
      className="relative grid grid-cols-[1fr_5rem_1fr] items-center sm:grid-cols-[1fr_8rem_1.1fr]"
    >
      {/* Connectors live behind the cards. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {connectors.map(({ stem, path }) => {
          const progress = stemProgress(state, stem);
          const isDone = progress >= 1;
          const isActive = isSeparating && progress > 0 && !isDone;
          return (
            <g key={stem}>
              <path
                d={path}
                pathLength={1}
                fill="none"
                stroke={IDLE_PATH_COLOR}
                strokeWidth={1.5}
                strokeDasharray={`${DASH_FRACTION} ${GAP_FRACTION}`}
              />
              {progress > 0 && (
                <path
                  d={path}
                  pathLength={1}
                  fill="none"
                  stroke={STEM_THEMES[stem].color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={
                    isDone ? undefined : dashArrayForProgress(progress)
                  }
                  className={isActive ? "animate-path-march" : undefined}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div ref={sourceRef}>
        <FileDropZone
          disabled={disabled}
          onFileSelected={onFileSelected}
          state={state}
        />
      </div>

      {/* Middle column is reserved for the connectors. */}
      <div />

      <div className="flex flex-col gap-3 py-2">
        {stemNames.map((stem) => (
          <StemCard
            key={stem}
            ref={(node) => {
              if (node) stemRefs.current.set(stem, node);
              else stemRefs.current.delete(stem);
            }}
            stem={stem}
            progress={stemProgress(state, stem)}
            result={state.stems.find((result) => result.name === stem) ?? null}
            sourceFileName={state.fileName}
          />
        ))}
      </div>
    </div>
  );
}
