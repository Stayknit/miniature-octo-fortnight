"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getAdminDoc, listAdminDocs, type DocContent, type DocListItem } from "@/app/actions/admin-docs"
import { MarkdownView } from "@/components/admin/markdown-view"
import { Download, FileText, Sheet } from "lucide-react"

function fmtBytes(bytes: number | null) {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Read-only reader for the project's legal & operational docs. Content is
// loaded on demand through admin-gated server actions; nothing here is
// reachable by an ordinary user.
export function DocsPanel() {
  const [docs, setDocs] = useState<DocListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<DocContent | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const list = await listAdminDocs()
        if (!active) return
        setDocs(list)
        // Open the first readable doc by default so the pane isn't empty.
        const firstMarkdown = list.find((d) => d.kind === "markdown")
        if (firstMarkdown) setSelected(firstMarkdown.slug)
      } finally {
        if (active) setLoadingList(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const openDoc = useCallback(async (slug: string) => {
    setSelected(slug)
    setLoadingDoc(true)
    setContent(null)
    try {
      setContent(await getAdminDoc(slug))
    } finally {
      setLoadingDoc(false)
    }
  }, [])

  // Load content whenever the selection changes (including the default).
  useEffect(() => {
    if (selected) void openDoc(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const grouped = useMemo(() => {
    const byCat = new Map<string, DocListItem[]>()
    for (const d of docs) {
      const arr = byCat.get(d.category) ?? []
      arr.push(d)
      byCat.set(d.category, arr)
    }
    return Array.from(byCat.entries())
  }, [docs])

  const selectedMeta = docs.find((d) => d.slug === selected)

  return (
    <div className="grid flex-1 gap-4 md:grid-cols-[minmax(240px,320px)_1fr]">
      {/* Doc index */}
      <div className="flex flex-col gap-4">
        {/* Compiled export — every document + company details in one workbook */}
        <a
          href="/api/admin/docs/spreadsheet"
          className="group flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:border-primary hover:bg-primary/10"
        >
          <Sheet className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">Download all as spreadsheet</span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Every document plus company &amp; legal details, compiled into one Excel workbook.
            </span>
          </span>
        </a>

        {loadingList && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading…</p>
        )}
        {grouped.map(([category, items]) => (
          <div key={category} className="flex flex-col gap-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
            {items.map((d) => {
              const isBinary = d.kind === "binary"
              const isActive = selected === d.slug && !isBinary
              return isBinary ? (
                <a
                  key={d.slug}
                  href={`/api/admin/docs/${d.slug}`}
                  className="group flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60"
                >
                  <Download className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{d.title}</span>
                    <span className="mt-0.5 text-xs text-muted-foreground">Download · {fmtBytes(d.bytes)}</span>
                  </span>
                </a>
              ) : (
                <button
                  key={d.slug}
                  onClick={() => setSelected(d.slug)}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                    isActive ? "border-primary bg-surface-2" : "border-border bg-card hover:bg-surface-2"
                  }`}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{d.title}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Reader */}
      <div className="min-w-0">
        {selected == null ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Select a document to read it here, or download the legal pack.
          </div>
        ) : (
          <div className="flex flex-col rounded-lg border border-border bg-card">
            {selectedMeta && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-foreground">{selectedMeta.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtBytes(selectedMeta.bytes)}
                    {selectedMeta.updatedAt
                      ? ` · updated ${new Date(selectedMeta.updatedAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`/api/admin/docs/${selectedMeta.slug}?format=docx`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-surface-2"
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    Word
                  </a>
                  <a
                    href={`/admin/docs/${selectedMeta.slug}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-surface-2"
                  >
                    <FileText className="size-3.5" aria-hidden="true" />
                    PDF
                  </a>
                </div>
              </div>
            )}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {loadingDoc ? (
                <p className="text-sm text-muted-foreground">Loading document…</p>
              ) : content && content.kind === "markdown" ? (
                <MarkdownView markdown={content.markdown} />
              ) : (
                <p className="text-sm text-muted-foreground">This document could not be loaded.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
