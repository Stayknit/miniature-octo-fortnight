import { promises as fs } from 'node:fs'
import { getAdmin } from '@/lib/admin-auth'
import { resolveDownloadableDoc, resolveMarkdownForDownload } from '@/app/actions/admin-docs'
import { markdownToDocxBuffer, safeFileStem } from '@/lib/markdown-to-docx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Gated download route. Re-checks the admin gate here — this is the security
// boundary, not just a convenience — and only ever serves an allow-listed doc
// resolved by slug, never a client-supplied path.
//
// - `?format=docx` on a markdown doc converts it to Word on the fly.
// - otherwise the pre-built binary doc (the legal-pack .docx) is streamed.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdmin()
  if (!admin) return new Response('Not found', { status: 404 })

  const { slug } = await params
  const format = new URL(req.url).searchParams.get('format')

  if (format === 'docx') {
    const md = await resolveMarkdownForDownload(slug)
    if (!md) return new Response('Not found', { status: 404 })
    const buffer = await markdownToDocxBuffer(md.markdown, md.title)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': DOCX_TYPE,
        'Content-Disposition': `attachment; filename="${safeFileStem(md.stem)}.docx"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const resolved = await resolveDownloadableDoc(slug)
  if (!resolved) return new Response('Not found', { status: 404 })

  try {
    const data = await fs.readFile(resolved.absolutePath)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': `attachment; filename="${resolved.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
