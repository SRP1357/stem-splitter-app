/**
 * Minimal RIFF/WAVE encoder producing 16-bit PCM stereo files — the most
 * universally compatible format for downloaded stems.
 */

/** Exported so the MP3 path can slice the PCM back out of our own WAVs. */
export const RIFF_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const BITS_PER_SAMPLE = BYTES_PER_SAMPLE * 8;
const PCM_FORMAT_CODE = 1; // "audio/wav" linear PCM
const INT16_MAX = 0x7fff;

export function encodeWavStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Blob {
  const channelCount = 2;
  const frameCount = left.length;
  const dataByteLength = frameCount * channelCount * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(RIFF_HEADER_BYTES + dataByteLength);
  const view = new DataView(buffer);

  const blockAlign = channelCount * BYTES_PER_SAMPLE;
  const byteRate = sampleRate * blockAlign;

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, RIFF_HEADER_BYTES - 8 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, PCM_FORMAT_CODE, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = RIFF_HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame++) {
    view.setInt16(offset, floatToInt16(left[frame]), true);
    offset += BYTES_PER_SAMPLE;
    view.setInt16(offset, floatToInt16(right[frame]), true);
    offset += BYTES_PER_SAMPLE;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * INT16_MAX);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
