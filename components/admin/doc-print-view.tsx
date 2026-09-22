"use client"

import { useEffect } from "react"
import { MarkdownView } from "@/components/admin/markdown-view"
import { COMPANY, companyIdentityLines, LOGO_PUBLIC_PATH } from "@/lib/company-details"

// Print-optimized, admin-only view of a single document. It reuses the same
// Markdown renderer as the in-app reader, and is presented on the official
// StayKnit letterhead (logo + registered company details) so a "Save as PDF"
// produces a professional, business-ready document. Auto-opens the print
// dialog; no server-side PDF engine required.
export function DocPrintView({ title, markdown }: { title: string; markdown: string }) {
  useEffect(() => {
    // Give the content a beat to lay out (fonts, tables, logo) before printing.
    const t = window.setTimeout(() => window.print(), 700)
    return () => window.clearTimeout(t)
  }, [])

  const stamp = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })
  const identity = companyIdentityLines()

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 text-foreground">
      {/* Toolbar — hidden when printing */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <button
          onClick={() => window.history.back()}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Official letterhead */}
      <header className="mb-5 border-b-2 border-primary pb-4">
        <div className="flex items-start justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_PUBLIC_PATH || "/placeholder.svg"}
            alt={`${COMPANY.name} logo`}
            className="h-16 w-auto shrink-0"
          />
          <div className="text-right text-[11px] leading-tight text-muted-foreground">
            <p className="text-sm font-bold text-foreground">{COMPANY.name}</p>
            <p className="mb-1 text-[11px] font-medium italic text-primary">{COMPANY.tagline}</p>
            {identity.map(({ label, value }) => (
              <p key={label}>
                <span className="font-semibold">{label}:</span> {value}
              </p>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{`${COMPANY.name} — official document · Exported ${stamp}`}</p>
        </div>
      </header>

      <MarkdownView markdown={markdown} />

      {/* Print footer with company identity line */}
      <footer className="mt-8 hidden border-t border-border pt-2 text-[10px] text-muted-foreground print:block">
        {`${COMPANY.name}  •  Reg. ${COMPANY.registration}  •  ${COMPANY.address}  •  ${COMPANY.email}`}
      </footer>

      <style>{`
        @media print {
          :root { color-scheme: light; }
          body { background: #fff !important; }
          @page { margin: 18mm; }
        }
      `}</style>
    </div>
  )
}
