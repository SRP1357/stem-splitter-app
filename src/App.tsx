import { useState } from "react";

import { FileDropZone } from "./components/FileDropZone";
import { ModelPicker } from "./components/ModelPicker";
import { ProgressBar } from "./components/ProgressBar";
import { StemResultList } from "./components/StemResultList";
import { DEFAULT_MODEL_VARIANT_ID } from "./config/constants";
import type { ModelVariantId } from "./config/constants";
import { useStemSeparation } from "./hooks/useStemSeparation";
import type { SeparationState } from "./hooks/useStemSeparation";

function progressLabel(state: SeparationState): string {
  const filePosition =
    state.fileCount > 1 ? ` (model ${state.currentFile}/${state.fileCount})` : "";
  switch (state.phase) {
    case "decoding":
      return "Decoding audio…";
    case "downloading-model":
      return `Downloading model${filePosition} — one-time, cached afterwards`;
    case "separating":
      return `Separating stems${filePosition}`;
    default:
      return "Working…";
  }
}

export default function App() {
  const { state, separate } = useStemSeparation();
  const [selectedModel, setSelectedModel] = useState<ModelVariantId>(
    DEFAULT_MODEL_VARIANT_ID,
  );

  const isBusy =
    state.phase === "decoding" ||
    state.phase === "downloading-model" ||
    state.phase === "separating";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-16">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
          Stem Splitter
        </h1>
        <p className="mt-3 text-zinc-400">
          Split any song into <span className="text-zinc-200">drums</span>,{" "}
          <span className="text-zinc-200">bass</span>,{" "}
          <span className="text-zinc-200">vocals</span> and more — entirely in
          your browser. Nothing is ever uploaded.
        </p>
      </header>

      <ModelPicker
        selected={selectedModel}
        disabled={isBusy}
        onSelect={setSelectedModel}
      />

      <FileDropZone
        disabled={isBusy}
        onFileSelected={(file) => {
          void separate(file, selectedModel);
        }}
      />

      {isBusy && (
        <section className="flex flex-col gap-2">
          <ProgressBar
            label={progressLabel(state)}
            value={state.phase === "decoding" ? 0 : state.progress}
          />
          {state.backend && (
            <p className="text-xs text-zinc-500">
              Running on{" "}
              {state.backend === "webgpu" ? "GPU (WebGPU)" : "CPU (WASM)"}
              {state.backend === "wasm" &&
                " — this can take a while on long tracks"}
            </p>
          )}
        </section>
      )}

      {state.phase === "error" && (
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      {state.stems.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            {state.fileName}
            {isBusy && (
              <span className="ml-2 text-sm font-normal text-zinc-500">
                more stems on the way…
              </span>
            )}
          </h2>
          <StemResultList stems={state.stems} sourceFileName={state.fileName} />
        </section>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-zinc-600">
        Powered by HT-Demucs (Alexandre Défossez / Meta AI) via ONNX Runtime
        Web. All processing happens on your device.
      </footer>
    </main>
  );
}
