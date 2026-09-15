/**
 * Wires the DOM (index.html) to the pure core modules and the DOM-touching
 * app/* modules. This file is intentionally "dumb": it holds mutable UI
 * state and event listeners, delegating all actual computation to modules
 * that are unit tested independently (src/core/*) or exercised by the
 * Playwright e2e test (src/app/*). See TECHNICAL.md for the full data flow.
 */
import type { AffineMatrix, Point, PointPair } from './core/geometry.ts';
import { solveAffine, solveSimilarity } from './core/geometry.ts';
import { GIF_OUTPUT_MAX_DIM, MARKING_DISPLAY_MAX_DIM, loadImageFromFile } from './core/imageUtils.ts';
import { computeDisplayScale } from './core/imageUtils.ts';
import { type ImageSide, PairManager } from './core/pairs.ts';
import { loopCountToGifRepeat, pickHalfFrameCount } from './core/gifSequence.ts';
import { renderPingPongGif } from './app/gifExport.ts';
import { MarkingCanvasView, type MarkerPoint } from './app/markingCanvas.ts';
import { PerspectiveEditor } from './app/perspectiveEditor.ts';
import { drawAlignedFrame, drawTransformedOnly } from './app/renderOverlay.ts';
import { workingImageFromElement, type WorkingImage } from './app/workingImage.ts';

const PREVIEW_MAX_DIM = 800;
const GIF_TARGET_TOTAL_FRAMES = 24;

// ---- Element lookups -------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`main: missing element #${id}`);
  return found as T;
}

const stepPerspective = el<HTMLElement>('step-perspective');
const stepMarking = el<HTMLElement>('step-marking');
const stepAlign = el<HTMLElement>('step-align');
const stepGif = el<HTMLElement>('step-gif');

const fileAInput = el<HTMLInputElement>('fileA');
const fileBInput = el<HTMLInputElement>('fileB');
const filenameA = el<HTMLElement>('filenameA');
const filenameB = el<HTMLElement>('filenameB');
const uploadError = el<HTMLElement>('uploadError');

const confirmPerspectiveA = el<HTMLButtonElement>('confirmPerspectiveA');
const resetPerspectiveA = el<HTMLButtonElement>('resetPerspectiveA');
const confirmPerspectiveB = el<HTMLButtonElement>('confirmPerspectiveB');
const resetPerspectiveB = el<HTMLButtonElement>('resetPerspectiveB');
const continueToMarking = el<HTMLButtonElement>('continueToMarking');

const markingHint = el<HTMLElement>('markingHint');
const pairCountEl = el<HTMLElement>('pairCount');
const pairListEl = el<HTMLUListElement>('pairList');
const undoLastPointBtn = el<HTMLButtonElement>('undoLastPoint');
const clearAllPairsBtn = el<HTMLButtonElement>('clearAllPairs');
const alignBtn = el<HTMLButtonElement>('alignBtn');
const alignError = el<HTMLElement>('alignError');

const overlayCanvas = el<HTMLCanvasElement>('overlayCanvas');
const opacitySlider = el<HTMLInputElement>('opacitySlider');
const continueToGif = el<HTMLButtonElement>('continueToGif');

const gifDurationSelect = el<HTMLSelectElement>('gifDuration');
const gifHoldDurationSelect = el<HTMLSelectElement>('gifHoldDuration');
const gifLoopCountSelect = el<HTMLSelectElement>('gifLoopCount');
const generateGifBtn = el<HTMLButtonElement>('generateGifBtn');
const gifProgressWrap = el<HTMLElement>('gifProgressWrap');
const gifProgress = el<HTMLProgressElement>('gifProgress');
const gifProgressLabel = el<HTMLElement>('gifProgressLabel');
const gifResultWrap = el<HTMLElement>('gifResultWrap');
const gifPreview = el<HTMLImageElement>('gifPreview');
const downloadGifLink = el<HTMLAnchorElement>('downloadGifLink');
const gifError = el<HTMLElement>('gifError');

// ---- App state ---------------------------------------------------------

interface AppState {
  rawImageA: WorkingImage | null;
  rawImageB: WorkingImage | null;
  workingImageA: WorkingImage | null;
  workingImageB: WorkingImage | null;
  pairManager: PairManager;
  transformType: 'similarity' | 'affine';
  alignedMatrix: AffineMatrix | null;
}

const state: AppState = {
  rawImageA: null,
  rawImageB: null,
  workingImageA: null,
  workingImageB: null,
  pairManager: new PairManager(),
  transformType: 'similarity',
  alignedMatrix: null,
};

const markingViewA = new MarkingCanvasView(el<HTMLCanvasElement>('canvasA'), MARKING_DISPLAY_MAX_DIM, (p) =>
  handleMarkingClick('A', p),
);
const markingViewB = new MarkingCanvasView(el<HTMLCanvasElement>('canvasB'), MARKING_DISPLAY_MAX_DIM, (p) =>
  handleMarkingClick('B', p),
);

