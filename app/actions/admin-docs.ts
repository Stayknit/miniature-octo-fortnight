'use server'

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { assertAdmin } from '@/lib/admin-auth'

// Curated, allow-listed set of documents surfaced in the support dashboard's
// "Docs" tab. Slugs are fixed keys (never user-supplied paths), so there is no
// path-traversal surface — a request can only ever resolve to one of these.
export type DocKind = 'markdown' | 'binary'

export type DocManifestEntry = {
  slug: string
  title: string
  description: string
  category: string
  file: string // path relative to the project's docs/ directory
  kind: DocKind
  // Curated fallback "last updated" date (ISO yyyy-mm-dd) for docs that don't
  // carry a parseable date in their own body. Filesystem mtime is NOT used —
  // in the deployed build every source file is written with the same fixed
  // build-constant mtime (which is where the bogus "20 Oct 2018" came from),
  // so it says nothing about when a document was actually edited.
  updated?: string
}

const DOCS_ROOT = path.join(process.cwd(), 'docs')

const MANIFEST: DocManifestEntry[] = [
  {
    slug: 'changelog',
    title: 'Change log',
    description: 'Dated record of notable app, security, and documentation updates. Newest first.',
    category: 'Updates',
    file: 'changelog.md',
    kind: 'markdown',
  },
  {
    slug: 'launch-checklist',
    title: 'Pre-launch checklist',
    description: 'Everything that must be cleared before taking real customers, with what is built vs. your action.',
    category: 'Launch',
    file: 'launch-checklist.md',
    kind: 'markdown',
  },
  {
    slug: 'master-ownership-execution-status',
    title: 'Master ownership & security — execution status',
    description:
      'Section-by-section status against the owner\u2019s Master Ownership & Security Execution Plan, with the prioritised list of open items for launch sign-off.',
    category: 'Launch',
    file: 'master-ownership-execution-status.md',
    kind: 'markdown',
  },
  {
    slug: 'operational-security-runbook',
    title: 'Operational security & compliance runbook',
    description: 'Incident response, backup/DR, encryption & data location, access reviews, secrets rotation, DSAR.',
    category: 'Security & ops',
    file: 'legal/07-operational-security-runbook.md',
    kind: 'markdown',
  },
  {
    slug: 'security-framework',
    title: 'Security & safety framework',
    description: 'The safeguards in place — auth, 2FA, headers, data isolation, payments — and open items for counsel.',
    category: 'Security & ops',
    file: 'legal/05-security-and-safety-framework.md',
    kind: 'markdown',
    updated: '2026-09-17',
  },
  {
    slug: 'audit-findings',
    title: 'Audit findings',
    description: 'The internal review, each finding, and its current resolution status.',
    category: 'Security & ops',
    file: 'legal/06-audit-findings.md',
    kind: 'markdown',
  },
  {
    slug: 'verification-report',
    title: 'Verification report',
    description: 'Evidence that the production safeguards were tested against the live domain and database.',
    category: 'Security & ops',
    file: 'verification-report.md',
    kind: 'markdown',
  },
  {
    slug: 'integrations-and-functions',
    title: 'Third-party connections & functions',
    description: 'Every external service StayKnit uses — Neon, Paystack, email, auth — with env vars and the functions behind each.',
    category: 'Security & ops',
    file: 'integrations-and-functions.md',
    kind: 'markdown',
  },
  {
    slug: 'business-model',
    title: 'Business model',
    description: 'How StayKnit works and makes money — the plain-language basis for the legal pack.',
    category: 'Legal pack',
    file: 'legal/01-business-model.md',
    kind: 'markdown',
    updated: '2026-09-17',
  },
  {
    slug: 'data-and-privacy-popia',
    title: 'Data & privacy (POPIA)',
    description: 'What personal information is processed, on what basis, and how POPIA obligations are met.',
    category: 'Legal pack',
    file: 'legal/02-data-and-privacy-popia.md',
    kind: 'markdown',
    updated: '2026-09-17',
  },
  {
    slug: 'instructions-to-counsel',
    title: 'Instructions to counsel',
    description: 'The brief for your lawyer — what to review and the questions to confirm before launch.',
    category: 'Legal pack',
    file: 'legal/03-instructions-to-counsel.md',
    kind: 'markdown',
    updated: '2026-09-17',
  },
  {
    slug: 'inapp-legal-copy',
    title: 'Current in-app legal copy',
    description: 'A snapshot of the Terms, Privacy, and Cookie copy as shown to users in the app.',
    category: 'Legal pack',
    file: 'legal/04-current-inapp-legal-copy.md',
    kind: 'markdown',
    updated: '2026-09-17',
  },
  {
    slug: 'legal-pack-docx',
    title: 'StayKnit legal pack (.docx)',
    description: 'The full legal pack compiled into a single Word document to hand to counsel. Download to open.',
    category: 'Legal pack',
    file: 'legal/StayKnit-Legal-Pack.docx',
    kind: 'binary',
    updated: '2026-09-17',
  },
]

