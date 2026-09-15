/** Minimal ambient type for the gif.js UMD bundle (no official types ship with the package). */
declare module 'gif.js/dist/gif.js' {
  export interface GifOptions {
    workers?: number;
    quality?: number;
    workerScript?: string;
    repeat?: number;
    background?: string;
    width?: number | null;
    height?: number | null;
    transparent?: number | null;
    dither?: boolean | string;
    debug?: boolean;
  }

  export interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
  }

  export default class GIF {
    constructor(options?: GifOptions);
    addFrame(
      image: CanvasRenderingContext2D | HTMLCanvasElement | HTMLImageElement | ImageData,
      options?: AddFrameOptions,
    ): void;
    on(event: 'start' | 'abort', listener: () => void): void;
    on(event: 'progress', listener: (fraction: number) => void): void;
    on(event: 'finished', listener: (blob: Blob, data: Uint8Array) => void): void;
    render(): void;
    abort(): void;
  }
}
