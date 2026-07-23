import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";

import type { SeparationState } from "../hooks/useStemSeparation";

interface FileDropZoneProps {
  disabled: boolean;
  onFileSelected: (file: File) => void;
  state: SeparationState;
}

function statusLine(state: SeparationState): string | null {
  const filePosition =
    state.fileCount > 1 ? ` ${state.currentFile}/${state.fileCount}` : "";
  switch (state.phase) {
    case "decoding":
      return "Decoding audio…";
    case "downloading-model":
      return `Downloading model${filePosition} — ${Math.round(state.progress * 100)}% (one-time, cached afterwards)`;
    case "separating":
      return `Separating — ${Math.round(state.progress * 100)}%`;
    case "done":
      return "Done — drop another file to go again";
    default:
      return null;
  }
}

/**
 * The source node of the split-flow diagram: a drag-and-drop target and
 * click-to-browse picker that also displays the current run's status.
 */
export function FileDropZone({
  disabled,
  onFileSelected,
  state,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setIsDragActive(false);
      if (disabled) return;
      const file = event.dataTransfer.files.item(0);
      if (file) onFileSelected(file);
    },
    [disabled, onFileSelected],
  );

  const status = statusLine(state);

  return (
    // The drop target is a div rather than a button: disabled buttons swallow
    // drag events in some browsers, and a file input must not be nested
    // inside another interactive element.
    <div
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      className={`w-full border border-dashed bg-slate-50 p-8 text-center transition-colors ${
        isDragActive
          ? "border-slate-700 bg-white"
          : "border-slate-400 hover:border-slate-600"
      } ${disabled ? "cursor-wait" : "cursor-pointer"}`}
    >
      {state.fileName ? (
        <>
          <p className="truncate text-sm font-medium text-slate-900">
            {state.fileName}
          </p>
          {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
          {state.backend && state.phase === "separating" && (
            <p className="mt-2 text-xs text-slate-500">
              Running on{" "}
              {state.backend === "webgpu" ? "GPU (WebGPU)" : "CPU (WASM)"}
              {state.backend === "wasm" && " — hang tight on long tracks"}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-900">
            Drop an audio file here
          </p>
          <p className="mt-2 text-xs text-slate-500">
            or click to browse — mp3, wav, flac, m4a, ogg
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.item(0);
          if (file) onFileSelected(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
