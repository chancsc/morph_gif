import { expect, test } from '@playwright/test';
import { PHOTO_A_MARKERS, PHOTO_B_MARKERS, writeLargeTestImage, writeTestImages } from '../fixtures/testImages.ts';

test.describe('Photo Align & Morph GIF - full user flow', () => {
  test('upload -> mark 4 point pairs -> align -> export a ping-pong GIF', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const { photoA, photoB } = writeTestImages();

    await page.goto('/');

    // Step 1: upload both photos (F1).
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);

    await expect(page.locator('#step-perspective')).toBeVisible();
    await expect(page.locator('#step-marking')).toBeVisible();
    await expect(page.getByTestId('filename-a')).toContainText('400');
    await expect(page.getByTestId('filename-b')).toContainText('400');

    // Step 2: mark 4 point pairs, alternating A then B (F3-F5).
    const canvasA = page.getByTestId('canvas-a');
    const canvasB = page.getByTestId('canvas-b');
    for (let i = 0; i < 4; i++) {
      const a = PHOTO_A_MARKERS[i];
      const b = PHOTO_B_MARKERS[i];
      await canvasA.click({ position: { x: a.x, y: a.y } });
      await canvasB.click({ position: { x: b.x, y: b.y } });
    }
    await expect(page.getByTestId('pair-count')).toHaveText('4');
    await expect(page.locator('#pairList li')).toHaveCount(4);
    await expect(page.getByTestId('align-btn')).toBeEnabled();

    // Step 3: align and preview the cross-fade overlay (F7-F9).
    await page.getByTestId('align-btn').click();
    await expect(page.locator('#step-align')).toBeVisible();
    await expect(page.getByTestId('align-error')).toBeHidden();
    const overlayBox = await page.getByTestId('overlay-canvas').boundingBox();
    expect(overlayBox?.width).toBeGreaterThan(0);
    expect(overlayBox?.height).toBeGreaterThan(0);

    // Quick cross-fade sanity check: dragging the opacity slider shouldn't error.
    await page.getByTestId('opacity-slider').fill('80');

    // Step 4: generate and download the GIF (F10-F11).
    await page.getByTestId('continue-to-gif').click();
    await expect(page.locator('#step-gif')).toBeVisible();
    await page.getByTestId('generate-gif-btn').click();
    await expect(page.getByTestId('gif-result-wrap')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gif-error')).toBeHidden();

    const previewSrc = await page.getByTestId('gif-preview').getAttribute('src');
    expect(previewSrc).toMatch(/^blob:/);
    const downloadHref = await page.getByTestId('download-gif-link').getAttribute('href');
    expect(downloadHref).toMatch(/^blob:/);

    expect(consoleErrors, `unexpected console/page errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('GIF options: a shorter duration, a peak hold, and a finite loop count all produce a valid GIF', async ({
    page,
  }) => {
    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-marking')).toBeVisible();

    const canvasA = page.getByTestId('canvas-a');
    const canvasB = page.getByTestId('canvas-b');
    for (let i = 0; i < 4; i++) {
      const a = PHOTO_A_MARKERS[i];
      const b = PHOTO_B_MARKERS[i];
      await canvasA.click({ position: { x: a.x, y: a.y } });
      await canvasB.click({ position: { x: b.x, y: b.y } });
    }
    await page.getByTestId('align-btn').click();
    await expect(page.locator('#step-align')).toBeVisible();
    await page.getByTestId('continue-to-gif').click();
    await expect(page.locator('#step-gif')).toBeVisible();

    // Away from the defaults: 5s duration, 1s hold at peak, loop twice (not infinite).
    await page.getByTestId('gif-duration').selectOption('5000');
    await page.getByTestId('gif-hold-duration').selectOption('1000');
    await page.getByTestId('gif-loop-count').selectOption('2');

    await page.getByTestId('generate-gif-btn').click();
    await expect(page.getByTestId('gif-result-wrap')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gif-error')).toBeHidden();

    const previewSrc = await page.getByTestId('gif-preview').getAttribute('src');
    expect(previewSrc).toMatch(/^blob:/);
  });

  test('point pair management: out-of-order click hint, undo, and delete', async ({ page }) => {
    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-marking')).toBeVisible();

    const canvasA = page.getByTestId('canvas-a');
    const canvasB = page.getByTestId('canvas-b');

    // Clicking B before A should not register a pair, just show a hint (F4).
    const b0 = PHOTO_B_MARKERS[0];
    await canvasB.click({ position: { x: b0.x, y: b0.y } });
    await expect(page.getByTestId('pair-count')).toHaveText('0');
    await expect(page.getByTestId('marking-hint')).toContainText('Photo A');

    // Complete one pair, then undo it (F6).
    const a0 = PHOTO_A_MARKERS[0];
    await canvasA.click({ position: { x: a0.x, y: a0.y } });
    await canvasB.click({ position: { x: b0.x, y: b0.y } });
    await expect(page.getByTestId('pair-count')).toHaveText('1');
    await page.getByTestId('undo-last-point').click();
    await expect(page.getByTestId('pair-count')).toHaveText('0');

    // Add two pairs, then delete the first via the pair list (F6).
    for (let i = 0; i < 2; i++) {
      const a = PHOTO_A_MARKERS[i];
      const b = PHOTO_B_MARKERS[i];
      await canvasA.click({ position: { x: a.x, y: a.y } });
      await canvasB.click({ position: { x: b.x, y: b.y } });
    }
    await expect(page.getByTestId('pair-count')).toHaveText('2');
    await page.getByTestId('delete-pair-0').click();
    await expect(page.getByTestId('pair-count')).toHaveText('1');

    // Align stays disabled below the 4-pair minimum (F5).
    await expect(page.getByTestId('align-btn')).toBeDisabled();

    // Clear all resets to zero.
    await page.getByTestId('clear-all-pairs').click();
    await expect(page.getByTestId('pair-count')).toHaveText('0');
  });

  test('perspective correction: touch-pulling an edge handle and confirming does not break the pipeline (§8)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-perspective')).toBeVisible();

    const container = page.getByTestId('perspective-container-a');
    const handle = container.locator('.handle[data-handle="left"]');
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('handle not found');

    // Pull the left edge handle straight up to stretch that side (simulating a left-right tilt).
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 60, { steps: 5 });
    await page.mouse.up();

    // The live CSS preview should reflect the drag (non-identity transform).
    const transform = await page.getByTestId('perspective-container-a').locator('canvas').evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    expect(transform).toMatch(/matrix3d/);
    expect(transform).not.toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');

    // The handle should have moved up (and only up - horizontal position is pinned to the edge).
    const afterDragBox = await handle.boundingBox();
    if (!afterDragBox) throw new Error('handle not found after drag');
    expect(afterDragBox.y).toBeLessThan(handleBox.y);
    expect(Math.abs(afterDragBox.x - handleBox.x)).toBeLessThan(2);

    // Confirming should bake the warp and let the marking step continue to work normally.
    await page.getByTestId('confirm-perspective-a').click();
    await expect(page.locator('#step-marking')).toBeVisible();
    const a0 = PHOTO_A_MARKERS[0];
    await page.getByTestId('canvas-a').click({ position: { x: a0.x, y: a0.y } });
    await expect(page.getByTestId('marking-hint')).toContainText('Photo B');

    expect(consoleErrors, `unexpected page errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('perspective correction: reset snaps a dragged handle back to center', async ({ page }) => {
    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-perspective')).toBeVisible();

    const container = page.getByTestId('perspective-container-a');
    const handle = container.locator('.handle[data-handle="right"]');
    // Read the handle's own style.top (its position in the editor's internal, unscaled
    // coordinate space) rather than its viewport-relative bounding box, so this assertion
    // doesn't depend on where the page happens to be scrolled to.
    const handleTop = () => handle.evaluate((el) => parseFloat((el as HTMLElement).style.top));

    const centeredTop = await handleTop();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('handle not found');

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 60, { steps: 5 });
    await page.mouse.up();
    const draggedTop = await handleTop();
    expect(Math.abs(draggedTop - centeredTop)).toBeGreaterThan(10);

    await page.getByTestId('reset-perspective-a').click();
    const resetTop = await handleTop();
    expect(Math.abs(resetTop - centeredTop)).toBeLessThan(1);
  });

  test('perspective correction fits a large photo to a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish width

    const largePhoto = writeLargeTestImage();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(largePhoto);
    await page.getByTestId('file-b').setInputFiles(largePhoto);
    await expect(page.locator('#step-perspective')).toBeVisible();

    const editor = page.getByTestId('perspective-container-a');
    const editorBox = await editor.boundingBox();
    if (!editorBox) throw new Error('perspective editor not found');

    // The editor (and everything in it) must fit within the viewport width - no horizontal
    // overflow - the same way the marking canvases already fit narrow screens.
    expect(editorBox.width).toBeLessThanOrEqual(390);

    // Both edge handles should land within the visible viewport, not off past the edge.
    for (const side of ['left', 'right']) {
      const handleBox = await editor.locator(`.handle[data-handle="${side}"]`).boundingBox();
      if (!handleBox) throw new Error(`${side} handle not found`);
      expect(handleBox.x).toBeGreaterThanOrEqual(-20);
      expect(handleBox.x).toBeLessThanOrEqual(390);
    }

    // Pulling the right edge handle on the shrunk editor should still move it vertically toward
    // the pointer, proving the screen-to-editor-space coordinate conversion is correct.
    // Scroll the handle itself into view first: page.mouse uses viewport-relative coordinates,
    // and the editor is taller than the remaining viewport, so scrolling the container alone
    // can still leave this handle below the fold.
    const handle = editor.locator('.handle[data-handle="right"]');
    await handle.scrollIntoViewIfNeeded();
    const before = await handle.boundingBox();
    if (!before) throw new Error('handle not found');
    const targetY = before.y - 40;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2, targetY, { steps: 5 });
    await page.mouse.up();
    const after = await handle.boundingBox();
    if (!after) throw new Error('handle not found after drag');
    expect(Math.abs(after.y - targetY)).toBeLessThan(15);
    expect(Math.abs(after.x - before.x)).toBeLessThan(2); // horizontal position stays pinned to the edge
  });

  test('restart clears everything back to the initial upload-only state', async ({ page }) => {
    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-marking')).toBeVisible();

    // Mark a couple of points, so there is real state to clear.
    const a0 = PHOTO_A_MARKERS[0];
    const b0 = PHOTO_B_MARKERS[0];
    await page.getByTestId('canvas-a').click({ position: { x: a0.x, y: a0.y } });
    await page.getByTestId('canvas-b').click({ position: { x: b0.x, y: b0.y } });
    await expect(page.getByTestId('pair-count')).toHaveText('1');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('restart-btn').click();
    await page.waitForLoadState('load');

    // Back to a fresh load: only the upload step visible, no filenames, file inputs empty.
    await expect(page.locator('#step-perspective')).toBeHidden();
    await expect(page.locator('#step-marking')).toBeHidden();
    await expect(page.locator('#step-align')).toBeHidden();
    await expect(page.locator('#step-gif')).toBeHidden();
    await expect(page.getByTestId('filename-a')).toHaveText('');
    await expect(page.getByTestId('filename-b')).toHaveText('');
    const fileACount = await page.getByTestId('file-a').evaluate((el) => (el as HTMLInputElement).files?.length ?? 0);
    expect(fileACount).toBe(0);
  });

  test('restart is cancellable: declining the confirm dialog leaves everything as-is', async ({ page }) => {
    const { photoA, photoB } = writeTestImages();
    await page.goto('/');
    await page.getByTestId('file-a').setInputFiles(photoA);
    await page.getByTestId('file-b').setInputFiles(photoB);
    await expect(page.locator('#step-marking')).toBeVisible();

    page.on('dialog', (dialog) => dialog.dismiss());
    await page.getByTestId('restart-btn').click();

    // Nothing should have changed - no reload happened.
    await expect(page.locator('#step-marking')).toBeVisible();
    await expect(page.getByTestId('filename-a')).toContainText('400');
  });
});
