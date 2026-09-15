import { describe, expect, it } from 'vitest';
import { applyHomography } from './geometry.ts';
import { clampStretch, KeystoneState, keystoneCorners, MAX_EDGE_STRETCH } from './keystone.ts';

describe('clampStretch', () => {
  it('passes through values within range', () => {
    expect(clampStretch(0)).toBe(0);
    expect(clampStretch(0.3)).toBe(0.3);
    expect(clampStretch(-0.3)).toBe(-0.3);
  });

  it('clamps to +/- MAX_EDGE_STRETCH', () => {
    expect(clampStretch(5)).toBe(MAX_EDGE_STRETCH);
    expect(clampStretch(-5)).toBe(-MAX_EDGE_STRETCH);
  });
});

describe('keystoneCorners', () => {
  it('returns the original rectangle unchanged when both stretches are 0', () => {
    const { origin, corrected } = keystoneCorners(400, 300, 0, 0);
    expect(corrected).toEqual(origin);
  });

  it('spreads the left edge apart (beyond the original bounds) for a positive left stretch', () => {
    const { corrected } = keystoneCorners(400, 300, 0.5, 0);
    const [topLeft, , , bottomLeft] = corrected;
    expect(topLeft.y).toBeLessThan(0); // stretched above the original top
    expect(bottomLeft.y).toBeGreaterThan(300); // stretched below the original bottom
    // Symmetric about the vertical center.
    expect(topLeft.y).toBeCloseTo(300 - bottomLeft.y, 10);
  });

  it('pinches the right edge together for a negative right stretch', () => {
    const { corrected } = keystoneCorners(400, 300, 0, -0.5);
    const [, topRight, bottomRight] = corrected;
    expect(topRight.y).toBeGreaterThan(0);
    expect(bottomRight.y).toBeLessThan(300);
    expect(bottomRight.y).toBeGreaterThan(topRight.y);
  });

  it('always keeps left corners at x=0 and right corners at x=width (no horizontal movement)', () => {
    const { corrected } = keystoneCorners(400, 300, 0.4, -0.4);
    expect(corrected[0].x).toBe(0);
    expect(corrected[3].x).toBe(0);
    expect(corrected[1].x).toBe(400);
    expect(corrected[2].x).toBe(400);
  });

  it('clamps extreme stretch values so an edge never collapses past zero height', () => {
    const { corrected } = keystoneCorners(400, 300, -100, 0);
    const [topLeft, , , bottomLeft] = corrected;
    expect(bottomLeft.y).toBeGreaterThan(topLeft.y);
  });
});

describe('KeystoneState', () => {
  it('starts at zero (no adjustment)', () => {
    const state = new KeystoneState();
    expect(state.leftStretch).toBe(0);
    expect(state.rightStretch).toBe(0);
    expect(state.hasBeenAdjusted).toBe(false);
  });

  it('setLeftStretch / setRightStretch clamp and mark as adjusted', () => {
    const state = new KeystoneState();
    state.setLeftStretch(2);
    expect(state.leftStretch).toBe(MAX_EDGE_STRETCH);
    expect(state.hasBeenAdjusted).toBe(true);
    state.setRightStretch(-2);
    expect(state.rightStretch).toBe(-MAX_EDGE_STRETCH);
  });

  it('reset() zeroes both sides', () => {
    const state = new KeystoneState();
    state.setLeftStretch(0.3);
    state.setRightStretch(-0.2);
    state.reset();
    expect(state.leftStretch).toBe(0);
    expect(state.rightStretch).toBe(0);
    expect(state.hasBeenAdjusted).toBe(false);
  });

  it('computeHomography maps every original corner exactly onto its corrected position', () => {
    const state = new KeystoneState();
    state.setLeftStretch(0.35);
    state.setRightStretch(-0.2);
    const width = 500;
    const height = 350;
    const h = state.computeHomography(width, height);
    const { origin, corrected } = keystoneCorners(width, height, state.leftStretch, state.rightStretch);
    origin.forEach((p, i) => {
      const mapped = applyHomography(p, h);
      expect(mapped.x).toBeCloseTo(corrected[i].x, 6);
      expect(mapped.y).toBeCloseTo(corrected[i].y, 6);
    });
  });

  it('computeHomography is the identity map when unadjusted', () => {
    const state = new KeystoneState();
    const h = state.computeHomography(400, 300);
    const testPoints = [
      { x: 0, y: 0 },
      { x: 400, y: 300 },
      { x: 200, y: 150 },
    ];
    for (const p of testPoints) {
      const mapped = applyHomography(p, h);
      expect(mapped.x).toBeCloseTo(p.x, 6);
      expect(mapped.y).toBeCloseTo(p.y, 6);
    }
  });
});
