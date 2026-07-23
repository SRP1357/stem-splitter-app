import { useCallback, useEffect, useRef, useState } from "react";

import { MODEL_SAMPLE_RATE } from "../config/constants";
import { decodeAudioFile } from "../lib/audio/decode";
import { encodeWavStereo } from "../lib/audio/wavEncoder";
import type {
  InferenceBackend,
  WorkerRequest,
  WorkerResponse,
} from "../types/messages";
import type { StemName } from "../config/constants";

export type SeparationPhase =
  | "idle"
  | "decoding"
  | "downloading-model"
  | "separating"
  | "done"
  | "error";

export interface StemResult {
  name: StemName;
  /** Object URL for an encoded WAV blob, usable in <audio> and downloads. */
  wavUrl: string;
}

export interface SeparationState {
  phase: SeparationPhase;
  /** 0..1 progress of the current phase (model download or separation). */
  progress: number;
  backend: InferenceBackend | null;
  fileName: string | null;
  stems: StemResult[];
  errorMessage: string | null;
}

const INITIAL_STATE: SeparationState = {
  phase: "idle",
  progress: 0,
  backend: null,
  fileName: null,
  stems: [],
  errorMessage: null,
};

/**
 * Owns the separation worker and exposes the pipeline as simple React state:
 * hand it a File, get phases, progress and finished stems back.
 */
export function useStemSeparation() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SeparationState>(INITIAL_STATE);

  const releaseStemUrls = useCallback((stems: StemResult[]) => {
    for (const stem of stems) URL.revokeObjectURL(stem.wavUrl);
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const separate = useCallback(
    async (file: File) => {
      setState((previous) => {
        releaseStemUrls(previous.stems);
        return {
          ...INITIAL_STATE,
          phase: "decoding",
          fileName: file.name,
        };
      });

      let decoded;
      try {
        decoded = await decodeAudioFile(file);
      } catch {
        setState((previous) => ({
          ...previous,
          phase: "error",
          errorMessage:
            "Could not decode this file. Please use a common audio format (mp3, wav, flac, m4a, ogg).",
        }));
        return;
      }

      workerRef.current ??= new Worker(
        new URL("../workers/separation.worker.ts", import.meta.url),
        { type: "module" },
      );
      const worker = workerRef.current;

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        switch (message.type) {
          case "model-download-progress":
            setState((previous) => ({
              ...previous,
              phase: "downloading-model",
              progress:
                message.totalBytes > 0
                  ? message.loadedBytes / message.totalBytes
                  : 0,
            }));
            break;
          case "backend-selected":
            setState((previous) => ({
              ...previous,
              backend: message.backend,
              phase: "separating",
              progress: 0,
            }));
            break;
          case "separation-progress":
            setState((previous) => ({
              ...previous,
              phase: "separating",
              progress: message.completedChunks / message.totalChunks,
            }));
            break;
          case "done": {
            const stems: StemResult[] = message.stems.map((stem) => ({
              name: stem.name,
              wavUrl: URL.createObjectURL(
                encodeWavStereo(stem.left, stem.right, MODEL_SAMPLE_RATE),
              ),
            }));
            setState((previous) => ({
              ...previous,
              phase: "done",
              progress: 1,
              stems,
            }));
            break;
          }
          case "error":
            setState((previous) => ({
              ...previous,
              phase: "error",
              errorMessage: message.message,
            }));
            break;
        }
      };

      const request: WorkerRequest = {
        type: "separate",
        left: decoded.left,
        right: decoded.right,
      };
      worker.postMessage(request, [
        decoded.left.buffer,
        decoded.right.buffer,
      ]);
    },
    [releaseStemUrls],
  );

  return { state, separate };
}
