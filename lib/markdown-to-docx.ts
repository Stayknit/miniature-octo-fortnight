import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  PageNumber,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { COMPANY, companyFooterLine, companyIdentityLines, LOGO_ASPECT } from '@/lib/company-details'

// Lightweight Markdown -> .docx converter. It intentionally supports only the
// constructs used across the StayKnit docs (headings, bold/italic/code/links,
// bullet + ordered + task lists, GFM tables, blockquotes/callouts, fenced code,
// horizontal rules). It is not a general CommonMark implementation.

const NAVY = '1F2A44'
const ACCENT = '2E6F5E'
const CODE_BG = 'F1F3F7'
const CODE_FG = 'B02A37'
const NOTE_BG = 'FCF3E6'
const NOTE_BAR = 'C08A2B'
const LIGHT_LINE = 'D6DBE4'
const TABLE_HEAD = '1F2A44'
const TABLE_ROW_SHADE = 'F5F7FA'
const BODY = '242A33'

const HEADINGS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}
const HSIZE: Record<number, number> = { 1: 34, 2: 28, 3: 24, 4: 22, 5: 21, 6: 20 }

type Seg = {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  strike?: boolean
  href?: string
}

// Recursively splits inline markdown into styled segments. `base` carries the
// formatting inherited from an enclosing span (e.g. bold text containing a link).
function parseInline(text: string, base: Partial<Seg> = {}): Seg[] {
  const patterns: { re: RegExp; apply: (m: RegExpExecArray) => Seg[] }[] = [
    { re: /`([^`]+)`/, apply: (m) => [{ ...base, text: m[1], code: true }] },
    { re: /\*\*([^*]+)\*\*/, apply: (m) => parseInline(m[1], { ...base, bold: true }) },
    { re: /__([^_]+)__/, apply: (m) => parseInline(m[1], { ...base, bold: true }) },
    { re: /~~([^~]+)~~/, apply: (m) => parseInline(m[1], { ...base, strike: true }) },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, apply: (m) => parseInline(m[1], { ...base, href: m[2] }) },
    { re: /(?<![A-Za-z0-9])\*([^*]+)\*(?![A-Za-z0-9])/, apply: (m) => parseInline(m[1], { ...base, italic: true }) },
    { re: /(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/, apply: (m) => parseInline(m[1], { ...base, italic: true }) },
  ]

  let best: { apply: (m: RegExpExecArray) => Seg[]; m: RegExpExecArray; index: number } | null = null
  for (const p of patterns) {
    const m = p.re.exec(text)
    if (m && (best === null || m.index < best.index)) best = { apply: p.apply, m, index: m.index }
  }

  if (!best) return text ? [{ ...base, text }] : []

  const segs: Seg[] = []
  if (best.index > 0) segs.push({ ...base, text: text.slice(0, best.index) })
  segs.push(...best.apply(best.m))
  segs.push(...parseInline(text.slice(best.index + best.m[0].length), base))
  return segs
}

type RunOpts = { size?: number; color?: string; bold?: boolean }

function segsToRuns(segs: Seg[], opts: RunOpts = {}): (TextRun | ExternalHyperlink)[] {
  const { size = 22, color = BODY, bold: forceBold } = opts
  const runs: (TextRun | ExternalHyperlink)[] = []
  for (const s of segs) {
    const common = { bold: forceBold || s.bold, italics: s.italic, strike: s.strike }
    if (s.href) {
      runs.push(
        new ExternalHyperlink({
          link: s.href,
          children: [new TextRun({ ...common, text: s.text, color: ACCENT, underline: {}, size })],
        }),
      )
    } else if (s.code) {
      runs.push(
        new TextRun({
          ...common,
          text: s.text,
          font: 'Consolas',
          color: CODE_FG,
          size: size - 1,
          shading: { type: ShadingType.SOLID, color: 'auto', fill: CODE_BG },
        }),
      )
    } else {
      runs.push(new TextRun({ ...common, text: s.text, color, size }))
    }
  }
  return runs.length ? runs : [new TextRun({ text: '', size })]
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((s) => s.trim())
}

function padRow(row: string[], cols: number): string[] {
  const out = row.slice(0, cols)
  while (out.length < cols) out.push('')
  return out
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: LIGHT_LINE }

function buildTable(lines: string[]): Table {
  const rows = lines.map(splitRow)
  const header = rows[0] ?? []
  const body = rows.slice(2)
  const cols = Math.max(1, header.length)

  const makeCell = (text: string, isHeader: boolean, shade: boolean) =>
    new TableCell({
      width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
      shading: isHeader
        ? { type: ShadingType.SOLID, color: 'auto', fill: TABLE_HEAD }
        : shade
          ? { type: ShadingType.SOLID, color: 'auto', fill: TABLE_ROW_SHADE }
          : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          children: segsToRuns(parseInline(text), {
            size: 20,
            color: isHeader ? 'FFFFFF' : BODY,
            bold: isHeader,
          }),
        }),
      ],
    })

  const trs = [
    new TableRow({ tableHeader: true, children: header.map((c) => makeCell(c, true, false)) }),
    ...body.map((r, idx) => new TableRow({ children: padRow(r, cols).map((c) => makeCell(c, false, idx % 2 === 1)) })),
  ]

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: trs,
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: cellBorder, insideVertical: cellBorder },
  })
}

function isSpecial(line: string): boolean {
  const t = line.trim()
  return (
    /^#{1,6}\s+/.test(t) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(t) ||
    /^```/.test(t) ||
    /^>\s?/.test(line) ||
    /^(\s*)([-*+]|\d+\.)\s+/.test(line) ||
    t.startsWith('|')
  )
}

