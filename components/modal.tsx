'use client'

import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="animate-slidein relative max-h-[88%] overflow-y-auto rounded-t-2xl border-t border-border bg-surface">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 className="font-sans text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="mono-label rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label mb-2 block text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-sm text-foreground outline-none placeholder:text-[#4d5c61] focus:border-primary'
