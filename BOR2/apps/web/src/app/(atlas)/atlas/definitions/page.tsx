"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  useAtlasDocCategories, useCreateDocCategory, useDeleteDocCategory, useUpdateDocCategory,
} from "@/hooks/use-atlas"
import {
  ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Layers, Pencil, Plus, Search, Trash2, X,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

// A mesma estrutura das tabelas de catálogo do Data Control: cabeçalho com a
// contagem, busca, botão de acrescentar, e a tabela rolando dentro do cartão.
//
// O que se cadastra aqui é a taxonomia: a categoria e o eixo pelo qual ela se
// divide. A subcategoria não se digita — nasce do cadastro da obra, dos andares
// que o prédio tem e das letras de unidade que ele usa. É isso que evita o que
// o Fieldwire virou: "Panels Fourth Floor", "4th floor wall panel layout" e
// "Riverview 50 1st Panels Walls 013026" convivendo como se fossem coisas
// diferentes.

const BUILD_TYPES = [
  { value: "", label: "Any build type" },
  { value: "building", label: "Building" },
  { value: "house", label: "House" },
]

const AXES = [
  { value: "none", label: "Single folder", hint: "One folder for the whole jobsite" },
  { value: "floor", label: "Per floor", hint: "One folder per floor: 1st, 2nd, 3rd…" },
  { value: "unit", label: "Per unit", hint: "One folder per unit letter: C, F, H…" },
]

const AXIS_LABEL: Record<string, string> = {
  none: "—",
  floor: "Per floor",
  unit: "Per unit",
}

// A tabela abre ordenada pelo tipo de build, A a Z. Dentro do tipo a ordem
// continua sendo a da posição na taxonomia, que é a ordem de leitura da obra —
// o sort é estável, então o empate preserva o que a API mandou.
const SORTABLE = [
  { key: "buildType" as const, label: "Build type" },
  { key: "name" as const, label: "Category" },
  { key: "axis" as const, label: "Subcategory" },
]

type SortKey = (typeof SORTABLE)[number]["key"]

const BUILD_LABEL: Record<string, string> = {
  "": "Any",
  building: "Building",
  house: "House",
}

// O campo tem a mesma caixa da etiqueta que ele substitui, para a linha não
// pular de altura enquanto se digita.
function ValueField({ value, onChange, onCommit, onCancel }: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => {
        if (e.key === "Enter") onCommit()
        if (e.key === "Escape") onCancel()
      }}
      className="h-7 w-24 rounded-md border border-primary/50 bg-background px-2.5 text-xs font-medium outline-none"
    />
  )
}

