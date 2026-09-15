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
  keystone.ts            KeystoneState: left/right edge-stretch drag state -> homography
  imageUtils.ts          computeDisplayScale (pure) + File/Image I/O (browser)
  bilinear.ts            bilinear pixel sampling over a raw RGBA buffer
  gifSequence.ts          ping-pong opacity sequence / frame timing math

src/app/              DOM-touching glue — exercised via Playwright, not Vitest
  workingImage.ts        unifies HTMLImageElement / HTMLCanvasElement sources
  markingCanvas.ts        renders a photo + markers, converts clicks -> full-res coords
  perspectiveEditor.ts    2 edge-pull handles, CSS matrix3d live preview, bake-on-confirm
  perspectiveWarp.ts      per-pixel inverse-mapped canvas warp (the "bake" step)
  renderOverlay.ts        draws base + transformed layer at any scale/opacity
  gifExport.ts            drives gif.js to encode the ping-pong sequence

src/main.ts            wires index.html to the above; all mutable UI state lives here
src/types/gif.d.ts      ambient types for gif.js (ships with none)
```

`src/core/*` has 73 Vitest unit tests and zero DOM dependency. `src/app/*`
and `src/main.ts` are covered by the Playwright e2e suite instead, since
their job is fundamentally "wire up real canvases and real clicks."

## 3. Data flow

```
File upload
  -> loadImageFromFile()            HTMLImageElement, full resolution
  -> workingImageFromElement()      WorkingImage { source, width, height }

(optional) Perspective correction
  -> PerspectiveEditor drags update a KeystoneState { leftStretch, rightStretch }
     (dimensionless fractions, not pixels - resolution-independent)
  -> on confirm: KeystoneState.computeHomography(fullResWidth, fullResHeight)
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

### 4.3 Homography, simplified to a 2-parameter keystone control (§8)

A full perspective correction is an 8-DOF projective transform (`solveHomography4`
in `geometry.ts`, still used internally, and still solvable as an exactly-determined
8-equation linear system via Gaussian elimination/DLT — no least squares or SVD
needed). But 4 independently-draggable 2D corner handles are fiddly on a touch
screen and overkill for the common case this app targets: an upright, roughly
centered subject shot with a slight left-right tilt (the classic "keystone"
effect, where one edge of the subject reads taller than the other).

So the UI exposes only 2 numbers — `leftStretch` and `rightStretch`
(`KeystoneState` in `keystone.ts`) — each describing how far that edge's two
corners spread apart (positive) or pull together (negative), **symmetrically
about the vertical center**. `keystoneCorners(width, height, leftStretch,
rightStretch)` turns those two numbers into the 4 origin -> corrected corner
correspondences (left corners always stay at `x=0`, right corners at
`x=width` — only y-positions move), which are then handed to the same
`solveHomography4` as before. This is a strict *subset* of what a full
4-handle system could express — no horizontal shear, no independent corner
movement — traded deliberately for a control that's a single vertical drag
per side. `invertHomography` (via a general 3x3 matrix inverse) gives the
inverse map used to bake the warp (§4.5).

Because `leftStretch`/`rightStretch` are dimensionless fractions of
half-height (not pixel offsets), `computeHomography` needs no display-scale
conversion — it's called directly with the image's real width/height,
whether that's the ~800px display size (for the live CSS preview) or the
full source resolution (for the "Confirm" bake).

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
When the loop is set to repeat, the wrap-around from the last frame back to
the first is itself a seamless step, so this produces a continuous
forward/backward ping-pong with roughly half the frame data of the naive
approach. `pickHalfFrameCount` targets the "20-30 frames for 10s" guidance
from §7, independent of the chosen duration (frame *count* stays fixed for
predictable file size; shorter durations just play those frames faster).

Three GIF export options are user-configurable (§5 UI, "Generate GIF" step):

- **Duration** (5s/8s/10s) is the total cross-fade time excluding any hold.
- **Hold at each end** adds an equal pause at both 100% opacity and 0%
  opacity, including the moment the loop wraps back to the start — so both
  ends of the ping-pong stop for the same length of time, not just the top.
  Since a GIF frame's delay is just a number, `computeFrameDelays` implements
  this by adding the hold onto the single peak-opacity frame's delay *and*
  the single base (0%) frame's delay — no extra frame data, and the full
  loop takes `duration + 2 * hold` to play.
- **Loop count** (play once / twice / infinitely) maps to gif.js's `repeat`
  option via `loopCountToGifRepeat`: gif.js's own convention is `0` = forever,
  `-1` = no repeat (play once), and `N` = `N` *additional* repeats after the
  first play — so "loop count" (a total play count) of 1 maps to `-1`, and 2
  maps to `1`.

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
- **Simplified perspective control**: §8.2 originally specced 4 independent
  draggable corner handles. That's fiddly on a touch screen and more power
  than the common case needs, so it was replaced with 2 edge handles
  (vertical-drag-only) assuming an upright, centered subject (§4.3) — a
  deliberate reduction in expressiveness for a much simpler interaction.
- **Restart**: a single button at the bottom of the page
  (`restartBtn` in `main.ts`) clears every piece of app state by just calling
  `location.reload()` after a confirmation dialog. A hand-written reset
  function would need to correctly clear every field of `AppState`, both
  perspective editors, both marking canvases, the file inputs, and revoke
  the GIF's object URL — a full reload gets all of that for free with no
  risk of missing one, at the cost of a page flash.

## 6. Testing strategy

Tests were designed around the pure/DOM split, so this section is really the
justification for that split.

### 6.1 Unit tests (Vitest) — `npm test`, 73 tests, `src/core/**/*.test.ts`

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
- **`keystone.test.ts`**: corner correspondences for zero/positive/negative
  edge stretch (including that stretch stays symmetric about the vertical
  center and clamps at the extremes), `KeystoneState`'s identity homography
  before any adjustment, exact corner mapping after one, and reset.
- **`bilinear.test.ts`**: exact-pixel sampling, center-of-4-pixels averaging,
  linear interpolation, out-of-bounds transparency, edge clamping.
- **`gifSequence.test.ts`**: ping-pong sequence shape (starts at 0, peaks at
  1 exactly once, symmetric, correct length), frame-count targeting, delay
  math, per-frame delays with a peak hold, and the loop-count -> gif.js
  `repeat` mapping.
- **`imageUtils.test.ts`**: `computeDisplayScale` (aspect-ratio-preserving
  downscale, no-op when already small enough).

### 6.2 End-to-end tests (Playwright) — `npm run test:e2e`, `tests/e2e/`

Playwright drives the real app in the pre-installed Chromium against a real
Vite dev server (`playwright.config.ts` starts one on port 4319
automatically). Eight tests:

1. **Full flow**: upload → mark 4 point pairs → align → preview → generate
   and download a GIF, asserting no console/page errors anywhere in the run.
2. **GIF options**: a non-default duration, peak hold, and loop count all
   still produce a valid GIF.
3. **Point pair management**: an out-of-order click (B before A) is rejected
   with a hint rather than corrupting state; undo removes a pending click;
   delete removes a specific pair; Align stays disabled below 4 pairs.
4. **Perspective correction**: pulling an edge handle vertically updates the
   live CSS `matrix3d()` preview and moves only that handle's y-position (x
   stays pinned to the edge); confirming bakes the warp and the marking step
   keeps working afterward.
5. **Perspective correction reset**: dragging a handle away from center and
   clicking Reset snaps it back exactly, verified via the handle's own
   `style.top` (not its viewport bounding box, which is scroll-dependent).
6. **Perspective editor on mobile**: a 1600x1200 photo on a 390px-wide
   viewport doesn't overflow, both handles stay within the viewport, and
   dragging still lands where the pointer went.
7. **Restart**: marks a point pair, clicks Restart, accepts the confirmation
   dialog, and verifies the page is back to a fresh upload-only state.
8. **Restart cancel**: declining the confirmation dialog leaves all state
   untouched.

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

A second one, from building the 2-handle keystone editor: after a large edge
stretch, clicking "Confirm correction" started timing out in Playwright with
"`<canvas>` ... subtree intercepts pointer events". CSS `transform` doesn't
affect layout, only paint, so the warped preview canvas could visually (and
therefore for hit-testing purposes) extend past its own box into the
Confirm/Reset buttons below it — a large enough correction made the canvas
cover those buttons. Since the canvas is purely decorative (all interaction
goes through the separate `.handle` elements), the fix is
`pointer-events: none` on it in `style.css`, letting clicks pass through to
whatever's actually there.

### 6.4 Fitting the perspective editor to small screens

The marking canvases (`MarkingCanvasView`) shrink to fit a phone screen for
free, via plain CSS (`canvas { max-width: 100% }`): a `<canvas>` is a
*replaced element*, so browsers exempt it from the usual flex/grid rule that
a fixed-size child forces its container to grow ("automatic minimum size").
The perspective editor's container is a plain `<div>`, which gets no such
exemption — with a large uploaded photo, its fixed-pixel-size content forced
`.perspective-slot`'s CSS Grid track wider than the viewport, overflowing a
phone screen even though the canvas itself had `max-width: 100%`. Fixed with
`min-width: 0` on the grid items (`.perspective-slot` et al.) so the track
can actually shrink to the available space, plus a uniform CSS
`transform: scale()` on a `.perspective-editor-inner` wrapper (containing
the canvas and its absolutely-positioned drag handles together) so
everything — including handle positions and the live homography preview —
shrinks as one unit; only the pointer-drag math needs to divide by that
scale factor to convert screen coordinates back into the editor's native,
unscaled coordinate space. Covered by an e2e test using a 1600x1200 synthetic
photo on a 390px-wide viewport.

## 7. Known limitations (mirrors spec §9)

- No pixel-level image morphing/warping mid-transition — only opacity
  cross-fade (§5 option (a), §9).
- Two images only, manual point marking only (no automatic feature
  detection).
- No server-side storage; nothing persists across a page reload.
- Perspective correction assumes a roughly planar subject (§8.4).