const perspectiveEditorA = new PerspectiveEditor(
  el<HTMLElement>('perspectiveContainerA'),
  el<HTMLCanvasElement>('perspectiveCanvasA'),
  Array.from(el<HTMLElement>('perspectiveContainerA').querySelectorAll<HTMLElement>('.handle')),
  MARKING_DISPLAY_MAX_DIM,
);
const perspectiveEditorB = new PerspectiveEditor(
  el<HTMLElement>('perspectiveContainerB'),
  el<HTMLCanvasElement>('perspectiveCanvasB'),
  Array.from(el<HTMLElement>('perspectiveContainerB').querySelectorAll<HTMLElement>('.handle')),
  MARKING_DISPLAY_MAX_DIM,
);

// ---- Upload step ---------------------------------------------------------

function showError(target: HTMLElement, message: string): void {
  target.textContent = message;
  target.hidden = false;
}

function clearError(target: HTMLElement): void {
  target.hidden = true;
  target.textContent = '';
}

async function handleFileChange(side: ImageSide, input: HTMLInputElement): Promise<void> {
  clearError(uploadError);
  const file = input.files?.[0];
  if (!file) return;
  try {
    const img = await loadImageFromFile(file);
    const working = workingImageFromElement(img);
    if (side === 'A') {
      state.rawImageA = working;
      state.workingImageA = working;
      filenameA.textContent = `${file.name} (${img.naturalWidth}×${img.naturalHeight})`;
    } else {
      state.rawImageB = working;
      state.workingImageB = working;
      filenameB.textContent = `${file.name} (${img.naturalWidth}×${img.naturalHeight})`;
    }
    // A fresh upload invalidates any downstream work (points, alignment).
    state.pairManager.clear();
    state.alignedMatrix = null;
    stepAlign.hidden = true;
    stepGif.hidden = true;

    if (state.rawImageA && state.rawImageB) {
      stepPerspective.hidden = false;
      perspectiveEditorA.load(state.rawImageA);
      perspectiveEditorB.load(state.rawImageB);
      stepMarking.hidden = false;
      markingViewA.setImage(state.workingImageA!);
      markingViewB.setImage(state.workingImageB!);
      renderPairsUI();
    }
  } catch (err) {
    showError(uploadError, err instanceof Error ? err.message : String(err));
  }
}

fileAInput.addEventListener('change', () => void handleFileChange('A', fileAInput));
fileBInput.addEventListener('change', () => void handleFileChange('B', fileBInput));

// ---- Perspective correction step ---------------------------------------

confirmPerspectiveA.addEventListener('click', () => {
  state.workingImageA = perspectiveEditorA.confirm();
  markingViewA.setImage(state.workingImageA);
  renderPairsUI();
});
resetPerspectiveA.addEventListener('click', () => {
  perspectiveEditorA.reset();
  if (state.rawImageA) {
    state.workingImageA = state.rawImageA;
    markingViewA.setImage(state.workingImageA);
    renderPairsUI();
  }
});
confirmPerspectiveB.addEventListener('click', () => {
  state.workingImageB = perspectiveEditorB.confirm();
  markingViewB.setImage(state.workingImageB);
  renderPairsUI();
});
resetPerspectiveB.addEventListener('click', () => {
  perspectiveEditorB.reset();
  if (state.rawImageB) {
    state.workingImageB = state.rawImageB;
    markingViewB.setImage(state.workingImageB);
    renderPairsUI();
  }
});
continueToMarking.addEventListener('click', () => {
  stepMarking.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- Point marking step --------------------------------------------------

function handleMarkingClick(side: ImageSide, point: Point): void {
  const pm = state.pairManager;
  if (side !== pm.nextSide) {
    markingHint.textContent = `Click on Photo ${pm.nextSide} next, not Photo ${side}.`;
    return;
  }
  pm.addPoint(side, point);
  renderPairsUI();
}

function markersForSide(side: ImageSide): MarkerPoint[] {
  const pm = state.pairManager;
  const markers: MarkerPoint[] = pm.pairs.map((pair, i) => ({
    ...(side === 'A' ? pair.a : pair.b),
    label: String(i + 1),
  }));
  if (side === 'A' && pm.pending) {
    markers.push({ ...pm.pending, label: String(pm.count + 1) });
  }
  return markers;
}

function renderPairsUI(): void {
  const pm = state.pairManager;
  markingViewA.render(markersForSide('A'));
  markingViewB.render(markersForSide('B'));

  pairCountEl.textContent = String(pm.count);
  pairListEl.innerHTML = '';
  pm.pairs.forEach((pair, i) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `Pair ${i + 1}: A(${pair.a.x.toFixed(0)}, ${pair.a.y.toFixed(0)}) ↔ B(${pair.b.x.toFixed(0)}, ${pair.b.y.toFixed(0)})`;
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.dataset.testid = `delete-pair-${i}`;
    delBtn.addEventListener('click', () => {
      pm.removePairAt(i);
      renderPairsUI();
    });
    li.append(label, delBtn);
    pairListEl.append(li);
  });

  markingHint.textContent = pm.pending
    ? `Now click the matching point on Photo B (pair ${pm.count + 1}).`
    : `Click a point on Photo A to start pair ${pm.count + 1} (or use Align once you have ${4}+ pairs).`;

  alignBtn.disabled = !pm.isReadyToAlign;
}

undoLastPointBtn.addEventListener('click', () => {
  state.pairManager.removeLastPoint();
  renderPairsUI();
});
clearAllPairsBtn.addEventListener('click', () => {
  state.pairManager.clear();
  renderPairsUI();
});
document.querySelectorAll<HTMLInputElement>('input[name="transformType"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) state.transformType = radio.value as 'similarity' | 'affine';
  });
});

