import { describe, expect, it } from 'vitest';
import { invert3x3, multiplyAtA, multiplyAtB, solveLeastSquares, solveLinearSystem } from './linalg.ts';

describe('solveLinearSystem', () => {
  it('solves a simple 2x2 system exactly', () => {
    // 2x + y = 5 ; x - y = 1  ->  x=2, y=1
    const x = solveLinearSystem(
      [
        [2, 1],
        [1, -1],
      ],
      [5, 1],
    );
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(1, 10);
  });

  it('solves identity system unchanged', () => {
    const x = solveLinearSystem(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [7, -3, 42],
    );
    expect(x).toEqual([7, -3, 42]);
  });

  it('uses partial pivoting so a zero on the diagonal does not blow up', () => {
    // Row 1 has a 0 in column 0; naive elimination without pivoting would divide by zero.
    const x = solveLinearSystem(
      [
        [0, 1],
        [1, 1],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('throws on a singular matrix', () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/singular/i);
  });

  it('throws on a non-square input', () => {
    expect(() => solveLinearSystem([[1, 2]], [1])).toThrow();
  });
});

describe('multiplyAtA / multiplyAtB', () => {
  it('computes transpose(A)*A and transpose(A)*b correctly', () => {
    const a = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const b = [1, 2, 3];
    expect(multiplyAtA(a)).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(multiplyAtB(a, b)).toEqual([4, 5]);
  });
});

describe('solveLeastSquares', () => {
  it('recovers an exact fit when the system is exactly determined', () => {
    // y = 2x + 1
    const a = [
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const b = [1, 3, 5];
    const [slope, intercept] = solveLeastSquares(a, b);
    expect(slope).toBeCloseTo(2, 8);
    expect(intercept).toBeCloseTo(1, 8);
  });

  it('finds the best fit for an overdetermined, noisy system', () => {
    // Points roughly along y = 3x, with one outlier-ish nudge.
    const a = [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ];
    const b = [0.1, 2.9, 6.2, 8.8];
    const [slope, intercept] = solveLeastSquares(a, b);
    expect(slope).toBeGreaterThan(2.5);
    expect(slope).toBeLessThan(3.2);
    expect(intercept).toBeGreaterThan(-1);
    expect(intercept).toBeLessThan(1);
  });

  it('throws when there are fewer rows than columns', () => {
    expect(() => solveLeastSquares([[1, 2, 3]], [1])).toThrow();
  });
});

describe('invert3x3', () => {
  it('inverts the identity to itself', () => {
    const inv = invert3x3([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(inv).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it('inverts a scale+translate matrix and round-trips', () => {
    const m = [
      [2, 0, 5],
      [0, 4, -3],
      [0, 0, 1],
    ];
    const inv = invert3x3(m);
    // m * inv should be (close to) identity
    const product = multiplyMatrices(m, inv);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i][j]).toBeCloseTo(i === j ? 1 : 0, 8);
      }
    }
  });

  it('throws on a singular matrix', () => {
    expect(() =>
      invert3x3([
        [1, 2, 3],
        [2, 4, 6],
        [1, 1, 1],
      ]),
    ).toThrow(/singular/i);
  });
});

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const result: number[][] = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[i][k] * b[k][j];
      result[i][j] = sum;
    }
  }
  return result;
}
