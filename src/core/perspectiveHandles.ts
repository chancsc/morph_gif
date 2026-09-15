/**
 * State for the 4 draggable perspective-correction handles (spec §8.2).
 * Each handle starts at a corner (or user-marked feature point) of the
 * image; dragging it to a "corrected" target position and calling
 * `computeHomography()` yields the homography that warps the original
 * image so that point lands at the dragged position. Pure state, no DOM.
 */
import { solveHomography4, type HomographyMatrix, type Point } from './geometry.ts';

export interface Handle {
  id: number;
  /** The point's position in the original (unwarped) image. */
  origin: Point;
  /** Where the user has dragged it to ("corrected" target position). */
  current: Point;
}

export class PerspectiveHandleSet {
  readonly handles: Handle[];

  constructor(initialCorners: readonly Point[]) {
    if (initialCorners.length !== 4) {
      throw new Error(`PerspectiveHandleSet: requires exactly 4 initial points, got ${initialCorners.length}`);
    }
    this.handles = initialCorners.map((p, id) => ({ id, origin: { ...p }, current: { ...p } }));
  }

  moveHandle(id: number, to: Point): void {
    const handle = this.handles.find((h) => h.id === id);
    if (!handle) throw new Error(`PerspectiveHandleSet: no handle with id ${id}`);
    handle.current = { ...to };
  }

  /** Snaps every handle back to its original (identity-warp) position. */
  reset(): void {
    for (const h of this.handles) h.current = { ...h.origin };
  }

  get hasBeenMoved(): boolean {
    return this.handles.some((h) => h.current.x !== h.origin.x || h.current.y !== h.origin.y);
  }

  /** Homography mapping the original image's pixel coordinates onto the corrected layout. */
  computeHomography(): HomographyMatrix {
    return solveHomography4(this.handles.map((h) => ({ a: h.current, b: h.origin })));
  }
}
