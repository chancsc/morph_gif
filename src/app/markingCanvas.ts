/**
 * Renders one photo (scaled to fit) on a canvas, converts on-canvas clicks
 * back to full-resolution image coordinates, and draws point markers with
 * numeric labels (spec F2, F3, F12; NFR §7: downscaled preview canvas).
 */
import type { Point } from '../core/geometry.ts';
import { computeDisplayScale } from '../core/imageUtils.ts';
import type { WorkingImage } from './workingImage.ts';

export interface MarkerPoint extends Point {
  label: string;
}

export class MarkingCanvasView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maxDisplayDim: number;
  private readonly onImageClick: (fullResPoint: Point) => void;
  private image: WorkingImage | null = null;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement, maxDisplayDim: number, onImageClick: (fullResPoint: Point) => void) {
    this.canvas = canvas;
    this.maxDisplayDim = maxDisplayDim;
    this.onImageClick = onImageClick;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MarkingCanvasView: could not get 2D context');
    this.ctx = ctx;
    canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  setImage(image: WorkingImage): void {
    this.image = image;
    this.scale = computeDisplayScale(image.width, image.height, this.maxDisplayDim);
    this.canvas.width = Math.max(1, Math.round(image.width * this.scale));
    this.canvas.height = Math.max(1, Math.round(image.height * this.scale));
    this.render([]);
  }

  get hasImage(): boolean {
    return this.image !== null;
  }

  private handleClick(e: MouseEvent): void {
    if (!this.image) return;
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
    const canvasY = ((e.clientY - rect.top) * this.canvas.height) / rect.height;
    this.onImageClick({ x: canvasX / this.scale, y: canvasY / this.scale });
  }

  /** Redraws the base image plus markers, given in full-resolution image coordinates. */
  render(markers: MarkerPoint[]): void {
    if (!this.image) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.image.source, 0, 0, this.canvas.width, this.canvas.height);

    for (const m of markers) {
      const x = m.x * this.scale;
      const y = m.y * this.scale;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(230, 57, 70, 0.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, x, y);
    }
  }
}
