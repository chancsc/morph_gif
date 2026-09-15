/**
 * Image loading and scaling helpers (spec F1, F2, F12, NFR §7).
 *
 * `computeDisplayScale` is pure and unit tested directly. The rest touches
 * the DOM (File/Image/Canvas APIs) and is exercised via the Playwright e2e
 * test instead, since jsdom does not implement real image decoding.
 */

/** Max on-screen size used for point-marking canvases, so huge photos don't freeze the UI (§7). */
export const MARKING_DISPLAY_MAX_DIM = 800;

/** Max output size for the exported GIF, to keep file size manageable (§7). */
export const GIF_OUTPUT_MAX_DIM = 800;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Returns the scale factor to shrink a `width`x`height` image so its longest
 * side is at most `maxDim`. Returns 1 (no upscaling) if it already fits.
 */
export function computeDisplayScale(width: number, height: number, maxDim: number): number {
  if (width <= 0 || height <= 0) {
    throw new Error('computeDisplayScale: width and height must be positive');
  }
  if (maxDim <= 0) {
    throw new Error('computeDisplayScale: maxDim must be positive');
  }
  const longest = Math.max(width, height);
  return longest <= maxDim ? 1 : maxDim / longest;
}

export function isAcceptedImageType(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** Loads a File into a decoded HTMLImageElement. Rejects on unsupported type or decode failure. */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (!isAcceptedImageType(file)) {
    return Promise.reject(
      new Error(`Unsupported file type "${file.type || 'unknown'}". Please upload a JPEG, PNG, or WebP image.`),
    );
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode "${file.name}" as an image.`));
    };
    img.src = url;
  });
}

/** Draws an image into a new canvas at `scale`, returning the canvas. */
export function drawScaledToCanvas(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('drawScaledToCanvas: could not get 2D context');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
