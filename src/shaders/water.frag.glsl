uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform vec2 uWindDir;
uniform sampler2D uWindMap;
uniform float uWaveAmplitude;
uniform float uWaveSpeed;
uniform float uFineWaveWeight;
uniform float uLineDensity;
uniform float uHighlightDetail;
uniform float uReflectionIntensity;
uniform float uReflectionCenter;
uniform float uReflectionWidth;
uniform vec3 uBaseColor;
uniform vec3 uMidColor;
uniform vec3 uLightColor;
uniform vec3 uLineColor;
uniform float uLineStrength;
uniform float uGlintStrength;
uniform float uNearShade;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;
varying float vInteraction;
varying vec2 vHeightSlope;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 ease = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), ease.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), ease.x), ease.y);
}

float waves(vec2 p) {
  float t = uTime * uWaveSpeed;
  return sin(dot(p, vec2(0.72, 1.83)) - t) * 0.55
    + sin(dot(p, vec2(-1.24, 3.17)) + t * 0.73) * 0.29
    + sin(dot(p, vec2(2.93, 7.31)) - t * 1.37) * 0.16 * uFineWaveWeight;
}

// One short wind wave with deep-water dispersion, omega = sqrt(g k): shorter
// waves oscillate faster but travel slower, which is what makes real ripples
// slide through each other instead of moving as one sheet. Returns
// (height, d height / dx, d height / dy) in plane units.
vec3 windWave(vec2 p, float t, vec2 dir, float k, float steepness, float offset) {
  float omega = sqrt(9.8 * k) * 0.35;
  float theta = dot(dir, p) * k - omega * t + offset;
  float amplitude = steepness / k;
  return vec3(amplitude * sin(theta), steepness * cos(theta) * dir);
}

// Short-wave detail riding on the swell: six non-harmonic wavelengths fanned
// around the swell heading. Lines, shading and glints all read this one
// field, so reflections stretch, compress and travel with the water.
vec3 detailWaves(vec2 p, float t) {
  return windWave(p, t, vec2(0.828, 0.561), 5.3, 0.16, 0.0)
    + windWave(p, t, vec2(0.585, 0.811), 7.9, 0.14, 1.7)
    + windWave(p, t, vec2(0.271, 0.963), 10.7, 0.12, 4.1)
    + windWave(p, t, vec2(-0.025, 1.0), 14.1, 0.10, 2.3)
    + windWave(p, t, vec2(-0.367, 0.930), 18.6, 0.08, 5.6)
    + windWave(p, t, vec2(0.970, 0.243), 23.9, 0.07, 3.2);
}

// Capillary ripples raised by wind: very short, dispersive, fanned around the
// gust heading. They exist only where the wind map says the water was
// roughened, and they move with water physics (their own dispersion), never
// with the cursor.
vec3 gustWaves(vec2 p, float t, vec2 dir) {
  vec2 side = vec2(-dir.y, dir.x);
  return windWave(p, t, dir, 31.0, 0.09, 0.4)
    + windWave(p, t, normalize(dir + side * 0.45), 38.0, 0.07, 2.9)
    + windWave(p, t, normalize(dir - side * 0.4), 46.0, 0.06, 5.1);
}

