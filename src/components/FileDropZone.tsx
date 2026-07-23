import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";

interface FileDropZoneProps {
  disabled: boolean;
  onFileSelected: (file: File) => void;
}

/** Drag-and-drop target that doubles as a click-to-browse file picker. */
export function FileDropZone({ disabled, onFileSelected }: FileDropZoneProps) {
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
      className={`w-full rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        isDragActive
          ? "border-emerald-400 bg-emerald-400/10"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <p className="text-lg font-medium text-zinc-100">
        Drop an audio file here
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        or click to browse — mp3, wav, flac, m4a, ogg
      </p>
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
