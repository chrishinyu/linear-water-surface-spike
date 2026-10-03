# Linear Water Surface Spike Results

Measured 2026-10-03. This decision applies to the isolated spike. The portfolio site has not been integrated or measured. Evidence files are in [`artifacts/`](artifacts/); reproduction commands are in [`README.md`](README.md). **Production integration: NO-GO.**

## Visual gate: FAIL

The water-recognition part passes: three independent, blind **agent** reviewers first described both clean stills as dark or rippled water. No reviewer reported a dominant grid or scan-line artifact. The complete visual gate fails because line construction was not explicitly discovered and stills cannot establish motion quality. These are agent responses, not human user research.

The reviewed images are [`frame-a.png`](artifacts/frame-a.png), 1440×900, and [`frame-b.png`](artifacts/frame-b.png), 390×844. `scripts/capture-review.mjs` captured them from a WebGL-ready development page after hiding demo copy, with `?debug=0`. I opened both files, confirmed their dimensions and visual contents, and checked their SHA-256 digests: `3a21737f578318cbecef1871531b77290a9f33ddca762b13643ad86e7d8094f1` and `ece2e67d2984f8d3236fc40255b98521f14e6c636c64b4a808fc0cf4e65d125c` respectively. They are single frames, not motion recordings.

### Raw blind agent-review answers

The reviewers were asked what material they perceived, what they noticed closely, and whether movement felt calm, artificial, plastic, or convincing. Their answers are preserved verbatim below.

```text
Reviewer A
Image A
1. Dark water with reflected light.
2. Long, fine horizontal ripples and a broken vertical trail of bright reflections stand out.
3. Movement can’t be judged from a still.
Image B
1. Dark, rippled water.
2. A narrow, broken trail of highlights runs through softer, mottled surface patterns.
3. Movement can’t be judged from a still.

Reviewer B
Frame A
1. Dark water, seen at a low, grazing angle.
2. Thin horizontal ripples and scattered bright reflections, especially through the center and lower edge.
3. Movement cannot be judged from a still.
Frame B
1. Dark, rippled water, seen from above or at a steeper angle.
2. A broken vertical trail of bright reflections runs through the middle; the surrounding surface looks softly blurred.
3. Movement cannot be judged from a still.

Reviewer C
Frame A
1. Dark water is the first impression.
2. I notice a narrow trail of brighter reflections near the center, with soft horizontal ripples across the rest of the surface.
3. Movement quality can’t be judged from a still.
Frame B
1. Dark, rippled water is the first impression.
2. I notice scattered highlights running down the middle and a mottled, uneven texture across the surface.
3. Movement quality can’t be judged from a still.
```

## Line discoverability: FAIL

All three agents noticed ripples or reflections, but none identified the intended dense, irregular *line construction* on closer inspection. [`frame-b.png`](artifacts/frame-b.png) especially reads as a soft, mottled water texture at mobile size. The still-image evidence does not meet the design's close-inspection criterion. A live, blind review after visual adjustments is needed.

## Desktop performance: FAIL

`npm run test:e2e` ran 18 Chromium tests: **17 passed, 1 failed**. The 10-second desktop regression assertion requires at least 45 FPS; the final full-gate rerun reported **20 FPS**. A prior full run reported 6 FPS and a targeted rerun reported 19 FPS, so this headless result is environment-sensitive, but every run fails the threshold. Chromium also emitted SwiftShader `GPU stall due to ReadPixels` warnings, recorded separately from actual shader/WebGL console errors; none of those errors failed the final test.

The separate 300.376-second desktop profile at 1440×900 measured **19.58 average FPS** and **9.86 FPS 1% low**, with 5,879 animation-frame intervals. It used Playwright Chromium 153.0.8010.12 in headless mode with the **ANGLE/SwiftShader Vulkan software renderer**, not a representative hardware GPU. The tier moved high → medium → low by about 10.6 seconds and stayed low. JS heap used fell from 17,678,460 to 8,207,100 bytes; samples after 60 seconds stayed near 8.0–8.7 MB, with no observed progressive heap increase. The Long Task API recorded 2,782 tasks totaling 152,128 ms, maximum 201 ms. Timed-run browser warnings were empty; screenshot setup produced four `ReadPixels` GPU stall warnings. Scroll, an inserted link, and heading visibility checks succeeded after profiling. Source: [`desktop-profile.json`](artifacts/desktop-profile.json), SHA-256 `f02be4ce1683d1dd722fa667999493294381ba1c7ef10260d4cd18251faa4979`.

