import './style.css';
import { resolveConfig } from './config';
import { WaterExperience } from './water/WaterExperience';

const status = document.querySelector<HTMLElement>('#status');
const root = document.querySelector<HTMLElement>('#water-root');
const fallback = document.querySelector<HTMLImageElement>('.water-fallback');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let experience: WaterExperience | undefined;
let debugPanel: { destroy(): void } | undefined;
let disposed = false;
const config = resolveConfig('hero');

document.documentElement.classList.remove('is-webgl-ready');
if (fallback) fallback.hidden = false;

try {
  if (!root) throw new Error('Water root is missing.');
  experience = WaterExperience.mount(root, config, motionPreference);
  document.documentElement.classList.add('is-webgl-ready');
  if (fallback) fallback.hidden = true;
  if (status) status.textContent = 'WebGL active';
} catch (error) {
  if (status) status.textContent = 'Static water preview';
  console.warn('Water renderer unavailable; using static preview.', error);
}

if (import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1') {
  void import('./ui/createDebugPanel').then(({ createDebugPanel }) => {
    if (disposed || !experience) return;
    debugPanel = createDebugPanel(config, (patch) => experience?.updateConfig(patch));
  }).catch((error: unknown) => console.warn('Water calibration panel unavailable.', error));
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  debugPanel?.destroy();
  experience?.dispose();
});
