/**
 * Draws Photo A as the base layer and the transform-aligned Photo B on top
 * (spec F8-F9), at an arbitrary display/export scale. The same function
 * renders the interactive on-screen preview and every GIF frame, so
 * "what you see is what gets exported" (§7: preview at reduced size, then
 * apply the transform to the full-res image for final export).
 */
import { toCanvasSetTransformArgs, type AffineMatrix } from '../core/geometry.ts';
import type { WorkingImage } from './workingImage.ts';

export function drawAlignedFrame(
  ctx: CanvasRenderingContext2D,
  photoA: WorkingImage,
  photoB: WorkingImage,
  /** Maps Photo B's full-resolution pixel coords onto Photo A's full-resolution pixel coords. */
  bToAMatrix: AffineMatrix,
  /** Scale from Photo A's full resolution to this canvas's pixel size. */
  scale: number,
  topOpacity: number,
): void {
  const width = Math.round(photoA.width * scale);
  const height = Math.round(photoA.height * scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(photoA.source, 0, 0, photoA.width, photoA.height);

  // Compose the B->A matrix with the display scale: since Scale() is diagonal,
  // Scale(scale) . M is just M's six components each multiplied by `scale`.
  const composed: AffineMatrix = {
    a: bToAMatrix.a * scale,
    b: bToAMatrix.b * scale,
    c: bToAMatrix.c * scale,
    d: bToAMatrix.d * scale,
    e: bToAMatrix.e * scale,
    f: bToAMatrix.f * scale,
  };
  ctx.setTransform(...toCanvasSetTransformArgs(composed));
  ctx.globalAlpha = topOpacity;
  ctx.drawImage(photoB.source, 0, 0, photoB.width, photoB.height);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

/**
 * Draws only the transform-aligned image onto a transparent canvas (no base
 * layer). Used to pre-render each GIF frame's top layer once per frame, so
 * gif.js's cross-fade compositing (`renderPingPongGif`) can vary opacity
 * cheaply against a static base + static top pair.
 */
export function drawTransformedOnly(
  ctx: CanvasRenderingContext2D,
  image: WorkingImage,
  matrix: AffineMatrix,
  scale: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const composed: AffineMatrix = {
    a: matrix.a * scale,
    b: matrix.b * scale,
    c: matrix.c * scale,
    d: matrix.d * scale,
    e: matrix.e * scale,
    f: matrix.f * scale,
  };
  ctx.setTransform(...toCanvasSetTransformArgs(composed));
  ctx.drawImage(image.source, 0, 0, image.width, image.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
