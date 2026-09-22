import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx'
import { mkdirSync, writeFileSync } from 'node:fs'

const BRAND = '2E4A7B'
const LIGHT = 'EEF2F9'
const MUTED = '5A6472'

function heading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, bold: true, color: level === HeadingLevel.HEADING_1 ? BRAND : '1A1A1A' })],
  })
}

function body(runs, opts = {}) {
  const children = typeof runs === 'string' ? [new TextRun({ text: runs })] : runs
  return new Paragraph({ spacing: { after: 120 }, ...opts, children })
}

function bullet(runs) {
  const children = typeof runs === 'string' ? [new TextRun({ text: runs })] : runs
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children })
}

function rule() {
  return new Paragraph({
    border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 120, after: 160 },
    children: [],
  })
}

function cell(text, { bold = false, header = false, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, fill: BRAND } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: bold || header, color: header ? 'FFFFFF' : '1A1A1A', size: 20 })],
      }),
    ],
  })
}

function statusTable() {
  const rows = [
    ['Item', 'Report severity', 'Status', 'Evidence'],
    [
      'Duplicate account signup',
      'P0',
      'Resolved',
      'DB UNIQUE (email) constraint + sequential and concurrent tests',
    ],
    ['Calendar header wrong year (2025)', 'P2', 'Resolved', 'Header derives from live todayParts(); reads 2026'],
    ['Dead lib/demo-data.ts (hardcoded 2025)', 'Found in review', 'Removed', 'File deleted; confirmed zero imports'],
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: r.map((c, j) =>
            cell(c, { header: i === 0, width: [34, 16, 16, 34][j], bold: i > 0 && j === 2 }),
          ),
        }),
    ),
  })
}

const doc = new Document({
  creator: 'v0',
  title: 'StayKnit — Fix Verification Report',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: '1A1A1A' } },
    },
  },
  sections: [
    {
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 40 },
          children: [new TextRun({ text: 'StayKnit', bold: true, size: 40, color: BRAND })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: 'Fix Verification Report', bold: true, size: 30, color: '1A1A1A' })],
        }),
        body([new TextRun({ text: 'Prepared by: ', bold: true }), new TextRun('v0')]),
        body([new TextRun({ text: 'Date: ', bold: true }), new TextRun('16 September 2026')]),
        body([
          new TextRun({ text: 'Re: ', bold: true }),
          new TextRun(
            'Verification of the open items in StayKnit-Fix-Report-for-v0 (P0 duplicate signup, P2 calendar year)',
          ),
        ]),
        rule(),

        heading('Summary', HeadingLevel.HEADING_1),
        body(
          'Both open items in the fix report were verified against the running application and the live database. Both are resolved. No code changes were required to fix them; the only change made was removing a stale, unused demo-data file that was the likely source of the "2025" date seen in the report.',
        ),
        statusTable(),
        new Paragraph({ spacing: { after: 120 }, children: [] }),

        heading('P0 — Duplicate account signup', HeadingLevel.HEADING_1),
        heading('Acceptance criteria (from fix report)', HeadingLevel.HEADING_2),
        body(
          'Signing up twice with the same email must not create a second account, verified at the database level.',
        ),
        heading('Root cause of original issue', HeadingLevel.HEADING_2),
        body('No uniqueness guarantee on user.email, allowing a second row for the same email.'),
        heading('Current state — verified', HeadingLevel.HEADING_2),
        bullet('The public.user table has a UNIQUE (email) constraint.'),
        bullet('There are 0 duplicate emails in the database at time of testing.'),
        heading('Test 1 — Sequential duplicate signup', HeadingLevel.HEADING_2),
        body('Two sign-up requests submitted with the same email, one after the other.'),
        bullet('Request 1 → HTTP 200'),
        bullet('Request 2 → HTTP 200 (generic response, no email-enumeration leak)'),
        bullet([new TextRun({ text: 'Database result: exactly 1 row persisted', bold: true }), new TextRun(' (the first signup only).')]),
        heading('Test 2 — Concurrent signup (race condition)', HeadingLevel.HEADING_2),
        body(
          'Five sign-up requests fired simultaneously with the same email, to prove the guarantee holds under a race rather than only in application logic.',
        ),
        bullet('Exactly 1 request returned HTTP 200'),
        bullet('The other 4 were rejected with HTTP 422'),
        bullet([
          new TextRun({ text: 'Database result: exactly 1 row persisted', bold: true }),
          new TextRun(' (in public.user; 0 in neon_auth.user).'),
        ]),
        heading('Conclusion', HeadingLevel.HEADING_2),
        body([
          new TextRun('The uniqueness guarantee is enforced at the database level and holds under concurrent load. '),
          new TextRun({ text: 'P0 resolved.', bold: true }),
        ]),
        body([
          new TextRun({
            text: 'All throwaway dup-test-* and race-test-* accounts created during testing were deleted afterward.',
            italics: true,
            color: MUTED,
          }),
        ]),
        rule(),

        heading('P2 — Calendar header showing the wrong year (2025)', HeadingLevel.HEADING_1),
        heading('Current state — verified', HeadingLevel.HEADING_2),
        body(
          'The Calendar header derives its date from todayParts() in lib/today.ts, which computes the real current date in the Africa/Johannesburg timezone. The heading now reads the correct current year (2026), matching the system clock. The screenshot in the fix report was taken against an earlier deploy.',
        ),
        heading('Related cleanup', HeadingLevel.HEADING_2),
        body(
          'While tracing the "2025" value, lib/demo-data.ts was found to hardcode September 2025 bookings. It was dead code — nothing in the application imported it (verified by a project-wide search). Live account seeding uses the dynamic todayParts() anchor, so real accounts were never affected. The file has been deleted to prevent future confusion; a follow-up search confirmed zero remaining references and the project still type-checks.',
        ),
        heading('Conclusion', HeadingLevel.HEADING_2),
        body([
          new TextRun({ text: 'P2 resolved. ', bold: true }),
          new TextRun('No user-facing change was needed; the stale file was removed as housekeeping.'),
        ]),
        rule(),

        heading('Test methodology notes', HeadingLevel.HEADING_1),
        bullet('Signup tests hit the live Better Auth endpoint (/api/auth/sign-up/email) on the running app.'),
        bullet(
          'Row counts were queried directly against the connected Neon Postgres database in both the public and neon_auth schemas.',
        ),
        bullet(
          'Constraint and duplicate checks were run against pg_constraint / pg_indexes and a GROUP BY lower(email) HAVING count(*) > 1 query.',
        ),
      ],
    },
  ],
})

mkdirSync('data', { recursive: true })
const buffer = await Packer.toBuffer(doc)
writeFileSync('data/StayKnit-Fix-Verification-Report.docx', buffer)
console.log('Wrote data/StayKnit-Fix-Verification-Report.docx (' + buffer.length + ' bytes)')
