import { Color, ShaderMaterial, Vector2, type Texture } from 'three';
import type { WaterConfig } from '../config';
import { MAX_RIPPLE_UNIFORMS } from '../math/ripple';
import type { ThemePalette } from '../theme';
import { getQualitySettings } from './quality';
import vertexShader from '../shaders/water.vert.glsl?raw';
import fragmentShader from '../shaders/water.frag.glsl?raw';

interface Uniform<T> { value: T }

export interface WaterUniforms {
  [name: string]: Uniform<unknown>;
  uTime: Uniform<number>;
  uResolution: Uniform<Vector2>;
  // Drawing-buffer pixels per CSS pixel, so line width is set in CSS px.
  uPixelRatio: Uniform<number>;
  // Ripple positions use plane UV coordinates (0..1).
  // Current wind strength from pointer speed (0..1-ish). Not read by the
  // shaders (the wind map is); kept for debugging and tests.
  uPointerStrength: Uniform<number>;
  // Wind energy the pointer left on the water, in screen space (R8).
  uWindMap: Uniform<Texture | null>;
  // Unit direction of pointer travel in plane space (the wind direction).
  uWindDir: Uniform<Vector2>;
  uWaveAmplitude: Uniform<number>;
  uWaveSpeed: Uniform<number>;
  uFineWaveWeight: Uniform<number>;
  uLineDensity: Uniform<number>;
  uHighlightDetail: Uniform<number>;
  uReflectionIntensity: Uniform<number>;
  uReflectionCenter: Uniform<number>;
  uReflectionWidth: Uniform<number>;
  uBaseColor: Uniform<Color>;
  uMidColor: Uniform<Color>;
  uLightColor: Uniform<Color>;
  uLineColor: Uniform<Color>;
  uLineStrength: Uniform<number>;
  uGlintStrength: Uniform<number>;
  uNearShade: Uniform<number>;
  uRipplePositions: Uniform<Float32Array>;
  uRippleStarts: Uniform<Float32Array>;
  uRippleStrengths: Uniform<Float32Array>;
  uRippleDuration: Uniform<number>;
  uRippleCount: Uniform<number>;
}

export type WaterMaterial = ShaderMaterial & { uniforms: WaterUniforms };

export function createWaterMaterial(config: WaterConfig,
  palette: Readonly<ThemePalette>): WaterMaterial {
  const quality = getQualitySettings(config.quality);
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uPointerStrength: { value: 0 },
    uWindMap: { value: null },
    uWindDir: { value: new Vector2(1, 0) },
    uWaveAmplitude: { value: config.waveAmplitude },
    uWaveSpeed: { value: config.waveSpeed },
    uFineWaveWeight: { value: quality.fineWaveWeight },
    uLineDensity: { value: Math.min(config.lineDensity, quality.lineSamples) },
    uHighlightDetail: { value: quality.highlightSamples },
    uReflectionIntensity: { value: config.reflectionIntensity },
    uReflectionCenter: { value: config.reflectionCenter },
    uReflectionWidth: { value: config.reflectionWidth },
    uBaseColor: { value: palette.base.clone() },
    uMidColor: { value: palette.mid.clone() },
    uLightColor: { value: palette.light.clone() },
    uLineColor: { value: palette.line.clone() },
    uLineStrength: { value: palette.lineStrength },
    uGlintStrength: { value: palette.glintStrength },
    uNearShade: { value: palette.nearShade },
    uRipplePositions: { value: new Float32Array(MAX_RIPPLE_UNIFORMS * 2) },
    uRippleStarts: { value: new Float32Array(MAX_RIPPLE_UNIFORMS) },
    uRippleStrengths: { value: new Float32Array(MAX_RIPPLE_UNIFORMS) },
    uRippleDuration: { value: config.rippleDuration },
    uRippleCount: { value: 0 },
  };

  return new ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: false, depthTest: false, depthWrite: false,
  }) as WaterMaterial;
}
