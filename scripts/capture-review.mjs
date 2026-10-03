import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const artifacts = join(process.cwd(), 'artifacts');
await mkdir(artifacts, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport, mobile] of [
    ['frame-a', { width: 1440, height: 900 }, false],
    ['frame-b', { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({
      viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5175/?debug=0');
    await page.locator('html.is-webgl-ready').waitFor();
    await page.waitForTimeout(1500);
    await page.locator('.demo-copy').evaluate((element) => { element.style.visibility = 'hidden'; });
    await page.screenshot({ path: join(artifacts, `${name}.png`), scale: 'css' });
    console.log(`${name}.png: ${viewport.width}x${viewport.height}, page copy hidden`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
