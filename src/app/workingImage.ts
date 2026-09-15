/**
 * Unifies "a freshly loaded photo" and "a photo baked from a perspective
 * warp" behind one shape, since one is an HTMLImageElement (naturalWidth/
 * naturalHeight) and the other is an HTMLCanvasElement (width/height).
 * Everything downstream (marking, alignment, GIF export) only needs the
 * drawable source plus its pixel dimensions.
 */
export interface WorkingImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export function workingImageFromElement(img: HTMLImageElement): WorkingImage {
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
}

export function workingImageFromCanvas(canvas: HTMLCanvasElement): WorkingImage {
  return { source: canvas, width: canvas.width, height: canvas.height };
}
