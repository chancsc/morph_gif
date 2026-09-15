import { describe, expect, it } from 'vitest';
import { buildPingPongOpacitySequence, computeFrameDelayMs, pickHalfFrameCount } from './gifSequence.ts';

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
