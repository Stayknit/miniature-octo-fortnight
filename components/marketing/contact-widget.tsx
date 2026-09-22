'use client'

import { submitContactRequest } from '@/app/actions/contact'
import { inputClass } from '@/components/modal'
import { Check, MessageSquare, Send, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'

// Custom event other components (e.g. the footer "Questions?" link) can fire to
// open the widget without prop-drilling shared state through the page.
export const OPEN_CONTACT_EVENT = 'open-contact'

// Contact form for logged-out visitors on the marketing site. Replaces the old
// mailto: link — visitors send a message without opening their mail client, and
// it lands in the support inbox with their address as Reply-To. There is no
// always-on floating button (it overlapped the footer); the panel opens only
// when the footer "Questions? Contact us" link fires OPEN_CONTACT_EVENT.
export function ContactWidget() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot

  const panelRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Let other parts of the page request the widget be opened.
  useEffect(() => {
    function onOpen() {
      setOpen(true)
      setSent(false)
    }
    window.addEventListener(OPEN_CONTACT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CONTACT_EVENT, onOpen)
  }, [])

  // Close on Escape, and focus the first field when the panel opens.
  useEffect(() => {
    if (!open) return
    firstFieldRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!message.trim()) {
      setError('Please add a short message.')
      return
    }
    startTransition(async () => {
      const res = await submitContactRequest({ name, email, message, company })
      if (res.ok) {
        setSent(true)
        setName('')
        setEmail('')
        setMessage('')
      } else {
        setError(res.error)
      }
    })
  }

  if (!open) return null

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Contact StayKnit"
        className="animate-slidein flex max-h-[calc(100dvh-6rem)] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Contact us</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close contact form"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {sent ? (
            <div className="p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-dim">
                <Check size={18} className="text-primary" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">Message sent</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Thanks for reaching out. We&apos;ll reply to your email as soon as possible.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mono-label mt-3 rounded border border-border px-3 py-1.5 text-[10px] text-primary hover:border-primary"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2.5 overflow-y-auto p-4">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Questions about StayKnit? Send us a message and we&apos;ll get back to you by email.
              </p>
              <input
                ref={firstFieldRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                className={inputClass}
                autoComplete="name"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                type="email"
                required
                className={inputClass}
                autoComplete="email"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={4}
                required
                className={`${inputClass} resize-none`}
              />
              {/* Honeypot: hidden from users, catches bots. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="hidden"
              />
              {error && <p className="text-[12px] text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={pending}
                className="mono-label flex items-center justify-center gap-1.5 rounded-lg bg-primary py-3 text-[11px] text-primary-foreground transition-opacity disabled:opacity-60"
              >
                <Send size={14} /> {pending ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
      </div>
    </div>
  )
}
