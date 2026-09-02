"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  useAtlasDocCategories, useCreateDocCategory, useDeleteDocCategory,
} from "@/hooks/use-atlas"
import { ArrowLeft, Layers, Plus, Search, Trash2, X } from "lucide-react"
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
  { value: "lot", label: "Lot" },
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

const BUILD_LABEL: Record<string, string> = {
  "": "Any",
  building: "Building",
  lot: "Lot",
  house: "House",
}

export default function AtlasDefinitionsPage() {
  const { data: rows = [], isLoading } = useAtlasDocCategories()
  const create = useCreateDocCategory()
  const remove = useDeleteDocCategory()

  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState({ client: "", buildType: "", name: "", axis: "none", defaultSlot: true })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      [r.client, r.buildType, r.name, AXIS_LABEL[r.axis]]
        .some(v => String(v ?? "").toLowerCase().includes(q)))
  }, [rows, search])

  function handleAdd() {
    if (!form.name.trim()) return
    create.mutate(form, {
      onSuccess: () => {
        setForm({ client: "", buildType: "", name: "", axis: "none", defaultSlot: true })
        setAddOpen(false)
      },
    })
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
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Build type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Subcategory</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {search ? "No results found" : "No categories yet"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">{row.id}</TableCell>
                    <TableCell className="text-sm">{row.client || "Any client"}</TableCell>
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
                    <TableCell className="text-sm">
                      {row.defaultSlot ? (
                        <span className="text-muted-foreground">Every jobsite</span>
                      ) : (
                        <span className="text-muted-foreground/60">On request</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(row.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={v => {
          setAddOpen(v)
          if (!v) setForm({ client: "", buildType: "", name: "", axis: "none", defaultSlot: true })
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              placeholder="Category name — Trusses, Wall Panels…"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
            />
            <Input
              placeholder="Client (leave empty for every client)"
              value={form.client}
              onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
            />
            <NativeSelect
              value={form.buildType}
              onChange={e => setForm(f => ({ ...f, buildType: e.target.value }))}
            >
              {BUILD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </NativeSelect>
            <div className="space-y-1">
              <NativeSelect
                value={form.axis}
                onChange={e => setForm(f => ({ ...f, axis: e.target.value }))}
              >
                {AXES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </NativeSelect>
              <p className="px-1 text-[11px] text-muted-foreground">{selectedAxis?.hint}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={create.isPending || !form.name.trim()}>
              {create.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
