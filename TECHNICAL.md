# Technical documentation

## 1. Stack and why

- **Vite + vanilla TypeScript**, no framework. The spec (§6) explicitly says
  React is optional and not required for this scope; a framework would add
  weight without simplifying anything here (a handful of DOM elements and a
  few event listeners).
- **No OpenCV.js.** The spec's own recommendation (§4, §6) is to prefer a
  small hand-rolled implementation over an ~8MB dependency. All transform
  math (similarity, affine, homography) is ~250 lines of dependency-free
  linear algebra in `src/core/`.
- **gif.js** for GIF encoding — pure JS, runs in a Web Worker so encoding a
  10-second loop doesn't freeze the UI.
- **Vitest** for unit tests, **Playwright** (against the pre-installed
  Chromium in this environment) for end-to-end tests.

## 2. Module map

The codebase is split along one axis: **pure logic vs. DOM-touching code**,
because that split is what makes most of it unit-testable without a browser.

```
src/core/            pure functions & classes — no DOM, no canvas, no fetch
  linalg.ts            Gaussian elimination, least squares, 3x3 inverse
  geometry.ts           similarity / affine / homography solve + apply
  pairs.ts              PairManager: click state machine (A/B alternation, undo)
  perspectiveHandles.ts PerspectiveHandleSet: 4-handle drag state -> homography
  imageUtils.ts          computeDisplayScale (pure) + File/Image I/O (browser)
  bilinear.ts            bilinear pixel sampling over a raw RGBA buffer
  gifSequence.ts          ping-pong opacity sequence / frame timing math

src/app/              DOM-touching glue — exercised via Playwright, not Vitest
  workingImage.ts        unifies HTMLImageElement / HTMLCanvasElement sources
  markingCanvas.ts        renders a photo + markers, converts clicks -> full-res coords
  perspectiveEditor.ts    4 draggable handles, CSS matrix3d live preview, bake-on-confirm
  perspectiveWarp.ts      per-pixel inverse-mapped canvas warp (the "bake" step)
  renderOverlay.ts        draws base + transformed layer at any scale/opacity
  gifExport.ts            drives gif.js to encode the ping-pong sequence

src/main.ts            wires index.html to the above; all mutable UI state lives here
src/types/gif.d.ts      ambient types for gif.js (ships with none)
```

`src/core/*` has 61 Vitest unit tests and zero DOM dependency. `src/app/*`
and `src/main.ts` are covered by the Playwright e2e suite instead, since
their job is fundamentally "wire up real canvases and real clicks."

## 3. Data flow

```
File upload
  -> loadImageFromFile()            HTMLImageElement, full resolution
  -> workingImageFromElement()      WorkingImage { source, width, height }

(optional) Perspective correction
  -> PerspectiveEditor, in DISPLAY-scaled coordinates
  -> on confirm: coordinates scaled back to full-res, solveHomography4()
  -> warpImageToCanvas()             bakes a new full-res WorkingImage

Point marking
  -> MarkingCanvasView draws the WorkingImage scaled to <=800px (NFR §7:
     "downscaled preview canvas for marking points")
  -> clicks are converted display-px -> full-res-px by dividing by the
     canvas's own display scale, so PairManager always stores FULL-RESOLUTION
     coordinates regardless of preview size

Align
  -> solveSimilarity(pairs) or solveAffine(pairs), operating on full-res pairs
  -> produces one AffineMatrix mapping full-res Photo B -> full-res Photo A

Preview (step 4) and GIF export (step 5)
  -> the SAME AffineMatrix is reused at two different scales:
     - preview: scaled down to <=800px for on-screen display
     - export: scaled to <=800px output resolution (independently computed,
       since Photo A's aspect ratio determines both, they usually coincide)
  -> drawAlignedFrame() / drawTransformedOnly() compose the matrix with the
     display/export scale by simple scalar multiplication (see §4.4)
```

Storing points in full-resolution coordinates (rather than display/preview
coordinates) means the transform is computed once, at full precision, and
both the interactive preview and the final GIF export are just different
renderings of that one matrix — "what you see is what you get," per spec §7.

## 4. Algorithms

### 4.1 Similarity transform (rotation + uniform scale + translation)

A similarity transform has 4 degrees of freedom, but it is **linear** in a
different parameterization than the obvious one. Writing `a = s·cos(θ)`,
`b = s·sin(θ)`:

