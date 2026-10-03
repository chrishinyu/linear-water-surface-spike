import { expect, test } from '@playwright/test';

test('reduced motion starts with one still frame and ignores pointer input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(true);
  const before = await page.evaluate(() => ({
    frame: window.__waterExperience!.renderer.info.render.frame,
    speed: window.__waterExperience!.uniforms.uWaveSpeed.value,
    running: window.__waterDebug!.running,
  }));
  expect(before.frame).toBe(1);
  expect(before.speed).toBe(0);
  expect(before.running).toBe(false);
  await page.mouse.click(500, 400);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(0);
  expect(await page.evaluate(() => window.__waterExperience!.renderer.info.render.frame)).toBe(before.frame);
});

test('live motion preference changes restore the latest preset without stale ripples', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(true);
  expect(await page.evaluate(() => ({
    running: window.__waterDebug!.running,
    ripples: window.__waterDebug!.activeRipples,
    speed: window.__waterExperience!.uniforms.uWaveSpeed.value,
    pointer: window.__waterExperience!.uniforms.uPointerStrength.value,
  }))).toEqual({ running: false, ripples: 0, speed: 0, pointer: 0 });
  await page.evaluate(() => window.__waterExperience!.updateConfig({ waveSpeed: 0.27, rippleStrength: 0.08 }));
  expect(await page.evaluate(() => window.__waterExperience!.uniforms.uWaveSpeed.value)).toBe(0);
  await page.mouse.click(500, 400);
  expect(await page.evaluate(() => window.__waterDebug!.activeRipples)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  expect(await page.evaluate(() => window.__waterExperience!.uniforms.uWaveSpeed.value)).toBe(0.27);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.reducedMotion)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  await page.mouse.click(500, 400);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.activeRipples)).toBe(1);
});

test('failed WebGL creation preserves the static fallback and removes the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/');
  await expect(page.locator('#water-root canvas')).toHaveCount(0);
  await expect(page.locator('.water-fallback')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/is-webgl-ready/);
  await expect(page.locator('#status')).toHaveText('Static water preview');
});

test('shader link failure preserves the static fallback and removes the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getProgramParameter;
    WebGL2RenderingContext.prototype.getProgramParameter = function (program, parameter) {
      if (parameter === this.LINK_STATUS) return false;
      return original.call(this, program, parameter);
    };
  });
  await page.goto('/');
  await expect(page.locator('#water-root canvas')).toHaveCount(0);
  await expect(page.locator('.water-fallback')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/is-webgl-ready/);
  await expect(page.locator('#status')).toHaveText('Static water preview');
});

test('decorative canvas leaves overlay links and status focus accessible', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.getByRole('status')).toHaveText('WebGL active');
  const canvas = page.locator('#water-root canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  expect(await canvas.getAttribute('tabindex')).toBeNull();
  await page.locator('.demo-copy').evaluate((copy) => {
    const link = document.createElement('a');
    link.href = '#overlay-test';
    link.textContent = 'Overlay test link';
    copy.append(link);
  });
  await page.getByRole('link', { name: 'Overlay test link' }).click();
  expect(await page.evaluate(() => location.hash)).toBe('#overlay-test');
  await expect(page.getByRole('status')).toHaveText('WebGL active');
  await expect(page.getByRole('link', { name: 'Overlay test link' })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS');
});

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
  const stopped = await page.evaluate(() => ({
    renderCount: window.__waterExperience!.renderer.info.render.frame,
    elapsed: window.__waterExperience!.uniforms.uTime.value,
  }));
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.__waterExperience?.start());
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__waterExperience!.renderer.info.render.frame))
    .toBeGreaterThan(stopped.renderCount);
  const resumedElapsed = await page.evaluate(() => window.__waterExperience!.uniforms.uTime.value);
  expect(resumedElapsed - stopped.elapsed).toBeLessThan(0.5);
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

test('requires five uninterrupted slow seconds before an automatic tier drop', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  const result = await page.evaluate(() => {
    const water = window.__waterExperience!;
    const frame = (water as unknown as { frame(timestamp: number): void }).frame;
    let timestamp = 0;
    frame(0);
    for (let index = 0; index < 75; index += 1) frame(timestamp += 60);
    for (let index = 0; index < 30; index += 1) frame(timestamp += 500 / 30);
    const afterRecovery = window.__waterDebug!.quality;
    for (let index = 0; index < 5; index += 1) frame(timestamp += 100);
    const afterShortPressure = window.__waterDebug!.quality;
    for (let index = 0; index < 45; index += 1) frame(timestamp += 100);
    return { afterRecovery, afterShortPressure,
      afterContinuousPressure: window.__waterDebug!.quality };
  });
  expect(result.afterRecovery).toBe('high');
  expect(result.afterShortPressure).toBe('high');
  expect(result.afterContinuousPressure).toBe('medium');
});

test('highlight detail changes desktop pixels while keeping the light path centered', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 450 });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto('/?debug=0');
  await expect(page.locator('#water-root canvas')).toHaveCount(1);
  const signal = await page.evaluate(() => {
    const water = window.__waterExperience!;
    const renderer = water.renderer;
    const gl = renderer.getContext();
    const scene = (water as unknown as { scene: import('three').Scene }).scene;
    const camera = (water as unknown as { camera: import('three').Camera }).camera;
    const x = Math.floor(gl.drawingBufferWidth * 0.25);
    const y = Math.floor(gl.drawingBufferHeight * 0.2);
    const width = Math.floor(gl.drawingBufferWidth * 0.5);
    const height = Math.floor(gl.drawingBufferHeight * 0.6);
    const read = (detail: number) => {
      water.uniforms.uHighlightDetail.value = detail;
      renderer.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const high = read(7);
    const low = read(3);
    let changedPixels = 0;
    let totalDifference = 0;
    let highCenter = 0;
    let lowCenter = 0;
    let highLight = 0;
    let lowLight = 0;
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      const highValue = high[offset] + high[offset + 1] + high[offset + 2];
      const lowValue = low[offset] + low[offset + 1] + low[offset + 2];
      const difference = Math.abs(highValue - lowValue);
      if (difference > 0) changedPixels += 1;
      totalDifference += difference;
      const column = index % width;
      highCenter += column * highValue;
      lowCenter += column * lowValue;
      highLight += highValue;
      lowLight += lowValue;
    }
    return {
      changedPixels,
      totalDifference,
      centerShift: Math.abs(highCenter / highLight - lowCenter / lowLight),
      width,
    };
  });
  expect(signal.changedPixels).toBeGreaterThan(10_000);
  expect(signal.totalDifference).toBeGreaterThan(400_000);
  expect(signal.centerShift).toBeLessThan(signal.width * 0.05);
  if (process.env.VISUAL_INSPECTION === '1') {
    for (const detail of [7, 3]) {
      await page.evaluate((value) => {
        const water = window.__waterExperience!;
        water.uniforms.uHighlightDetail.value = value;
        const scene = (water as unknown as { scene: import('three').Scene }).scene;
        const camera = (water as unknown as { camera: import('three').Camera }).camera;
        water.renderer.render(scene, camera);
      }, detail);
      await page.screenshot({ path: testInfo.outputPath(`desktop-highlight-${detail}.png`) });
    }
  }
});
