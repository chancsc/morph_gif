import { defineConfig } from 'vite';

// GitHub Pages project sites serve from https://<user>.github.io/<repo>/,
// not the domain root, so the base path must match the repo name in
// production. Dev/test keep the default root ('/') so `npm run dev` and
// the Playwright e2e suite (which hit http://localhost:PORT/) are unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/morph_gif/' : '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
