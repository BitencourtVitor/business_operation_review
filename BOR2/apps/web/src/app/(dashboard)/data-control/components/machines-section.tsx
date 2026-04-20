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
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, Wrench, X } from "lucide-react"
import { useMemo, useState } from "react"
import type { MRow } from "../types"
import { MACHINE_TYPES } from "../types"

// ─── MachinesRowItem ───────────────────────────────────────────────────────────

function MachinesRowItem({
  row,
  onSaved,
  onDeleted,
}: {
  row: MRow
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({
    equipment_category: row.equipment_category,
    title: row.title,
  })
  const updateMutation = useUpdateCatalogItem("machines")
  const deleteMutation = useDeleteCatalogItem("machines")

  function handleSave() {
    updateMutation.mutate(
      { id: row.id, data: { category: row.category, subcategory: row.subcategory, ...form } },
      { onSuccess: () => { setEditing(false); onSaved() } },
    )
  }

  function handleCancel() {
    setForm({ equipment_category: row.equipment_category, title: row.title })
    setEditing(false)
  }

  if (editing) {
    return (
      <TableRow className="bg-accent/30">
        <TableCell>
          <Input
            value={form.equipment_category}
            onChange={e => setForm(f => ({ ...f, equipment_category: e.target.value }))}
            className="h-7 text-sm"
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel() }}
            autoFocus
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
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
      <TableCell className="text-sm text-muted-foreground">{row.equipment_category || "—"}</TableCell>
      <TableCell className="text-sm">{row.title || "—"}</TableCell>
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

// ─── MachinesCategoryBlock ─────────────────────────────────────────────────────

function MachinesCategoryBlock({
  category,
  subcategory,
  rows,
  onMutated,
  initialAdding = false,
  onCancelledEmpty,
}: {
  category: string
  subcategory: string
  rows: MRow[]
  onMutated: () => void
  initialAdding?: boolean
  onCancelledEmpty?: () => void
}) {
  const label = subcategory ? `${category} – ${subcategory}` : category
  const [collapsed, setCollapsed] = useState(true)
  const [adding, setAdding]       = useState(initialAdding)
  const [newRow, setNewRow]       = useState({ equipment_category: "", title: "" })
  const addMutation = useAddCatalogItem("machines")

  function handleAdd() {
    if (!newRow.title.trim()) return
    addMutation.mutate(
      { category, subcategory, ...newRow },
      { onSuccess: () => { setNewRow({ equipment_category: "", title: "" }); setAdding(false); onMutated() } },
    )
  }

  function handleCancelAdd() {
    setAdding(false)
    if (rows.length === 0) onCancelledEmpty?.()
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
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
              <TableHead className="h-8 w-[30%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</TableHead>
              <TableHead className="h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment</TableHead>
              <TableHead className="h-8 w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <MachinesRowItem key={row.id} row={row} onSaved={onMutated} onDeleted={onMutated} />
            ))}
            {adding && (
              <TableRow className="bg-accent/20">
                <TableCell>
                  <Input
                    placeholder="e.g. Machine"
                    value={newRow.equipment_category}
                    onChange={e => setNewRow(f => ({ ...f, equipment_category: e.target.value }))}
                    className="h-7 text-sm"
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") handleCancelAdd() }}
                    autoFocus
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Equipment name"
                    value={newRow.title}
                    onChange={e => setNewRow(f => ({ ...f, title: e.target.value }))}
                    className="h-7 text-sm"
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") handleCancelAdd() }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400"
                      onClick={handleAdd} disabled={addMutation.isPending || !newRow.title.trim()}
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

// ─── MachinesSection ───────────────────────────────────────────────────────────

export function MachinesSection() {
  const { data: rows = [], isLoading }        = useCatalogTable("machines")
  const { data: catalogClients = [] }         = useClients()
  const [search, setSearch]                   = useState("")
  const [addOpen, setAddOpen]                 = useState(false)
  const [newCategory, setNewCategory]         = useState("")
  const [newSubcategory, setNewSubcategory]   = useState("")
  const [pendingCategory, setPendingCategory] = useState<{ category: string; subcategory: string } | null>(null)

  const typedRows = rows as unknown as MRow[]

  const groups = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map<string, MRow[]>()
    for (const row of typedRows) {
      if (
        q &&
        !["category", "subcategory", "equipment_category", "title"].some(f =>
          String((row as Record<string, unknown>)[f] ?? "").toLowerCase().includes(q),
        )
      ) continue
      const key = `${row.category}–${row.subcategory}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [typedRows, search])

  const existingClients = useMemo(
    () => catalogClients.map(c => c.name).sort(),
    [catalogClients],
  )

  const newCategoryKey        = `${newCategory}–${newSubcategory}`
  const categoryAlreadyExists = !!newCategory && groups.has(newCategoryKey)

  function handleAddCategory() {
    const cat = newCategory.trim()
    if (!cat || categoryAlreadyExists) return
    setAddOpen(false)
    setNewCategory("")
    setNewSubcategory("")
    if (!groups.has(newCategoryKey)) setPendingCategory({ category: cat, subcategory: newSubcategory })
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Machines</h1>
          <p className="text-sm text-muted-foreground">
            {typedRows.length} {typedRows.length === 1 ? "machine" : "machines"} across{" "}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
        ) : groups.size === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {search ? "No results found" : "No machines yet"}
          </p>
        ) : (
          <div className="space-y-3">
            {[...groups.entries()].map(([key, catRows]) => (
              <MachinesCategoryBlock
                key={key}
                category={catRows[0].category}
                subcategory={catRows[0].subcategory}
                rows={catRows}
                onMutated={() => {}}
              />
            ))}
            {pendingCategory &&
              !groups.has(`${pendingCategory.category}–${pendingCategory.subcategory}`) && (
                <MachinesCategoryBlock
                  key={`pending-${pendingCategory.category}–${pendingCategory.subcategory}`}
                  category={pendingCategory.category}
                  subcategory={pendingCategory.subcategory}
                  rows={[]}
                  onMutated={() => setPendingCategory(null)}
                  initialAdding
                  onCancelledEmpty={() => setPendingCategory(null)}
                />
              )}
          </div>
        )}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={v => { setAddOpen(v); if (!v) { setNewCategory(""); setNewSubcategory("") } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              New Category
            </DialogTitle>
            <DialogDescription>
              Which client and project type will use this equipment list?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Client</label>
                <Select value={newCategory} onValueChange={v => setNewCategory(v ?? "")}>
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
                  <span className="font-normal text-muted-foreground/50">(optional)</span>
                </label>
                <Select value={newSubcategory} onValueChange={v => setNewSubcategory(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any</SelectItem>
                    {MACHINE_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newCategory && !categoryAlreadyExists && (
              <p className="text-xs text-muted-foreground">
                {newSubcategory ? (
                  <>
                    This category will list the required machines for{" "}
                    <span className="text-foreground font-medium">{newCategory}</span>{" "}
                    {newSubcategory.toLowerCase()}s.
                  </>
                ) : (
                  <>
                    This category will list all required machines for any{" "}
                    <span className="text-foreground font-medium">{newCategory}</span> project.
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
                disabled={!newCategory || newCategory === "__none__" || categoryAlreadyExists}
              >
                <Wrench className="h-3.5 w-3.5" />Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