function parseBlocks(md: string): (Paragraph | Table)[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: (Paragraph | Table)[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code block.
    if (/^```/.test(line.trim())) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i])
        i++
      }
      i++ // skip closing fence
      for (const c of code) {
        out.push(
          new Paragraph({
            shading: { type: ShadingType.SOLID, color: 'auto', fill: CODE_BG },
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: c || ' ', font: 'Consolas', size: 20, color: BODY })],
          }),
        )
      }
      continue
    }

    // Heading.
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      out.push(
        new Paragraph({
          heading: HEADINGS[level],
          spacing: { before: level <= 2 ? 240 : 180, after: 100 },
          children: segsToRuns(parseInline(h[2].trim()), { size: HSIZE[level], color: NAVY, bold: true }),
        }),
      )
      i++
      continue
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LIGHT_LINE } },
          spacing: { after: 120 },
          children: [],
        }),
      )
      i++
      continue
    }

    // GFM table (header row followed by a separator row containing dashes).
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('-') &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
    ) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      out.push(buildTable(tableLines))
      continue
    }

    // Blockquote / callout.
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const text = quote.join(' ').trim()
      out.push(
        new Paragraph({
          shading: { type: ShadingType.SOLID, color: 'auto', fill: NOTE_BG },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: NOTE_BAR } },
          spacing: { before: 80, after: 80 },
          indent: { left: 120 },
          children: segsToRuns(parseInline(text), { size: 22 }),
        }),
      )
      continue
    }

    // List block (unordered / ordered / task).
    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const orderedCounter: Record<number, number> = {}
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])
        if (!m) break
        const indent = m[1].replace(/\t/g, '  ').length
        const level = Math.min(3, Math.floor(indent / 2))
        const ordered = /\d+\./.test(m[2])
        let content = m[3]

        const task = /^\[([ xX])\]\s+(.*)$/.exec(content)
        const prefix: TextRun[] = []
        if (task) {
          content = task[2]
          prefix.push(new TextRun({ text: task[1].toLowerCase() === 'x' ? '\u2611 ' : '\u2610 ', size: 22 }))
        }

        const runs = [...prefix, ...segsToRuns(parseInline(content), { size: 22 })]
        if (ordered) {
          orderedCounter[level] = (orderedCounter[level] || 0) + 1
          out.push(
            new Paragraph({
              indent: { left: 360 + level * 360, hanging: 260 },
              spacing: { before: 0, after: 40 },
              children: [new TextRun({ text: `${orderedCounter[level]}. `, size: 22, color: BODY }), ...runs],
            }),
          )
        } else {
          out.push(new Paragraph({ bullet: { level }, spacing: { before: 0, after: 40 }, children: runs }))
        }
        i++
      }
      continue
    }

    // Paragraph — gather consecutive plain lines.
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
      para.push(lines[i])
      i++
    }
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 120 },
        children: segsToRuns(parseInline(para.join(' ')), { size: 22 }),
      }),
    )
  }

  return out
}

// Reads the official logo from disk, or returns null if it can't be read (the
// letterhead then falls back to the wordmark text so a document still renders).
async function loadLogo(): Promise<Buffer | null> {
  try {
    // Static literal path so Next's build tracer scopes this to the single
    // asset instead of tracing the whole project into the server bundle.
    return await fs.readFile(path.join(process.cwd(), 'public/images/stayknit-logo-standard.png'))
  } catch {
    return null
  }
}

// Borderless letterhead: official logo on the left, company identity on the
// right, followed by the document title and export date under an accent rule.
function letterhead(title: string, logo: Buffer | null): (Table | Paragraph)[] {
  const stamp = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })

  const logoHeight = 64
  const logoWidth = Math.round(logoHeight * LOGO_ASPECT)

  const logoCellChildren: Paragraph[] = logo
    ? [
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: logo,
              transformation: { width: logoWidth, height: logoHeight },
            }),
          ],
        }),
      ]
    : [
        new Paragraph({
          children: [new TextRun({ text: COMPANY.tradingName, bold: true, size: 32, color: NAVY })],
        }),
      ]

  const identityChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0 },
      children: [new TextRun({ text: COMPANY.name, bold: true, size: 22, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [new TextRun({ text: COMPANY.tagline, italics: true, size: 16, color: ACCENT })],
    }),
    ...companyIdentityLines().map(
      ({ label, value }) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 15, color: '5A6472' }),
            new TextRun({ text: value, size: 15, color: '5A6472' }),
          ],
        }),
    ),
  ]

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const noBorders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
    insideHorizontal: noBorder,
    insideVertical: noBorder,
  }

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 42, type: WidthType.PERCENTAGE },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: logoCellChildren,
          }),
          new TableCell({
            width: { size: 58, type: WidthType.PERCENTAGE },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: identityChildren,
          }),
        ],
      }),
    ],
  })

  return [
    headerTable,
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT } },
      spacing: { before: 120, after: 220 },
      children: [],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: title, bold: true, size: 40, color: NAVY })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [
        new TextRun({ text: `${COMPANY.name} \u2014 official document`, size: 18, color: '7A8699' }),
        new TextRun({ text: `   \u2022   Exported ${stamp}`, size: 18, color: '7A8699' }),
      ],
    }),
  ]
}

// Company footer: identity line on the left, page numbers on the right, above a
// thin rule. Repeats on every page.
function docFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: LIGHT_LINE } },
        spacing: { before: 60 },
        children: [new TextRun({ text: companyFooterLine(), size: 14, color: '8A94A3' })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0 },
        children: [
          new TextRun({ text: 'Page ', size: 14, color: '8A94A3' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '8A94A3' }),
          new TextRun({ text: ' of ', size: 14, color: '8A94A3' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '8A94A3' }),
        ],
      }),
    ],
  })
}

// Converts a markdown string to a .docx file buffer, on official letterhead.
export async function markdownToDocxBuffer(markdown: string, title: string): Promise<Buffer> {
  const logo = await loadLogo()
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: BODY } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        footers: { default: docFooter() },
        children: [...letterhead(title, logo), ...parseBlocks(markdown)],
      },
    ],
  })
  return Packer.toBuffer(doc)
}

// Turns a doc title into a safe download filename stem.
export function safeFileStem(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'document'
  )
}
