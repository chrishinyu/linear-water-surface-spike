/// <reference types="vite/client" />

declare module '*.glsl' {
  const source: string;
  export default source;
}

interface WaterDebugMetrics {
  activeRipples: number;
  quality: import('./config').QualityTier;
  running: boolean;
  averageFps: number;
  reducedMotion: boolean;
}

interface Window {
  __waterDebug?: WaterDebugMetrics;
  __waterExperience?: import('./water/WaterExperience').WaterExperience;
}
