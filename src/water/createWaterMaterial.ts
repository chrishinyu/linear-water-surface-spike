import { Color, ShaderMaterial, Vector2 } from 'three';
import type { WaterConfig } from '../config';
import { MAX_RIPPLE_UNIFORMS } from '../math/ripple';
import { getQualitySettings } from './quality';
import vertexShader from '../shaders/water.vert.glsl?raw';
import fragmentShader from '../shaders/water.frag.glsl?raw';

interface Uniform<T> { value: T }

export interface WaterUniforms {
  [name: string]: Uniform<unknown>;
  uTime: Uniform<number>;
  uResolution: Uniform<Vector2>;
  // Pointer and ripple positions use plane UV coordinates (0..1).
  uPointer: Uniform<Vector2>;
  uPointerStrength: Uniform<number>;
  uWaveAmplitude: Uniform<number>;
  uWaveSpeed: Uniform<number>;
  uFineWaveWeight: Uniform<number>;
  uLineDensity: Uniform<number>;
  uReflectionIntensity: Uniform<number>;
  uReflectionCenter: Uniform<number>;
  uReflectionWidth: Uniform<number>;
  uBaseColor: Uniform<Color>;
  uMidColor: Uniform<Color>;
  uLightColor: Uniform<Color>;
  uRipplePositions: Uniform<Float32Array>;
  uRippleStarts: Uniform<Float32Array>;
  uRippleStrengths: Uniform<Float32Array>;
  uRippleDuration: Uniform<number>;
  uRippleCount: Uniform<number>;
}

export type WaterMaterial = ShaderMaterial & { uniforms: WaterUniforms };

export function createWaterMaterial(config: WaterConfig): WaterMaterial {
  const quality = getQualitySettings(config.quality);
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uPointer: { value: new Vector2(-10, -10) },
    uPointerStrength: { value: 0 },
    uWaveAmplitude: { value: config.waveAmplitude },
    uWaveSpeed: { value: config.waveSpeed },
    uFineWaveWeight: { value: quality.fineWaveWeight },
    uLineDensity: { value: Math.min(config.lineDensity, quality.lineSamples) },
    uReflectionIntensity: { value: config.reflectionIntensity },
    uReflectionCenter: { value: config.reflectionCenter },
    uReflectionWidth: { value: config.reflectionWidth },
    uBaseColor: { value: new Color('#061015') },
    uMidColor: { value: new Color('#577180') },
    uLightColor: { value: new Color('#d5e3e5') },
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
