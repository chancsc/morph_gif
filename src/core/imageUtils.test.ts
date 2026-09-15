import { describe, expect, it } from 'vitest';
import { computeDisplayScale } from './imageUtils.ts';

describe('computeDisplayScale', () => {
  it('returns 1 when the image already fits within maxDim', () => {
    expect(computeDisplayScale(400, 300, 800)).toBe(1);
    expect(computeDisplayScale(800, 800, 800)).toBe(1);
  });

  it('scales down based on the longest side, preserving aspect ratio (F2)', () => {
    // 4000x3000 -> longest side 4000, capped to 800 -> scale 0.2
    expect(computeDisplayScale(4000, 3000, 800)).toBeCloseTo(0.2, 10);
    // A tall image: longest side is height.
    expect(computeDisplayScale(300, 3000, 800)).toBeCloseTo(800 / 3000, 10);
  });

  it('produces dimensions that stay within maxDim after scaling', () => {
    const scale = computeDisplayScale(4000, 3000, 800);
    expect(4000 * scale).toBeCloseTo(800, 6);
    expect(3000 * scale).toBeLessThanOrEqual(800);
  });

  it('throws on non-positive dimensions or maxDim', () => {
    expect(() => computeDisplayScale(0, 100, 800)).toThrow();
    expect(() => computeDisplayScale(100, -1, 800)).toThrow();
    expect(() => computeDisplayScale(100, 100, 0)).toThrow();
  });
});
