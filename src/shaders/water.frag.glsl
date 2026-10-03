uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerStrength;
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

varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;
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

void main() {
  vec2 screen = gl_FragCoord.xy / uResolution;
  vec2 p = vec2((vUv.x - 0.5) * 10.0, vUv.y * 12.0);
  float swell = waves(p);
  float t = uTime * uWaveSpeed;
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
  float phase = depth * uLineDensity + swell * 3.8
    + (breakupA - 0.5) * 1.35 + (breakupB - 0.5) * 0.45 * uFineWaveWeight;
  float ridgeDistance = abs(fract(phase) - 0.5);
  float aa = max(fwidth(phase), 0.001);
  float lines = 1.0 - smoothstep(0.075, 0.075 + aa, ridgeDistance);
  // Fade unresolved lines to their average coverage instead of aliasing.
  lines = mix(lines, 0.15, smoothstep(0.6, 1.6, aa));
  float portrait = 1.0 - smoothstep(0.65, 1.2, uResolution.x / uResolution.y);
  vec3 normal = normalize(vec3(-vHeightSlope.x, -vHeightSlope.y, 1.0));
  float face = smoothstep(-0.35, 0.65, normal.y + (breakupA - 0.5) * 0.48);
  float broadNoise = noise(vec2(p.x * 0.85, p.y * 2.0 + swell));
  float tone = clamp(0.12 + face * 0.34 + vHeight * 0.8
    + broadNoise * 0.14 + screen.y * 0.12, 0.0, 1.0);
  vec3 color = mix(uBaseColor, uMidColor, tone * tone);
  float crestCoverage = smoothstep(0.24, 0.76, crestBreakup);
  color *= 0.86 + lines * crestCoverage * (0.10 + breakupB * 0.20)
    * mix(1.0, 0.55, portrait)
    + breakupA * 0.14;

  // Screen-anchored illumination: pointer and wave motion cannot move its center.
  // A slight widening toward the viewer keeps one stable vertical light path.
  float pathWidth = uReflectionWidth * mix(1.12, 0.82, screen.y);
  float reflectionX = (screen.x - uReflectionCenter) / max(pathWidth, 0.001);
  float reflection = exp(-reflectionX * reflectionX * 2.5);
  float facing = smoothstep(0.04, 0.5, normal.y + swell * 0.15 + (breakupB - 0.5) * 0.45);
  float fragments = smoothstep(0.31, 0.73, breakupA)
    * smoothstep(0.23, 0.70, breakupB) * mix(0.18, 1.0, crestCoverage);
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
  float crestGlint = mix(lines, 0.13 + lines * 0.47, portrait);
  float detailBreakup = smoothstep(0.38, 0.75, highlightBreakup);
  float glint = reflection * facing * fragments * crestGlint
    * mix(mix(0.2, 1.6, detailBreakup), detailBreakup * 1.4, portrait);
  // Specular energy is confined to the same crest lines as the dark surface;
  // there is no screen-space bloom or broad white reflection wash.
  color += uLightColor * glint * 1.9 * uReflectionIntensity;
  color += uMidColor * reflection * face * 0.065 * uReflectionIntensity;
  vec2 pointerDelta = (vUv - uPointer) * vec2(1.5, 1.0);
  float pointerLift = exp(-dot(pointerDelta, pointerDelta) * 95.0);
  color += uMidColor * pointerLift * uPointerStrength * 0.2;
  // A slight near-field darkening reinforces the angle without a horizon.
  color *= 0.84 + 0.16 * smoothstep(-2.0, 1.0, vWorldPosition.y);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
