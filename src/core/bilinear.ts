/**
 * Bilinear pixel sampling over a raw RGBA buffer (as from ImageData.data).
 * Pure function operating on typed arrays, so it's testable without canvas.
 */
export function bilinearSample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  // Outside the source image (with half-pixel tolerance at the border) -> fully transparent.
  if (x < -0.5 || y < -0.5 || x > width - 0.5 || y > height - 0.5) {
    return [0, 0, 0, 0];
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const clampCoord = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
  const readPixel = (px: number, py: number): [number, number, number, number] => {
    const idx = (clampCoord(py, height) * width + clampCoord(px, width)) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };

  const c00 = readPixel(x0, y0);
  const c10 = readPixel(x0 + 1, y0);
  const c01 = readPixel(x0, y0 + 1);
  const c11 = readPixel(x0 + 1, y0 + 1);

  const result: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const top = c00[i] * (1 - fx) + c10[i] * fx;
    const bottom = c01[i] * (1 - fx) + c11[i] * fx;
    result[i] = top * (1 - fy) + bottom * fy;
  }
  return result;
}
