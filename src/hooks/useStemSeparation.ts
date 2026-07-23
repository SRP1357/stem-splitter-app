import { useCallback, useEffect, useRef, useState } from "react";

import {
  FORCE_WASM_STORAGE_KEY,
  MODEL_SAMPLE_RATE,
  MODEL_VARIANTS,
} from "../config/constants";
import type { ModelVariantId, StemName } from "../config/constants";
import { WAVEFORM_BUCKETS } from "../config/theme";
import { decodeAudioFile } from "../lib/audio/decode";
import { encodeWavStereo } from "../lib/audio/wavEncoder";
import type {
  InferenceBackend,
  WorkerRequest,
  WorkerResponse,
} from "../types/messages";

export type SeparationPhase =
  "idle" | "decoding" | "downloading-model" | "separating" | "done" | "error";

export interface StemResult {
  name: StemName;
  /** Object URL for an encoded WAV blob, usable in <audio> and downloads. */
  wavUrl: string;
  /**
   * Peak amplitude (0..1, normalised per stem) for each of WAVEFORM_BUCKETS
   * equal slices of the track, precomputed for waveform rendering.
   */
  peaks: Float32Array;
  durationSeconds: number;
}

/** Max |sample| across both channels for each equal slice of the track. */
function computePeaks(left: Float32Array, right: Float32Array): Float32Array {
  const peaks = new Float32Array(WAVEFORM_BUCKETS);
  const samplesPerBucket = left.length / WAVEFORM_BUCKETS;
  let overallMax = 0;
  for (let bucket = 0; bucket < WAVEFORM_BUCKETS; bucket++) {
    const start = Math.floor(bucket * samplesPerBucket);
    const end = Math.min(
      left.length,
      Math.floor((bucket + 1) * samplesPerBucket),
    );
    let max = 0;
    for (let i = start; i < end; i++) {
      const value = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      if (value > max) max = value;
    }
    peaks[bucket] = max;
    if (max > overallMax) overallMax = max;
  }
  if (overallMax > 0) {
    for (let bucket = 0; bucket < WAVEFORM_BUCKETS; bucket++) {
      peaks[bucket] /= overallMax;
    }
  }
  return peaks;
}

export type LogTone = "info" | "warn" | "error";

/** One line in the activity log ("terminal") strip. */
export interface LogEntry {
  id: number;
  /** Wall-clock HH:MM:SS when the event happened. */
  time: string;
  text: string;
  tone: LogTone;
  /**
   * Entries with the same key overwrite the previous entry in place when it
   * is still the newest line, instead of appending. Used for progress
   * updates so they don't flush informative lines out of the visible window.
   */
  coalesceKey?: string;
}

export interface SeparationState {
  phase: SeparationPhase;
  /** 0..1 progress of the current phase (model download or separation). */
  progress: number;
  /** 1-based position within the variant's model files, for multi-file variants. */
  currentFile: number;
  fileCount: number;
  backend: InferenceBackend | null;
  modelId: ModelVariantId | null;
  fileName: string | null;
  /** Grows incrementally: specialist stems appear as soon as they finish. */
  stems: StemResult[];
  errorMessage: string | null;
  /** Rolling activity log; newest entry last. */
  log: LogEntry[];
}

/** Keep the log bounded; only the visible tail matters anyway. */
const MAX_LOG_ENTRIES = 50;

/** Log separation progress only when it crosses another 10% boundary. */
const LOG_PROGRESS_STEP = 0.1;

