import './style.css';
import { resolveConfig } from './config';
import { WaterExperience } from './water/WaterExperience';

const status = document.querySelector<HTMLElement>('#status');
const root = document.querySelector<HTMLElement>('#water-root');
const fallback = document.querySelector<HTMLImageElement>('.water-fallback');
let experience: WaterExperience | undefined;

document.documentElement.classList.remove('is-webgl-ready');
if (fallback) fallback.hidden = false;

try {
  if (!root) throw new Error('Water root is missing.');
  experience = WaterExperience.mount(root, resolveConfig('hero'));
  document.documentElement.classList.add('is-webgl-ready');
  if (fallback) fallback.hidden = true;
  if (status) status.textContent = 'WebGL active';
} catch (error) {
  if (status) status.textContent = 'Static water preview';
  console.warn('Water renderer unavailable; using static preview.', error);
}

if (import.meta.hot) import.meta.hot.dispose(() => experience?.dispose());
