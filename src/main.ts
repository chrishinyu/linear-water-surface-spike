import './style.css';
import { resolveConfig } from './config';
import { currentTheme, storedTheme, storeTheme, type Theme } from './theme';
import { WaterExperience } from './water/WaterExperience';

const status = document.querySelector<HTMLElement>('#status');
const root = document.querySelector<HTMLElement>('#water-root');
const fallback = document.querySelector<HTMLElement>('.water-fallback');
const themeToggle = document.querySelector<HTMLButtonElement>('.theme-toggle');
const systemLight = window.matchMedia('(prefers-color-scheme: light)');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let experience: WaterExperience | undefined;
let debugPanel: { destroy(): void } | undefined;
let disposed = false;
let fallbackTimer: number | undefined;
const config = resolveConfig('hero');
// Matches the 400ms canvas fade in style.css, plus a frame of margin.
const FADE_MS = 450;

document.documentElement.classList.remove('is-webgl-ready');
if (fallback) fallback.hidden = false;
const showStaticPreview = (): void => {
  window.clearTimeout(fallbackTimer);
  document.documentElement.classList.remove('is-webgl-ready');
  if (fallback) fallback.hidden = false;
  if (status) status.textContent = 'Static water preview';
  debugPanel?.destroy();
  debugPanel = undefined;
  experience = undefined;
};

try {
  if (!root) throw new Error('Water root is missing.');
  experience = WaterExperience.mount(root, config, motionPreference, showStaticPreview,
    currentTheme());
  document.documentElement.classList.add('is-webgl-ready');
  // Keep the static preview under the fading canvas, then remove it.
  if (fallback) {
    if (motionPreference.matches) fallback.hidden = true;
    else fallbackTimer = window.setTimeout(() => { fallback.hidden = true; }, FADE_MS);
  }
  if (status) status.textContent = 'WebGL active';
} catch (error) {
  showStaticPreview();
  console.warn('Water renderer unavailable; using static preview.', error);
}

// Theme: one switch drives the page tokens (CSS transitions) and the shader
// palette (render-loop tween) with the same duration and curve.
const labelToggle = (theme: Theme): void => {
  themeToggle?.setAttribute('aria-label',
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
};
const applyTheme = (theme: Theme, animate: boolean): void => {
  document.documentElement.dataset.theme = theme;
  labelToggle(theme);
  experience?.setTheme(theme, animate);
};

// The water was built with the stamped theme, so boot only labels the toggle
// (re-applying would render an extra still frame under reduced motion).
labelToggle(currentTheme());
themeToggle?.addEventListener('click', () => {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  storeTheme(next);
  applyTheme(next, true);
});
// Follow the system until the visitor makes an explicit choice.
systemLight.addEventListener('change', (event) => {
  if (storedTheme() === null) applyTheme(event.matches ? 'light' : 'dark', true);
});

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
