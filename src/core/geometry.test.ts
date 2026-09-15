import { describe, expect, it } from 'vitest';
import {
  applyAffine,
  applyHomography,
  homographyToCssMatrix3d,
  invertHomography,
  solveAffine,
  solveHomography4,
  solveSimilarity,
  toCanvasSetTransformArgs,
  type AffineMatrix,
  type Point,
  type PointPair,
} from './geometry.ts';

function makePairsFromAffine(points: Point[], m: AffineMatrix): PointPair[] {
  // "a" is the target (Photo A); "b" is the source (Photo B) that gets transformed onto a.
  return points.map((b) => ({ a: applyAffine(b, m), b }));
}

function expectPointsClose(actual: Point, expected: Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

const SQUARE: Point[] = [
  { x: 10, y: 10 },
  { x: 200, y: 15 },
  { x: 190, y: 210 },
  { x: 5, y: 195 },
];

describe('solveSimilarity', () => {
  it('recovers a known rotation+scale+translation exactly (noise-free)', () => {
    const theta = Math.PI / 9; // 20 degrees
    const scale = 1.35;
    const truth: AffineMatrix = {
      a: scale * Math.cos(theta),
      b: -scale * Math.sin(theta),
      c: scale * Math.sin(theta),
      d: scale * Math.cos(theta),
      e: 50,
      f: -20,
    };
    const pairs = makePairsFromAffine(SQUARE, truth);
    const fitted = solveSimilarity(pairs);

    for (const b of SQUARE) {
      expectPointsClose(applyAffine(b, fitted), applyAffine(b, truth), 6);
    }
    // Similarity preserves aspect ratio: same scale factor along both axes.
    const scaleX = Math.hypot(fitted.a, fitted.c);
    const scaleY = Math.hypot(fitted.b, fitted.d);
    expect(scaleX).toBeCloseTo(scaleY, 6);
  });

  it('least-squares-fits an overdetermined, slightly noisy set of pairs', () => {
    const theta = 0.1;
    const scale = 0.9;
    const truth: AffineMatrix = {
      a: scale * Math.cos(theta),
      b: -scale * Math.sin(theta),
      c: scale * Math.sin(theta),
      d: scale * Math.cos(theta),
      e: 3,
      f: 4,
    };
    const points: Point[] = [
      ...SQUARE,
      { x: 100, y: 100 },
      { x: 60, y: 150 },
    ];
    const noisyPairs = makePairsFromAffine(points, truth).map((pair, i) => ({
      ...pair,
      // Deterministic tiny jitter, alternating sign, well below the transform's scale.
      a: { x: pair.a.x + (i % 2 === 0 ? 0.3 : -0.3), y: pair.a.y + (i % 2 === 0 ? -0.3 : 0.3) },
    }));

    const fitted = solveSimilarity(noisyPairs);
    for (const b of points) {
      expectPointsClose(applyAffine(b, fitted), applyAffine(b, truth), 0);
    }
  });

  it('throws with fewer than 2 pairs', () => {
    expect(() => solveSimilarity([{ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }])).toThrow();
  });
});

describe('solveAffine', () => {
  it('recovers a known non-uniform-scale + shear transform exactly with 4 pairs', () => {
    const truth: AffineMatrix = { a: 1.6, b: 0.3, c: -0.2, d: 0.8, e: 12, f: -7 };
    const pairs = makePairsFromAffine(SQUARE, truth);
    const fitted = solveAffine(pairs);
    for (const b of SQUARE) {
      expectPointsClose(applyAffine(b, fitted), applyAffine(b, truth), 6);
    }
  });

  it('recovers a known transform exactly from the minimum 3 pairs', () => {
    const truth: AffineMatrix = { a: 2, b: 0, c: 0, d: 0.5, e: -3, f: 9 };
    const pairs = makePairsFromAffine(SQUARE.slice(0, 3), truth);
    const fitted = solveAffine(pairs);
    for (const b of SQUARE.slice(0, 3)) {
      expectPointsClose(applyAffine(b, fitted), applyAffine(b, truth), 6);
    }
  });

  it('throws with fewer than 3 pairs', () => {
    expect(() =>
      solveAffine([
        { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
        { a: { x: 1, y: 0 }, b: { x: 2, y: 1 } },
      ]),
    ).toThrow();
  });

  it('throws for collinear (degenerate) source points', () => {
    const collinear: PointPair[] = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
      { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } },
      { a: { x: 2, y: 2 }, b: { x: 2, y: 2 } },
    ];
    expect(() => solveAffine(collinear)).toThrow(/singular/i);
  });
});