This profile is a browser-environment regression signal, not a Chrome Performance trace or a mid-range hardware-desktop measurement. It has no per-minute FPS breakdown, so it cannot establish whether frame rate progressively slowed.

## Mobile performance: FAIL

The 300.234-second **mobile-emulation** profile used a 390×844 Playwright viewport, touch emulation, device scale factor 3, and the same desktop-hosted SwiftShader renderer. Its drawing buffer was 585×1266, or 1.5× CSS resolution. It measured **22.02 average FPS** and **10.23 FPS 1% low** over 6,615 animation-frame intervals, below the 30–45 FPS mobile target. It moved high → medium at about 13.6 seconds and finished at medium. JS heap used fell from 17,415,660 to 8,532,500 bytes; after 60 seconds samples stayed near 8.0–8.6 MB. The Long Task API recorded 804 tasks totaling 46,640 ms, maximum 225 ms. Timed-run warnings were empty; screenshot setup produced four `ReadPixels` GPU stall warnings. Scroll, an inserted link, and heading visibility checks succeeded. Source: [`mobile-emulation-profile.json`](artifacts/mobile-emulation-profile.json), SHA-256 `80a0c0b438a91cef9a1d31bf74ad3fa36cfccc5da6cd359ff4e9ec8586b000e4`.

No physical mobile device, thermal reading, battery observation, or remote-debugging trace was available. The real-device requirement for GO is unmet. The current hero preset permits a 1.5 DPR cap even on mobile; the plan's mobile target is near 1.25. Emulation does not establish device GPU, heat, battery, or sustained touch/scroll behavior.

## Accessibility and fallback: PASS

The 17 passing Chromium smoke tests cover reduced-motion still rendering and live preference changes; static SVG fallback after WebGL creation or shader-link failure; decorative canvas semantics and overlay link focus; mouse and touch ripple behavior; hidden/offscreen pause and resume; disposal after root removal; and quality changes. The performance test also observed one canvas, one active WebGL context, and at most four active ripples before navigation; its only remaining failure after separating warnings from errors is the FPS assertion. These are automated browser checks, not a real-device accessibility audit. Source: `npm run test:e2e` output and [`performance.spec.ts`](tests/e2e/performance.spec.ts).

## Bundle and asset budgets: PASS

`npm run check` passed **19 unit tests in 4 files**, TypeScript compilation, Vite production build, and the Node gzip budget assertion. The application and other non-Three.js JavaScript measured **7.5 KiB gzip** against a **150 KiB** limit; the isolated Three.js chunk measured **126.1 KiB gzip**, for **133.5 KiB total JavaScript**. Vite also emitted its non-failing warning that the uncompressed Three.js chunk exceeds 500 kB. The production build has no eager calibration-panel chunk or external model, video, HDR, or texture asset. Source: build output and [`check-bundle.mjs`](scripts/check-bundle.mjs).

## Observed risks

- Headless software rendering is far below the desktop and mobile targets and emitted GPU stall warnings during screenshot capture. Real GPU performance is unknown.
- Mobile rendering uses 1.5× DPR in the hero preset, above the planned near-1.25 mobile cap.
- The close-up line identity and live motion quality are unproven; the mobile still looks mottled to the reviewers.
- Browser emulation cannot measure device heat or battery, and no physical mobile profile was run.
- The five-minute profiles record aggregate frame pacing and heap samples, but no per-minute FPS trend or Chrome Performance trace. Link, scroll, and text checks are simple post-run probes, not interaction-latency measurements.

## Recommended changes

1. Reduce fragment-shader sampling and overdraw until a hardware desktop reaches the 45 FPS floor without relying on a low quality tier. Profile GPU and main-thread time with Chrome Performance, then repeat a five-minute desktop run.
2. Apply a mobile-specific rendering DPR cap near 1.25 and retune tier downgrade behavior; verify on a representative physical phone for five minutes with thermal, battery/power state, scroll, link, and overlay observations.
3. Increase the visibility of irregular line construction at mobile size while preserving the water first read. Repeat blind review with stills and a live-motion capture so reviewers can judge calmness and physical credibility.
4. Record per-minute frame pacing, interaction latency, and a Chrome Performance trace in the next measurement round. Keep the 45 FPS automated desktop assertion unchanged.

## Production integration decision: NO-GO

Water recognition and the automated functional, accessibility, fallback, and bundle checks are promising. Line discoverability is unproven, the available performance measurements fail, and the required physical-mobile run is missing. Do not integrate this spike into the production portfolio until the failed gates are corrected and remeasured on real desktop and mobile hardware.
