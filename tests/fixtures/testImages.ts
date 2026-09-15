/**
 * Deterministic synthetic "photos" for the e2e test: two 400x300 images,
 * each with 4 distinctly colored square markers at known pixel coordinates.
 * The coordinates double as the ground-truth click targets for the point-
 * marking step, so the e2e test can drive real mouse clicks without any
 * image-recognition guesswork.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RgbaCanvas } from './pngEncoder.ts';

export const IMAGE_WIDTH = 400;
export const IMAGE_HEIGHT = 300;

export interface NamedPoint {
  name: string;
  color: [number, number, number];
  x: number;
  y: number;
}

// Photo A: the fixed reference image.
export const PHOTO_A_MARKERS: NamedPoint[] = [
  { name: 'red', color: [220, 40, 40], x: 80, y: 70 },
  { name: 'green', color: [40, 180, 60], x: 320, y: 60 },
  { name: 'blue', color: [40, 90, 220], x: 330, y: 230 },
  { name: 'yellow', color: [230, 200, 30], x: 70, y: 220 },
];

// Photo B: the same 4 features, shifted/scaled to simulate a second, slightly
// different shot - what the app should align back onto Photo A.
export const PHOTO_B_MARKERS: NamedPoint[] = [
  { name: 'red', color: [220, 40, 40], x: 110, y: 95 },
  { name: 'green', color: [40, 180, 60], x: 345, y: 90 },
  { name: 'blue', color: [40, 90, 220], x: 350, y: 245 },
  { name: 'yellow', color: [230, 200, 30], x: 100, y: 240 },
];

function renderPhoto(markers: NamedPoint[]): Buffer {
  const canvas = new RgbaCanvas(IMAGE_WIDTH, IMAGE_HEIGHT, [245, 245, 245]);
  for (const m of markers) canvas.fillSquare(m.x, m.y, 16, m.color);
  return canvas.toPng();
}

export interface TestImagePaths {
  photoA: string;
  photoB: string;
}

export function writeTestImages(): TestImagePaths {
  const dir = join(tmpdir(), 'morph-gif-e2e-fixtures');
  mkdirSync(dir, { recursive: true });
  const photoA = join(dir, 'photo-a.png');
  const photoB = join(dir, 'photo-b.png');
  writeFileSync(photoA, renderPhoto(PHOTO_A_MARKERS));
  writeFileSync(photoB, renderPhoto(PHOTO_B_MARKERS));
  return { photoA, photoB };
}

// A large photo (bigger than the 800px marking/perspective display cap) - big enough on its own
// to overflow a phone-width viewport unless the editor's "fit to screen" scaling actually works.
export const LARGE_IMAGE_WIDTH = 1600;
export const LARGE_IMAGE_HEIGHT = 1200;

export function writeLargeTestImage(): string {
  const dir = join(tmpdir(), 'morph-gif-e2e-fixtures');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'photo-large.png');
  const canvas = new RgbaCanvas(LARGE_IMAGE_WIDTH, LARGE_IMAGE_HEIGHT, [245, 245, 245]);
  canvas.fillSquare(200, 200, 60, [220, 40, 40]);
  canvas.fillSquare(1400, 200, 60, [40, 180, 60]);
  canvas.fillSquare(1400, 1000, 60, [40, 90, 220]);
  canvas.fillSquare(200, 1000, 60, [230, 200, 30]);
  writeFileSync(path, canvas.toPng());
  return path;
}
