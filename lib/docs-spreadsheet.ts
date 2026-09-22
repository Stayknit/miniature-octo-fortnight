import { promises as fs } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import type { DocExportItem } from '@/app/actions/admin-docs'
import { COMPANY, companyIdentityLines, companyFooterLine, LOGO_ASPECT } from '@/lib/company-details'

// Builds a single, professionally formatted .xlsx workbook that compiles every
// StayKnit document. The first sheet is a branded company register (logo +
// registered details + an index of every document); each subsequent sheet holds
// one document's full text, laid out for reading. Uses ExcelJS so the workbook
// carries real styling (brand colours, merged letterhead, borders, an embedded
// logo) — not just raw text.

const NAVY = 'FF1F2A44'
const ACCENT = 'FF2E6F5E'
const MUTED = 'FF5A6472'
const LINE = 'FFD6DBE4'
const HEAD_FILL = 'FF1F2A44'
const ROW_SHADE = 'FFF5F7FA'
const WHITE = 'FFFFFFFF'
const BODY = 'FF242A33'

type FlatKind = 'h1' | 'h2' | 'h3' | 'body' | 'rule' | 'blank'
type FlatRow = { text: string; kind: FlatKind }

// Strips inline markdown markers so the spreadsheet shows clean, readable text.
function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(?<![A-Za-z0-9])\*([^*]+)\*(?![A-Za-z0-9])/g, '$1')
    .replace(/(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g, '$1')
    .trim()
}

