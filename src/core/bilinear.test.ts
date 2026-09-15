import { describe, expect, it } from 'vitest';
import { bilinearSample } from './bilinear.ts';

// A 2x2 RGBA image:
// (0,0)=red   (1,0)=green
// (0,1)=blue  (1,1)=white
function make2x2(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255,
  ]);
}

describe('bilinearSample', () => {
  it('returns the exact pixel value when sampling at an integer coordinate', () => {
    const data = make2x2();
    expect(bilinearSample(data, 2, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(bilinearSample(data, 2, 2, 1, 0)).toEqual([0, 255, 0, 255]);
  });

  it('averages the four neighbors at the exact center', () => {
    const data = make2x2();
    const [r, g, b, a] = bilinearSample(data, 2, 2, 0.5, 0.5);
    expect(r).toBeCloseTo((255 + 0 + 0 + 255) / 4, 5);
    expect(g).toBeCloseTo((0 + 255 + 0 + 255) / 4, 5);
    expect(b).toBeCloseTo((0 + 0 + 255 + 255) / 4, 5);
    expect(a).toBe(255);
  });

  it('interpolates linearly between two horizontally adjacent pixels', () => {
    const data = make2x2();
    const [r, g] = bilinearSample(data, 2, 2, 0.25, 0);
    expect(r).toBeCloseTo(255 * 0.75, 5);
    expect(g).toBeCloseTo(255 * 0.25, 5);
  });

  it('returns fully transparent outside the image bounds', () => {
    const data = make2x2();
    expect(bilinearSample(data, 2, 2, -5, -5)).toEqual([0, 0, 0, 0]);
    expect(bilinearSample(data, 2, 2, 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it('clamps at the border instead of sampling garbage just past the edge', () => {
    const data = make2x2();
    // Half a pixel past the right edge is still considered "in bounds" (edge tolerance),
    // and should clamp to the rightmost column rather than blend with nothing.
    const [r] = bilinearSample(data, 2, 2, 1.4, 0);
    expect(r).toBeCloseTo(0, 5); // still mostly green's red channel (0), clamped
  });
});
