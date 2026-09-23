// Client-side color-mode preference. Four themes, persisted in localStorage and
// applied to <html data-theme> (the token overrides live in globals.css). Kept
// off the server/DB deliberately: a display preference should apply instantly
// with no round-trip, and it survives even on the sign-in screen before any
// account data loads. The matching anti-flash init runs from a beforeInteractive
// script in app/layout.tsx.

export const THEME_MODES = ['dark', 'light', 'midnight', 'sepia'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_STORAGE_KEY = 'stayknit-theme'
export const DEFAULT_THEME: ThemeMode = 'dark'

export const THEME_LABELS: Record<ThemeMode, string> = {
  dark: 'Dark',
  light: 'Light',
  midnight: 'Midnight',
  sepia: 'Sepia',
}

export const THEME_HINTS: Record<ThemeMode, string> = {
  dark: 'The StayKnit default',
  light: 'Bright, high-contrast',
  midnight: 'True black, easy on OLED',
  sepia: 'Warm, low-glare paper',
}

// Small preview palette for the Settings swatches. Mirrors the key tokens each
// theme sets in globals.css.
export const THEME_SWATCH: Record<ThemeMode, { bg: string; fg: string; primary: string }> = {
  dark: { bg: '#0a0f11', fg: '#ffffff', primary: '#5fb3a1' },
  light: { bg: '#f5f7f7', fg: '#0b1618', primary: '#2f8677' },
  midnight: { bg: '#000000', fg: '#f3f7f6', primary: '#63bca9' },
  sepia: { bg: '#f3ead8', fg: '#3b2f1d', primary: '#3f7d6e' },
}

// Themes that use a light color-scheme also drop the `.dark` class so any
// shadcn `dark:` utilities resolve to their light variant.
const LIGHT_MODES: readonly ThemeMode[] = ['light', 'sepia']

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v)
}

export function applyTheme(mode: ThemeMode) {
  const el = document.documentElement
  el.dataset.theme = mode
  el.classList.toggle('dark', !LIGHT_MODES.includes(mode))
}

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable (private mode / blocked); the choice simply
    // won't persist, which is acceptable.
  }
}
