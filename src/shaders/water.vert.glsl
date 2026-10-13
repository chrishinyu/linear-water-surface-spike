uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveSpeed;
uniform float uFineWaveWeight;
uniform vec2 uRipplePositions[4];
uniform float uRippleStarts[4];
uniform float uRippleStrengths[4];
uniform float uRippleDuration;
uniform int uRippleCount;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying float vHeight;
varying float vInteraction;
varying vec2 vHeightSlope;

// Shared analytic wave family: broad cross-swell, oblique middle swell,
// and short ripples. The fragment shader uses these exact phases too.
float waves(vec2 p) {
  float t = uTime * uWaveSpeed;
  return sin(dot(p, vec2(0.72, 1.83)) - t) * 0.55
    + sin(dot(p, vec2(-1.24, 3.17)) + t * 0.73) * 0.29
    + sin(dot(p, vec2(2.93, 7.31)) - t * 1.37) * 0.16 * uFineWaveWeight;
}

float interactionAt(vec2 texcoord) {
  float interaction = 0.0;
  // Pointer wind is computed per pixel in the fragment shader: its wavelets
  // are shorter than a mesh cell, and vertex interpolation kinked them.
  for (int i = 0; i < 4; i++) {
    if (i < uRippleCount) {
      float age = uTime - uRippleStarts[i];
      float radius = length((texcoord - uRipplePositions[i]) * vec2(1.5, 1.0));
      float offset = (radius - age * 0.18) * 15.0;
      float envelope = exp(-offset * offset);
      float alive = step(0.0, age) * (1.0 - step(uRippleDuration, age));
      interaction += sin(radius * 85.0 - age * 15.0) * envelope
        * exp(-radius * 3.0) * uRippleStrengths[i] * alive * 0.65;
    }
  }
  // Several quick taps must never turn the quiet swell into a rubber sheet.
  return clamp(interaction, -0.14, 0.14);
}

float heightAt(vec2 p, vec2 texcoord) {
  return waves(p) * uWaveAmplitude + interactionAt(texcoord);
}

void main() {
  vUv = uv;
  vec2 p = vec2((uv.x - 0.5) * 10.0, uv.y * 12.0);
  // Handed to the fragment shader so click ripples bend the lines too.
  vInteraction = interactionAt(uv);
  vHeight = waves(p) * uWaveAmplitude + vInteraction;
  const float epsilon = 0.025;
  vHeightSlope = vec2(
    heightAt(p + vec2(epsilon, 0.0), uv + vec2(epsilon / 10.0, 0.0)),
    heightAt(p + vec2(0.0, epsilon), uv + vec2(0.0, epsilon / 12.0))
  ) - vHeight;
  vHeightSlope /= epsilon;
  vec3 displaced = position;
  // Keep mesh relief shallow enough that the fixed oblique projection never
  // folds onto itself; the fuller normal field retains the broad swell depth.
  displaced.z += vHeight * 0.28;
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