describe('toCanvasSetTransformArgs', () => {
  it('reorders to the canvas setTransform(a,b,c,d,e,f) convention', () => {
    const m: AffineMatrix = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
    expect(toCanvasSetTransformArgs(m)).toEqual([1, 3, 2, 4, 5, 6]);
  });
});

describe('homography (solveHomography4 / applyHomography / invertHomography)', () => {
  const srcCorners: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  // A genuine perspective distortion: not affine, corners map to a non-parallelogram quad.
  const dstCorners: Point[] = [
    { x: 10, y: 20 },
    { x: 220, y: 5 },
    { x: 180, y: 190 },
    { x: -5, y: 210 },
  ];

  it('solves a homography that exactly reproduces the 4 correspondences', () => {
    const pairs: PointPair[] = srcCorners.map((b, i) => ({ a: dstCorners[i], b }));
    const h = solveHomography4(pairs);
    for (let i = 0; i < 4; i++) {
      expectPointsClose(applyHomography(srcCorners[i], h), dstCorners[i], 6);
    }
  });

  it('is genuinely projective: the midpoint of the source square does not map to the midpoint of the quad under an affine assumption', () => {
    const pairs: PointPair[] = srcCorners.map((b, i) => ({ a: dstCorners[i], b }));
    const h = solveHomography4(pairs);
    const srcMid = { x: 50, y: 50 };
    const mappedMid = applyHomography(srcMid, h);
    const avgOfCorners = {
      x: dstCorners.reduce((s, p) => s + p.x, 0) / 4,
      y: dstCorners.reduce((s, p) => s + p.y, 0) / 4,
    };
    // For a true perspective warp these differ; for an affine map of a square's center they'd coincide.
    const dist = Math.hypot(mappedMid.x - avgOfCorners.x, mappedMid.y - avgOfCorners.y);
    expect(dist).toBeGreaterThan(0.01);
  });

  it('inverts so applying H then H^-1 returns the original point', () => {
    const pairs: PointPair[] = srcCorners.map((b, i) => ({ a: dstCorners[i], b }));
    const h = solveHomography4(pairs);
    const hInv = invertHomography(h);
    const testPoints: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
      { x: 33, y: 77 },
    ];
    for (const p of testPoints) {
      const roundTripped = applyHomography(applyHomography(p, h), hInv);
      expectPointsClose(roundTripped, p, 6);
    }
  });

  it('throws unless given exactly 4 pairs', () => {
    const pairs: PointPair[] = srcCorners.slice(0, 3).map((b, i) => ({ a: dstCorners[i], b }));
    expect(() => solveHomography4(pairs)).toThrow(/exactly 4/);
  });
});

describe('homographyToCssMatrix3d', () => {
  it('produces the identity matrix3d for an identity homography', () => {
    const identityPairs: PointPair[] = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
      { a: { x: 1, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } },
      { a: { x: 0, y: 1 }, b: { x: 0, y: 1 } },
    ];
    const h = solveHomography4(identityPairs);
    const css = homographyToCssMatrix3d(h);
    expect(css).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });

  it('places the perspective terms (h31, h32) in the 4th column of rows 1-2', () => {
    const h = { h11: 1, h12: 0, h13: 5, h21: 0, h22: 1, h23: 6, h31: 0.001, h32: 0.002 };
    const css = homographyToCssMatrix3d(h);
    const nums = css
      .slice('matrix3d('.length, -1)
      .split(',')
      .map((s) => Number(s.trim()));
    expect(nums[3]).toBeCloseTo(0.001, 10); // column 1, row 4 -> h31
    expect(nums[7]).toBeCloseTo(0.002, 10); // column 2, row 4 -> h32
    expect(nums[12]).toBeCloseTo(5, 10); // column 4, row 1 -> h13
    expect(nums[13]).toBeCloseTo(6, 10); // column 4, row 2 -> h23
  });
});
