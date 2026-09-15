import { describe, expect, it } from 'vitest';
import { applyHomography } from './geometry.ts';
import { PerspectiveHandleSet } from './perspectiveHandles.ts';

const CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('PerspectiveHandleSet', () => {
  it('starts with each handle at its origin (no distortion yet)', () => {
    const set = new PerspectiveHandleSet(CORNERS);
    expect(set.hasBeenMoved).toBe(false);
    for (const h of set.handles) expect(h.current).toEqual(h.origin);
  });

  it('computes the identity homography before any handle is dragged', () => {
    const set = new PerspectiveHandleSet(CORNERS);
    const h = set.computeHomography();
    for (const corner of CORNERS) {
      const mapped = applyHomography(corner, h);
      expect(mapped.x).toBeCloseTo(corner.x, 6);
      expect(mapped.y).toBeCloseTo(corner.y, 6);
    }
  });

  it('computes a homography that maps origins to dragged positions after moving handles', () => {
    const set = new PerspectiveHandleSet(CORNERS);
    // Drag the top-right corner inward/down, simulating correcting foreshortening.
    set.moveHandle(1, { x: 80, y: 20 });
    expect(set.hasBeenMoved).toBe(true);

    const h = set.computeHomography();
    for (const handle of set.handles) {
      const mapped = applyHomography(handle.origin, h);
      expect(mapped.x).toBeCloseTo(handle.current.x, 6);
      expect(mapped.y).toBeCloseTo(handle.current.y, 6);
    }
  });

  it('reset() snaps all handles back to their origins', () => {
    const set = new PerspectiveHandleSet(CORNERS);
    set.moveHandle(0, { x: 20, y: 20 });
    set.moveHandle(2, { x: 70, y: 70 });
    set.reset();
    expect(set.hasBeenMoved).toBe(false);
  });

  it('throws when constructed with a count other than 4', () => {
    expect(() => new PerspectiveHandleSet(CORNERS.slice(0, 3))).toThrow(/exactly 4/);
  });

  it('throws moveHandle on an unknown id', () => {
    const set = new PerspectiveHandleSet(CORNERS);
    expect(() => set.moveHandle(99, { x: 1, y: 1 })).toThrow(/no handle/);
  });
});
