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
            className={`flex flex-col gap-1 rounded-xl border bg-white p-4 shadow-sm transition-all ${
              isSelected
                ? "border-stone-900 ring-1 ring-stone-900"
                : "border-stone-200 hover:border-stone-400"
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
            <span className="font-semibold text-stone-900">
              {variant.label}
            </span>
            <span className="text-xs leading-relaxed text-stone-500">
              {variant.description}
            </span>
            <span className="mt-1 text-xs text-stone-400">
              ~{variant.approximateDownloadMb} MB download (one-time)
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
