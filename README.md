# Photo Align & Morph GIF

A browser-based tool for aligning two photos by hand-marked point pairs and
exporting a looping cross-fade GIF between them. Everything runs client-side
— no server, no upload, no backend.

Built from `photo-align-morph-app-spec.md`. See [TECHNICAL.md](./TECHNICAL.md)
for architecture, algorithms, and design decisions.

## Quick start

```sh
npm install
npm run dev       # http://localhost:5173
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | Run the Playwright end-to-end suite (spins up its own dev server) |

## How to use it

1. **Upload** Photo A (the reference) and Photo B (the one that gets aligned
   onto A).
2. **(Optional) Perspective correction** — if either photo was shot at a
   tilt, drag its 4 corner handles to where they should sit if the subject
   were parallel to the camera, then confirm.
3. **Mark points** — click a point on Photo A, then the matching point on
   Photo B. Repeat at least 4 times. Delete or undo mis-clicks as needed.
4. **Align** — pick Similarity (rotation + uniform scale) or Affine
   (independent x/y scale + shear), then click Align. Drag the opacity
   slider for a quick cross-fade sanity check.
5. **Generate GIF** — produces a 10-second, infinitely looping ping-pong
   cross-fade (0% → 100% → 0% opacity), capped at 800px on the longest side.
   Preview it, then download.

No photo, point, or pixel ever leaves the browser tab.
