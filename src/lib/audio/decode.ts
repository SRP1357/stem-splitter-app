import { CHANNEL_COUNT, MODEL_SAMPLE_RATE } from "../../config/constants";

export interface DecodedAudio {
  left: Float32Array;
  right: Float32Array;
  durationSeconds: number;
}

/**
 * Decodes any browser-supported audio file (mp3, wav, flac, m4a, ogg, ...)
 * into stereo 44.1 kHz PCM — the only format the model accepts.
 *
 * `decodeAudioData` resamples to the context's sample rate automatically, so
 * constructing the OfflineAudioContext at the model rate handles arbitrary
 * input rates for free. Mono files are duplicated to both channels.
 */
export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  const encodedBytes = await file.arrayBuffer();

  // Length of 1 frame: we only use this context for decoding, never rendering.
  const decodingContext = new OfflineAudioContext(
    CHANNEL_COUNT,
    1,
    MODEL_SAMPLE_RATE,
  );
  const audioBuffer = await decodingContext.decodeAudioData(encodedBytes);

  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

  return {
    // Copy so the buffers are transferable to the worker without detaching
    // the AudioBuffer's internal storage.
    left: new Float32Array(left),
    right: new Float32Array(right),
    durationSeconds: audioBuffer.duration,
  };
}