```
x' =  a·x - b·y + tx
y' =  b·x + a·y + ty
```

This is linear in `(a, b, tx, ty)`, so with ≥2 point pairs it's solved
directly by least squares (`solveSimilarity` in `geometry.ts`) — no need for
Procrustes analysis or SVD, which the spec mentions as the "textbook"
approach. Rotation and scale are recovered afterward as
`atan2(b, a)` and `sqrt(a² + b²)` (implicitly, via the matrix itself — callers
that need the scalar values can derive them from the returned matrix).

### 4.2 Affine transform (independent x/y scale + shear)

6 degrees of freedom: `x' = a·x + b·y + e`, `y' = c·x + d·y + f`. Since the
two output equations don't share unknowns, they decouple into two
independent 3-unknown least-squares problems (`solveAffine`) — cheaper and
simpler than a single 6x6 normal-equations solve, with an identical result.

### 4.3 Homography (perspective correction, §8)

The optional perspective-correction step needs a full 8-DOF projective
transform. Because the UI always presents exactly 4 draggable handles (§8.2),
the system is **exactly determined** (8 equations, 8 unknowns) rather than
over-determined, so `solveHomography4` does a direct linear solve (DLT) via
Gaussian elimination — no least squares or SVD needed. `invertHomography`
(via a general 3x3 matrix inverse) gives the inverse map used to bake the
warp (§4.5).

### 4.4 Composing a transform with a display/export scale

Both the on-screen overlay preview and every GIF frame need "Photo B,
transformed by matrix M, then everything scaled by `s` to fit the target
canvas." Because a uniform scale is a diagonal matrix, `Scale(s) ∘ M` is
just every component of `M` multiplied by `s` — no matrix multiplication
needed (`renderOverlay.ts`). The result is fed to
`CanvasRenderingContext2D.setTransform`, whose `(a,b,c,d,e,f)` argument
order differs from this codebase's `{a,b,c,d,e,f}` convention;
`toCanvasSetTransformArgs` does the (documented) reorder.

### 4.5 Baking the perspective warp

Canvas 2D's `transform()` can't express a true perspective (projective)
warp — only affine. So the live drag preview uses a CSS `matrix3d()` on the
preview canvas (`homographyToCssMatrix3d`, embedding the 3x3 homography into
a 4x4 matrix that leaves z untouched — cheap, real-time, exactly what §8.3
recommends), while the "Confirm" bake does a true per-pixel warp
(`warpImageToCanvas`): for every destination pixel, apply the **inverse**
homography to find the source pixel, then bilinearly sample
(`bilinearSample`, pure and unit tested against a hand-built 2x2 RGBA
buffer). Inverse (not forward) mapping is what avoids holes in the output.

### 4.6 GIF ping-pong sequence (§5, §10, F10)

Spec §5 offers two readings of the loop; per its own recommendation, this
implementation uses **(a): a simple 0% → 100% → 0% opacity cross-fade**, not
per-frame image warping/morphing (explicitly out of scope, §9).

Rather than rendering a forward pass and then a separate identical backward
pass, `buildPingPongOpacitySequence(halfFrameCount)` generates one ascending
ramp `[0, ..., 1]` and appends its reverse with the shared endpoints removed.
Since gif.js loops infinitely (`repeat: 0`), the wrap-around from the last
frame back to the first is itself a seamless step, so this produces a
continuous forward/backward ping-pong with roughly half the frame data of
the naive approach. `pickHalfFrameCount` targets the "20-30 frames for 10s"
guidance from §7.

## 5. Notable design decisions / spec clarifications

- **§5 open decision → option (a)**, per the spec's own recommendation:
  simple opacity cross-fade, no in-between warped frames.
- **Point labels**: §2 step 3-4 literally says the Photo-A point is labeled
  "A1" and its Photo-B match is labeled "A2" — read strictly, that scheme
  becomes ambiguous once there's more than one pair. This build labels both
  points of pair *N* with the numeral `N` on both canvases (a marker on
  Photo A and its match on Photo B both show "1", "2", etc.), which
  unambiguously shows correspondence while still satisfying F3's "small
  circular marker + numeric label."
