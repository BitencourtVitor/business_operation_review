"use client"

import { useState } from "react"
import Link from "next/link"
import * as Lucide from "lucide-react"
import { ArrowLeft, Plus, Trash2, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import {
  useCategories, useCategoryMutations,
  useAccountMappings, useSetAccountMapping,
  useVendorMappings, useSetVendorMapping,
} from "@/hooks/use-budget-taxonomy"
import type { ProjectType, Category } from "@/services/budget-taxonomy.service"

const COMPANIES = ["framing", "hvac", "pcg"] as const
const TABS = ["categories", "accounts", "subcontractors"] as const
type Tab = (typeof TABS)[number]

// Money input: right-to-left cents mask. Typing "1000" -> "$ 10.00", "5" -> "$ 0.05".
// `value` is the stored dollar amount as a string (e.g. "10" or "12500.5").
function MoneyInput({ value, onChange, className, placeholder = "0.00" }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string
}) {
  const cents = value === "" ? 0 : Math.round(Number(value) * 100)
  const display = value === ""
    ? ""
    : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
      <input
        value={display}
        inputMode="numeric"
        placeholder={placeholder}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, "")
          if (digits === "") { onChange(""); return }
          onChange(String(parseInt(digits, 10) / 100))
        }}
        className="h-7 w-full rounded-md border border-input bg-transparent pl-5 pr-2 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring dark:bg-input/30"
      />
    </div>
  )
}

