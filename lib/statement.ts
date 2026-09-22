// Client-side statement export helpers. Money figures are whole units in the
// host's chosen currency.

import type { ComputedLine } from '@/lib/costing'
import { currencyCode, formatMoney } from '@/lib/currency'
import { monthYearLabel } from '@/lib/today'

// The managing host/agency shown at the top of every statement.
export type StatementHost = {
  name: string // business/agency name, or the host's own name
  managedBy?: string // host person's name when a business name is also set
  email?: string
  phone?: string
}

// A single unit's slice of a multi-property statement.
export type StatementProperty = {
  name: string
  nights: number
  bookings: number
  gross: number
  net: number
  paid: number // net already paid out to the owner
  due: number // net still outstanding
}

export type StatementOwner = {
  name: string
  email?: string
  property?: string // which unit this statement covers, or "All properties"
  host?: StatementHost // who prepared the statement
  currency?: string // host currency label, e.g. "USD ($)"
  nights: number
  bookings?: number // reservation count in the period
  gross: number
  lines: ComputedLine[] // deductions (management, cleaning, laundry, extras…)
  net: number
  paid?: number // net already paid out (from booking payment ticks)
  due?: number // net still due to the owner
  properties?: StatementProperty[] // per-unit breakdown for multi-unit owners
}

// Split a net payout into paid/due using the per-booking payment ticks. The
// paid share is proportional to the gross value of bookings marked paid.
export function paidSplit(
  rows: { amount: number; paid: boolean }[],
  net: number,
): { paid: number; due: number; paidCount: number; total: number } {
  const gross = rows.reduce((a, r) => a + r.amount, 0)
  const paidGross = rows.filter((r) => r.paid).reduce((a, r) => a + r.amount, 0)
  const due = gross > 0 ? Math.round((net * (gross - paidGross)) / gross) : net
  return { paid: net - due, due, paidCount: rows.filter((r) => r.paid).length, total: rows.length }
}

// Compose the statement host block from the host's account name plus the
// optional business/contact details saved in Settings. A business name, when
// present, becomes the headline and the personal name moves to "Managed by".
export function buildHost(input: {
  hostName?: string
  hostEmail?: string
  businessName?: string
  businessEmail?: string
  businessPhone?: string
}): StatementHost {
  const business = input.businessName?.trim()
  const person = input.hostName?.trim()
  return {
    name: business || person || 'Your host',
    managedBy: business && person ? person : undefined,
    email: input.businessEmail?.trim() || input.hostEmail?.trim() || undefined,
    phone: input.businessPhone?.trim() || undefined,
  }
}

export type StatementFormat = 'pdf' | 'csv' | 'txt'

export const STATEMENT_FORMATS: { key: StatementFormat; label: string; hint: string }[] = [
  { key: 'pdf', label: 'PDF', hint: 'Branded, print-ready' },
  { key: 'csv', label: 'CSV', hint: 'For spreadsheets' },
  { key: 'txt', label: 'Text', hint: 'Plain summary' },
]

// Statement period defaults to the real current calendar month, not a fixed
// demo month. Evaluated per call so a long-open session stays correct across a
// month boundary.
function defaultPeriod(): string {
  return monthYearLabel()
}

function money(n: number, currency?: string): string {
  return formatMoney(n, currency)
}

function slug(name: string): string {
  return name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'owner'
}

