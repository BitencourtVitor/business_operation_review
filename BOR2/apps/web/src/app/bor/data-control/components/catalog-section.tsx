"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useAddCatalogItem,
  useCatalogTable,
  useDeleteCatalogItem,
  useReorderContractSteps,
} from "@/hooks/use-catalog"
import type { CatalogTable } from "@/services/catalog.service"
import { ArrowDown, ArrowUp, GripVertical, Plus, Search, Trash2, X } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CATALOG_TABS } from "../types"

// ─── ContractStepsTable ────────────────────────────────────────────────────────

function ContractStepsTable() {
  const { data: rows = [], isLoading } = useCatalogTable("contract-steps")
  const deleteMutation  = useDeleteCatalogItem("contract-steps")
  const reorderMutation = useReorderContractSteps()

  // Local ordered copy for optimistic DnD
  const [localRows, setLocalRows] = useState<Record<string, unknown>[]>([])
  const _rowsKey = rows.map(r => r.id).join(",")
  useEffect(() => { setLocalRows(rows) }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function handleDragStart(i: number) {
    dragIndex.current = i
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    setDragOver(i)
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    setDragOver(null)
    const from = dragIndex.current
    if (from === null || from === targetIndex) return
    const next = [...localRows]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex, 0, moved)
    setLocalRows(next)
    reorderMutation.mutate(next.map(r => Number(r.id)))
    dragIndex.current = null
  }

  function handleDragEnd() {
    setDragOver(null)
    dragIndex.current = null
  }

  // Touch-friendly fallback for the drag-and-drop reorder above (native HTML5 DnD has no touch support)
  function moveRow(from: number, to: number) {
    if (to < 0 || to >= localRows.length) return
    const next = [...localRows]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLocalRows(next)
    reorderMutation.mutate(next.map(r => Number(r.id)))
  }

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
  }

  if (localRows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No steps yet</p>
  }

  return (
    <table className="w-full caption-bottom text-sm">
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="w-12">#</TableHead>
          <TableHead>Step</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {localRows.map((row, i) => (
          <TableRow
            key={String(row.id)}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`cursor-grab active:cursor-grabbing ${dragOver === i ? "bg-accent" : ""}`}
          >
            <TableCell className="text-muted-foreground/40">
              <GripVertical className="h-4 w-4" />
            </TableCell>
            <TableCell className="text-xs font-medium text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{String(row.step ?? "—")}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => moveRow(i, i - 1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => moveRow(i, i + 1)}
                  disabled={i === localRows.length - 1}
                  title="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(Number(row.id))}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </table>
  )
}

// ─── CatalogSection ────────────────────────────────────────────────────────────

export function CatalogSection({ activeTable }: { activeTable: CatalogTable }) {
  const tableDef = CATALOG_TABS.find(t => t.key === activeTable)!
  const { data: rows = [], isLoading } = useCatalogTable(activeTable)
  const addMutation    = useAddCatalogItem(activeTable)
  const deleteMutation = useDeleteCatalogItem(activeTable)
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch]   = useState("")
  const [form, setForm]       = useState<Record<string, string>>({})

  // reset form and search when table changes
  useMemo(() => { setForm({}); setSearch("") }, [])

  const filteredRows = useMemo(() => {
    const base = !search.trim()
      ? rows
      : rows.filter(row => {
          const q = search.toLowerCase()
          return tableDef.cols.some(c => String(row[c.field] ?? "").toLowerCase().includes(q))
        })
    if (activeTable === "workforce") {
      return [...base].sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" })
      )
    }
    return base
  }, [rows, search, tableDef, activeTable])

  function handleAdd() {
    if (tableDef.cols.some(c => !form[c.field]?.trim())) return
    addMutation.mutate(form, { onSuccess: () => { setForm({}); setAddOpen(false) } })
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{tableDef.label}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "entry" : "entries"} in the catalog
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`h-8 pl-8 text-sm w-52 ${search ? "pr-7" : ""}`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add {tableDef.label}
          </Button>
        </div>
      </div>

      {/* ── Table — fills remaining height, scrolls internally ── */}
      <div className="min-h-0 flex-1">
        <Card className="flex max-h-full flex-col py-0">
          <div className="overflow-auto">
            {activeTable === "contract-steps" ? (
              <ContractStepsTable />
            ) : (
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    {tableDef.cols.map(c => <TableHead key={c.field}>{c.label}</TableHead>)}
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={tableDef.cols.length + 2}
                        className="py-12 text-center text-muted-foreground"
                      >
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={tableDef.cols.length + 2}
                        className="py-12 text-center text-muted-foreground"
                      >
                        {search ? "No results found" : "No entries yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row, i) => (
                      <TableRow key={String(row.id ?? i)}>
                        <TableCell className="text-xs text-muted-foreground">{String(row.id)}</TableCell>
                        {tableDef.cols.map(c => (
                          <TableCell key={c.field} className="text-sm">
                            {String(row[c.field] ?? "—")}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(Number(row.id))}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* ── Add dialog ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) setForm({}) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to {tableDef.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {tableDef.cols.map(c => (
              <Input
                key={c.field}
                placeholder={c.label}
                value={form[c.field] ?? ""}
                onChange={e => setForm(f => ({ ...f, [c.field]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending || tableDef.cols.some(c => !form[c.field]?.trim())}
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
