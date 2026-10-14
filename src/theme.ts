import { Color } from 'three';

export type Theme = 'light' | 'dark';

/**
 * Shader palette per theme. Every colour is a primitive from the portfolio
 * design system (website styles/tokens.css), so the water speaks the same
 * Blue Slate ramp as the site:
 *   dark  — obsidian blue-grey, low contrast: slate-neutral troughs and swell,
 *           primary-500 line ink, primary-300 (obsidian accent) glints.
 *   light — near-white, low contrast: faint neutral-grey troughs rising to
 *           white, primary-600 line ink, white glints; lines read as engraving.
 */
export interface ThemePalette {
  base: Color;
  mid: Color;
  light: Color;
  line: Color;
  clear: Color;
  /** How strongly line coverage pulls toward the line ink (0..1 range). */
  lineStrength: number;
  glintStrength: number;
  /** Foreground darkening that implies the downward viewing angle. */
  nearShade: number;
  /** Depth of the surface texture's darkening (0..1). */
  grain: number;
}

const palette = (values: {
  base: string; mid: string; light: string; line: string; clear: string;
  lineStrength: number; glintStrength: number; nearShade: number; grain: number;
}): Readonly<ThemePalette> => Object.freeze({
  base: new Color(values.base),
  mid: new Color(values.mid),
  light: new Color(values.light),
  line: new Color(values.line),
  clear: new Color(values.clear),
  lineStrength: values.lineStrength,
  glintStrength: values.glintStrength,
  nearShade: values.nearShade,
  grain: values.grain,
});

export const THEME_PALETTES: Readonly<Record<Theme, Readonly<ThemePalette>>> = {
  // Obsidian blue-grey, low contrast. The darkest Blue Slate tokens are
  // strongly saturated at low luminance (primary-950 reads as navy), so the
  // surface blends the slate ramp with the neutrals: blue-grey, not blue.
  // The brightest value is the obsidian accent itself (primary-300), kept low.
  dark: palette({
    base: '#151b20', // primary-900 blended 65% toward neutral-900
    mid: '#2a3338', // primary-700 blended 60% toward neutral-800
    light: '#8da3b0', // primary-300, the obsidian accent (Decision 025)
    line: '#536878', // primary-500
    clear: '#151b20',
    lineStrength: 0.1,
    // Night: the same shimmer motion, but moonlit: dim, soft highlights.
    glintStrength: 0.36,
    nearShade: 0.1,
    grain: 0.14,
  }),
  // Daytime: a bright field with real shade in the troughs, so pure-white
  // sun glitter has something to stand against. A near-white field cannot
  // show white highlights; the contrast lives between trough and glint.
  light: palette({
    base: '#edf0f2', // neutral-50 with a trace of primary-100: near white
    mid: '#ffffff', // neutral-0
    light: '#ffffff',
    line: '#425868', // primary-600
    clear: '#f3f5f6',
    lineStrength: 0.12,
    // Day: intense, saturating glints that bloom to pure white.
    glintStrength: 1.5,
    nearShade: 0.03,
    // Shallow texture so the field stays near white (median ~237/255).
    grain: 0.07,
  }),
};

/**
 * One duration and curve for every part of a theme change. CSS uses
 * --theme-ms with --ease-apple (cubic-bezier(0.16, 1, 0.3, 1)); the shader
 * palette uses easeOutExpo, the same family, so water and type move together.
 */
export const THEME_MS = 600;
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const STORAGE_KEY = 'water-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The inline script in index.html stamps data-theme before first paint. */
export function currentTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  return isTheme(stamped) ? stamped : 'dark';
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this visit.
  }
}
