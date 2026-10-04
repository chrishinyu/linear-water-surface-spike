# Linear water surface spike

An isolated Vite, Three.js, and GLSL prototype for a dark water hero made from procedural lines. It is a measurement spike, not integrated into the portfolio site. Read [SPIKE-RESULTS.md](SPIKE-RESULTS.md) before reuse.

## Run and verify

Use Node.js 24 and npm 10.8.3 or newer. The locked Vitest 5.0.3 supports Node 24, and `vite-plugin-glsl` requires npm 10.8.3 or newer. The package engines and repository `.npmrc` enforce these versions during a clean install. From this directory:

```bash
npm install
npx playwright install chromium
npm run dev
npm test
npm run test:e2e
npm run build
npm run preview
```

`npm run check` runs unit tests and a production build. `npm run build` also fails if all non-Three.js JavaScript chunks together exceed 150 KiB gzip. The build prints the Three.js chunk separately and reports total JavaScript transfer. Playwright starts its own Vite server for `npm run test:e2e`; stop `npm run dev` if it already occupies port 5173.

The default page uses the hero preset. Hover creates a subtle local response. A short primary click or touch tap creates a ripple that fades in three seconds; drags and long presses do not. The demo has one canvas and keeps copy above it. `?debug=1` loads the calibration panel only in development; `?debug=0` or no flag leaves it unloaded. The panel can change quality and wave, reflection, pointer, and ripple controls. There is no URL flag for quality or mode. The background preset is available through `resolveConfig('background')` for integration experiments.

Quality starts at high for the hero. After five continuous seconds below 45 FPS on desktop or 30 FPS on a coarse pointer, it drops high → medium → low and never upgrades automatically. Tiers lower DPR, fine-wave weight, highlight samples, line density, and the active ripple cap. Rendering pauses when the page is hidden or the water root leaves the viewport. `prefers-reduced-motion: reduce` draws one still frame, disables pointer responses, and resumes the latest settings when the preference returns to normal. WebGL or shader initialization failure leaves the static SVG fallback visible. Runtime WebGL context loss stops and disposes the renderer and returns to that fallback; this spike does not recreate the WebGL instance automatically.

## Reproduce measurements

The automated 10-second headless regression check runs in `npm run test:e2e`. It measures the debug frame sampler, one canvas/context, ripple cap, navigation, and browser errors. Headless FPS is a regression signal; it does not prove device performance. The 150 KiB application budget is separate from the measured Three.js dependency, which remains part of total transfer.

The 2026-10-03 gate is recorded in [SPIKE-RESULTS.md](SPIKE-RESULTS.md): the 45 FPS desktop assertion fails, both five-minute headless profiles are below their frame-rate targets, and a real mobile run is still required. The saved JSON files are Playwright frame/heap/long-task profiles, **not Chrome Performance traces**. Their software GPU renderer and the browser's mobile emulation limit what they can establish about hardware performance and heat. The PRD's minimal pure-line geometry reference and hybrid-versus-pure-line comparison were not performed, so this gate cannot rank the alternatives. The hybrid spike remains NO-GO on its own evidence. Do not interpret a passing build or functional smoke tests as integration approval.

For sustained, repeatable browser-environment runs, build first, then run these separately so they do not compete for the same GPU:

```bash
npm run build
npm run profile:desktop
npm run profile:mobile
npm run validate:profiles
```

Each profile lasts at least 300 seconds by default and writes a JSON measurement plus a still to `artifacts/`. The desktop run uses 1440×900 at device scale factor 1. The mobile-emulation run uses 390×844, mobile viewport/touch emulation, and device scale factor 3 (the application caps rendering DPR). Both use headless Playwright Chromium against the Vite development server so `window.__waterDebug` can expose tier changes. The JSON `browserEnvironment.drawingBuffer` value is a pre-profile setup snapshot before the screenshot and timed sampling; the mobile value of 585×1266 does not describe sustained low-tier resolution. After the screenshot and setup, the sampler clears prior intervals and its previous-frame timestamp; it discards the first boundary interval. The JSON persists every measured frame interval in `frameIntervalsMs`, plus browser/GPU identification, average and 1% low FPS calculated from those intervals, CDP JS heap samples, Long Task API entries, quality changes, browser warnings, and a post-profile scroll/link/text check. Screenshot capture is excluded from the timed interval. `npm run validate:profiles` recomputes the frame metrics from the raw intervals and checks duration and screenshot dimensions. Future profiles must record drawing-buffer dimensions alongside each quality-tier transition and during sustained sampling. A browser profile cannot provide physical-device temperature.

For a Chrome Performance trace, open `npm run dev` in Chrome, set the responsive viewport to 1440×900 or 390×844, select the actual device scale factor, enable screenshots and memory in DevTools Performance, then record for five minutes. Save the trace with the browser version, viewport, DPR, GPU renderer, power state, and foreground/background state. Inspect Frames, Main thread long tasks, JS heap, GPU warnings, and quality transitions. Repeat on a physical mobile device through remote debugging; record model, OS, browser, battery and power mode, thermal state or highest temperature the device exposes, and interaction responsiveness. Mobile emulation alone does not satisfy the GO gate.

For the visual gate, export one still at each target viewport. Show them without the project name or page copy to at least three independent reviewers, and ask what material they perceive first, what they notice close up, and how the movement feels after seeing it live. Preserve their raw answers. Water must be the dominant first reading, line construction must be discoverable, and a grid or scan-line artifact must not dominate. Do not treat agent review as human research.
