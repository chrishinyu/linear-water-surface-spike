import { expect, test } from '@playwright/test';

test('mounts one canvas and records one intentional ripple', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(1);
});

test('does not emit a ripple for a drag gesture', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(300, 430, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(0);
});

test('does not ripple when a drag returns to its starting point', async ({ page }) => {
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  const gesture = async (positions: number[]) => page.evaluate((points) => {
    const canvas = document.querySelector('#water-root canvas')!;
    const send = (type: string, y: number) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, isPrimary: true, pointerId: 7, pointerType: 'mouse',
      button: 0, clientX: 500, clientY: y,
    }));
    send('pointerdown', points[0]);
    for (const y of points.slice(1, -1)) send('pointermove', y);
    send('pointerup', points.at(-1)!);
  }, positions);
  await gesture([400, 445, 400, 400]);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(0);
});

test('does not ripple after the pointer leaves and returns to the canvas', async ({ page }) => {
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.evaluate(() => {
    const canvas = document.querySelector('#water-root canvas')!;
    const send = (type: string, x: number) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: type !== 'pointerleave', isPrimary: true, pointerId: 9, pointerType: 'mouse',
      button: 0, clientX: x, clientY: 400,
    }));
    send('pointerdown', 25);
    send('pointerleave', -20);
    send('pointermove', 25);
    send('pointerup', 25);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(0);
});

test('expires a three-second ripple under a throttled frame loop', async ({ page }) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 200);
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
  });
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(1);
  await page.waitForTimeout(3400);
  expect(await page.evaluate(() => window.__waterDebug?.averageFps ?? 0)).toBeLessThan(20);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0),
    { timeout: 1500 }).toBe(0);
});

test('a touch tap ripples and expires', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?debug=1');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.touchscreen.tap(195, 420);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples ?? 0), { timeout: 6000 }).toBe(0);
  await context.close();
});

test('pauses and resumes without aging ripples while suspended', async ({ page }) => {
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(1);
  await page.evaluate(() => window.__waterExperience?.stop());
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(false);
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.__waterExperience?.start());
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(1);
});

test('pauses when hidden or outside the viewport and resumes when visible', async ({ page }) => {
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  await page.locator('#water-root').evaluate((root) => { root.style.transform = 'translateY(200vh)'; });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(false);
  await page.locator('#water-root').evaluate((root) => { root.style.transform = ''; });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
});

test('disposes the canvas cleanly after root removal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.evaluate(() => {
    document.querySelector('#water-root')?.remove();
    window.__waterExperience?.dispose();
  });
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('changes all quality controls without replacing the canvas or material', async ({ page }) => {
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  const result = await page.evaluate(() => {
    const water = window.__waterExperience!;
    const canvas = water.renderer.domElement;
    const material = water.material;
    const before = {
      dpr: water.renderer.getPixelRatio(),
      lineDensity: water.uniforms.uLineDensity.value,
      fineWaveWeight: water.uniforms.uFineWaveWeight.value,
      highlightDetail: water.uniforms.uHighlightDetail.value,
    };
    water.setQuality('low');
    return {
      sameCanvas: canvas === water.renderer.domElement,
      sameMaterial: material === water.material,
      dpr: water.renderer.getPixelRatio(),
      lineDensity: water.uniforms.uLineDensity.value,
      fineWaveWeight: water.uniforms.uFineWaveWeight.value,
      highlightDetail: water.uniforms.uHighlightDetail.value,
      maxRipples: water.uniforms.uRippleCount.value,
      before,
    };
  });
  expect(result.sameCanvas).toBe(true);
  expect(result.sameMaterial).toBe(true);
  expect(result.dpr).toBeLessThan(result.before.dpr);
  expect(result.lineDensity).toBeLessThan(result.before.lineDensity);
  expect(result.fineWaveWeight).toBeLessThan(result.before.fineWaveWeight);
  expect(result.highlightDetail).toBeLessThan(result.before.highlightDetail);
  expect(result.maxRipples).toBe(2);
});
