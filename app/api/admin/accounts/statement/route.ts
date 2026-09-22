import { getAdmin } from '@/lib/admin-auth'
import { computeAccountStatement } from '@/lib/account-statement-data'
import {
  statementMarkdown,
  statementCsv,
  statementText,
  statementHtml,
  statementFileBase,
  currentStatementMonth,
} from '@/lib/account-statement'
import { markdownToDocxBuffer } from '@/lib/markdown-to-docx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Gated download route for the monthly accounts statement. Re-checks the admin
// gate here (this is the security boundary) and recomputes server-side, so a
// download is always self-contained and never trusts client-supplied figures.
//   ?month=YYYY-MM  (defaults to the current month)
//   ?format=docx|csv|txt|pdf  (defaults to pdf)
export async function GET(req: Request) {
  const admin = await getAdmin()
  if (!admin) return new Response('Not found', { status: 404 })

  const url = new URL(req.url)
  const month = url.searchParams.get('month') || currentStatementMonth()
  const format = (url.searchParams.get('format') || 'pdf').toLowerCase()

  const statement = await computeAccountStatement(month)
  const base = statementFileBase(statement)

  if (format === 'pdf') {
    // Branded, print-ready HTML the browser opens in a new tab and prints to
    // PDF. Served inline (not an attachment) so the print dialog can trigger.
    return new Response(statementHtml(statement), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
    })
  }

  if (format === 'docx') {
    const buffer = await markdownToDocxBuffer(statementMarkdown(statement), `StayKnit accounts — ${statement.periodLabel}`)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': DOCX_TYPE,
        'Content-Disposition': `attachment; filename="${base}.docx"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  if (format === 'csv') {
    return new Response(statementCsv(statement), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  if (format === 'txt') {
    return new Response(statementText(statement), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.txt"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  return new Response('Unsupported format', { status: 400 })
}
