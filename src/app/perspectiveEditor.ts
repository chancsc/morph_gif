/**
 * Optional perspective (tilt) correction editor (spec §8). Shows 4 draggable
 * handles starting at the image corners; dragging them gives a cheap live
 * preview via CSS `matrix3d()` on the preview canvas (§8.3), and "Confirm"
 * bakes a true per-pixel warp into a new full-resolution image via
 * `warpImageToCanvas` before the point-pair alignment step runs.
 */
import { homographyToCssMatrix3d, solveHomography4, type Point } from '../core/geometry.ts';
import { computeDisplayScale } from '../core/imageUtils.ts';
import { PerspectiveHandleSet } from '../core/perspectiveHandles.ts';
import { warpImageToCanvas } from './perspectiveWarp.ts';
import { workingImageFromCanvas, type WorkingImage } from './workingImage.ts';

export class PerspectiveEditor {
  private readonly container: HTMLElement;
  /** Wraps the canvas + handles at their full, unscaled pixel size; gets CSS-scaled as a unit to fit small screens. */
  private readonly innerEl: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly handleEls: readonly HTMLElement[];
  private readonly maxDisplayDim: number;
  private handleSet: PerspectiveHandleSet | null = null;
  private sourceImage: WorkingImage | null = null;
  private displayScale = 1;
  private dispW = 0;
  private dispH = 0;
  /** Uniform CSS scale applied to innerEl to fit the available width (<=1; 1 on wide-enough screens). */
  private fitScale = 1;

  constructor(
    container: HTMLElement,
    previewCanvas: HTMLCanvasElement,
    handleEls: readonly HTMLElement[],
    maxDisplayDim: number,
  ) {
    if (handleEls.length !== 4) {
      throw new Error('PerspectiveEditor: needs exactly 4 handle elements');
    }
    const innerEl = previewCanvas.parentElement;
    if (!innerEl) {
      throw new Error('PerspectiveEditor: previewCanvas must have a wrapping parent element');
    }
    this.container = container;
    this.innerEl = innerEl;
    this.previewCanvas = previewCanvas;
    this.handleEls = handleEls;
    this.maxDisplayDim = maxDisplayDim;
    this.previewCanvas.style.transformOrigin = '0 0';
    this.innerEl.style.transformOrigin = '0 0';
    this.handleEls.forEach((el, id) => this.makeDraggable(el, id));
  }

  get isActive(): boolean {
    return this.handleSet !== null;
  }

  load(image: WorkingImage): void {
    this.sourceImage = image;
    this.displayScale = computeDisplayScale(image.width, image.height, this.maxDisplayDim);
    this.dispW = Math.max(1, Math.round(image.width * this.displayScale));
    this.dispH = Math.max(1, Math.round(image.height * this.displayScale));

    this.previewCanvas.width = this.dispW;
    this.previewCanvas.height = this.dispH;
    this.previewCanvas.style.width = `${this.dispW}px`;
    this.previewCanvas.style.height = `${this.dispH}px`;
    this.innerEl.style.width = `${this.dispW}px`;
    this.innerEl.style.height = `${this.dispH}px`;

    // Shrink the whole editor (canvas + handles, as one unit) to fit the available width, the
    // same way the marking canvases shrink via plain `canvas { max-width: 100% }` on narrow
    // screens - but here handle positions are real DOM elements, not canvas pixels, so a uniform
    // CSS transform (rather than resizing the canvas itself) is what keeps them in sync.
    const availableWidth = this.container.parentElement?.getBoundingClientRect().width || this.dispW;
    this.fitScale = Math.min(1, availableWidth / this.dispW);
    this.innerEl.style.transform = `scale(${this.fitScale})`;
    this.container.style.width = `${this.dispW * this.fitScale}px`;
    this.container.style.height = `${this.dispH * this.fitScale}px`;

    const ctx = this.previewCanvas.getContext('2d');
    if (!ctx) throw new Error('PerspectiveEditor: could not get 2D context');
    ctx.clearRect(0, 0, this.dispW, this.dispH);
    ctx.drawImage(image.source, 0, 0, this.dispW, this.dispH);

    this.handleSet = new PerspectiveHandleSet([
      { x: 0, y: 0 },
      { x: this.dispW, y: 0 },
      { x: this.dispW, y: this.dispH },
      { x: 0, y: this.dispH },
    ]);
    this.syncHandleElements();
    this.updatePreviewTransform();
  }

  reset(): void {
    this.handleSet?.reset();
    this.syncHandleElements();
    this.updatePreviewTransform();
  }

  /** Bakes the current warp into a new full-resolution WorkingImage. */
  confirm(): WorkingImage {
    if (!this.handleSet || !this.sourceImage) {
      throw new Error('PerspectiveEditor: no image loaded');
    }
    // Scale handle positions from display space back to full-resolution source space.
    const toFullRes = (p: Point): Point => ({ x: p.x / this.displayScale, y: p.y / this.displayScale });
    const fullResPairs = this.handleSet.handles.map((h) => ({
      a: toFullRes(h.current),
      b: toFullRes(h.origin),
    }));
    const homography = solveHomography4(fullResPairs);
    const warped = warpImageToCanvas(
      this.sourceImage.source,
      this.sourceImage.width,
      this.sourceImage.height,
      homography,
      this.sourceImage.width,
      this.sourceImage.height,
    );
    return workingImageFromCanvas(warped);
  }

  private syncHandleElements(): void {
    if (!this.handleSet) return;
    this.handleSet.handles.forEach((h, i) => {
      const el = this.handleEls[i];
      el.style.left = `${h.current.x}px`;
      el.style.top = `${h.current.y}px`;
    });
  }

  private updatePreviewTransform(): void {
    if (!this.handleSet) return;
    this.previewCanvas.style.transform = homographyToCssMatrix3d(this.handleSet.computeHomography());
  }

  private makeDraggable(el: HTMLElement, id: number): void {
    el.addEventListener('pointerdown', (downEvent) => {
      if (!this.handleSet) return;
      downEvent.preventDefault();
      el.setPointerCapture(downEvent.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        if (!this.handleSet) return;
        const rect = this.container.getBoundingClientRect();
        const margin = 60;
        // Pointer coordinates are in real screen pixels; convert back into the editor's
        // unscaled dispW x dispH coordinate space (the same space handle positions, the
        // homography, and the matrix3d preview all use) by undoing the CSS fit-scale.
        const rawX = (moveEvent.clientX - rect.left) / this.fitScale;
        const rawY = (moveEvent.clientY - rect.top) / this.fitScale;
        const x = Math.min(Math.max(rawX, -margin), this.dispW + margin);
        const y = Math.min(Math.max(rawY, -margin), this.dispH + margin);
        this.handleSet.moveHandle(id, { x, y });
        this.syncHandleElements();
        this.updatePreviewTransform();
      };
      const onUp = (upEvent: PointerEvent) => {
        el.releasePointerCapture(upEvent.pointerId);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    });
  }
}
