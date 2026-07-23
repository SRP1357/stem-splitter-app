import { MODEL_VARIANTS } from "../config/constants";
import type { ModelVariantId } from "../config/constants";

interface ModelPickerProps {
  selected: ModelVariantId;
  disabled: boolean;
  onSelect: (id: ModelVariantId) => void;
}

/** Radio-card selector for the three model variants. */
export function ModelPicker({
  selected,
  disabled,
  onSelect,
}: ModelPickerProps) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3" disabled={disabled}>
      <legend className="sr-only">Model</legend>
      {Object.values(MODEL_VARIANTS).map((variant) => {
        const isSelected = variant.id === selected;
        return (
          <label
            key={variant.id}
            className={`flex flex-col gap-1 rounded-xl border p-4 transition-all ${
              isSelected
                ? "border-slate-400 bg-white shadow-sm"
                : "border-slate-200 bg-white/50 hover:border-slate-300 hover:bg-white"
            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name="model-variant"
              value={variant.id}
              checked={isSelected}
              onChange={() => onSelect(variant.id)}
              className="sr-only"
            />
            <span className="text-sm font-medium text-slate-900">
              {variant.label}
            </span>
            <span className="text-xs leading-relaxed text-slate-500">
              {variant.description}
            </span>
            <span className="mt-1 text-xs text-slate-400">
              ~{variant.approximateDownloadMb} MB download (one-time)
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