// ---- Align step -----------------------------------------------------------

function currentOverlayScale(): number {
  const a = state.workingImageA!;
  return computeDisplayScale(a.width, a.height, PREVIEW_MAX_DIM);
}

function renderOverlayPreview(): void {
  if (!state.workingImageA || !state.workingImageB || !state.alignedMatrix) return;
  const scale = currentOverlayScale();
  overlayCanvas.width = Math.round(state.workingImageA.width * scale);
  overlayCanvas.height = Math.round(state.workingImageA.height * scale);
  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;
  const opacity = Number(opacitySlider.value) / 100;
  drawAlignedFrame(ctx, state.workingImageA, state.workingImageB, state.alignedMatrix, scale, opacity);
}

alignBtn.addEventListener('click', () => {
  clearError(alignError);
  const pairs: PointPair[] = [...state.pairManager.pairs];
  try {
    state.alignedMatrix =
      state.transformType === 'similarity' ? solveSimilarity(pairs) : solveAffine(pairs);
  } catch (err) {
    showError(alignError, err instanceof Error ? err.message : String(err));
    return;
  }
  stepAlign.hidden = false;
  renderOverlayPreview();
  stepAlign.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

opacitySlider.addEventListener('input', renderOverlayPreview);

continueToGif.addEventListener('click', () => {
  stepGif.hidden = false;
  stepGif.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- GIF export step --------------------------------------------------

generateGifBtn.addEventListener('click', () => {
  void generateGif();
});

async function generateGif(): Promise<void> {
  if (!state.workingImageA || !state.workingImageB || !state.alignedMatrix) return;
  clearError(gifError);
  gifResultWrap.hidden = true;
  gifProgressWrap.hidden = false;
  generateGifBtn.disabled = true;
  gifProgress.value = 0;
  gifProgressLabel.textContent = '0%';

  try {
    const a = state.workingImageA;
    const outputScale = computeDisplayScale(a.width, a.height, GIF_OUTPUT_MAX_DIM);
    const outW = Math.max(1, Math.round(a.width * outputScale));
    const outH = Math.max(1, Math.round(a.height * outputScale));

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = outW;
    baseCanvas.height = outH;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) throw new Error('Could not create base canvas context');
    baseCtx.drawImage(a.source, 0, 0, outW, outH);

    const topCanvas = document.createElement('canvas');
    topCanvas.width = outW;
    topCanvas.height = outH;
    const topCtx = topCanvas.getContext('2d');
    if (!topCtx) throw new Error('Could not create top-layer canvas context');
    drawTransformedOnly(topCtx, state.workingImageB, state.alignedMatrix, outputScale);

    const loopValue = gifLoopCountSelect.value;
    const blob = await renderPingPongGif({
      baseCanvas,
      topCanvas,
      width: outW,
      height: outH,
      halfFrameCount: pickHalfFrameCount(GIF_TARGET_TOTAL_FRAMES),
      durationMs: Number(gifDurationSelect.value),
      holdAtPeakMs: Number(gifHoldDurationSelect.value),
      repeat: loopCountToGifRepeat(loopValue === 'infinite' ? 'infinite' : Number(loopValue)),
      workerScript: `${import.meta.env.BASE_URL}gif.worker.js`,
      onProgress: (fraction) => {
        const pct = Math.round(fraction * 100);
        gifProgress.value = pct;
        gifProgressLabel.textContent = `${pct}%`;
      },
    });

    const url = URL.createObjectURL(blob);
    gifPreview.src = url;
    downloadGifLink.href = url;
    gifResultWrap.hidden = false;
  } catch (err) {
    showError(gifError, err instanceof Error ? err.message : String(err));
  } finally {
    gifProgressWrap.hidden = true;
    generateGifBtn.disabled = false;
  }
}