// Flattens markdown into styled, spreadsheet-friendly rows.
function flattenMarkdown(md: string): FlatRow[] {
  const out: FlatRow[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  for (const raw of lines) {
    const t = raw.trim()
    if (/^```/.test(t)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push({ text: raw, kind: 'body' })
      continue
    }
    if (!t) {
      out.push({ text: '', kind: 'blank' })
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      out.push({ text: '', kind: 'rule' })
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) {
      const lvl = h[1].length
      out.push({ text: stripInline(h[2]), kind: lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : 'h3' })
      continue
    }
    if (t.startsWith('|')) {
      if (/^\|?[\s:|-]+\|?$/.test(t)) continue // separator row
      const cells = t
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => stripInline(c))
      out.push({ text: cells.join('   |   '), kind: 'body' })
      continue
    }
    if (/^>\s?/.test(raw)) {
      out.push({ text: stripInline(t.replace(/^>\s?/, '')), kind: 'body' })
      continue
    }
    out.push({ text: stripInline(raw), kind: 'body' })
  }
  // Collapse runs of blank lines to a single spacer.
  const collapsed: FlatRow[] = []
  for (const r of out) {
    if (r.kind === 'blank' && collapsed[collapsed.length - 1]?.kind === 'blank') continue
    collapsed.push(r)
  }
  return collapsed
}

async function loadLogo(): Promise<Buffer | null> {
  try {
    // Static literal path so Next's build tracer scopes this to the single
    // asset instead of tracing the whole project into the server bundle.
    return await fs.readFile(path.join(process.cwd(), 'public/images/stayknit-logo-standard.png'))
  } catch {
    return null
  }
}

// Excel worksheet names: <=31 chars, no []:*?/\, and must be unique.
function safeSheetName(title: string, used: Set<string>): string {
  let base = title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Document'
  let name = base
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n}`
    name = base.slice(0, 28 - suffix.length) + suffix
    n++
  }
  used.add(name.toLowerCase())
  return name
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function buildDocsWorkbook(docs: DocExportItem[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = COMPANY.name
  wb.company = COMPANY.name
  wb.created = new Date()
  wb.title = `${COMPANY.tradingName} — Document Register`

  const logo = await loadLogo()
  const exportedStamp = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })

  // ---- Overview / register sheet ------------------------------------------
  const overview = wb.addWorksheet('Register', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 11 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })
  overview.columns = [
    { width: 6 }, // A  #
    { width: 34 }, // B  Document
    { width: 20 }, // C  Category
    { width: 62 }, // D  Description
    { width: 16 }, // E  Last updated
    { width: 14 }, // F  Format
  ]
  // Reserve height for the logo band.
  for (let r = 1; r <= 7; r++) overview.getRow(r).height = 21

  if (logo) {
    const imgId = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' })
    const w = 150
    const h = Math.round(w / LOGO_ASPECT)
    overview.addImage(imgId, { tl: { col: 0.15, row: 0.3 }, ext: { width: w, height: h }, editAs: 'oneCell' })
  }

  // Company identity block, right-aligned in columns D:F.
  const identity = companyIdentityLines()
  const nameCell = overview.getCell('D1')
  nameCell.value = COMPANY.name
  nameCell.font = { bold: true, size: 14, color: { argb: NAVY } }
  nameCell.alignment = { horizontal: 'right' }
  overview.mergeCells('D1:F1')

  const taglineCell = overview.getCell('D2')
  taglineCell.value = COMPANY.tagline
  taglineCell.font = { italic: true, size: 10, color: { argb: ACCENT } }
  taglineCell.alignment = { horizontal: 'right' }
  overview.mergeCells('D2:F2')

  identity.forEach(({ label, value }, i) => {
    const rowNum = 3 + i
    const cell = overview.getCell(`D${rowNum}`)
    cell.value = { richText: [{ text: `${label}: `, font: { bold: true, size: 9, color: { argb: MUTED } } }, { text: value, font: { size: 9, color: { argb: MUTED } } }] }
    cell.alignment = { horizontal: 'right', wrapText: false }
    overview.mergeCells(`D${rowNum}:F${rowNum}`)
  })

  // Document title band.
  overview.mergeCells('A9:F9')
  const titleCell = overview.getCell('A9')
  titleCell.value = 'Document Register'
  titleCell.font = { bold: true, size: 16, color: { argb: NAVY } }
  overview.getRow(9).height = 24

  overview.mergeCells('A10:F10')
  const subCell = overview.getCell('A10')
  subCell.value = `Compiled legal, security & operational documents  ·  Exported ${exportedStamp}`
  subCell.font = { size: 10, color: { argb: MUTED } }

  // Index table header (row 11).
  const headers = ['#', 'Document', 'Category', 'Description', 'Last updated', 'Format']
  const headerRow = overview.getRow(11)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: LINE } } }
  })
  headerRow.height = 20

  docs.forEach((d, i) => {
    const r = overview.getRow(12 + i)
    const shade = i % 2 === 1
    const cells: (string | number)[] = [
      i + 1,
      d.title,
      d.category,
      d.description,
      fmtDate(d.updatedAt),
      d.kind === 'binary' ? 'Word (.docx)' : 'Text',
    ]
    cells.forEach((val, ci) => {
      const cell = r.getCell(ci + 1)
      cell.value = val
      cell.font = { size: 10, color: { argb: BODY }, bold: ci === 1 }
      cell.alignment = {
        vertical: 'top',
        horizontal: ci === 0 ? 'center' : 'left',
        wrapText: ci === 3,
      }
      if (shade) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_SHADE } }
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } }
    })
  })

  // Footer note beneath the table.
  const noteRow = 12 + docs.length + 1
  overview.mergeCells(`A${noteRow}:F${noteRow}`)
  const note = overview.getCell(`A${noteRow}`)
  note.value = companyFooterLine()
  note.font = { size: 8, italic: true, color: { argb: MUTED } }

  // ---- One sheet per document ---------------------------------------------
  const usedNames = new Set<string>(['register'])
  for (const d of docs) {
    const ws = wb.addWorksheet(safeSheetName(d.title, usedNames), {
      views: [{ showGridLines: false }],
      pageSetup: { fitToWidth: 1, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    })
    ws.getColumn(1).width = 110

    // Compact letterhead for each sheet.
    const c1 = ws.getCell('A1')
    c1.value = COMPANY.name
    c1.font = { bold: true, size: 12, color: { argb: NAVY } }
    const c2 = ws.getCell('A2')
    c2.value = d.title
    c2.font = { bold: true, size: 15, color: { argb: NAVY } }
    const c3 = ws.getCell('A3')
    c3.value = `${d.category}  ·  Last updated ${fmtDate(d.updatedAt)}  ·  Exported ${exportedStamp}`
    c3.font = { size: 9, color: { argb: MUTED } }
    const rule = ws.getCell('A4')
    rule.border = { bottom: { style: 'medium', color: { argb: ACCENT } } }

    let rowIdx = 6
    if (d.kind === 'binary') {
      const cell = ws.getCell(`A${rowIdx}`)
      cell.value =
        'This item is a compiled Word document (.docx). Download it from the Docs page in the admin dashboard; its full contents are the individual legal-pack sheets in this workbook.'
      cell.font = { size: 11, italic: true, color: { argb: BODY } }
      cell.alignment = { wrapText: true, vertical: 'top' }
      continue
    }

    const rows = flattenMarkdown(d.markdown)
    for (const fr of rows) {
      const cell = ws.getCell(`A${rowIdx}`)
      if (fr.kind === 'rule') {
        cell.border = { bottom: { style: 'thin', color: { argb: LINE } } }
        ws.getRow(rowIdx).height = 6
        rowIdx++
        continue
      }
      if (fr.kind === 'blank') {
        ws.getRow(rowIdx).height = 6
        rowIdx++
        continue
      }
      cell.value = fr.text
      cell.alignment = { wrapText: true, vertical: 'top' }
      if (fr.kind === 'h1') cell.font = { bold: true, size: 15, color: { argb: NAVY } }
      else if (fr.kind === 'h2') cell.font = { bold: true, size: 13, color: { argb: NAVY } }
      else if (fr.kind === 'h3') cell.font = { bold: true, size: 11, color: { argb: ACCENT } }
      else cell.font = { size: 10.5, color: { argb: BODY } }
      rowIdx++
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
