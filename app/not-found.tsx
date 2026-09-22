import { Wordmark } from '@/components/wordmark'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
      <Wordmark size={40} />

      <div className="flex flex-col items-center gap-3">
        <p className="mono-label text-[11px] tracking-widest text-primary">Error 404</p>
        <h1 className="font-sans text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          This page took a night off
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          We couldn&apos;t find the page you were looking for. It may have been moved, or the link
          might be out of date.
        </p>
      </div>

      <Link
        href="/"
        className="mono-label rounded-lg bg-primary px-5 py-3 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to StayKnit
      </Link>
    </main>
  )
}
