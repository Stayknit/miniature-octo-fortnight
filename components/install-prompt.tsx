'use client'

import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'sk-install-banner-dismissed'

// Chrome/Edge/Android fire `beforeinstallprompt` with this shape. It isn't in
// the DOM lib types, so we model just what we use.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPad on iOS 13+ reports as Mac, so also check for touch + no MSStream.
  const iosUa = /iphone|ipad|ipod/i.test(ua)
  const iPadOs = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iosUa || iPadOs
}

/**
 * A discoverable install control for the StayKnit PWA.
 *
 * - Chrome/Edge/Android: shows a button that triggers the native install
 *   dialog, appearing only once the browser reports the app is installable.
 * - iOS Safari: there is no programmatic install, so it reveals the manual
 *   Share -> "Add to Home Screen" steps instead.
 * - Already installed (standalone) or unsupported desktop: renders nothing.
 *
 * `variant="settings"` wraps the control in a labeled section for the settings
 * panel; `variant="banner"` is a dismissible card for the dashboard whose
 * dismissal is remembered; `variant="hero"` (default) is the standalone button
 * for the public Home page, always visible so every visitor can install.
 */
export function InstallPrompt({ variant = 'hero' }: { variant?: 'hero' | 'settings' | 'banner' }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const [showManualSteps, setShowManualSteps] = useState(false)
  const [dismissed, setDismissed] = useState(variant === 'banner')

  useEffect(() => {
    if (variant === 'banner' && localStorage.getItem(DISMISS_KEY) !== '1') {
      setDismissed(false)
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    if (isIos()) setIos(true)

    const onPrompt = (e: Event) => {
      e.preventDefault() // stop Chrome's mini-infobar; we show our own button
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Already installed or dismissed: nothing to offer anywhere.
  if (installed || dismissed) return null
  // On the public Home page (`hero`) we always surface a download control, even
  // on browsers that never fire `beforeinstallprompt` (Firefox, desktop
  // Safari, embedded webviews) — falling back to manual instructions. The
  // dashboard banner and settings entry stay hidden when there's nothing
  // actionable to avoid clutter.
  const canInstall = Boolean(deferred) || ios
  if (!canInstall && variant !== 'hero') return null

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null) // the event is single-use; drop it so the button hides
  }

  function dismissBanner() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // private mode / storage disabled — dismissing for the session is fine
    }
  }

  const buttonClass =
    'mono-label flex w-full items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-3 text-[11px] text-foreground transition-colors hover:bg-muted'

  const control = ios ? (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setShowIosSteps((v) => !v)} className={buttonClass}>
        <SquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
        Add StayKnit to Home Screen
      </button>
      {showIosSteps && (
        <ol className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <li className="flex items-center gap-2">
            <span>1. Tap the Share icon</span>
            <Share className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>in Safari&apos;s toolbar.</span>
          </li>
          <li>2. Scroll down and choose &quot;Add to Home Screen&quot;.</li>
          <li>3. Tap &quot;Add&quot; — StayKnit installs like a native app.</li>
        </ol>
      )}
    </div>
  ) : deferred ? (
    <button type="button" onClick={install} className={buttonClass}>
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Install StayKnit app
    </button>
  ) : (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setShowManualSteps((v) => !v)} className={buttonClass}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Install StayKnit app
      </button>
      {showManualSteps && (
        <ol className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <li>1. Open your browser menu (the three-dots icon).</li>
          <li>2. Choose &quot;Install StayKnit&quot; or &quot;Add to Home Screen&quot;.</li>
          <li>3. Confirm — StayKnit opens full-screen like a native app.</li>
        </ol>
      )}
    </div>
  )

  if (variant === 'settings') {
    return (
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Install app</p>
        {control}
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-dim/40 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-dim text-primary">
            <Download className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Install StayKnit</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Add StayKnit to your home screen for one-tap access and a full-screen app experience.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss install prompt"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {control}
      </div>
    )
  }

  return control
}