// Curated default set; search filters all lucide icons.
const CURATED_ICONS = [
  "Frame", "LayoutGrid", "Layers", "PanelTop", "SquareStack", "Ruler", "Columns3",
  "Hammer", "Wrench", "HardHat", "Home", "Building2", "Building", "Warehouse",
  "Package", "Boxes", "Truck", "PaintBucket", "Paintbrush", "Grid3x3", "Trees",
  "Droplets", "Zap", "Wind", "Triangle", "BrickWall", "DoorOpen", "Fence", "Construction",
]
const ALL_ICON_NAMES = Object.keys(Lucide).filter(
  k => /^[A-Z]/.test(k) && !["Icon", "LucideIcon", "createLucideIcon"].includes(k)
)

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const Cur = value ? (Lucide as unknown as Record<string, React.ElementType>)[value] : null
  const names = q.trim()
    ? ALL_ICON_NAMES.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 56)
    : CURATED_ICONS
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setQ("") }}>
      <PopoverTrigger className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        {Cur ? <Cur className="h-4 w-4" /> : <span className="text-[9px]">icon</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icon…"
          className="mb-2 h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto no-scrollbar">
          {names.map(n => {
            const I = (Lucide as unknown as Record<string, React.ElementType>)[n]
            return (
              <button key={n} title={n} onClick={() => { onChange(n); setOpen(false) }}
                className={cn("flex h-7 w-7 items-center justify-center rounded hover:bg-muted", value === n && "bg-primary/15 text-primary")}>
                <I className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Categories tab ───────────────────────────────────────────────────────────

function CategoriesTab({ projectType }: { projectType: ProjectType }) {
  const { data: cats, isLoading } = useCategories(projectType)
  const { create, update, remove } = useCategoryMutations()
  const [newName, setNewName] = useState("")
  const [newMax, setNewMax] = useState("")
  const [newIcon, setNewIcon] = useState("")

  if (isLoading) return <Loading />

  return (
    <div className="flex flex-col gap-3">
      {/* Add new */}
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-2">
        <IconPicker value={newIcon} onChange={setNewIcon} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category name"
          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        <MoneyInput value={newMax} onChange={setNewMax} className="w-36" />
        <button
          disabled={!newName.trim() || create.isPending}
          onClick={() => create.mutate({ project_type: projectType, name: newName.trim(), icon: newIcon || "Tag", default_max: newMax === "" ? null : Number(newMax) }, { onSuccess: () => { setNewName(""); setNewMax(""); setNewIcon("") } })}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </div>

      {/* List */}
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60">
        {(cats ?? []).map(cat => (
          <CategoryRow key={cat.id} cat={cat}
            onSave={(b) => update.mutate({ id: cat.id, body: b })}
            onDelete={() => remove.mutate(cat.id)} />
        ))}
        {(cats ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>}
      </div>
    </div>
  )
}

function CategoryRow({ cat, onSave, onDelete }: { cat: Category; onSave: (b: Partial<Category>) => void; onDelete: () => void }) {
  const [name, setName] = useState(cat.name)
  const [icon, setIcon] = useState(cat.icon)
  const [max, setMax] = useState(cat.default_max != null ? String(cat.default_max) : "")
  const dirty = name !== cat.name || icon !== cat.icon || (max === "" ? cat.default_max != null : Number(max) !== cat.default_max)

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <IconPicker value={icon} onChange={setIcon} />
      <input value={name} onChange={e => setName(e.target.value)}
        className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
      <MoneyInput value={max} onChange={setMax} className="w-32" />
      <button disabled={!dirty}
        onClick={() => onSave({ name, icon, default_max: max === "" ? null : Number(max), sort_order: cat.sort_order, active: cat.active })}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDelete}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Mapping tabs (accounts / subcontractors) ─────────────────────────────────

const NONE = "__none__"

function CategorySelect({ cats, value, onChange }: { cats: Category[]; value: string | null; onChange: (v: string | null) => void }) {
  const current = value ? cats.find(c => c.id === value)?.name : null
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="h-7 w-48 text-xs">
        <span className={cn("flex-1 truncate text-left", !current && "text-muted-foreground")}>
          {current ?? "Unmapped"}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— unmapped —</SelectItem>
        {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function AccountsTab({ company, projectType }: { company: string; projectType: ProjectType }) {
  const { data: cats } = useCategories(projectType)
  const { data: rows, isLoading } = useAccountMappings(company, projectType)
  const setMap = useSetAccountMapping()
  const [filter, setFilter] = useState("")
  if (isLoading) return <Loading />
  const list = (rows ?? []).filter(r => !filter || r.account_name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="flex flex-col gap-3">
      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter accounts…"
        className="h-8 w-64 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60">
        {list.map(r => (
          <div key={r.account_ref_id} className="flex items-center gap-3 px-3 py-1.5">
            <span className="flex-1 truncate text-sm" title={r.account_name}>{r.account_name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{r.account_type}</span>
            <CategorySelect cats={cats ?? []} value={r.category_id}
              onChange={(v) => setMap.mutate({ company, account_ref_id: r.account_ref_id, project_type: projectType, category_id: v })} />
          </div>
        ))}
        {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts.</p>}
      </div>
    </div>
  )
}

function SubcontractorsTab({ company, projectType }: { company: string; projectType: ProjectType }) {
  const { data: cats } = useCategories(projectType)
  const { data: rows, isLoading } = useVendorMappings(company, projectType)
  const setMap = useSetVendorMapping()
  const [filter, setFilter] = useState("")
  if (isLoading) return <Loading />
  const list = (rows ?? []).filter(r => !filter || r.display_name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="flex flex-col gap-3">
      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter subcontractors…"
        className="h-8 w-64 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60">
        {list.map(r => (
          <div key={r.vendor_id} className="flex items-center gap-3 px-3 py-1.5">
            <span className="flex-1 truncate text-sm" title={r.display_name}>{r.display_name}</span>
            <CategorySelect cats={cats ?? []} value={r.category_id}
              onChange={(v) => setMap.mutate({ company, vendor_id: r.vendor_id, project_type: projectType, category_id: v })} />
          </div>
        ))}
        {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No subcontractors (vendors on POs).</p>}
      </div>
    </div>
  )
}

function Loading() {
  return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BudgetManagePage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role)) || myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [projectType, setProjectType] = useState<ProjectType>("building")
  const [tab, setTab] = useState<Tab>("categories")

  if (!canManage) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">You don&apos;t have permission to manage budget settings.</div>
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/budget-control" className="flex h-8 w-8 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Budget — Categories &amp; Mapping</h1>
          <p className="text-sm text-muted-foreground">Define categories per project type and map accounts and subcontractors</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center rounded-lg border border-input bg-transparent text-xs dark:bg-input/30 overflow-hidden">
          {COMPANIES.map(co => (
            <button key={co} onClick={() => setCompany(co)}
              className={cn("flex h-full items-center px-3 font-medium uppercase transition-colors", company === co ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{co}</button>
          ))}
        </div>
        <div className="flex h-8 items-center rounded-lg border border-input bg-transparent text-xs dark:bg-input/30 overflow-hidden">
          {(["building", "house"] as const).map(t => (
            <button key={t} onClick={() => setProjectType(t)}
              className={cn("flex h-full items-center px-3 font-medium capitalize transition-colors", projectType === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative px-3 py-2 text-sm font-medium capitalize transition-colors",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-2">
        {tab === "categories" && <CategoriesTab projectType={projectType} />}
        {tab === "accounts" && <AccountsTab company={company} projectType={projectType} />}
        {tab === "subcontractors" && <SubcontractorsTab company={company} projectType={projectType} />}
      </div>
    </div>
  )
}
