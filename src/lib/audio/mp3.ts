/**
 * Client for the MP3 encoder worker. Extracts PCM from one of our own WAV
 * object URLs (16-bit stereo, fixed header — see wavEncoder.ts) and encodes
 * it off the main thread. One shared worker serves all lanes.
 */
import type { Mp3Request, Mp3Response } from "../../types/messages";
import { RIFF_HEADER_BYTES } from "./wavEncoder";

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<
  number,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker {
  worker ??= new Worker(new URL("../../workers/mp3.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<Mp3Response>) => {
    const { requestId, blob, error } = event.data;
    const handlers = pending.get(requestId);
    if (!handlers) return;
    pending.delete(requestId);
    if (blob) handlers.resolve(blob);
    else handlers.reject(new Error(error ?? "MP3 encoding failed"));
  };
  return worker;
}

export async function encodeWavUrlToMp3(wavUrl: string): Promise<Blob> {
  const wavBytes = await (await fetch(wavUrl)).arrayBuffer();
  const interleaved = new Int16Array(wavBytes, RIFF_HEADER_BYTES);
  const frameCount = interleaved.length / 2;
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    left[frame] = interleaved[frame * 2];
    right[frame] = interleaved[frame * 2 + 1];
  }

  const requestId = nextRequestId++;
  const request: Mp3Request = { requestId, left, right };
  return new Promise<Blob>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    getWorker().postMessage(request, [left.buffer, right.buffer]);
  });
}
