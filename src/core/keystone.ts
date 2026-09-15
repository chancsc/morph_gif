/**
 * Simplified single-axis perspective (keystone) correction (spec §8, revised
 * for a simpler touch control). Instead of dragging 4 free 2D corner
 * handles, the user pulls on the left or right edge, up or down; each side
 * gets one number - `leftStretch` / `rightStretch` - describing how far that
 * edge's two corners spread apart (positive) or pull together (negative),
 * symmetrically about the vertical center. This models the common case: a
 * photo of an upright, horizontally-centered subject shot with a slight
 * left-right tilt, so one edge reads "taller" than the other (the classic
 * keystone effect). Pure math, no DOM.
 */
import { solveHomography4, type HomographyMatrix, type Point } from './geometry.ts';

/** Clamped so an edge's half-height never collapses to (or past) zero. */
export const MAX_EDGE_STRETCH = 0.6;

export function clampStretch(value: number): number {
  return Math.min(MAX_EDGE_STRETCH, Math.max(-MAX_EDGE_STRETCH, value));
}

export interface KeystoneCorners {
  /** The 4 original image corners: [top-left, top-right, bottom-right, bottom-left]. */
  origin: [Point, Point, Point, Point];
  /** Where each of those corners should land after correction, same order. */
  corrected: [Point, Point, Point, Point];
}

/**
 * Computes the origin/corrected corner correspondences for a `width`x`height`
 * image, given how much each edge should stretch (>0) or pinch (<0) around
 * its vertical center. Left corners always stay at x=0 and right corners at
 * x=width - only their y-positions move - since the whole point of this
 * simplified control is correcting keystone, not general 2D warping.
 */
export function keystoneCorners(width: number, height: number, leftStretch: number, rightStretch: number): KeystoneCorners {
  const cy = height / 2;
  const leftHalf = (height / 2) * (1 + clampStretch(leftStretch));
  const rightHalf = (height / 2) * (1 + clampStretch(rightStretch));

  const origin: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const corrected: [Point, Point, Point, Point] = [
    { x: 0, y: cy - leftHalf },
    { x: width, y: cy - rightHalf },
    { x: width, y: cy + rightHalf },
    { x: 0, y: cy + leftHalf },
  ];
  return { origin, corrected };
}

export class KeystoneState {
  leftStretch = 0;
  rightStretch = 0;

  setLeftStretch(value: number): void {
    this.leftStretch = clampStretch(value);
  }

  setRightStretch(value: number): void {
    this.rightStretch = clampStretch(value);
  }

  reset(): void {
    this.leftStretch = 0;
    this.rightStretch = 0;
  }

  get hasBeenAdjusted(): boolean {
    return this.leftStretch !== 0 || this.rightStretch !== 0;
  }

  /** Homography mapping a `width`x`height` image's original corners onto the corrected layout. */
  computeHomography(width: number, height: number): HomographyMatrix {
    const { origin, corrected } = keystoneCorners(width, height, this.leftStretch, this.rightStretch);
    return solveHomography4(origin.map((o, i) => ({ a: corrected[i], b: o })));
  }
}
