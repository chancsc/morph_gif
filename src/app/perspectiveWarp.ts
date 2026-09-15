/**
 * Bakes a perspective (homography) warp into a new canvas by inverse-mapping
 * each destination pixel back to source coordinates and bilinearly sampling
 * (spec §8.3: "Confirm button to bake the warp into a new canvas image").
 */
import { applyHomography, invertHomography, type HomographyMatrix } from '../core/geometry.ts';
import { bilinearSample } from '../core/bilinear.ts';

export function warpImageToCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  /** Homography mapping source pixel coordinates to destination pixel coordinates. */
  homography: HomographyMatrix,
  outWidth: number,
  outHeight: number,
): HTMLCanvasElement {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('warpImageToCanvas: could not get source 2D context');
  srcCtx.drawImage(source, 0, 0, srcWidth, srcHeight);
  const srcData = srcCtx.getImageData(0, 0, srcWidth, srcHeight).data;

  // We iterate destination pixels, so we need the inverse map (dest -> src).
  const inverseH = invertHomography(homography);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('warpImageToCanvas: could not get output 2D context');
  const outImageData = outCtx.createImageData(outWidth, outHeight);
  const outData = outImageData.data;

  for (let destY = 0; destY < outHeight; destY++) {
    for (let destX = 0; destX < outWidth; destX++) {
      const srcPoint = applyHomography({ x: destX + 0.5, y: destY + 0.5 }, inverseH);
      const [r, g, b, a] = bilinearSample(srcData, srcWidth, srcHeight, srcPoint.x, srcPoint.y);
      const idx = (destY * outWidth + destX) * 4;
      outData[idx] = r;
      outData[idx + 1] = g;
      outData[idx + 2] = b;
      outData[idx + 3] = a;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
}
