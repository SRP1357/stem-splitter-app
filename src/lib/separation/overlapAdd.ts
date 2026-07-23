/**
 * Helpers for chunked overlap-add processing.
 *
 * The ONNX graph only accepts fixed 7.8-second segments, so longer tracks are
 * split into overlapping windows whose outputs are cross-faded back together.
 * A triangular "transition" window ramps each segment in and out across the
 * overlap region; dividing by the accumulated window weights afterwards makes
 * the blend exact.
 */

/**
 * Builds the per-sample blending weights for one segment: a linear ramp up
 * over the first `overlapLength` samples, flat 1 in the middle, and a linear
 * ramp down over the last `overlapLength` samples.
 */
export function makeTransitionWindow(
  segmentLength: number,
  overlapLength: number,
): Float32Array {
  const window = new Float32Array(segmentLength).fill(1);
  for (let i = 0; i < overlapLength; i++) {
    const ramp = i / overlapLength;
    window[i] = ramp;
    window[segmentLength - 1 - i] = ramp;
  }
  return window;
}

/** Number of overlapping segments needed to cover `totalSamples`. */
export function countChunks(totalSamples: number, stride: number): number {
  return Math.max(1, Math.ceil(totalSamples / stride));
}

/**
 * Divides accumulated weighted samples by accumulated weights, in place,
 * completing the overlap-add blend.
 */
export function normalizeByWeights(
  samples: Float32Array,
  weights: Float32Array,
  epsilon: number,
): void {
  for (let i = 0; i < samples.length; i++) {
    samples[i] /= Math.max(weights[i], epsilon);
  }
}