- **Resolution capping (§7, F12)**: marking canvases and the GIF output both
  cap at 800px on the longest side (`MARKING_DISPLAY_MAX_DIM`,
  `GIF_OUTPUT_MAX_DIM` in `imageUtils.ts`), independent of source photo
  resolution — a 4000x3000 photo is downscaled for interaction but the
  transform itself is always computed from full-resolution click coordinates
  (§7: "apply the transform to the full-res image for final export").
- **gif.worker.js**: gif.js ships its Web Worker as a static file, not a
  bundlable module, so it lives in `public/` and is kept in sync with the
  installed `gif.js` version by a `postinstall` script
  (`scripts/sync-gif-worker.js`) rather than hand-copied and left to drift.

## 6. Testing strategy

Tests were designed around the pure/DOM split, so this section is really the
justification for that split.

### 6.1 Unit tests (Vitest) — `npm test`, 61 tests, `src/core/**/*.test.ts`

Every `src/core/*` module is pure (no DOM), so tests run in Node with no
mocking:

- **`linalg.test.ts`**: Gaussian elimination (incl. partial pivoting and
  singular-matrix rejection), least squares, 3x3 inverse.
- **`geometry.test.ts`**: similarity/affine recovery of a *known* ground-truth
  transform (both exact and noisy/overdetermined cases), a genuinely
  projective homography test (distinguishing it from an affine
  approximation), homography round-trip via its inverse, and the
  `toCanvasSetTransformArgs` / `homographyToCssMatrix3d` conversions.
- **`pairs.test.ts`**: the full click state machine — alternation
  enforcement, the 4-pair minimum, undo, delete-by-index, clear.
- **`perspectiveHandles.test.ts`**: identity homography before any drag,
  correct homography after dragging, reset.
- **`bilinear.test.ts`**: exact-pixel sampling, center-of-4-pixels averaging,
  linear interpolation, out-of-bounds transparency, edge clamping.
- **`gifSequence.test.ts`**: ping-pong sequence shape (starts at 0, peaks at
  1 exactly once, symmetric, correct length), frame-count targeting, delay
  math.
- **`imageUtils.test.ts`**: `computeDisplayScale` (aspect-ratio-preserving
  downscale, no-op when already small enough).

### 6.2 End-to-end tests (Playwright) — `npm run test:e2e`, `tests/e2e/`

Playwright drives the real app in the pre-installed Chromium against a real
Vite dev server (`playwright.config.ts` starts one on port 4319
automatically). Three tests:

1. **Full flow**: upload → mark 4 point pairs → align → preview → generate
   and download a GIF, asserting no console/page errors anywhere in the run.
2. **Point pair management**: an out-of-order click (B before A) is rejected
   with a hint rather than corrupting state; undo removes a pending click;
   delete removes a specific pair; Align stays disabled below 4 pairs.
3. **Perspective correction**: dragging a corner handle updates the live
   CSS `matrix3d()` preview; confirming bakes the warp and the marking step
   keeps working afterward.

**Test fixtures** (`tests/fixtures/`): two 400x300 synthetic PNGs, each with
4 distinctly colored square markers at known pixel coordinates. These are
generated by a ~90-line dependency-free PNG encoder
(`tests/fixtures/pngEncoder.ts` — raw RGBA → zlib-deflated scanlines → PNG
chunks) rather than an external image library, so the fixtures need no
native dependencies and the click targets are exact pixel coordinates known
in advance (no image recognition required in the test).

### 6.3 A bug the e2e tests actually caught

Early on, the "Generate GIF" e2e assertion failed with a `null` image `src`
even though the result panel was reportedly visible. The root cause:
`style.css` set `display: flex` directly on `.gif-result` /
`.gif-progress`, which has the *same specificity* as the browser's built-in
`[hidden] { display: none }` rule and loads later — so those panels were
visually present from page load, before generation even started, regardless
of their `hidden` attribute. The fix is a single `[hidden] { display: none
!important; }` rule in `style.css`. Left here because it's a good example of
why the e2e suite (which asserts on real visibility/layout) caught something
a unit test or a manual click-through easily could have missed.

## 7. Known limitations (mirrors spec §9)

- No pixel-level image morphing/warping mid-transition — only opacity
  cross-fade (§5 option (a), §9).
- Two images only, manual point marking only (no automatic feature
  detection).
- No server-side storage; nothing persists across a page reload.
- Perspective correction assumes a roughly planar subject (§8.4).
