import { expect, test } from '@playwright/test';

test('meets the desktop headless regression budget and releases its page on navigation', async ({ page }) => {
  test.setTimeout(90_000);
  const renderingErrors: string[] = [];
  const renderingWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|webgl|gl_/i.test(message.text())) {
      renderingErrors.push(message.text());
    }
    if (message.type() === 'warning' && /shader|webgl|gl_/i.test(message.text())) {
      renderingWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => renderingErrors.push(error.message));
  await page.addInitScript(() => {
    const contexts = new Set<WebGLRenderingContext | WebGL2RenderingContext>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      const result = original.apply(this, args) as ReturnType<typeof original>;
      if (result instanceof WebGLRenderingContext || result instanceof WebGL2RenderingContext) {
        contexts.add(result);
      }
      return result;
    } as typeof original;
    (window as typeof window & { __testWebglContexts: typeof contexts }).__testWebglContexts = contexts;
  });

  await page.goto('/?debug=0');
  await expect(page.locator('html')).toHaveClass(/is-webgl-ready/);
  await expect.poll(() => page.evaluate(() => window.__waterDebug?.running)).toBe(true);
  await page.waitForTimeout(10_000);

  const metrics = await page.evaluate(() => {
    const contexts = (window as typeof window & {
      __testWebglContexts: Set<WebGLRenderingContext | WebGL2RenderingContext>;
    }).__testWebglContexts;
    return {
      averageFps: window.__waterDebug?.averageFps ?? 0,
      canvasCount: document.querySelectorAll('canvas').length,
      contextCount: contexts.size,
      activeContextCount: [...contexts].filter((context) => !context.isContextLost()).length,
      activeRipples: window.__waterDebug?.activeRipples ?? 0,
      tier: window.__waterDebug?.quality,
    };
  });
  test.info().annotations.push({ type: 'desktop-headless-metrics', description: JSON.stringify(metrics) });
  expect.soft(metrics.averageFps, '10-second headless average FPS').toBeGreaterThanOrEqual(45);
  expect(metrics.canvasCount).toBe(1);
  expect(metrics.contextCount).toBe(1);
  expect(metrics.activeContextCount).toBe(1);

  for (let index = 0; index < 8; index += 1) {
    await page.mouse.click(500 + index * 3, 400);
    expect(await page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBeLessThanOrEqual(4);
  }
  expect(await page.evaluate(() => window.__waterDebug?.activeRipples ?? 0)).toBeLessThanOrEqual(4);

  // Observe the old document's render-frame counter in the Playwright process.
  // This starts after the timed FPS measurement, so the binding cannot skew it.
  const observedRenderFrames: number[] = [];
  await page.exposeBinding('__reportWaterRenderFrame', (_source, frame: number) => {
    observedRenderFrames.push(frame);
  });
  await page.evaluate(async () => {
    const experience = window.__waterExperience!;
    const report = (window as typeof window & {
      __reportWaterRenderFrame: (frame: number) => Promise<void>;
    }).__reportWaterRenderFrame;
    await report(experience.renderer.info.render.frame);
    window.setInterval(() => { void report(experience.renderer.info.render.frame); }, 50);
  });
  await expect.poll(() => observedRenderFrames.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => observedRenderFrames.at(-1)! - observedRenderFrames[0],
    { timeout: 15_000 }).toBeGreaterThan(0);

  await page.goto('about:blank');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => document.readyState)).toBe('complete');
  await page.waitForTimeout(300);
  const reportsAfterUnload = observedRenderFrames.length;
  await page.waitForTimeout(500);
  expect(observedRenderFrames).toHaveLength(reportsAfterUnload);
  test.info().annotations.push({
    type: 'navigation-render-observation',
    description: JSON.stringify({
      firstFrame: observedRenderFrames[0],
      lastFrame: observedRenderFrames.at(-1),
      reportsBeforeAndAfterUnload: reportsAfterUnload,
      reportsAfterSettling: observedRenderFrames.length,
    }),
  });
  test.info().annotations.push({ type: 'rendering-warnings', description: JSON.stringify(renderingWarnings) });
  expect(renderingErrors).toEqual([]);
});
