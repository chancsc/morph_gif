/**
 * Transform estimation from point-pair correspondences (spec §4).
 *
 * All three estimators are hand-rolled (no OpenCV.js) to keep the bundle small,
 * per the spec's recommendation in §6. Every function here is pure and takes
 * plain data in/out, so it can be unit tested without a DOM or canvas.
 */
import { invert3x3, solveLeastSquares, solveLinearSystem } from './linalg.ts';

export interface Point {
  x: number;
  y: number;
}

export interface PointPair {
  /** Point on Photo A (the fixed reference image). */
  a: Point;
  /** Corresponding point on Photo B (the image being aligned onto A). */
  b: Point;
}

/**
 * 2D affine matrix: x' = a*x + b*y + e ; y' = c*x + d*y + f
 * A similarity transform is represented the same way (with b == -c).
 */
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * 2D projective (homography) matrix, normalized so h33 = 1:
 *   x' = (h11*x + h12*y + h13) / (h31*x + h32*y + 1)
 *   y' = (h21*x + h22*y + h23) / (h31*x + h32*y + 1)
 */
export interface HomographyMatrix {
  h11: number;
  h12: number;
  h13: number;
  h21: number;
  h22: number;
  h23: number;
  h31: number;
  h32: number;
}

export const IDENTITY_AFFINE: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function requireMinPairs(pairs: PointPair[], min: number, name: string): void {
  if (pairs.length < min) {
    throw new Error(`${name}: need at least ${min} point pairs, got ${pairs.length}`);
  }
}

/**
 * Fits a similarity transform (uniform scale + rotation + translation, 4 DOF)
 * mapping B points onto A points, in the least-squares sense.
 *
 * Despite encoding rotation and scale, the system is *linear* in the
 * unknowns (a, b, tx, ty) where a = s*cos(theta), b = s*sin(theta):
 *   x' =  a*x - b*y + tx
 *   y' =  b*x + a*y + ty
 * so it can be solved directly via least squares, without Procrustes/SVD.
 */
export function solveSimilarity(pairs: PointPair[]): AffineMatrix {
  requireMinPairs(pairs, 2, 'solveSimilarity');
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const { a, b } of pairs) {
    rows.push([b.x, -b.y, 1, 0]);
    targets.push(a.x);
    rows.push([b.y, b.x, 0, 1]);
    targets.push(a.y);
  }
  const [sa, sb, tx, ty] = solveLeastSquares(rows, targets);
  return { a: sa, b: -sb, c: sb, d: sa, e: tx, f: ty };
}

/**
 * Fits a full affine transform (independent x/y scale, shear, rotation,
 * translation, 6 DOF) mapping B points onto A points, in the least-squares
 * sense. The x' and y' equations are independent given fixed (x,y) inputs,
 * so this decouples into two 3-unknown least-squares solves.
 */
export function solveAffine(pairs: PointPair[]): AffineMatrix {
  requireMinPairs(pairs, 3, 'solveAffine');
  const design = pairs.map(({ b }) => [b.x, b.y, 1]);
  const targetX = pairs.map(({ a }) => a.x);
  const targetY = pairs.map(({ a }) => a.y);
  const [a, b, e] = solveLeastSquares(design, targetX);
  const [c, d, f] = solveLeastSquares(design, targetY);
  return { a, b, c, d, e, f };
}

export function applyAffine(p: Point, m: AffineMatrix): Point {
  return { x: m.a * p.x + m.b * p.y + m.e, y: m.c * p.x + m.d * p.y + m.f };
}

/** Canvas 2D's setTransform(a,b,c,d,e,f) uses x'=a*x+c*y+e, y'=b*x+d*y+f — reordered from our (a,b,c,d,e,f). */
export function toCanvasSetTransformArgs(m: AffineMatrix): [number, number, number, number, number, number] {
  return [m.a, m.c, m.b, m.d, m.e, m.f];
}

/**
 * Solves a homography (8 DOF perspective transform) from exactly 4 point
 * correspondences via direct linear transform (DLT). With exactly 4 pairs
 * the system is exactly determined (8 equations, 8 unknowns), so this is a
 * direct linear solve rather than a least-squares fit — matching the
 * 4-draggable-handle interaction in spec §8.2.
 */
export function solveHomography4(pairs: PointPair[]): HomographyMatrix {
  if (pairs.length !== 4) {
    throw new Error(`solveHomography4: requires exactly 4 point pairs, got ${pairs.length}`);
  }
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const { a: dst, b: src } of pairs) {
    const { x, y } = src;
    const { x: X, y: Y } = dst;
    rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    targets.push(X);
    rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    targets.push(Y);
  }
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solveLinearSystem(rows, targets);
  return { h11, h12, h13, h21, h22, h23, h31, h32 };
}

export function applyHomography(p: Point, h: HomographyMatrix): Point {
  const denom = h.h31 * p.x + h.h32 * p.y + 1;
  return {
    x: (h.h11 * p.x + h.h12 * p.y + h.h13) / denom,
    y: (h.h21 * p.x + h.h22 * p.y + h.h23) / denom,
  };
}

function homographyToMatrix(h: HomographyMatrix): number[][] {
  return [
    [h.h11, h.h12, h.h13],
    [h.h21, h.h22, h.h23],
    [h.h31, h.h32, 1],
  ];
}

function matrixToHomography(m: number[][]): HomographyMatrix {
  const scale = m[2][2];
  if (Math.abs(scale) < 1e-12) {
    throw new Error('matrixToHomography: cannot normalize, h33 is ~0');
  }
  return {
    h11: m[0][0] / scale,
    h12: m[0][1] / scale,
    h13: m[0][2] / scale,
    h21: m[1][0] / scale,
    h22: m[1][1] / scale,
    h23: m[1][2] / scale,
    h31: m[2][0] / scale,
    h32: m[2][1] / scale,
  };
}

/** Inverts a homography, so it maps destination coordinates back to source coordinates. */
export function invertHomography(h: HomographyMatrix): HomographyMatrix {
  return matrixToHomography(invert3x3(homographyToMatrix(h)));
}

/**
 * Converts a 2D homography into a CSS `matrix3d()` string for a live-preview
 * warp (spec §8.3), by embedding the 3x3 projective matrix into a 4x4 matrix
 * that leaves the z-axis untouched. Column-major, as CSS `matrix3d` expects.
 * Callers should also set `transform-origin: 0 0` on the transformed element
 * so pixel (0,0) of the source image maps through unchanged.
 */
export function homographyToCssMatrix3d(h: HomographyMatrix): string {
  const values = [
    h.h11, h.h21, 0, h.h31,
    h.h12, h.h22, 0, h.h32,
    0, 0, 1, 0,
    h.h13, h.h23, 0, 1,
  ];
  return `matrix3d(${values.join(', ')})`;
}
