import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandLockup } from '@/components/wordmark'
import { SiteFooter } from '@/components/site-footer'
import { LEGAL } from '@/lib/legal'

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="inline-flex w-fit">
        <BrandLockup width={148} />
      </Link>
      <h1 className="mt-8 font-sans text-3xl font-extrabold tracking-tight text-balance">{title}</h1>
      <p className="mono-label mt-2 text-[10px] text-muted-foreground">Last updated · {LEGAL.lastUpdated}</p>
      <div className="mt-8 flex flex-col gap-7 text-[14px] leading-relaxed text-muted-foreground">{children}</div>
      <SiteFooter />
    </main>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-sans text-lg font-bold text-foreground">{heading}</h2>
      {children}
    </section>
  )
}
