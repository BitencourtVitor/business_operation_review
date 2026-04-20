"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useAddCatalogItem,
  useDeleteCatalogItem,
  useUpdateCatalogItem,
  useCatalogTable,
} from "@/hooks/use-catalog"
import { useClients } from "@/hooks/use-clients"
import { Check, ChevronDown, FolderPlus, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import type { FWRow } from "../types"
import { FW_PROJECT_TYPES } from "../types"

// ─── FieldwireRowItem ──────────────────────────────────────────────────────────

function FieldwireRowItem({
  row,
  onSaved,
  onDeleted,
}: {
  row: FWRow
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    document: row.document,
    where_location: row.where_location,
    notes: row.notes,
  })
  const updateMutation = useUpdateCatalogItem("fieldwire")
  const deleteMutation = useDeleteCatalogItem("fieldwire")

  function handleSave() {
    updateMutation.mutate(
      { id: row.id, data: { client: row.client, type: row.type, ...form } },
      { onSuccess: () => { setEditing(false); onSaved() } },
    )
  }

  function handleCancel() {
    setForm({ document: row.document, where_location: row.where_location, notes: row.notes })
    setEditing(false)
  }

  if (editing) {
    return (
      <TableRow className="bg-accent/30">
        <TableCell>
          <Input
            value={form.document}
            onChange={e => setForm(f => ({ ...f, document: e.target.value }))}
            className="h-7 text-sm"
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel() }}
            autoFocus
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.where_location}
            onChange={e => setForm(f => ({ ...f, where_location: e.target.value }))}
            className="h-7 text-sm"
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel() }}
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="h-7 text-sm"
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel() }}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400"
              onClick={handleSave} disabled={updateMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className="group">
      <TableCell className="text-sm">{row.document || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.where_location || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.notes || "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate(row.id, { onSuccess: onDeleted })}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── FieldwireCategoryBlock ────────────────────────────────────────────────────

function FieldwireCategoryBlock({
  client,
  type,
  rows,
  onMutated,
  initialAdding = false,
  onCancelledEmpty,
}: {
  client: string
  type: string
  rows: FWRow[]
  onMutated: () => void
  initialAdding?: boolean
  onCancelledEmpty?: () => void
}) {
  const label = `${client} – ${type}`
  const [collapsed, setCollapsed] = useState(true)
  const [adding, setAdding]       = useState(initialAdding)
  const [newRow, setNewRow]       = useState({ document: "", where_location: "", notes: "" })
  const addMutation = useAddCatalogItem("fieldwire")

  function handleAdd() {
    if (!newRow.document.trim()) return
    addMutation.mutate(
      { client, type, ...newRow },
      { onSuccess: () => { setNewRow({ document: "", where_location: "", notes: "" }); setAdding(false); onMutated() } },
    )
  }

  function handleCancelAdd() {
    setAdding(false)
    if (rows.length === 0) onCancelledEmpty?.()
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Category header */}
      <div className="flex h-10 items-center justify-between gap-2 bg-muted/40 px-4">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
          onClick={() => setCollapsed(c => !c)}
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          {label}
          <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        </button>
        {!collapsed && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAdding(a => !a)}>
            <Plus className="h-3.5 w-3.5" />Add row
          </Button>
        )}
      </div>

      {!collapsed && (
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border bg-muted/20">
              <TableHead className="w-[35%] h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document</TableHead>
              <TableHead className="w-[25%] h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</TableHead>
              <TableHead className="h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</TableHead>
              <TableHead className="w-20 h-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <FieldwireRowItem key={row.id} row={row} onSaved={onMutated} onDeleted={onMutated} />
            ))}

            {/* Inline add row */}
            {adding && (
              <TableRow className="bg-accent/20">
                <TableCell>
                  <Input
                    placeholder="Document name"
                    value={newRow.document}
                    onChange={e => setNewRow(f => ({ ...f, document: e.target.value }))}
                    className="h-7 text-sm"
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") handleCancelAdd() }}
                    autoFocus
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Where"
                    value={newRow.where_location}
                    onChange={e => setNewRow(f => ({ ...f, where_location: e.target.value }))}
                    className="h-7 text-sm"
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") handleCancelAdd() }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Notes"
                    value={newRow.notes}
                    onChange={e => setNewRow(f => ({ ...f, notes: e.target.value }))}
                    className="h-7 text-sm"
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") handleCancelAdd() }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400"
                      onClick={handleAdd} disabled={addMutation.isPending || !newRow.document.trim()}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelAdd}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      )}
    </div>
  )
}

