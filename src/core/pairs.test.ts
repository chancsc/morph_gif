import { describe, expect, it } from 'vitest';
import { MIN_PAIRS_TO_ALIGN, PairManager } from './pairs.ts';

describe('PairManager', () => {
  it('starts empty, expecting a click on A first', () => {
    const pm = new PairManager();
    expect(pm.nextSide).toBe('A');
    expect(pm.pending).toBeNull();
    expect(pm.count).toBe(0);
    expect(pm.isReadyToAlign).toBe(false);
  });

  it('alternates A then B to complete a pair', () => {
    const pm = new PairManager();
    const r1 = pm.addPoint('A', { x: 1, y: 1 });
    expect(r1.pairCompleted).toBe(false);
    expect(pm.nextSide).toBe('B');
    expect(pm.pending).toEqual({ x: 1, y: 1 });

    const r2 = pm.addPoint('B', { x: 2, y: 2 });
    expect(r2.pairCompleted).toBe(true);
    expect(pm.pending).toBeNull();
    expect(pm.count).toBe(1);
    expect(pm.pairs[0]).toEqual({ a: { x: 1, y: 1 }, b: { x: 2, y: 2 } });
    expect(pm.nextSide).toBe('A');
  });

  it('rejects an out-of-order click (F4: enforce alternating order)', () => {
    const pm = new PairManager();
    pm.addPoint('A', { x: 0, y: 0 });
    expect(() => pm.addPoint('A', { x: 5, y: 5 })).toThrow(/Expected the next click on image B/);
  });

  it('rejects a B click before any A click', () => {
    const pm = new PairManager();
    expect(() => pm.addPoint('B', { x: 0, y: 0 })).toThrow(/Expected the next click on image A/);
  });

  it('requires MIN_PAIRS_TO_ALIGN (4) pairs before ready to align (F5)', () => {
    const pm = new PairManager();
    for (let i = 0; i < MIN_PAIRS_TO_ALIGN - 1; i++) {
      pm.addPoint('A', { x: i, y: i });
      pm.addPoint('B', { x: i + 1, y: i + 1 });
    }
    expect(pm.count).toBe(MIN_PAIRS_TO_ALIGN - 1);
    expect(pm.isReadyToAlign).toBe(false);

    pm.addPoint('A', { x: 99, y: 99 });
    pm.addPoint('B', { x: 100, y: 100 });
    expect(pm.count).toBe(MIN_PAIRS_TO_ALIGN);
    expect(pm.isReadyToAlign).toBe(true);
  });

  it('supports more than the minimum pairs for better accuracy (F5)', () => {
    const pm = new PairManager();
    for (let i = 0; i < 7; i++) {
      pm.addPoint('A', { x: i, y: i });
      pm.addPoint('B', { x: i, y: i });
    }
    expect(pm.count).toBe(7);
    expect(pm.isReadyToAlign).toBe(true);
  });

  describe('removeLastPoint (undo, F6)', () => {
    it('clears a pending A-point without touching completed pairs', () => {
      const pm = new PairManager();
      pm.addPoint('A', { x: 0, y: 0 });
      pm.addPoint('B', { x: 1, y: 1 });
      pm.addPoint('A', { x: 2, y: 2 }); // pending, mis-click
      pm.removeLastPoint();
      expect(pm.pending).toBeNull();
      expect(pm.count).toBe(1);
      expect(pm.nextSide).toBe('A');
    });

    it('pops the last completed pair when nothing is pending', () => {
      const pm = new PairManager();
      pm.addPoint('A', { x: 0, y: 0 });
      pm.addPoint('B', { x: 1, y: 1 });
      pm.removeLastPoint();
      expect(pm.count).toBe(0);
      expect(pm.nextSide).toBe('A');
    });

    it('is a no-op on a completely empty state', () => {
      const pm = new PairManager();
      expect(() => pm.removeLastPoint()).not.toThrow();
      expect(pm.count).toBe(0);
    });
  });

  describe('removePairAt (delete a specific pair, F6)', () => {
    it('removes the pair at the given index', () => {
      const pm = new PairManager();
      for (let i = 0; i < 3; i++) {
        pm.addPoint('A', { x: i, y: i });
        pm.addPoint('B', { x: i, y: i });
      }
      pm.removePairAt(1);
      expect(pm.count).toBe(2);
      expect(pm.pairs[0].a).toEqual({ x: 0, y: 0 });
      expect(pm.pairs[1].a).toEqual({ x: 2, y: 2 });
    });

    it('throws on an out-of-range index', () => {
      const pm = new PairManager();
      expect(() => pm.removePairAt(0)).toThrow(/out of range/);
    });
  });

  it('clear() resets all state', () => {
    const pm = new PairManager();
    pm.addPoint('A', { x: 0, y: 0 });
    pm.addPoint('B', { x: 1, y: 1 });
    pm.addPoint('A', { x: 2, y: 2 });
    pm.clear();
    expect(pm.count).toBe(0);
    expect(pm.pending).toBeNull();
    expect(pm.nextSide).toBe('A');
  });
});
