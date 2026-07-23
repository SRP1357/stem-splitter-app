import { useEffect, useRef } from "react";

import type { LogEntry, LogTone } from "../hooks/useStemSeparation";

interface ActivityLogProps {
  entries: LogEntry[];
  /** Shows a blinking cursor on the last line while the pipeline works. */
  busy: boolean;
}

const TONE_CLASSES: Record<LogTone, string> = {
  info: "text-slate-600",
  warn: "text-amber-700",
  error: "text-red-700",
};

/**
 * Terminal-style activity strip: new entries appear at the bottom and push
 * older ones up out of view. Not a scrollable element by design — it is a
 * live ticker, not a history browser.
 */
export function ActivityLog({ entries, busy }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  return (
    <div className="border border-slate-300 bg-slate-50/70">
      <div className="flex items-center justify-between border-b border-slate-300 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Activity
        </span>
        {busy && (
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse bg-emerald-500"
          />
        )}
      </div>
      <div
        ref={scrollRef}
        aria-live="polite"
        className="h-28 overflow-hidden px-3 py-2"
      >
        <div className="flex min-h-full flex-col justify-end">
          {entries.map((entry) => (
            <p
              key={entry.id}
              className={`animate-log-in truncate text-xs leading-5 ${TONE_CLASSES[entry.tone]}`}
            >
              <span className="text-slate-400">[{entry.time}]</span>{" "}
              {entry.text}
              {busy && entry.id === entries[entries.length - 1].id && (
                <span className="animate-pulse text-slate-700">▌</span>
              )}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
