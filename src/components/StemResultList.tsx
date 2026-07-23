import type { StemResult } from "../hooks/useStemSeparation";

interface StemResultListProps {
  stems: StemResult[];
  sourceFileName: string | null;
}

/** Playable preview and WAV download for each separated stem. */
export function StemResultList({ stems, sourceFileName }: StemResultListProps) {
  const baseName = sourceFileName?.replace(/\.[^.]+$/, "") ?? "track";

  return (
    <ul className="flex flex-col gap-4">
      {stems.map((stem) => (
        <li
          key={stem.name}
          className="flex flex-col gap-3 rounded-xl bg-zinc-900 p-4 sm:flex-row sm:items-center"
        >
          <span className="w-20 shrink-0 font-medium capitalize text-zinc-100">
            {stem.name}
          </span>
          <audio controls src={stem.wavUrl} className="min-w-0 flex-1" />
          <a
            href={stem.wavUrl}
            download={`${baseName} - ${stem.name}.wav`}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-center text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
