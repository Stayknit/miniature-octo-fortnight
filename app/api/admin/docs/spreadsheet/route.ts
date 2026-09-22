import { getAdmin } from '@/lib/admin-auth'
import { getAllDocsForExport } from '@/app/actions/admin-docs'
import { buildDocsWorkbook } from '@/lib/docs-spreadsheet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Gated download: compiles every allow-listed document into one branded .xlsx
// workbook. The admin gate here is the security boundary (same as the other doc
// routes); everyone else gets a 404.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return new Response('Not found', { status: 404 })

  const docs = await getAllDocsForExport()
  const buffer = await buildDocsWorkbook(docs)
  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="StayKnit-Documents-${stamp}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
