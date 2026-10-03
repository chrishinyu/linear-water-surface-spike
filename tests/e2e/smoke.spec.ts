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
