'use client'

import {
  applyTheme,
  DEFAULT_THEME,
  readStoredTheme,
  storeTheme,
  THEME_LABELS,
  THEME_MODES,
  THEME_SWATCH,
  type ThemeMode,
} from '@/lib/theme'
import { Check, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Compact color-mode switcher shown as an icon on the Today tab. Opens a small
// popover with the four themes. The preference is client-only (localStorage +
// <html data-theme>), so we sync from storage after mount to match what the
// beforeInteractive init script already applied, avoiding a hydration mismatch.
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(readStoredTheme())
  }, [])

  // Close on outside click or Escape while the popover is open.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(mode: ThemeMode) {
    setTheme(mode)
    applyTheme(mode)
    storeTheme(mode)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change color mode"
        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
          open ? 'border-primary bg-primary-dim text-primary' : 'border-border bg-surface-2 text-muted-foreground hover:border-primary hover:text-primary'
        }`}
      >
        <Palette size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-52 rounded-lg border border-border bg-popover p-1.5 shadow-lg"
        >
          <p className="mono-label px-2 py-1 text-[9px] text-muted-foreground">Color mode</p>
          {THEME_MODES.map((mode) => {
            const on = theme === mode
            const sw = THEME_SWATCH[mode]
            return (
              <button
                key={mode}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => choose(mode)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                  on ? 'bg-primary-dim' : 'hover:bg-surface-2'
                }`}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                  style={{ backgroundColor: sw.bg, borderColor: on ? sw.primary : 'transparent' }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sw.primary }} />
                </span>
                <span className={`flex-1 text-[13px] font-medium ${on ? 'text-primary' : 'text-foreground'}`}>
                  {THEME_LABELS[mode]}
                </span>
                {on && <Check size={14} className="text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
