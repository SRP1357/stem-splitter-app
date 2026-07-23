import { MODEL_VARIANTS } from "../config/constants";
import type { ModelVariantId } from "../config/constants";

interface ModelPickerProps {
  selected: ModelVariantId;
  disabled: boolean;
  onSelect: (id: ModelVariantId) => void;
}

/** Radio-card selector for the three model variants. */
export function ModelPicker({ selected, disabled, onSelect }: ModelPickerProps) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-zinc-400">Model</legend>
      {Object.values(MODEL_VARIANTS).map((variant) => {
        const isSelected = variant.id === selected;
        return (
          <label
            key={variant.id}
            className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors ${
              isSelected
                ? "border-emerald-400 bg-emerald-400/10"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="model-variant"
              value={variant.id}
              checked={isSelected}
              onChange={() => onSelect(variant.id)}
              className="sr-only"
            />
            <span className="font-semibold text-zinc-100">{variant.label}</span>
            <span className="text-xs text-zinc-400">{variant.description}</span>
            <span className="mt-1 text-xs text-zinc-500">
              ~{variant.approximateDownloadMb} MB download (one-time)
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
