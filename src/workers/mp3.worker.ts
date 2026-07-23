/**
 * Encodes 16-bit stereo PCM to MP3 off the main thread, so multi-minute
 * stems don't freeze the UI while lamejs crunches them.
 */
import { Mp3Encoder } from "@breezystack/lamejs";

import { MODEL_SAMPLE_RATE, MP3_BITRATE_KBPS } from "../config/constants";
import type { Mp3Request, Mp3Response } from "../types/messages";

/** lamejs consumes PCM in blocks of this many frames (MPEG frame size). */
const ENCODE_BLOCK_FRAMES = 1152;

self.onmessage = (event: MessageEvent<Mp3Request>) => {
  const { requestId, left, right } = event.data;
  try {
    const encoder = new Mp3Encoder(2, MODEL_SAMPLE_RATE, MP3_BITRATE_KBPS);
    const chunks: Uint8Array[] = [];
    for (let start = 0; start < left.length; start += ENCODE_BLOCK_FRAMES) {
      const end = Math.min(start + ENCODE_BLOCK_FRAMES, left.length);
      const chunk = encoder.encodeBuffer(
        left.subarray(start, end),
        right.subarray(start, end),
      );
      if (chunk.length > 0) chunks.push(chunk);
    }
    const finalChunk = encoder.flush();
    if (finalChunk.length > 0) chunks.push(finalChunk);

    const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
    const response: Mp3Response = { requestId, blob };
    self.postMessage(response);
  } catch (error) {
    const response: Mp3Response = {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
