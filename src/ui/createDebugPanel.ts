import type { WaterConfig } from '../config';

export interface DebugPanel { destroy(): void }

export function createDebugPanel(
  config: WaterConfig,
  onChange: (patch: Partial<WaterConfig>) => void,
): DebugPanel {
  let disposed = false;
  let gui: { destroy(): void } | undefined;
  const handle: DebugPanel = {
    destroy() { disposed = true; gui?.destroy(); },
  };
  if (!import.meta.env.DEV || new URLSearchParams(location.search).get('debug') !== '1') {
    return handle;
  }
  // Neither the GUI library nor its CSS is requested by normal page loads.
  void import('lil-gui').then(({ default: GUI }) => {
    if (disposed) return;
    const panel = new GUI({ title: 'Water calibration', width: 280 });
    gui = panel;
    const values = { ...config };
    const number = (key: keyof Pick<WaterConfig,
      'waveAmplitude' | 'waveSpeed' | 'lineDensity' | 'reflectionCenter' |
      'reflectionWidth' | 'reflectionIntensity' | 'pointerStrength' | 'rippleStrength'>,
    min: number, max: number, step: number, label: string) => {
      panel.add(values, key, min, max, step).name(label)
        .onChange((value: number) => onChange({ [key]: value }));
    };
    number('waveAmplitude', 0.02, 0.3, 0.005, 'Wave amplitude');
    number('waveSpeed', 0, 0.4, 0.005, 'Wave speed');
    number('lineDensity', 60, 240, 1, 'Line density');
    number('reflectionCenter', 0, 1, 0.005, 'Reflection center');
    number('reflectionWidth', 0.04, 0.4, 0.005, 'Reflection width');
    number('reflectionIntensity', 0, 2, 0.01, 'Reflection intensity');
    number('pointerStrength', 0, 0.08, 0.001, 'Pointer strength');
    number('rippleStrength', 0, 0.16, 0.005, 'Ripple strength');
    panel.add(values, 'quality', ['high', 'medium', 'low']).name('Quality')
      .onChange((quality: WaterConfig['quality']) => onChange({ quality }));
  }).catch((error: unknown) => console.warn('Water calibration panel unavailable.', error));
  return handle;
}