// ─── FieldwireSection ──────────────────────────────────────────────────────────

export function FieldwireSection() {
  const { data: rows = [], isLoading }    = useCatalogTable("fieldwire")
  const { data: catalogClients = [] }     = useClients()
  const [search, setSearch]               = useState("")
  const [addOpen, setAddOpen]             = useState(false)
  const [newClient, setNewClient]         = useState("")
  const [newType, setNewType]             = useState("")
  const [pendingCategory, setPendingCategory] = useState<{ client: string; type: string } | null>(null)

  const typedRows = rows as unknown as FWRow[]

  const groups = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map<string, FWRow[]>()
    for (const row of typedRows) {
      if (
        q &&
        !["client", "type", "document", "where_location", "notes"].some(f =>
          String((row as Record<string, unknown>)[f] ?? "").toLowerCase().includes(q),
        )
      ) continue
      const key = `${row.client}–${row.type}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [typedRows, search])

  const existingClients = useMemo(
    () => catalogClients.map(c => c.name).sort(),
    [catalogClients],
  )

  const newCategoryKey     = `${newClient}–${newType}`
  const categoryAlreadyExists = !!newClient && groups.has(newCategoryKey)

  function handleAddCategory() {
    const client = newClient.trim()
    if (!client || categoryAlreadyExists) return
    setAddOpen(false)
    setNewClient("")
    setNewType("")
    if (!groups.has(newCategoryKey)) setPendingCategory({ client, type: newType })
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fieldwire Docs</h1>
          <p className="text-sm text-muted-foreground">
            {typedRows.length} {typedRows.length === 1 ? "document" : "documents"} across{" "}
            {groups.size} {groups.size === 1 ? "category" : "categories"}
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
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Category
          </Button>
        </div>
      </div>

      {/* Groups — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
        ) : groups.size === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {search ? "No results found" : "No documents yet"}
          </p>
        ) : (
          <div className="space-y-3">
            {[...groups.entries()].map(([key, catRows]) => (
              <FieldwireCategoryBlock
                key={key}
                client={catRows[0].client}
                type={catRows[0].type}
                rows={catRows}
                onMutated={() => {}}
              />
            ))}
            {/* Pending new category — empty block, add row form open */}
            {pendingCategory &&
              !groups.has(`${pendingCategory.client}–${pendingCategory.type}`) && (
                <FieldwireCategoryBlock
                  key={`pending-${pendingCategory.client}–${pendingCategory.type}`}
                  client={pendingCategory.client}
                  type={pendingCategory.type}
                  rows={[]}
                  onMutated={() => setPendingCategory(null)}
                  initialAdding
                  onCancelledEmpty={() => setPendingCategory(null)}
                />
              )}
          </div>
        )}
      </div>

      {/* Add Category dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={v => { setAddOpen(v); if (!v) { setNewClient(""); setNewType("") } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4" />
              New Category
            </DialogTitle>
            <DialogDescription>
              Which client and project type will trigger this list?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Client</label>
                <Select value={newClient} onValueChange={v => setNewClient(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingClients.length > 0
                      ? existingClients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                      : <SelectItem value="__none__" disabled>No clients yet</SelectItem>
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Project Type{" "}
                  <span className="text-muted-foreground/50 font-normal">(optional)</span>
                </label>
                <Select value={newType} onValueChange={v => setNewType(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any</SelectItem>
                    {FW_PROJECT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newClient && !categoryAlreadyExists && (
              <p className="text-xs text-muted-foreground">
                {newType ? (
                  <>
                    This category will provision the required documents for{" "}
                    <span className="text-foreground font-medium">{newClient}</span>{" "}
                    {newType.toLowerCase()}s.
                  </>
                ) : (
                  <>
                    This category will provision all required documents for any{" "}
                    <span className="text-foreground font-medium">{newClient}</span> project.
                  </>
                )}
              </p>
            )}
            {categoryAlreadyExists && (
              <p className="text-xs text-destructive">
                This client + type combination already exists.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddCategory}
                disabled={!newClient || newClient === "__none__" || categoryAlreadyExists}
              >
                <FolderPlus className="h-3.5 w-3.5" />Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