void main() {
  vec2 screen = gl_FragCoord.xy / uResolution;
  vec2 p = vec2((vUv.x - 0.5) * 10.0, vUv.y * 12.0);
  float swell = waves(p);
  float t = uTime * uWaveSpeed;
  // Detail time is tied to wave speed, so reduced motion (speed 0) freezes it
  // too; at the hero speed it runs close to real seconds. Lower quality tiers
  // soften the detail rather than dropping it.
  // Wind energy the pointer left on this patch of water (0..1). It stays where
  // it landed and decays there (see WindField.ts); here it simply roughens the
  // surface: the existing short waves grow and wind capillaries appear, so the
  // lines bend and the glints flicker more through ordinary wave physics.
  float roughness = texture2D(uWindMap, screen).r;
  roughness = roughness * roughness * (3.0 - 2.0 * roughness);
  vec3 detail = detailWaves(p, t * 4.0)
    * (mix(0.55, 1.0, uFineWaveWeight) + roughness * 1.6);
  vec3 gust = vec3(0.0);
  if (roughness > 0.004) gust = gustWaves(p, t * 4.0, uWindDir) * roughness;
  detail += gust;
  // The projected plane is orthographic; this depth mapping adds the line
  // foreshortening of a close, downward-looking water photograph.
  float depth = -log(max(0.18, 1.18 - screen.y));
  vec2 grain = vec2(p.x * 1.8, depth * 38.0 - t * 0.13);
  float breakupA = noise(grain + vec2(swell * 0.4, 0.0));
  float breakupB = noise(grain * vec2(2.13, 1.71) + vec2(19.7, 5.3));
  // A continuous, anisotropic crest field interrupts rows without introducing
  // independent particles or a repeating cell/grid of specular dots.
  float crestBreakup = noise(grain * vec2(3.7, 1.27)
    + vec2(swell * 1.2, breakupA * 1.5));
  // Click ripples displace the same lines the swell does. Lines are only a few
  // pixels apart, so a shift must span several periods to read as a bend:
  // 40.0 maps the ripple height to a few periods at peak. The short-wave height
  // (including wind-raised waves) displaces lines too, so spacing stretches
  // on wave backs and compresses on fronts, exactly where the glints move.
  // Capillaries are physically tiny in height, so they get their own, larger
  // line displacement: enough for a fine ripple texture where the wind landed.
  float phase = depth * uLineDensity + swell * 3.8 + detail.x * 22.0 + gust.x * 140.0
    + vInteraction * 40.0
    + (breakupA - 0.5) * 1.35 + (breakupB - 0.5) * 0.45 * uFineWaveWeight;
  float ridgeDistance = abs(fract(phase) - 0.5);
  // aa = line periods per drawing-buffer pixel.
  float aa = max(fwidth(phase), 0.001);
  // Hairline lines. The intended width is ~0.35 CSS px, but no screen can draw
  // a sharp line narrower than one device pixel without it flickering as it
  // moves. So the profile is drawn at no less than ~1 buffer pixel wide and
  // its strength is scaled by intended / drawn width: thinner lines become
  // fainter, not wider, which is how the eye reads sub-pixel thinness.
  float distancePx = ridgeDistance / aa;
  float targetFwhmPx = 0.35 * uPixelRatio;
  float drawFwhmPx = max(targetFwhmPx, 1.05);
  float widthPx = drawFwhmPx / 1.665; // gaussian width for that FWHM
  float lineShape = exp(-(distancePx * distancePx) / (widthPx * widthPx));
  // Where lines crowd closer than ~3 px they cannot resolve; fade to their
  // mean coverage (profile area per period) instead of aliasing.
  float meanCoverage = min(1.0, widthPx * 1.7725 * aa);
  lineShape = mix(lineShape, meanCoverage, smoothstep(0.25, 0.55, aa * widthPx));
  // Ink lines carry the sub-pixel faintness; glints keep the full-strength
  // shape so sunlight still peaks bright along a one-pixel hairline.
  float lines = lineShape * (targetFwhmPx / drawFwhmPx);
  float portrait = 1.0 - smoothstep(0.65, 1.2, uResolution.x / uResolution.y);
  // Swell slope (per vertex) plus short-wave slope (per pixel): one surface.
  vec2 slope = vHeightSlope + detail.yz;
  vec3 normal = normalize(vec3(-slope.x, -slope.y, 1.0));
  float face = smoothstep(-0.35, 0.65, normal.y + (breakupA - 0.5) * 0.48);
  float broadNoise = noise(vec2(p.x * 0.85, p.y * 2.0 + swell));
  float tone = clamp(0.12 + face * 0.34 + vHeight * 0.8
    + broadNoise * 0.14 + screen.y * 0.12, 0.0, 1.0);
  vec3 color = mix(uBaseColor, uMidColor, tone * tone);
  float crestCoverage = smoothstep(0.24, 0.76, crestBreakup);
  color *= 0.86 + breakupA * 0.14;
  // Lines pull toward the theme's line ink instead of brightening, so the same
  // field reads as light strokes on obsidian and as fine engraving on pale
  // water. A faint base term outside the crests keeps construction legible in
  // flat regions; portrait keeps most of its line contrast.
  // Toward the far field the crest noise cells compress into small, hard
  // rectangles; gating line ink with them shows as blocky patches. Blend the
  // gate toward its average with distance so far lines read as even texture.
  float crestGate = mix(crestCoverage, 0.45, smoothstep(0.3, 0.85, screen.y));
  float lineCoverage = lines * (0.05 + crestGate * (0.10 + breakupB * 0.20)
    * mix(1.0, 0.8, portrait));
  // Unresolved lines (sub-pixel spacing) fade rather than shimmer.
  lineCoverage *= mix(1.0, 0.3, smoothstep(0.45, 1.3, aa));
  color = mix(color, uLineColor, clamp(lineCoverage * uLineStrength * 3.0, 0.0, 1.0));

  // Screen-anchored illumination: pointer and wave motion cannot move its center.
  // A slight widening toward the viewer keeps one stable vertical light path.
  float pathWidth = uReflectionWidth * mix(1.12, 0.82, screen.y);
  float reflectionX = (screen.x - uReflectionCenter) / max(pathWidth, 0.001);
  float reflection = exp(-reflectionX * reflectionX * 2.5);
  // Glint eligibility is physical first: a facet lights up when the moving
  // wave tilts it toward the light. Noise only adds a little irregularity, so
  // glints appear, split and vanish with the waves rather than on their own.
  float facing = smoothstep(0.04, 0.5, normal.y + swell * 0.15 + (breakupB - 0.5) * 0.2);
  float fragments = mix(0.2, 1.0, smoothstep(0.31, 0.73, breakupA)
    * smoothstep(0.23, 0.70, breakupB) * mix(0.18, 1.0, crestCoverage));
  // Vary glint fragmentation within the same fixed light path on every aspect
  // ratio; portrait framing uses stronger breakup to avoid stacked bright rows.
  float highlightBreakup = breakupA;
  if (uHighlightDetail >= 5.0) {
    highlightBreakup = noise(vec2(p.x * 2.7 + breakupA * 1.3,
      phase * 0.73 + breakupB * 0.5));
  }
  if (uHighlightDetail >= 7.0) {
    highlightBreakup = mix(highlightBreakup,
      noise(vec2(p.x * 4.1 + crestBreakup, phase * 1.17)), 0.25);
  }
  float crestGlint = mix(lineShape, 0.13 + lineShape * 0.47, portrait);
  float detailBreakup = smoothstep(0.38, 0.75, highlightBreakup);
  float glint = reflection * facing * fragments * crestGlint
    * mix(mix(0.2, 1.6, detailBreakup), detailBreakup * 1.4, portrait);
  // No independent twinkle clock: shimmer comes only from the short waves
  // tilting facets through the light, so every glint moves with the water.
  // Crest lines shape the stronger glints, with a softer reflection fill below;
  // there is no screen-space bloom or broad white reflection wash.
  // The bright reflection lines are cut to 40% strength in both themes.
  // Note: mix(color, color + X, 0.4) is algebraically color + 0.4 * X, a
  // brightness scale before tonemapping, not a true layer opacity. That is
  // what still lets strong daytime glints reach pure white; a true 40% layer
  // would cap them below white.
  const float GLINT_OPACITY = 0.4;
  vec3 lit = color + uLightColor * glint * 1.9 * uReflectionIntensity * uGlintStrength;
  color = mix(color, lit, GLINT_OPACITY);
  // The soft sunlit band under the glitter scales with day/night intensity:
  // a luminous path by day, a faint moonlit one by night.
  color += uLightColor * reflection * face * 0.05 * uReflectionIntensity * uGlintStrength;
  // The pointer adds no light of its own: it only roughens the water (the wind
  // map above), and the lines and glints respond through the waves.
  // A slight near-field darkening reinforces the angle without a horizon.
  color *= 1.0 - uNearShade * (1.0 - smoothstep(-2.0, 1.0, vWorldPosition.y));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
