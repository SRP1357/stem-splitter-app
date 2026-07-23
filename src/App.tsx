import { useState } from "react";

import { ModelPicker } from "./components/ModelPicker";
import { SplitFlow } from "./components/SplitFlow";
import { StemTracks } from "./components/StemTracks";
import { DEFAULT_MODEL_VARIANT_ID, MODEL_VARIANTS } from "./config/constants";
import type { ModelVariantId } from "./config/constants";
import { useStemSeparation } from "./hooks/useStemSeparation";

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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-4 py-14">
      <header className="text-center">
        <h1 className="text-2xl font-semibold uppercase tracking-[0.25em] text-slate-900">
          Stem Splitter
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
          Split any song into its stems — drums, bass, vocals and more —
          entirely in your browser. Nothing is ever uploaded.
        </p>
      </header>

      <ModelPicker
        selected={selectedModel}
        disabled={isBusy}
        onSelect={setSelectedModel}
      />

      <SplitFlow
        state={state}
        selectedModel={selectedModel}
        disabled={isBusy}
        onFileSelected={(file) => {
          void separate(file, selectedModel);
        }}
      />

      <StemTracks
        stemNames={
          MODEL_VARIANTS[state.modelId ?? selectedModel].stemNames
        }
        results={state.stems}
        sourceFileName={state.fileName}
      />

      {state.phase === "error" && (
        <p className="border border-red-300 bg-red-50 p-4 text-xs text-red-700">
          {state.errorMessage}
        </p>
      )}

      <footer className="mt-auto pt-8 text-center text-[11px] text-slate-400">
        Powered by HT-Demucs (Alexandre Défossez / Meta AI) via ONNX Runtime
        Web. All processing happens on your device.
      </footer>
    </main>
  );
}
