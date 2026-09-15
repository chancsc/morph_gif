/**
 * Simplified perspective (keystone) correction editor (spec §8, revised for
 * a simpler touch control). Two edge handles sit at the vertical middle of
 * the left and right image edges; dragging one up or down stretches or
 * pinches that edge symmetrically about the vertical center, correcting the
 * common case of an upright, centered subject shot with a slight left-right
 * tilt. The live preview uses CSS `matrix3d()` (§8.3), and "Confirm" bakes a
 * true per-pixel warp into a new full-resolution image via
 * `warpImageToCanvas` before the point-pair alignment step runs.
 */
import { homographyToCssMatrix3d } from '../core/geometry.ts';
import { computeDisplayScale } from '../core/imageUtils.ts';
import { KeystoneState, MAX_EDGE_STRETCH } from '../core/keystone.ts';
import { warpImageToCanvas } from './perspectiveWarp.ts';
import { workingImageFromCanvas, type WorkingImage } from './workingImage.ts';

export class PerspectiveEditor {
  private readonly container: HTMLElement;
  /** Wraps the canvas + handles at their full, unscaled pixel size; gets CSS-scaled as a unit to fit small screens. */
  private readonly innerEl: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly leftHandleEl: HTMLElement;
  private readonly rightHandleEl: HTMLElement;
  private readonly maxDisplayDim: number;
  private readonly state = new KeystoneState();
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
    if (handleEls.length !== 2) {
      throw new Error('PerspectiveEditor: needs exactly 2 handle elements (left edge, right edge)');
    }
    const leftHandleEl = handleEls.find((el) => el.dataset.handle === 'left');
    const rightHandleEl = handleEls.find((el) => el.dataset.handle === 'right');
    if (!leftHandleEl || !rightHandleEl) {
      throw new Error('PerspectiveEditor: handle elements must have data-handle="left" and "right"');
    }
    const innerEl = previewCanvas.parentElement;
    if (!innerEl) {
      throw new Error('PerspectiveEditor: previewCanvas must have a wrapping parent element');
    }
    this.container = container;
    this.innerEl = innerEl;
    this.previewCanvas = previewCanvas;
    this.leftHandleEl = leftHandleEl;
    this.rightHandleEl = rightHandleEl;
    this.maxDisplayDim = maxDisplayDim;
    this.previewCanvas.style.transformOrigin = '0 0';
    this.innerEl.style.transformOrigin = '0 0';
    this.makeDraggable(this.leftHandleEl, 'left');
    this.makeDraggable(this.rightHandleEl, 'right');
  }

  get isActive(): boolean {
    return this.sourceImage !== null;
  }

  load(image: WorkingImage): void {
    this.sourceImage = image;
    this.state.reset();
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

    this.syncHandleElements();
    this.updatePreviewTransform();
  }

  reset(): void {
    this.state.reset();
    this.syncHandleElements();
    this.updatePreviewTransform();
  }

  /** Bakes the current warp into a new full-resolution WorkingImage. */
  confirm(): WorkingImage {
    if (!this.sourceImage) {
      throw new Error('PerspectiveEditor: no image loaded');
    }
    // Stretch values are resolution-independent (fractions of half-height), so the homography can
    // be computed directly from the full-resolution image dimensions - no display-scale conversion.
    const homography = this.state.computeHomography(this.sourceImage.width, this.sourceImage.height);
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

  /**
   * Handle vertical position encodes stretch directly: centered = no adjustment, dragged to the
   * very top = max spread, dragged to the very bottom = max pinch. The full physical travel
   * range (0..dispH) maps onto the full allowed stretch range (+/-MAX_EDGE_STRETCH) with no dead
   * zone, so the handle tracks the pointer 1:1 across its entire draggable range.
   */
  private stretchToHandleY(stretch: number): number {
    return this.dispH / 2 - (stretch / MAX_EDGE_STRETCH) * (this.dispH / 2);
  }

  private handleYToStretch(handleY: number): number {
    return ((this.dispH / 2 - handleY) / (this.dispH / 2)) * MAX_EDGE_STRETCH;
  }

  private syncHandleElements(): void {
    this.leftHandleEl.style.left = '0px';
    this.leftHandleEl.style.top = `${this.stretchToHandleY(this.state.leftStretch)}px`;
    this.rightHandleEl.style.left = `${this.dispW}px`;
    this.rightHandleEl.style.top = `${this.stretchToHandleY(this.state.rightStretch)}px`;
  }

  private updatePreviewTransform(): void {
    if (!this.sourceImage) return;
    const homography = this.state.computeHomography(this.dispW, this.dispH);
    this.previewCanvas.style.transform = homographyToCssMatrix3d(homography);
  }

  private makeDraggable(el: HTMLElement, side: 'left' | 'right'): void {
    el.addEventListener('pointerdown', (downEvent) => {
      if (!this.sourceImage) return;
      downEvent.preventDefault();
      el.setPointerCapture(downEvent.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const rect = this.container.getBoundingClientRect();
        // Pointer coordinates are in real screen pixels; convert back into the editor's unscaled
        // dispH coordinate space (undoing the CSS fit-scale), then to a stretch value. Only the
        // vertical position matters - horizontal drift is ignored, keeping this a 1D "pull" control.
        const rawY = (moveEvent.clientY - rect.top) / this.fitScale;
        const clampedY = Math.min(Math.max(rawY, 0), this.dispH);
        const stretch = this.handleYToStretch(clampedY);
        if (side === 'left') this.state.setLeftStretch(stretch);
        else this.state.setRightStretch(stretch);
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
