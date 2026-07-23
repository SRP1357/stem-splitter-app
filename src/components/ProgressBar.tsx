interface ProgressBarProps {
  label: string;
  /** 0..1 */
  value: number;
}

export function ProgressBar({ label, value }: ProgressBarProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-sm text-zinc-400">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
