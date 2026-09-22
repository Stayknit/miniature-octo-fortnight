'use client'

import Link from 'next/link'
import { Printer, ArrowLeft } from 'lucide-react'
import { BrandLockup } from '@/components/wordmark'
import type { Receipt } from '@/lib/billing/receipt'
import { LEGAL, addressLine, registrationLines } from '@/lib/legal'

// The hosted, printable version of the receipt/tax invoice StayKnit emails on
// payment. Data is derived server-side (lib/billing/receipt.ts); this component
// only renders and offers print / save-to-PDF via the browser's print dialog.
export function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:py-12">
      {/* Actions — hidden when printing so the PDF is just the document. */}
      <div className="mx-auto mb-5 flex w-full max-w-xl items-center justify-between print:hidden">
        <Link
          href="/"
          className="mono-label inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to StayKnit
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="mono-label inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[10px] text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Printer size={14} aria-hidden="true" />
          Print / save PDF
        </button>
      </div>

      <article className="receipt-doc mx-auto w-full max-w-xl rounded-2xl border border-border bg-surface p-6 sm:p-9">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <BrandLockup width={150} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {LEGAL.entity}
              <br />
              {addressLine()}
            </p>
          </div>
          <div className="sm:text-right">
            <span className="mono-label inline-block rounded-full bg-primary/10 px-3 py-1 text-[10px] text-primary">
              {receipt.badge}
            </span>
            <h1 className="mt-2 font-sans text-xl font-extrabold tracking-tight">{receipt.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{receipt.invoiceNumber}</p>
          </div>
        </header>

        <dl className="mt-6 flex flex-col">
          {receipt.rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-b border-border/60 py-3 last:border-b-0"
            >
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd
                className={`text-right text-sm tabular-nums ${
                  row.strong ? 'text-base font-extrabold text-foreground' : 'text-foreground'
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 rounded-lg bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {receipt.note}
        </p>

        <footer className="mt-6 border-t border-border pt-5 text-[11px] leading-relaxed text-muted-foreground">
          {registrationLines().map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-2">
            Questions about this payment? Email{' '}
            <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary hover:underline">
              {LEGAL.contactEmail}
            </a>
            .
          </p>
        </footer>
      </article>

      <style>{`
        @media print {
          :root { color-scheme: light; }
          body { background: #ffffff !important; }
          main { padding: 0 !important; background: #ffffff !important; }
          .receipt-doc {
            max-width: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </main>
  )
}
