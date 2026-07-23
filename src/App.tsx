import { useState } from "react";

import { ActivityLog } from "./components/ActivityLog";
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
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
          High-quality stem separation, completely free. Everything runs on
          your device — nothing is ever uploaded.
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

      <ActivityLog entries={state.log} busy={isBusy} />

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

      <footer className="mt-auto pt-8 text-center text-xs text-slate-500">
        Powered by HT-Demucs via ONNX Runtime Web. All processing happens on
        your device.
      </footer>
    </main>
  );
}
