import { describe, expect, it } from 'vitest';
import {
  buildPingPongOpacitySequence,
  computeFrameDelayMs,
  computeFrameDelays,
  loopCountToGifRepeat,
  pickHalfFrameCount,
} from './gifSequence.ts';

describe('buildPingPongOpacitySequence', () => {
  it('starts at 0, peaks at exactly 1 once, and returns toward 0 (ping-pong, F10)', () => {
    const seq = buildPingPongOpacitySequence(5);
    expect(seq[0]).toBe(0);
    expect(Math.max(...seq)).toBe(1);
    expect(seq.filter((v) => v === 1)).toHaveLength(1);
    expect(seq.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('has length 2*halfFrameCount - 2', () => {
    expect(buildPingPongOpacitySequence(5)).toHaveLength(8);
    expect(buildPingPongOpacitySequence(13)).toHaveLength(24);
  });

  it('is symmetric: ascending half mirrors the descending half', () => {
    const seq = buildPingPongOpacitySequence(6);
    const half = 6;
    const ascending = seq.slice(0, half);
    const descending = seq.slice(half);
    const expectedDescending = ascending.slice(1, -1).reverse();
    expect(descending).toEqual(expectedDescending);
  });

  it('the frame after the peak strictly decreases (no flat/duplicate peak frames)', () => {
    const seq = buildPingPongOpacitySequence(4);
    const peakIndex = seq.indexOf(1);
    expect(seq[peakIndex + 1]).toBeLessThan(1);
  });

  it('throws for fewer than 2 frames in the ascending half', () => {
    expect(() => buildPingPongOpacitySequence(1)).toThrow();
  });
});

describe('pickHalfFrameCount', () => {
  it('yields a total frame count close to the target, within the 20-30 range from spec §7', () => {
    const half = pickHalfFrameCount(24);
    const total = 2 * half - 2;
    expect(total).toBeGreaterThanOrEqual(20);
    expect(total).toBeLessThanOrEqual(30);
  });
});

describe('computeFrameDelayMs', () => {
  it('divides total duration evenly across frames', () => {
    expect(computeFrameDelayMs(10000, 25)).toBe(400);
  });

  it('throws for zero or negative frame counts', () => {
    expect(() => computeFrameDelayMs(1000, 0)).toThrow();
  });
});

describe('computeFrameDelays', () => {
  it('gives every frame the same base delay when there is no hold', () => {
    const seq = buildPingPongOpacitySequence(5); // length 8
    const delays = computeFrameDelays(seq, 8000, 0);
    expect(delays).toHaveLength(8);
    expect(delays.every((d) => d === 1000)).toBe(true);
  });

  it('adds the hold only to the single peak-opacity frame, leaving the total at motion + hold', () => {
    const seq = buildPingPongOpacitySequence(5); // length 8, peak at index 4
    const delays = computeFrameDelays(seq, 8000, 2000);
    const peakIndex = seq.indexOf(1);
    expect(delays[peakIndex]).toBe(1000 + 2000);
    delays.forEach((d, i) => {
      if (i !== peakIndex) expect(d).toBe(1000);
    });
    // Total delay across one loop = motion duration + hold (the hold doesn't add frames).
    expect(delays.reduce((a, b) => a + b, 0)).toBe(8000 + 2000);
  });

  it('defaults to no hold when omitted', () => {
    const seq = buildPingPongOpacitySequence(5);
    expect(computeFrameDelays(seq, 5000)).toEqual(computeFrameDelays(seq, 5000, 0));
  });
});

describe('loopCountToGifRepeat', () => {
  it('maps "infinite" to gif.js repeat 0 (forever)', () => {
    expect(loopCountToGifRepeat('infinite')).toBe(0);
  });

  it('maps playing once to gif.js repeat -1 (no repeat)', () => {
    expect(loopCountToGifRepeat(1)).toBe(-1);
  });

  it('maps playing N>1 times to gif.js repeat N-1 (N-1 additional repeats)', () => {
    expect(loopCountToGifRepeat(2)).toBe(1);
    expect(loopCountToGifRepeat(3)).toBe(2);
  });
});