/** localStorage can throw (e.g. blocked storage); treat that as "not set". */
function isWebGpuKnownUnusable(): boolean {
  try {
    return localStorage.getItem(FORCE_WASM_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberWebGpuUnusable(): void {
  try {
    localStorage.setItem(FORCE_WASM_STORAGE_KEY, "true");
  } catch {
    // Non-persistent storage just means we re-detect on the next visit.
  }
}

const INITIAL_STATE: SeparationState = {
  phase: "idle",
  progress: 0,
  currentFile: 1,
  fileCount: 1,
  backend: null,
  modelId: null,
  fileName: null,
  stems: [],
  errorMessage: null,
  log: [
    {
      id: 0,
      time: new Date().toTimeString().slice(0, 8),
      text: "system ready — drop an audio file to begin",
      tone: "info",
    },
  ],
};

/**
 * Owns the separation worker and exposes the pipeline as simple React state:
 * hand it a File and a model variant, get phases, progress and finished
 * stems back (streamed in as each model file completes).
 */
export function useStemSeparation() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SeparationState>(INITIAL_STATE);
  const nextLogId = useRef(1);

  const pushLog = useCallback(
    (text: string, tone: LogTone = "info", coalesceKey?: string) => {
      const time = new Date().toTimeString().slice(0, 8);
      setState((previous) => {
        const last = previous.log[previous.log.length - 1];
        if (coalesceKey && last && last.coalesceKey === coalesceKey) {
          // Overwrite the still-newest progress line in place (same id, so
          // the UI updates the text without replaying the entry animation).
          const updated: LogEntry = { ...last, text, time };
          return {
            ...previous,
            log: [...previous.log.slice(0, -1), updated],
          };
        }
        const entry: LogEntry = {
          id: nextLogId.current++,
          time,
          text,
          tone,
          coalesceKey,
        };
        return {
          ...previous,
          log: [...previous.log, entry].slice(-MAX_LOG_ENTRIES),
        };
      });
    },
    [],
  );

  const releaseStemUrls = useCallback((stems: StemResult[]) => {
    for (const stem of stems) URL.revokeObjectURL(stem.wavUrl);
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const separate = useCallback(
    async (file: File, modelId: ModelVariantId) => {
      setState((previous) => {
        releaseStemUrls(previous.stems);
        return {
          ...INITIAL_STATE,
          phase: "decoding",
          fileName: file.name,
          modelId,
          fileCount: MODEL_VARIANTS[modelId].files.length,
          log: previous.log, // the terminal keeps scrolling across runs
        };
      });

      const variant = MODEL_VARIANTS[modelId];
      const stemOrder = variant.stemNames;
      pushLog(`load: ${file.name} · mode: ${variant.label.toLowerCase()}`);
      if (isWebGpuKnownUnusable()) {
        pushLog(
          "gpu failed on a previous run here — going straight to cpu, may take a bit longer",
          "warn",
        );
      }
      pushLog("decoding audio…");

      // Run-scoped dedupe so progress logs fire once per milestone.
      const runLog = {
        announcedFetches: new Set<number>(),
        finishedFetches: new Set<number>(),
        announcedPasses: new Set<number>(),
        lastProgressStep: 0,
      };

      // Decoded buffers are transferred to the worker, so a restart (after
      // a GPU device loss) has to decode the file again.
      const startRun = async (forceWasm: boolean): Promise<void> => {
        let decoded;
        try {
          decoded = await decodeAudioFile(file);
          const seconds = decoded.left.length / MODEL_SAMPLE_RATE;
          pushLog(
            `decoded ${seconds.toFixed(1)}s stereo pcm @ ${MODEL_SAMPLE_RATE / 1000} kHz`,
          );
        } catch {
          pushLog("decode failed — unsupported or corrupted file", "error");
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
            case "model-download-progress": {
              const { fileIndex, fileCount, loadedBytes, totalBytes } = message;
              if (!runLog.announcedFetches.has(fileIndex)) {
                runLog.announcedFetches.add(fileIndex);
                pushLog(`fetching model ${fileIndex + 1}/${fileCount}…`);
              }
              if (
                totalBytes > 0 &&
                loadedBytes >= totalBytes &&
                !runLog.finishedFetches.has(fileIndex)
              ) {
                runLog.finishedFetches.add(fileIndex);
                pushLog(
                  `model ${fileIndex + 1}/${fileCount} ready (${Math.round(totalBytes / 1024 / 1024)} MB, cached)`,
                );
              }
              setState((previous) => ({
                ...previous,
                phase: "downloading-model",
                currentFile: fileIndex + 1,
                fileCount,
                progress: totalBytes > 0 ? loadedBytes / totalBytes : 0,
              }));
              break;
            }
            case "backend-selected": {
              if (message.backend === "webgpu") {
                pushLog("backend: webgpu — gpu acceleration active");
              } else {
                if (message.wasmReason === "no-webgpu") {
                  pushLog(
                    "gpu not available in this browser — falling back to cpu",
                    "warn",
                  );
                } else if (message.wasmReason === "init-failed") {
                  pushLog(
                    "gpu found but failed to initialize — falling back to cpu",
                    "warn",
                  );
                }
                const threads = message.threads ?? 1;
                pushLog(
                  `backend: wasm — cpu with ${threads} thread${threads === 1 ? "" : "s"}, may take a bit longer than gpu`,
                );
                if (threads === 1) {
                  pushLog(
                    "multithreading unavailable in this context — expect slower processing",
                    "warn",
                  );
                }
              }
              setState((previous) => ({
                ...previous,
                backend: message.backend,
                phase: "separating",
                progress: 0,
              }));
              break;
            }
            case "separation-progress": {
              const progress = message.completedUnits / message.totalUnits;
              if (
                message.passCount > 1 &&
                !runLog.announcedPasses.has(message.passIndex)
              ) {
                runLog.announcedPasses.add(message.passIndex);
                pushLog(
                  `processing model ${message.passIndex + 1}/${message.passCount}…`,
                );
              }
              const step = Math.floor(progress / LOG_PROGRESS_STEP);
              if (step > runLog.lastProgressStep && progress < 1) {
                runLog.lastProgressStep = step;
                pushLog(
                  `separating… ${Math.round(step * LOG_PROGRESS_STEP * 100)}%`,
                  "info",
                  "separation-progress",
                );
              }
              setState((previous) => ({
                ...previous,
                phase: "separating",
                currentFile: message.passIndex + 1,
                fileCount: message.passCount,
                progress,
              }));
              break;
            }
          case "stems-ready": {
            const newStems: StemResult[] = message.stems.map((stem) => ({
              name: stem.name,
              wavUrl: URL.createObjectURL(
                encodeWavStereo(stem.left, stem.right, MODEL_SAMPLE_RATE),
              ),
              peaks: computePeaks(stem.left, stem.right),
              durationSeconds: stem.left.length / MODEL_SAMPLE_RATE,
            }));
            pushLog(
              `stems ready: ${newStems.map((stem) => stem.name).join(", ")}`,
            );
              setState((previous) => ({
                ...previous,
                stems: [...previous.stems, ...newStems].sort(
                  (a, b) =>
                    stemOrder.indexOf(a.name) - stemOrder.indexOf(b.name),
                ),
              }));
              break;
            }
            case "done":
              pushLog("complete ✓ all stems separated");
              setState((previous) => ({
                ...previous,
                phase: "done",
                progress: 1,
              }));
              break;
            case "webgpu-device-lost":
              // The GPU was reset mid-run and the worker's runtime is wedged.
              // Replace the worker and redo the whole run on the CPU backend;
              // also remember so future runs skip the doomed GPU attempt.
              pushLog(
                "gpu device lost mid-run (driver reset) — the gpu on this device can't finish the job",
                "error",
              );
              pushLog(
                "restarting the whole run on cpu — may take a bit longer. future runs will skip the gpu.",
                "warn",
              );
              rememberWebGpuUnusable();
              worker.terminate();
              workerRef.current = null;
              runLog.lastProgressStep = 0;
              runLog.announcedPasses.clear();
              setState((previous) => ({
                ...previous,
                backend: "wasm",
                phase: "decoding",
                progress: 0,
              }));
              void startRun(true);
              break;
            case "error":
              pushLog(`error: ${message.message}`, "error");
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
          modelId,
          left: decoded.left,
          right: decoded.right,
          forceWasm,
        };
        worker.postMessage(request, [
          decoded.left.buffer,
          decoded.right.buffer,
        ]);
      };

      await startRun(isWebGpuKnownUnusable());
    },
    [releaseStemUrls, pushLog],
  );

  return { state, separate };
}
