"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

// ─── Cell renderer ────────────────────────────────────────────────────────────

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-muted-foreground/40">null</span>

  if (typeof value === "boolean")
    return (
      <span className={cn("font-mono", value ? "text-emerald-500" : "text-red-400")}>
        {String(value)}
      </span>
    )

  if (typeof value === "object")
    return (
      <span className="max-w-[280px] truncate font-mono text-blue-400">
        {JSON.stringify(value)}
      </span>
    )

  const str = String(value)

  if (/^\d{4}-\d{2}-\d{2}T/.test(str))
    return <span className="text-violet-400">{new Date(str).toLocaleString()}</span>

  if (/^\d{4}-\d{2}-\d{2}$/.test(str))
    return <span className="text-violet-400">{str}</span>

  if (typeof value === "number")
    return <span className="font-mono tabular-nums">{str}</span>

  return <span>{str}</span>
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(tableName: string, rows: Row[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    cols.join(","),
    ...rows.map(r => cols.map(c => escape(r[c])).join(",")),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const a    = document.createElement("a")
  a.href     = URL.createObjectURL(blob)
  a.download = `bor1_${tableName}_p${Date.now()}.csv`
  a.click()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BOR1ExplorerPage() {
  const [tables,       setTables]       = useState<string[]>([])
  const [tableSearch,  setTableSearch]  = useState("")
  const [selected,     setSelected]     = useState<string | null>(null)
  const [rows,         setRows]         = useState<Row[]>([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [loadingList,  setLoadingList]  = useState(true)
  const [loadingData,  setLoadingData]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // ── Fetch table list ────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const res  = await fetch("/api/bor1/tables")
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setTables(json.tables ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { fetchTables() }, [fetchTables])

  // ── Fetch table data ────────────────────────────────────────

  const fetchData = useCallback(async (table: string, p: number) => {
    setLoadingData(true)
    setError(null)
    try {
      const offset = (p - 1) * PAGE_SIZE
      const res    = await fetch(
        `/api/bor1/data?table=${encodeURIComponent(table)}&limit=${PAGE_SIZE}&offset=${offset}`
      )
      const json   = await res.json()
      if (json.error) throw new Error(json.error)
      setRows(json.rows  ?? [])
      setTotal(json.total ?? 0)
    } catch (e) {
      setError(String(e))
      setRows([])
      setTotal(0)
    } finally {
      setLoadingData(false)
    }
  }, [])

  function selectTable(table: string) {
    setSelected(table)
    setPage(1)
    fetchData(table, 1)
  }

  function goPage(p: number) {
    setPage(p)
    if (selected) fetchData(selected, p)
  }

  // ── Derived ─────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const columns    = rows.length > 0 ? Object.keys(rows[0]) : []
  const filtered   = tables.filter(t =>
    t.toLowerCase().includes(tableSearch.toLowerCase())
  )

  const pageStart = Math.min((page - 1) * PAGE_SIZE + 1, total)
  const pageEnd   = Math.min(page * PAGE_SIZE, total)

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">BOR1 Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Read-only access to all BOR1 Supabase tables — use to audit and migrate data into BOR2
        </p>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Main split layout ── */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">

        {/* ── Left: table list ── */}
        <aside className="flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border bg-card">

          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {loadingList ? "Loading…" : `${tables.length} tables`}
            </span>
            <button
              onClick={fetchTables}
              title="Refresh table list"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-2 pt-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Filter tables…"
                className="h-7 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No tables found</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map(t => (
                  <button
                    key={t}
                    onClick={() => selectTable(t)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      selected === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Table2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: data panel ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">

          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Database className="h-10 w-10 opacity-20" />
              <p className="text-sm">Select a table to explore its data</p>
            </div>
          ) : (
            <>
              {/* Data panel header */}
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{selected}</span>
                  {!loadingData && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {total.toLocaleString()} rows
                    </span>
                  )}
                </div>
                <button
                  onClick={() => exportCSV(selected, rows)}
                  disabled={rows.length === 0}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  Export CSV
                </button>
              </div>

              {/* Table body */}
              <div className="min-h-0 flex-1 overflow-auto">
                {loadingData ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    This table has no rows
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur">
                      <tr>
                        {columns.map(col => (
                          <th
                            key={col}
                            className="whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/40 transition-colors hover:bg-muted/30"
                        >
                          {columns.map(col => (
                            <td
                              key={col}
                              className="max-w-[300px] truncate px-3 py-1.5"
                              title={
                                row[col] !== null && row[col] !== undefined
                                  ? typeof row[col] === "object"
                                    ? JSON.stringify(row[col])
                                    : String(row[col])
                                  : ""
                              }
                            >
                              <CellValue value={row[col]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-2">
                <span className="text-[11px] text-muted-foreground">
                  {total > 0
                    ? `Rows ${pageStart}–${pageEnd} of ${total.toLocaleString()}`
                    : "No rows"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goPage(page - 1)}
                    disabled={page <= 1 || loadingData}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-input transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[64px] text-center text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => goPage(page + 1)}
                    disabled={page >= totalPages || loadingData}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-input transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
