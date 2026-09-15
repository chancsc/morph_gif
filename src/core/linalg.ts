/**
 * Minimal linear algebra helpers: Gaussian elimination with partial pivoting.
 * Kept dependency-free (no OpenCV.js) to keep the bundle small, per spec §6/§4.
 */

/** Solves the square linear system A x = b. Mutates copies internally, not the inputs. */
export function solveLinearSystem(aInput: number[][], bInput: number[]): number[] {
  const n = bInput.length;
  if (aInput.length !== n || aInput.some((row) => row.length !== n)) {
    throw new Error(`solveLinearSystem: expected a square ${n}x${n} matrix`);
  }

  // Augmented matrix, working copy.
  const m = aInput.map((row, i) => [...row, bInput[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: find row with largest absolute value in this column.
    let pivotRow = col;
    let pivotVal = Math.abs(m[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(m[row][col]);
      if (v > pivotVal) {
        pivotVal = v;
        pivotRow = row;
      }
    }
    if (pivotVal < 1e-12) {
      throw new Error(
        'solveLinearSystem: matrix is singular or near-singular (are the points collinear or duplicated?)',
      );
    }
    if (pivotRow !== col) {
      [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
    }

    const pivot = m[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        m[row][c] -= factor * m[col][c];
      }
    }
  }

  return m.map((row, i) => row[n] / m[i][i]);
}

/** Multiplies transpose(A) * A for a rectangular matrix A (rows x cols). */
export function multiplyAtA(a: number[][]): number[][] {
  const rows = a.length;
  const cols = a[0].length;
  const result: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let r = 0; r < rows; r++) sum += a[r][i] * a[r][j];
      result[i][j] = sum;
    }
  }
  return result;
}

/** Multiplies transpose(A) * b. */
export function multiplyAtB(a: number[][], b: number[]): number[] {
  const rows = a.length;
  const cols = a[0].length;
  const result = new Array(cols).fill(0);
  for (let i = 0; i < cols; i++) {
    let sum = 0;
    for (let r = 0; r < rows; r++) sum += a[r][i] * b[r];
    result[i] = sum;
  }
  return result;
}

/** Least-squares solve of A x = b (rows >= cols) via normal equations. */
export function solveLeastSquares(a: number[][], b: number[]): number[] {
  if (a.length < a[0].length) {
    throw new Error('solveLeastSquares: need at least as many rows as columns');
  }
  const ata = multiplyAtA(a);
  const atb = multiplyAtB(a, b);
  return solveLinearSystem(ata, atb);
}

/** Inverts a 3x3 matrix. Throws if singular. */
export function invert3x3(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) {
    throw new Error('invert3x3: matrix is singular');
  }
  const invDet = 1 / det;
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}
