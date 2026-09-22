// Monthly business accounts statement — the StayKnit operator's own P&L for a
// single calendar month, distinct from the owner payout statements in
// lib/statement.ts. Types, month helpers, and pure renderers live here (no DB,
// no DOM) so they can run in the API route, a server action, or the client.

import { formatMoney } from '@/lib/pricing'

const zar = (cents: number) => formatMoney(cents, 'zar')

export type AccountStatementPlanRow = {
  plan: string
  name: string
  count: number
  monthlyValueCents: number
}

export type AccountStatementCostRow = {
  label: string
  cadence: 'monthly' | 'yearly'
  currency: string // as recorded (zar | eur | usd)
  amountMinor: number // as entered, in `currency`
  monthlyCents: number // normalised to monthly ZAR
}

export type AccountStatement = {
  month: string // YYYY-MM
  periodLabel: string // e.g. "September 2026"
  generatedAt: string // ISO
  currency: 'zar'
  payingAccounts: number
  compAccounts: number
  mrrCents: number
  arrCents: number
  byPlan: AccountStatementPlanRow[]
  costs: AccountStatementCostRow[]
  runningCostMonthlyCents: number
  netMonthlyCents: number
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Current month as YYYY-MM (UTC, so a late-night session near a month boundary
// still resolves consistently with the server).
export function currentStatementMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  if (!MONTH_RE.test(month)) return month
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Half-open UTC bounds [startMs, endExclusiveMs) for the month, plus its label.
export function monthBounds(month: string): { startMs: number; endExclusiveMs: number; label: string } {
  const safe = MONTH_RE.test(month) ? month : currentStatementMonth()
  const [y, m] = safe.split('-').map(Number)
  return {
    startMs: Date.UTC(y, m - 1, 1),
    endExclusiveMs: Date.UTC(y, m, 1),
    label: monthLabel(safe),
  }
}

// The most recent `count` months (current first) for a picker.
export function lastMonths(count: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const d = new Date()
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth() // 0-based
  for (let i = 0; i < count; i++) {
    const value = `${y}-${String(m + 1).padStart(2, '0')}`
    out.push({ value, label: monthLabel(value) })
    m--
    if (m < 0) {
      m = 11
      y--
    }
  }
  return out
}

const CADENCE_LABEL: Record<string, string> = { monthly: 'Monthly', yearly: 'Yearly' }

const DISCLAIMER =
  'Run-rate snapshot reconstructed from subscription and cost records as of month end. ' +
  'Billing is prepaid, so figures reflect the monthly run-rate attributable to this month, not cash physically collected. Amounts in ZAR.'

export function statementFileBase(s: AccountStatement): string {
  return `stayknit-accounts-${s.month}`
}

// ---- Markdown (source for the Word/.docx export) ---------------------------

export function statementMarkdown(s: AccountStatement): string {
  const lines: string[] = []
  lines.push(`# StayKnit — Monthly accounts statement`, ``)
  lines.push(`**Period:** ${s.periodLabel}`, ``)
  lines.push(`**Prepared:** ${new Date(s.generatedAt).toISOString().slice(0, 10)}`, ``)
  lines.push(`**Currency:** ZAR (R)`, ``)

  lines.push(`## Summary`, ``)
  lines.push(`| Metric | Amount |`, `| --- | --- |`)
  lines.push(`| Paying accounts | ${s.payingAccounts} |`)
  lines.push(`| Complimentary accounts | ${s.compAccounts} |`)
  lines.push(`| Monthly recurring revenue (MRR) | ${zar(s.mrrCents)} |`)
  lines.push(`| Annual run-rate (ARR) | ${zar(s.arrCents)} |`)
  lines.push(`| Operating costs (monthly) | ${zar(s.runningCostMonthlyCents)} |`)
  lines.push(`| **Net (monthly)** | **${zar(s.netMonthlyCents)}** |`, ``)

  lines.push(`## Revenue by plan`, ``)
  lines.push(`| Plan | Accounts | Monthly value |`, `| --- | --- | --- |`)
  if (s.byPlan.length === 0) {
    lines.push(`| — | 0 | ${zar(0)} |`)
  } else {
    for (const p of s.byPlan) {
      lines.push(`| ${p.name} | ${p.count} | ${zar(p.monthlyValueCents)} |`)
    }
  }
  lines.push(``)

  lines.push(`## Operating costs`, ``)
  lines.push(`| Cost | Cadence | Monthly (ZAR) |`, `| --- | --- | --- |`)
  if (s.costs.length === 0) {
    lines.push(`| No recorded costs | — | ${zar(0)} |`)
  } else {
    for (const c of s.costs) {
      lines.push(`| ${escapeCell(c.label)} | ${CADENCE_LABEL[c.cadence]} | ${zar(c.monthlyCents)} |`)
    }
  }
  lines.push(`| **Total** | | **${zar(s.runningCostMonthlyCents)}** |`, ``)

  lines.push(`---`, ``)
  lines.push(DISCLAIMER)
  return lines.join('\n')
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|')
}

// ---- CSV -------------------------------------------------------------------

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function statementCsv(s: AccountStatement): string {
  const rows: string[] = []
  rows.push(`StayKnit monthly accounts statement,${csvCell(s.periodLabel)}`)
  rows.push(`Prepared,${new Date(s.generatedAt).toISOString().slice(0, 10)}`)
  rows.push(`Currency,ZAR`)
  rows.push('')
  rows.push(`Metric,Amount (ZAR cents)`)
  rows.push(`Paying accounts,${s.payingAccounts}`)
  rows.push(`Complimentary accounts,${s.compAccounts}`)
  rows.push(`MRR,${s.mrrCents}`)
  rows.push(`ARR,${s.arrCents}`)
  rows.push(`Operating costs (monthly),${s.runningCostMonthlyCents}`)
  rows.push(`Net (monthly),${s.netMonthlyCents}`)
  rows.push('')
  rows.push(`Plan,Accounts,Monthly value (ZAR cents)`)
  for (const p of s.byPlan) rows.push(`${csvCell(p.name)},${p.count},${p.monthlyValueCents}`)
  rows.push('')
  rows.push(`Cost,Cadence,As entered,Currency,Monthly (ZAR cents)`)
  for (const c of s.costs) {
    rows.push(`${csvCell(c.label)},${c.cadence},${c.amountMinor},${c.currency.toUpperCase()},${c.monthlyCents}`)
  }
  rows.push(`Total,,,,${s.runningCostMonthlyCents}`)
  return rows.join('\n')
}

// ---- Plain text ------------------------------------------------------------

export function statementText(s: AccountStatement): string {
  const pad = (label: string) => label.padEnd(32, ' ')
  const lines: string[] = []
  lines.push(`STAYKNIT — MONTHLY ACCOUNTS STATEMENT`)
  lines.push(s.periodLabel)
  lines.push(`Prepared ${new Date(s.generatedAt).toISOString().slice(0, 10)} · Currency ZAR`)
  lines.push('')
  lines.push(`${pad('Paying accounts')}${s.payingAccounts}`)
  lines.push(`${pad('Complimentary accounts')}${s.compAccounts}`)
  lines.push(`${pad('MRR')}${zar(s.mrrCents)}`)
  lines.push(`${pad('ARR')}${zar(s.arrCents)}`)
  lines.push(`${pad('Operating costs (monthly)')}${zar(s.runningCostMonthlyCents)}`)
  lines.push('-'.repeat(48))
  lines.push(`${pad('NET (monthly)')}${zar(s.netMonthlyCents)}`)
  lines.push('')
  lines.push('REVENUE BY PLAN')
  if (s.byPlan.length === 0) lines.push('  (none)')
  for (const p of s.byPlan) lines.push(`${pad(`  ${p.name} (${p.count})`)}${zar(p.monthlyValueCents)}`)
  lines.push('')
  lines.push('OPERATING COSTS')
  if (s.costs.length === 0) lines.push('  (none recorded)')
  for (const c of s.costs) lines.push(`${pad(`  ${c.label} (${CADENCE_LABEL[c.cadence]})`)}${zar(c.monthlyCents)}`)
  lines.push('')
  lines.push(DISCLAIMER)
  return lines.join('\n')
}

// ---- Branded print-ready HTML (for PDF via the browser) --------------------

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

export function statementHtml(s: AccountStatement): string {
  const row = (label: string, value: string, opts: { muted?: boolean; total?: boolean } = {}) => `
    <tr class="${opts.total ? 'total' : ''}">
      <td class="${opts.muted ? 'muted' : ''}">${esc(label)}</td>
      <td class="amt ${opts.muted ? 'muted' : ''}">${esc(value)}</td>
    </tr>`
  const planRows = s.byPlan.length
    ? s.byPlan.map((p) => row(`${p.name} — ${p.count} account${p.count === 1 ? '' : 's'}`, zar(p.monthlyValueCents))).join('')
    : row('No paying accounts', zar(0), { muted: true })
  const costRows = s.costs.length
    ? s.costs.map((c) => row(`${c.label} · ${CADENCE_LABEL[c.cadence]}`, zar(c.monthlyCents), { muted: true })).join('')
    : row('No recorded costs', zar(0), { muted: true })

  return `<!doctype html><html><head><meta charset="utf-8"><title>StayKnit accounts — ${esc(s.periodLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f1518; margin: 0; padding: 48px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.02em; font-size: 22px; color: #2f7d6b; }
  .emblem { position: relative; display: inline-block; width: 36px; height: 36px; flex: none; overflow: hidden; }
  .emblem img { position: absolute; max-width: none; width: 159.3%; left: -30.08%; top: 3.25%; }
  .meta { text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; color: #6b7a7e; margin-top: 4px; }
  h1 { font-size: 18px; margin: 28px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 11px 4px; border-bottom: 1px solid #e6ebec; font-size: 14px; }
  td.amt { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: #6b7a7e; }
  tr.total td { border-bottom: none; border-top: 2px solid #0f1518; font-weight: 800; font-size: 16px; padding-top: 14px; }
  tr.total td.amt { color: #2f7d6b; }
  .foot { margin-top: 32px; font-size: 11px; color: #6b7a7e; line-height: 1.6; }
  @media print { body { padding: 24px; } .noprint { display: none; } }
  .btn { display: inline-block; margin-top: 24px; padding: 10px 18px; background: #2f7d6b; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
</style></head>
<body>
  <div class="brand"><span class="emblem"><img src="/images/stayknit-logo-standard.png" alt=""></span><span>StayKnit</span></div>
  <div class="meta">Monthly accounts statement</div>
  <h1>${esc(s.periodLabel)}</h1>
  <div class="meta">Prepared ${new Date(s.generatedAt).toISOString().slice(0, 10)} · ZAR</div>
  <table>
    ${row('Paying accounts', String(s.payingAccounts))}
    ${row('Complimentary accounts', String(s.compAccounts), { muted: true })}
    ${row('Monthly recurring revenue (MRR)', zar(s.mrrCents))}
    ${row('Annual run-rate (ARR)', zar(s.arrCents), { muted: true })}
    ${row('Operating costs (monthly)', `− ${zar(s.runningCostMonthlyCents)}`, { muted: true })}
    ${row('Net (monthly)', zar(s.netMonthlyCents), { total: true })}
  </table>
  <h1>Revenue by plan</h1>
  <table>${planRows}</table>
  <h1>Operating costs</h1>
  <table>${costRows}${row('Total', zar(s.runningCostMonthlyCents), { total: true })}</table>
  <div class="foot">${esc(DISCLAIMER)}</div>
  <button class="btn noprint" onclick="window.print()">Save as PDF</button>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
</body></html>`
}
