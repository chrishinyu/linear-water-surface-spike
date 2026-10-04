# Final whole-branch fixes report

Base commit: `02cacf6`. Production integration decision: **NO-GO**. This pass addresses the final whole-branch review findings without changing the saved five-minute profiles or the 45 FPS performance assertion.

## Fixes and evidence

1. Runtime `webglcontextlost` now calls `preventDefault`, stops and disposes the `WaterExperience`, removes its canvas and listeners, reveals the static SVG, and changes the live status from “WebGL active” to “Static water preview.” The application treats this instance as terminal; automatic WebGL recreation or restoration is not implemented. A Playwright test uses `WEBGL_lose_context`, verifies fallback, disposal, stopped frame count, and the status, and checks that an overlay link already focused before the loss keeps focus through the application-driven status transition. The regression test failed before the fix because the status stayed “WebGL active,” then passed after it.
2. `README.md` and `SPIKE-RESULTS.md` label 585×1266 as the mobile **pre-profile setup snapshot**, not a sustained low-tier drawing-buffer resolution. The mobile tier changed from medium to low about 4.1 seconds into timed sampling; buffer dimensions were not captured at that transition. Future runs must record buffer dimensions and tier transitions together throughout the timed profile. The saved frame intervals and FPS values are unchanged.
3. The PRD's minimal pure-line geometry reference and hybrid-versus-pure-line comparison are explicitly marked unperformed. This prevents a ranking of alternatives' fidelity, bundle size, CPU/GPU cost, or mobile stability. The measured hybrid remains NO-GO independently.
4. The shader comment now describes stronger crest-shaped glints plus a softer reflection fill, matching the code below it.
5. Task 6 test names, comments, and result text state their evidentiary limits: synthetic timestamps verify pressure accounting, while WebGL readback verifies numerical pixel change and luminance-centroid stability. Neither establishes browser scheduling frequency, isolated reflection perception, or visual quality.

## Verification

- Focused Playwright tests for context loss/focus, simulated tier pressure, and highlight readback: **3 passed**.
- `npm run check`: **4 unit-test files, 19 tests passed**; TypeScript compilation, Vite production build, and gzip budget assertion passed. Application and other non-Three.js JavaScript: **7.6 KiB gzip** against 150 KiB; Three.js: **126.1 KiB**; total JS: **133.6 KiB**. Vite's over-500-kB uncompressed Three.js chunk warning remains non-failing.
- `npm run validate:profiles`: **passed**. Desktop saved profile: 301.7 seconds, 1,025 intervals, **3.41 FPS average / 0.81 FPS 1% low**. Mobile-emulation saved profile: 300.6 seconds, 727 intervals, **2.42 FPS average / 0.45 FPS 1% low**. Raw intervals and PNGs verified; no new five-minute profiles were run.
- Full `npm run test:e2e -- --reporter=line`: **17 passed, 1 failed** in about 1.3 minutes. The sole failure is the unchanged 10-second desktop threshold: **9 FPS received versus 45 FPS required**. The performance test's canvas/context, ripple-cap, and navigation lifecycle checks continued past the soft FPS assertion.
- `git diff --check`: passed before commit.

## Remaining limits

No physical-device run, Chrome Performance trace, live human motion critique, pure-line reference, or tier-linked drawing-buffer record exists. The hybrid's close-up line discoverability remains failed. Runtime context restoration is not supported; context loss leaves the static preview in place. None of these limitations changes the NO-GO.
