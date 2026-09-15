/**
 * GIF encoding via gif.js (spec F10-F11, §6). Runs entirely client-side in
 * a Web Worker; nothing leaves the browser.
 */
import GIF from 'gif.js/dist/gif.js';
import { buildPingPongOpacitySequence, computeFrameDelayMs } from '../core/gifSequence.ts';

export interface GifRenderInputs {
  /** Photo A, pre-drawn at the target output size. */
  baseCanvas: HTMLCanvasElement;
  /** Aligned Photo B, pre-drawn at the same output size as baseCanvas. */
  topCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Frames in the ascending 0->1 half of the ping-pong loop; total frames = 2*halfFrameCount-2. */
  halfFrameCount: number;
  durationMs: number;
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
    quality = 10,
    workerScript = 'gif.worker.js',
    onProgress,
  } = inputs;

  const sequence = buildPingPongOpacitySequence(halfFrameCount);
  const delay = Math.max(20, Math.round(computeFrameDelayMs(durationMs, sequence.length)));

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) throw new Error('renderPingPongGif: could not get 2D context');

  const gif = new GIF({ workers: 2, quality, workerScript, width, height, repeat: 0 });

  for (const opacity of sequence) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.drawImage(baseCanvas, 0, 0, width, height);
    ctx.globalAlpha = opacity;
    ctx.drawImage(topCanvas, 0, 0, width, height);
    ctx.globalAlpha = 1;
    gif.addFrame(ctx, { copy: true, delay });
  }

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