// Filename base like "stayknit-statement-m-dlamini" or, when scoped to one
// unit, "stayknit-statement-m-dlamini-sea-cottage".
function fileBase(owner: StatementOwner): string {
  const scoped = owner.property && owner.property !== 'All properties' ? `-${slug(owner.property)}` : ''
  return `stayknit-statement-${slug(owner.name)}${scoped}`
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function statementCsv(owner: StatementOwner, period = defaultPeriod()): string {
  const h = owner.host
  return [
    `StayKnit statement,${period}`,
    ...(h ? [`Host,${csvCell(h.name)}`] : []),
    ...(h?.managedBy ? [`Managed by,${csvCell(h.managedBy)}`] : []),
    ...(h?.email ? [`Host email,${csvCell(h.email)}`] : []),
    ...(h?.phone ? [`Host phone,${csvCell(h.phone)}`] : []),
    `Owner,${csvCell(owner.name)}`,
    ...(owner.property ? [`Property,${csvCell(owner.property)}`] : []),
    '',
    `Line,Amount (${currencyCode(owner.currency)})`,
    `Nights booked,${owner.nights}`,
    `Gross revenue,${owner.gross}`,
    ...owner.lines.map((l) => `${csvCell(l.label)},-${l.amount}`),
    `Net payout,${owner.net}`,
    ...(owner.paid !== undefined ? [`Paid to date,${owner.paid}`] : []),
    ...(owner.due !== undefined ? [`Outstanding due,${owner.due}`] : []),
    ...(owner.properties && owner.properties.length > 1
      ? [
          '',
          `Property,Nights,Bookings,Gross,Net,Paid,Due`,
          ...owner.properties.map(
            (p) => `${csvCell(p.name)},${p.nights},${p.bookings},${p.gross},${p.net},${p.paid},${p.due}`,
          ),
        ]
      : []),
  ].join('\n')
}

export function statementText(owner: StatementOwner, period = defaultPeriod()): string {
  const pad = (label: string) => label.padEnd(24, ' ')
  const h = owner.host
  return [
    `STAYKNIT STATEMENT`,
    `${period}`,
    ...(h ? [`Prepared by: ${h.name}`] : []),
    ...(h?.managedBy ? [`Managed by: ${h.managedBy}`] : []),
    ...(h?.email ? [`Contact: ${h.email}${h.phone ? ` · ${h.phone}` : ''}`] : h?.phone ? [`Contact: ${h.phone}`] : []),
    ``,
    `Owner: ${owner.name}`,
    ...(owner.property ? [`Property: ${owner.property}`] : []),
    ``,
    `${pad('Nights booked')}${owner.nights}`,
    `${pad('Gross revenue')}${money(owner.gross, owner.currency)}`,
    ...owner.lines.map((l) => `${pad(l.label)}- ${money(l.amount, owner.currency)}`),
    `----------------------------------------`,
    `${pad('Net payout')}${money(owner.net, owner.currency)}`,
    ...(owner.paid !== undefined ? [`${pad('Paid to date')}${money(owner.paid, owner.currency)}`] : []),
    ...(owner.due !== undefined ? [`${pad('Outstanding due')}${money(owner.due, owner.currency)}`] : []),
    ...(owner.properties && owner.properties.length > 1
      ? [
          ``,
          `PER PROPERTY`,
          ...owner.properties.flatMap((p) => [
            `${p.name}`,
            `${pad('  Nights / bookings')}${p.nights} / ${p.bookings}`,
            `${pad('  Gross')}${money(p.gross, owner.currency)}`,
            `${pad('  Net payout')}${money(p.net, owner.currency)}`,
            `${pad('  Paid / due')}${money(p.paid, owner.currency)} / ${money(p.due, owner.currency)}`,
          ]),
        ]
      : []),
    ``,
    `For your records — payment is arranged directly with your host, not through StayKnit.`,
    `Questions? Contact your host or email info@stayknit.org.`,
  ].join('\n')
}

// A self-contained, branded HTML document for printing to PDF.
function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

function statementHtml(owner: StatementOwner, period = defaultPeriod(), origin = ''): string {
  // The emblem is cropped from the full vertical lockup with a fixed square
  // window — the same technique the in-app LogoMark uses. An absolute URL is
  // required because the print document renders in a blank window.
  const logo = origin
    ? `<span class="emblem"><img src="${origin}/images/stayknit-logo-standard.png" alt=""></span>`
    : ''
  const row = (label: string, value: string, opts: { muted?: boolean; total?: boolean } = {}) => `
    <tr class="${opts.total ? 'total' : ''}">
      <td class="${opts.muted ? 'muted' : ''}">${esc(label)}</td>
      <td class="amt ${opts.muted ? 'muted' : ''}">${value}</td>
    </tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>StayKnit statement — ${owner.name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f1518; margin: 0; padding: 48px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.02em; font-size: 22px; color: #2f7d6b; }
  .emblem { position: relative; display: inline-block; width: 36px; height: 36px; flex: none; overflow: hidden; }
  .emblem img { position: absolute; max-width: none; width: 159.3%; left: -30.08%; top: 3.25%; }
  .meta { text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; color: #6b7a7e; margin-top: 4px; }
  .host { margin-top: 18px; padding: 14px 16px; background: #f4f7f6; border-radius: 10px; font-size: 12px; line-height: 1.6; color: #3a484c; }
  .host .name { font-weight: 700; font-size: 14px; color: #0f1518; }
  h1 { font-size: 18px; margin: 28px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 12px 4px; border-bottom: 1px solid #e6ebec; font-size: 14px; }
  td.amt { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: #6b7a7e; }
  tr.total td { border-bottom: none; border-top: 2px solid #0f1518; font-weight: 800; font-size: 16px; padding-top: 16px; }
  tr.total td.amt { color: #2f7d6b; }
  .foot { margin-top: 32px; font-size: 11px; color: #6b7a7e; line-height: 1.6; }
  @media print { body { padding: 24px; } .noprint { display: none; } }
  .btn { display: inline-block; margin-top: 24px; padding: 10px 18px; background: #2f7d6b; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
</style></head>
<body>
  <div class="brand">${logo}<span>StayKnit</span></div>
  <div class="meta">Owner payout statement</div>
  ${
    owner.host
      ? (() => {
          const contact = [owner.host.email, owner.host.phone]
            .filter((v): v is string => Boolean(v))
            .map(esc)
            .join(' · ')
          return `<div class="host">
    <div class="name">${esc(owner.host.name)}</div>
    ${owner.host.managedBy ? `<div>Managed by ${esc(owner.host.managedBy)}</div>` : ''}
    ${contact ? `<div>${contact}</div>` : ''}
  </div>`
        })()
      : ''
  }
  <h1>${owner.name}</h1>
  <div class="meta">${period}${owner.property ? ` · ${owner.property}` : ''}</div>
  <table>
    ${row('Nights booked', String(owner.nights))}
    ${row('Gross revenue', money(owner.gross, owner.currency))}
    ${owner.lines.map((l) => row(l.label, `− ${money(l.amount, owner.currency)}`, { muted: true })).join('')}
    ${row('Net payout', money(owner.net, owner.currency), { total: true })}
    ${owner.paid !== undefined ? row('Paid to date', money(owner.paid, owner.currency), { muted: true }) : ''}
    ${owner.due !== undefined ? row('Outstanding due', money(owner.due, owner.currency)) : ''}
  </table>
  ${
    owner.properties && owner.properties.length > 1
      ? `<h1>Per property</h1>
  <table>
    <tr><td class="muted">Property</td><td class="amt muted">Net · Due</td></tr>
    ${owner.properties
      .map(
        (p) =>
          row(
            `${esc(p.name)} — ${p.nights} nights · ${p.bookings} bookings`,
            `${money(p.net, owner.currency)} · ${money(p.due, owner.currency)} due`,
          ),
      )
      .join('')}
  </table>`
      : ''
  }
  <div class="foot">For your records — payment is arranged directly with your host, not through StayKnit.<br>Questions? Contact your host or email <a href="mailto:info@stayknit.org">info@stayknit.org</a>.</div>
  <button class="btn noprint" onclick="window.print()">Save as PDF</button>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
</body></html>`
}

function saveFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Export the statement in the chosen format. PDF opens a branded, print-ready
// document and triggers the browser's print-to-PDF dialog; CSV and text
// download directly.
export function downloadStatement(
  owner: StatementOwner,
  format: StatementFormat = 'pdf',
  period = defaultPeriod(),
): void {
  if (format === 'csv') {
    saveFile(statementCsv(owner, period), `${fileBase(owner)}.csv`, 'text/csv;charset=utf-8')
    return
  }
  if (format === 'txt') {
    saveFile(statementText(owner, period), `${fileBase(owner)}.txt`, 'text/plain;charset=utf-8')
    return
  }
  // PDF: render the branded document in a new window and let the user save it.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const win = window.open('', '_blank')
  if (!win) {
    // Popup blocked — fall back to a direct HTML file download.
    saveFile(statementHtml(owner, period, origin), `${fileBase(owner)}.html`, 'text/html;charset=utf-8')
    return
  }
  win.document.write(statementHtml(owner, period, origin))
  win.document.close()
}

// Open the user's mail client with the statement prefilled.
export function emailStatement(owner: StatementOwner, period = defaultPeriod()): void {
  const to = owner.email ?? ''
  const scope = owner.property && owner.property !== 'All properties' ? ` (${owner.property})` : ''
  const subject = encodeURIComponent(`Your StayKnit statement — ${period}${scope}`)
  const body = encodeURIComponent(
    `Hi ${owner.name},\n\nHere is your payout statement for ${period}${scope}.\n\n` +
      `Nights booked: ${owner.nights}\n` +
      `Gross revenue: ${money(owner.gross, owner.currency)}\n` +
      owner.lines.map((l) => `${l.label}: -${money(l.amount, owner.currency)}\n`).join('') +
      `Net payout: ${money(owner.net, owner.currency)}\n` +
      (owner.paid !== undefined ? `Paid to date: ${money(owner.paid, owner.currency)}\n` : '') +
      (owner.due !== undefined ? `Outstanding due: ${money(owner.due, owner.currency)}\n` : '') +
      `\nFor your records — payment is arranged directly with your host, not through StayKnit.\n` +
      `Questions? Contact your host or email info@stayknit.org.\n\n` +
      (owner.host
        ? `${owner.host.name}${owner.host.managedBy ? `\n${owner.host.managedBy}` : ''}` +
          `${owner.host.email ? `\n${owner.host.email}` : ''}${owner.host.phone ? `\n${owner.host.phone}` : ''}\n\n`
        : '') +
      `Sent via StayKnit`,
  )
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
}
