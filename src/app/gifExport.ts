/**
 * GIF encoding via gif.js (spec F10-F11, §6). Runs entirely client-side in
 * a Web Worker; nothing leaves the browser.
 */
import GIF from 'gif.js/dist/gif.js';
import { buildPingPongOpacitySequence, computeFrameDelays } from '../core/gifSequence.ts';

export interface GifRenderInputs {
  /** Photo A, pre-drawn at the target output size. */
  baseCanvas: HTMLCanvasElement;
  /** Aligned Photo B, pre-drawn at the same output size as baseCanvas. */
  topCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Frames in the ascending 0->1 half of the ping-pong loop; total frames = 2*halfFrameCount-2. */
  halfFrameCount: number;
  /** Time spent cross-fading (0->1->0), not counting any hold at either end. */
  durationMs: number;
  /** Extra pause at each end (100% opacity, and 0% opacity when the loop wraps back). Default 0 (no hold). */
  holdMs?: number;
  /** gif.js `repeat` option: 0 = forever, -1 = play once, N = N additional repeats. Default 0. */
  repeat?: number;
  quality?: number;
  workerScript?: string;
  onProgress?: (fraction: number) => void;
}

/** Renders a looping ping-pong cross-fade GIF and resolves with the encoded Blob. */
export function renderPingPongGif(inputs: GifRenderInputs): Promise<Blob> {
  const {
    baseCanvas,
    topCanvas,
    width,
    height,
    halfFrameCount,
    durationMs,
    holdMs = 0,
    repeat = 0,
    quality = 10,
    workerScript = 'gif.worker.js',
    onProgress,
  } = inputs;

  const sequence = buildPingPongOpacitySequence(halfFrameCount);
  const delays = computeFrameDelays(sequence, durationMs, holdMs).map((d) => Math.max(20, Math.round(d)));

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) throw new Error('renderPingPongGif: could not get 2D context');

  const gif = new GIF({ workers: 2, quality, workerScript, width, height, repeat });

  sequence.forEach((opacity, i) => {
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.drawImage(baseCanvas, 0, 0, width, height);
    ctx.globalAlpha = opacity;
    ctx.drawImage(topCanvas, 0, 0, width, height);
    ctx.globalAlpha = 1;
    gif.addFrame(ctx, { copy: true, delay: delays[i] });
  });

  return new Promise((resolve, reject) => {
    gif.on('progress', (fraction) => onProgress?.(fraction));
    gif.on('finished', (blob) => resolve(blob));
    gif.on('abort', () => reject(new Error('GIF rendering was aborted')));
    try {
      gif.render();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