function entryFor(slug: string): DocManifestEntry | undefined {
  return MANIFEST.find((d) => d.slug === slug)
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

// Derives a document's "last updated" date from the newest real date written in
// its own body — the only trustworthy source, since deployed file mtimes are a
// fixed build constant. Recognises ISO (2026-09-17) and long/short month forms
// ("17 September 2026", "17 Sep 2026"). Registration numbers like
// "2026/740258/07" use slashes and never match. Returns an ISO string, or null
// when the body has no parseable date (the caller then uses the curated
// manifest fallback).
function extractUpdatedAt(markdown: string): string | null {
  const times: number[] = []
  for (const m of markdown.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (!Number.isNaN(t)) times.push(t)
  }
  for (const m of markdown.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/g)) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month === undefined) continue
    const t = Date.UTC(Number(m[3]), month, Number(m[1]))
    if (!Number.isNaN(t)) times.push(t)
  }
  if (times.length === 0) return null
  return new Date(Math.max(...times)).toISOString()
}

export type DocListItem = Omit<DocManifestEntry, 'file'> & {
  /** Size in bytes, or null if the file is missing on disk. */
  bytes: number | null
  /** Last-modified ISO string, or null if the file is missing. */
  updatedAt: string | null
}

// Lists the available documents with size and a trustworthy "updated" date.
// Size comes from the filesystem (reliable); the date is parsed from the doc's
// own body, falling back to the curated manifest date — never the meaningless
// deployed mtime.
export async function listAdminDocs(): Promise<DocListItem[]> {
  await assertAdmin()
  return Promise.all(
    MANIFEST.map(async ({ file, updated, ...rest }) => {
      const abs = path.join(DOCS_ROOT, file)
      try {
        const stat = await fs.stat(abs)
        let updatedAt: string | null = updated ?? null
        if (rest.kind === 'markdown') {
          const fromBody = extractUpdatedAt(await fs.readFile(abs, 'utf8'))
          if (fromBody) updatedAt = fromBody
        }
        return { ...rest, bytes: stat.size, updatedAt }
      } catch {
        return { ...rest, bytes: null, updatedAt: updated ?? null }
      }
    }),
  )
}

export type DocContent = {
  slug: string
  title: string
  kind: DocKind
  /** Raw markdown for markdown docs; empty for binary docs. */
  markdown: string
}

export type DocExportItem = {
  slug: string
  title: string
  description: string
  category: string
  kind: DocKind
  updatedAt: string | null
  /** Raw markdown for markdown docs; empty for binary docs. */
  markdown: string
}

// Returns every allow-listed document with its content, for the compiled
// spreadsheet export. Markdown docs carry their body; binary docs (the legal
// pack .docx) carry metadata only and are noted as a separate download.
// Admin-gated — this is the same security boundary as the other doc readers.
export async function getAllDocsForExport(): Promise<DocExportItem[]> {
  await assertAdmin()
  return Promise.all(
    MANIFEST.map(async ({ file, updated, slug, title, description, category, kind }) => {
      const abs = path.join(DOCS_ROOT, file)
      let markdown = ''
      let updatedAt: string | null = updated ?? null
      if (kind === 'markdown') {
        try {
          markdown = await fs.readFile(abs, 'utf8')
          const fromBody = extractUpdatedAt(markdown)
          if (fromBody) updatedAt = fromBody
        } catch {
          /* leave markdown empty; the sheet notes the file is unavailable */
        }
      }
      return { slug, title, description, category, kind, updatedAt, markdown }
    }),
  )
}

// Returns the raw markdown for a single allow-listed document. Binary docs
// (e.g. the .docx) are not returned here — they are fetched via the gated
// download route instead.
export async function getAdminDoc(slug: string): Promise<DocContent | null> {
  await assertAdmin()
  const entry = entryFor(slug)
  if (!entry) return null
  if (entry.kind === 'binary') {
    return { slug: entry.slug, title: entry.title, kind: 'binary', markdown: '' }
  }
  try {
    const markdown = await fs.readFile(path.join(DOCS_ROOT, entry.file), 'utf8')
    return { slug: entry.slug, title: entry.title, kind: 'markdown', markdown }
  } catch {
    return null
  }
}

// Internal helper for the download route: resolves an allow-listed binary doc
// to its absolute path and a safe download filename. Returns null for unknown
// or non-binary slugs. Not exported to clients directly.
export async function resolveDownloadableDoc(
  slug: string,
): Promise<{ absolutePath: string; filename: string; contentType: string } | null> {
  await assertAdmin()
  const entry = entryFor(slug)
  if (!entry || entry.kind !== 'binary') return null
  const filename = path.basename(entry.file)
  const contentType = filename.endsWith('.docx')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/octet-stream'
  return { absolutePath: path.join(DOCS_ROOT, entry.file), filename, contentType }
}

// Internal helper for the download route: resolves an allow-listed markdown doc
// to its raw content, title, and a filename stem, so the route can convert it
// to .docx on the fly. Returns null for unknown or non-markdown slugs.
export async function resolveMarkdownForDownload(
  slug: string,
): Promise<{ markdown: string; title: string; stem: string } | null> {
  await assertAdmin()
  const entry = entryFor(slug)
  if (!entry || entry.kind !== 'markdown') return null
  try {
    const markdown = await fs.readFile(path.join(DOCS_ROOT, entry.file), 'utf8')
    const stem = path.basename(entry.file).replace(/\.md$/i, '')
    return { markdown, title: entry.title, stem }
  } catch {
    return null
  }
}
