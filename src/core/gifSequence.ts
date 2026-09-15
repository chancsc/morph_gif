/**
 * Pure frame-timing math for the ping-pong cross-fade GIF (spec F10, §5 option a).
 *
 * Instead of literally doubling frames for a forward pass and a backward
 * pass, we generate one ascending 0->1 ramp and append its reverse (with
 * the shared endpoints deduplicated). Because the GIF loops infinitely,
 * the loop point (end -> start) is itself a seamless 0->0 step, giving a
 * continuous forward/backward ping-pong with roughly half the frame data.
 */

/**
 * Builds the sequence of opacity values (each in [0, 1]) for one full
 * ping-pong loop, given the number of frames in the ascending half
 * (0 -> 1 inclusive). `halfFrameCount` must be >= 2.
 *
 * Total sequence length is `2 * halfFrameCount - 2`.
 */
export function buildPingPongOpacitySequence(halfFrameCount: number): number[] {
  if (halfFrameCount < 2) {
    throw new Error('buildPingPongOpacitySequence: halfFrameCount must be >= 2');
  }
  const ascending = Array.from({ length: halfFrameCount }, (_, i) => i / (halfFrameCount - 1));
  const descending = ascending.slice(1, -1).reverse();
  return [...ascending, ...descending];
}

/**
 * Picks a `halfFrameCount` that keeps the total frame count within
 * [minTotalFrames, maxTotalFrames] (spec §7: "20-30 frames for 10s").
 */
export function pickHalfFrameCount(targetTotalFrames: number): number {
  const clamped = Math.max(4, Math.round(targetTotalFrames));
  // total = 2*half - 2  =>  half = total/2 + 1
  return Math.round(clamped / 2) + 1;
}

/** Per-frame delay in milliseconds for a given total duration and sequence length. */
export function computeFrameDelayMs(durationMs: number, frameCount: number): number {
  if (frameCount <= 0) throw new Error('computeFrameDelayMs: frameCount must be > 0');
  return durationMs / frameCount;
}
