'use client'

import { OPEN_CONTACT_EVENT } from '@/components/marketing/contact-widget'

// Footer "Questions?" trigger. Opens the floating contact widget instead of
// launching the visitor's mail client via a mailto: link.
export function ContactLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONTACT_EVENT))}
      className="text-primary hover:underline"
    >
      Contact us
    </button>
  )
}