export default function AtlasDefinitionsPage() {
  const { data: rows = [], isLoading } = useAtlasDocCategories()
  const create = useCreateDocCategory()
  const update = useUpdateDocCategory()
  const remove = useDeleteDocCategory()
  // Quando há id, o diálogo edita em vez de criar — é o mesmo formulário, e
  // duplicá-lo faria dois lugares para consertar cada ajuste.
  const [editingId, setEditingId] = useState<number | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey | null>("buildType")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }
  const [form, setForm] = useState({ client: "", buildType: "", name: "", axis: "none", defaultSlot: true })
  // Renomear e acrescentar acontecem na própria etiqueta. Valor vazio é o
  // acréscimo; com valor, é a etiqueta daquele nome que virou campo.
  const [editingValue, setEditingValue] = useState<{ id: number; value: string } | null>(null)
  const [valueDraft, setValueDraft] = useState("")

  function startValue(id: number, value: string) {
    setEditingValue({ id, value })
    setValueDraft(value)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = !q ? rows : rows.filter(r =>
      [r.buildType, r.name, AXIS_LABEL[r.axis]]
        .some(v => String(v ?? "").toLowerCase().includes(q)))
    if (!sortKey) return base
    const label = (r: (typeof base)[number]) =>
      sortKey === "buildType" ? BUILD_LABEL[r.buildType] ?? r.buildType
      : sortKey === "axis" ? AXIS_LABEL[r.axis] ?? r.axis
      : r.name
    return [...base].sort((a, b) => {
      const cmp = label(a).localeCompare(label(b))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, search, sortKey, sortDir])

  // As operações de subcategoria mandam a lista inteira: o PATCH substitui o
  // vetor, e mandar só a diferença exigiria um endpoint por operação para
  // ganhar nada.
  type Row = (typeof rows)[number]

  function saveValues(row: Row, axisValues: string[]) {
    update.mutate({
      id: row.id, name: row.name, buildType: row.buildType,
      axis: row.axis, defaultSlot: row.defaultSlot, axisValues,
    })
  }

  function commitValue(row: Row) {
    const value = valueDraft.trim()
    const target = editingValue?.value ?? ""
    setEditingValue(null)
    if (!value || value === target) return
    const current = row.axisValues ?? []
    if (current.includes(value)) return
    saveValues(row, target
      ? current.map(v => (v === target ? value : v))
      : [...current, value])
  }

  function removeValue(row: Row, value: string) {
    saveValues(row, (row.axisValues ?? []).filter(v => v !== value))
  }

  function closeDialog() {
    setAddOpen(false)
    setEditingId(null)
    setForm({ client: "", buildType: "", name: "", axis: "none", defaultSlot: true })
  }

  function startEdit(row: { id: number; buildType: string; name: string; axis: string; defaultSlot: boolean }) {
    setEditingId(row.id)
    setForm({ client: "", buildType: row.buildType, name: row.name, axis: row.axis, defaultSlot: row.defaultSlot })
    setAddOpen(true)
  }

  function handleAdd() {
    if (!form.name.trim()) return
    if (editingId !== null) {
      update.mutate(
        { id: editingId, name: form.name.trim(), buildType: form.buildType, axis: form.axis, defaultSlot: form.defaultSlot },
        { onSuccess: closeDialog },
      )
      return
    }
    create.mutate(form, { onSuccess: closeDialog })
  }

  const selectedAxis = AXES.find(a => a.value === form.axis)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-4">
        {/* Mesma volta que a Manage Users tem: quem entrou por Settings precisa
            do caminho de volta na própria página, e não só no menu. */}
        <div className="flex items-center gap-3">
          <Link
            href="/atlas/settings"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Manage Categories and Subcategories</h1>
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "category" : "categories"} a jobsite is organised by
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`h-8 w-52 pl-8 text-sm ${search ? "pr-7" : ""}`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add category
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Card className="flex max-h-full flex-col py-0">
          <Table containerClassName="max-h-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                {SORTABLE.map(col => (
                  <TableHead key={col.key}>
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${
                        sortKey === col.key ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {col.label}
                      {sortKey === col.key
                        ? sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                        : <ChevronUp className="h-3 w-3 opacity-20" />}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    {search ? "No results found" : "No categories yet"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.flatMap(row => {
                  // Só quem tem eixo abre: categoria de pasta única não tem o
                  // que expandir, e um chevron ali prometeria conteúdo que não
                  // existe.
                  // A lista pode não vir: API antiga não conhece o campo. Sem
                  // a guarda, a tela inteira quebra por causa de um deploy.
                  const subs = row.subcategories ?? []
                  const opts = row.axisValues ?? []
                  const expandable = row.axis !== "none"
                  const isOpen = expanded.has(row.id)
                  const rows = [
                  <TableRow key={row.id}>
                    <TableCell className="px-1">
                      {expandable && (
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{BUILD_LABEL[row.buildType] ?? row.buildType}</TableCell>
                    <TableCell className="text-sm font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm">
                      {row.axis === "none" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Layers className="h-3 w-3" />
                          {AXIS_LABEL[row.axis]}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => remove.mutate(row.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ]

                  if (expandable && isOpen) {
                    rows.push(
                      <TableRow key={`${row.id}-sub`}>
                        <TableCell />
                        <TableCell colSpan={4} className="py-2">
                          {/* As opções que a categoria admite, com destaque no
                              que já virou pasta em alguma obra: a distinção
                              entre o que existe e o que está disponível é
                              justamente o que a tela precisa dizer. */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {opts.map(opt => {
                              const inUse = subs.includes(opt)
                              if (editingValue?.id === row.id && editingValue.value === opt) {
                                return (
                                  <ValueField
                                    key={opt}
                                    value={valueDraft}
                                    onChange={setValueDraft}
                                    onCommit={() => commitValue(row)}
                                    onCancel={() => setEditingValue(null)}
                                  />
                                )
                              }
                              return (
                                <span
                                  key={opt}
                                  className={`flex h-7 items-center gap-1.5 rounded-md border pl-2.5 pr-1 text-xs font-medium ${
                                    inUse
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border bg-muted/60 text-foreground/80"
                                  }`}
                                >
                                  {row.axis === "floor" ? `${opt} Floor` : `${opt} Unit`}
                                  <span className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      title="Rename"
                                      onClick={() => startValue(row.id, opt)}
                                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      title={inUse ? "In use by a jobsite — cannot remove" : "Remove"}
                                      disabled={inUse}
                                      onClick={() => removeValue(row, opt)}
                                      className="rounded p-0.5 text-destructive hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </span>
                                </span>
                              )
                            })}
                            {editingValue?.id === row.id && editingValue.value === "" ? (
                              <ValueField
                                value={valueDraft}
                                onChange={setValueDraft}
                                onCommit={() => commitValue(row)}
                                onCancel={() => setEditingValue(null)}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startValue(row.id, "")}
                                className="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                              >
                                <Plus className="h-3 w-3" />
                                {row.axis === "floor" ? "Floor" : "Unit"}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>,
                    )
                  }
                  return rows
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={v => { if (!v) closeDialog(); else setAddOpen(true) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              placeholder="Category name — Trusses, Wall Panels…"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
            />
            <Select value={form.buildType} onValueChange={v => setForm(f => ({ ...f, buildType: v ?? "" }))}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm">
                  {BUILD_TYPES.find(t => t.value === form.buildType)?.label}
                </span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {BUILD_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Select value={form.axis} onValueChange={v => setForm(f => ({ ...f, axis: v ?? "none" }))}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm">{selectedAxis?.label}</span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {AXES.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="px-1 text-[11px] text-muted-foreground">{selectedAxis?.hint}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleAdd} disabled={create.isPending || update.isPending || !form.name.trim()}>
              {create.isPending || update.isPending
                ? "Saving..."
                : editingId !== null ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
