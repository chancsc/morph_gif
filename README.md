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
   slight left-right tilt, touch and pull the handle on the left or right
   edge up or down to straighten it (works best when the subject is upright
   and centered), then confirm.
3. **Mark points** — click a point on Photo A, then the matching point on
   Photo B. Repeat at least 4 times. Delete or undo mis-clicks as needed.
4. **Align** — pick Similarity (rotation + uniform scale) or Affine
   (independent x/y scale + shear), then click Align. Drag the opacity
   slider for a quick cross-fade sanity check.
5. **Generate GIF** — enter any duration in seconds (1-30s; 2, 3, 4, 5, 8,
   10 are offered as quick presets), an optional hold at each end (100%
   opacity, and 0% opacity when it loops back) so both ends pause evenly,
   and how many times it should loop (once, twice, or infinitely), then
   generate a ping-pong cross-fade (0% → 100% → 0%
   opacity), capped at 800px on the longest side. Preview it,
   then download.

**Restart** at the bottom of the page clears both photos, all points, and
any generated GIF, and starts over.

No photo, point, or pixel ever leaves the browser tab.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys `dist/` on every push to
`main`. To turn it on:

1. Merge this branch into `main` (Pages builds from `main`; the workflow
   won't run on other branches).
2. In the repo, go to **Settings → Pages → Build and deployment → Source**
   and select **"GitHub Actions"**.
3. Push to `main` (or re-run the workflow manually from the Actions tab) —
   the site will publish to `https://<owner>.github.io/morph_gif/`.

`vite.config.ts` sets `base: '/morph_gif/'` for production builds so assets
resolve correctly at that subpath; local dev (`npm run dev`) is unaffected.
