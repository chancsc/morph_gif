/**
 * Point-pair click state machine (spec §2 steps 3-6, F3-F6).
 *
 * Enforces alternating A-then-B click order, supports undo of the last
 * point or any specific completed pair, and reports readiness to align.
 * Pure state, no DOM — testable without a browser.
 */
import type { Point, PointPair } from './geometry.ts';

export type ImageSide = 'A' | 'B';

export const MIN_PAIRS_TO_ALIGN = 4;

export class PairManager {
  private completedPairs: PointPair[] = [];
  private pendingA: Point | null = null;

  /** Which image side the next click should land on. */
  get nextSide(): ImageSide {
    return this.pendingA ? 'B' : 'A';
  }

  /** The unpaired A-point currently awaiting its B counterpart, if any. */
  get pending(): Point | null {
    return this.pendingA;
  }

  get pairs(): readonly PointPair[] {
    return this.completedPairs;
  }

  get count(): number {
    return this.completedPairs.length;
  }

  get isReadyToAlign(): boolean {
    return this.completedPairs.length >= MIN_PAIRS_TO_ALIGN;
  }

  /**
   * Registers a click on the given image side. Throws if the click is on
   * the wrong side (out-of-order click) so the caller can surface an error
   * instead of silently corrupting a pair.
   */
  addPoint(side: ImageSide, point: Point): { pairCompleted: boolean } {
    if (side !== this.nextSide) {
      throw new Error(
        `Expected the next click on image ${this.nextSide} (pair ${this.completedPairs.length + 1}), got a click on image ${side}.`,
      );
    }
    if (side === 'A') {
      this.pendingA = point;
      return { pairCompleted: false };
    }
    this.completedPairs.push({ a: this.pendingA as Point, b: point });
    this.pendingA = null;
    return { pairCompleted: true };
  }

  /** Undoes the most recent click: the pending A-point, or else the last completed pair. */
  removeLastPoint(): void {
    if (this.pendingA) {
      this.pendingA = null;
      return;
    }
    this.completedPairs.pop();
  }

  /** Removes one specific completed pair by index (e.g. from a "delete" button in the pair list). */
  removePairAt(index: number): void {
    if (index < 0 || index >= this.completedPairs.length) {
      throw new Error(`removePairAt: index ${index} out of range`);
    }
    this.completedPairs.splice(index, 1);
  }

  clear(): void {
    this.completedPairs = [];
    this.pendingA = null;
  }
}
