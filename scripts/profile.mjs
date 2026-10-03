import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const mode = process.argv[2];
if (!['desktop', 'mobile-emulation'].includes(mode)) {
  throw new Error('Usage: node scripts/profile.mjs desktop|mobile-emulation [seconds=300]');
}
const seconds = Number(process.argv[3] ?? 300);
if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Duration must be positive.');
const viewport = mode === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const artifacts = join(process.cwd(), 'artifacts');
await mkdir(artifacts, { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: mode === 'desktop' ? 1 : 3,
    isMobile: mode !== 'desktop',
    hasTouch: mode !== 'desktop',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const warnings = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) warnings.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    const samples = { frameMs: [], longTasks: [], tierChanges: [], lastTier: '' };
    Object.assign(window, { __profileSamples: samples });
    let lastFrame = 0;
    const sampleFrame = (timestamp) => {
      if (lastFrame) samples.frameMs.push(timestamp - lastFrame);
      lastFrame = timestamp;
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          samples.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* Long Task API may be unavailable. */ }
    setInterval(() => {
      const tier = window.__waterDebug?.quality;
      if (tier && tier !== samples.lastTier) {
        samples.tierChanges.push({ ms: performance.now(), tier });
        samples.lastTier = tier;
      }
    }, 250);
  });
  await page.goto('http://127.0.0.1:5174/?debug=0');
  await page.locator('html.is-webgl-ready').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  const browserEnvironment = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: devicePixelRatio,
      gpuVendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
      gpuRenderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
      drawingBuffer: gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : null,
    };
  });
  await page.screenshot({ path: join(artifacts, `${mode}-1440-or-390.png`) });
  const screenshotWarnings = warnings.splice(0);
  await page.evaluate(() => {
    window.__profileSamples.frameMs.length = 0;
    window.__profileSamples.longTasks.length = 0;
    window.__profileSamples.tierChanges.length = 0;
    window.__profileSamples.tierChanges.push({ ms: performance.now(), tier: window.__waterDebug?.quality });
  });
  const start = await cdp.send('Performance.getMetrics');
  const heapSamples = [{ seconds: 0, bytes: start.metrics.find((item) => item.name === 'JSHeapUsedSize')?.value ?? null }];
  const profileStart = Date.now();
  while (Date.now() - profileStart < seconds * 1000) {
    await page.waitForTimeout(Math.min(30_000, seconds * 1000 - (Date.now() - profileStart)));
    const metrics = await cdp.send('Performance.getMetrics');
    heapSamples.push({ seconds: (Date.now() - profileStart) / 1000,
      bytes: metrics.metrics.find((item) => item.name === 'JSHeapUsedSize')?.value ?? null });
    console.log(`${mode}: ${Math.round((Date.now() - profileStart) / 1000)}/${seconds}s`);
  }
  const end = await cdp.send('Performance.getMetrics');
  const samples = await page.evaluate(() => {
    const samples = window.__profileSamples;
    return {
      ...samples,
      finalTier: window.__waterDebug?.quality,
      finalAverageFps: window.__waterDebug?.averageFps,
      activeRipples: window.__waterDebug?.activeRipples,
      running: window.__waterDebug?.running,
      textVisible: !!document.querySelector('h1')?.getClientRects().length,
    };
  });
  const metric = (set, name) => set.metrics.find((item) => item.name === name)?.value ?? null;
  const sorted = samples.frameMs.filter((value) => value > 0).sort((a, b) => b - a);
  const slowestCount = Math.max(1, Math.ceil(sorted.length * 0.01));
  const slowestMeanMs = sorted.slice(0, slowestCount).reduce((sum, value) => sum + value, 0) / slowestCount;
  const elapsedSeconds = (Date.now() - profileStart) / 1000;
  const frameSummary = {
    count: sorted.length,
    averageFps: sorted.length / (sorted.reduce((sum, value) => sum + value, 0) / 1000),
    onePercentLowFps: 1000 / slowestMeanMs,
    slowestMeanMs,
    maxFrameMs: sorted[0] ?? null,
  };

  // Exercise the demo's interaction surfaces after sustained sampling.
  const interaction = await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '#profile-link';
    link.textContent = 'Profile link';
    document.querySelector('.demo-copy')?.append(link);
    const spacer = document.createElement('div');
    spacer.style.height = '100vh';
    document.body.append(spacer);
    window.scrollTo(0, document.body.scrollHeight);
    const scrollY = window.scrollY;
    window.scrollTo(0, 0);
    link.click();
    return { scrollY, linkActivated: location.hash === '#profile-link', textVisible: !!document.querySelector('h1')?.getClientRects().length };
  });
  const output = {
    mode,
    profileDurationSeconds: elapsedSeconds,
    measuredAt: new Date().toISOString(),
    browser: `Playwright Chromium ${browser.version()} headless, Vite development server`,
    host: { platform: process.platform, architecture: process.arch },
    viewport,
    browserEnvironment,
    frames: frameSummary,
    jsHeapUsedBytes: { start: metric(start, 'JSHeapUsedSize'), end: metric(end, 'JSHeapUsedSize') },
    jsHeapSamples: heapSamples,
    longTasks: { count: samples.longTasks.length, totalMs: samples.longTasks.reduce((sum, entry) => sum + entry.duration, 0), maxMs: Math.max(0, ...samples.longTasks.map((entry) => entry.duration)) },
    quality: { transitions: samples.tierChanges, finalTier: samples.finalTier, finalAverageFps: samples.finalAverageFps },
    warnings,
    screenshotWarnings,
    interaction,
    activeRipples: samples.activeRipples,
    running: samples.running,
    deviceTemperature: null,
    deviceTemperatureReason: 'Neither Playwright nor Chromium exposes a physical device temperature sensor.',
  };
  const path = join(artifacts, `${mode}-profile.json`);
  await writeFile(path, JSON.stringify(output, null, 2) + '\n');
  console.log(`Profile written: ${path}`);
  console.log(JSON.stringify({ frames: output.frames, jsHeapUsedBytes: output.jsHeapUsedBytes, longTasks: output.longTasks, quality: output.quality, warnings: output.warnings, interaction: output.interaction }, null, 2));
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
