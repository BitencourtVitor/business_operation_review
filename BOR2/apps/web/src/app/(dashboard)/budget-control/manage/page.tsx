"use client"

import { useState } from "react"
import Link from "next/link"
import * as Lucide from "lucide-react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import {
  ArrowLeft, Plus, Trash2, Loader2, Check, Pencil, ChevronDown,
  Building2, Home, ArrowRightLeft, Users, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Accordion, AccordionItem, AccordionContent } from "@/components/ui/accordion"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import {
  useCategories, useCategoryMutations,
  useVendorMappings, useSetVendorMapping,
} from "@/hooks/use-budget-taxonomy"
import type { ProjectType, Category } from "@/services/budget-taxonomy.service"
import { Segmented } from "../components/Segmented"

const COMPANIES: { value: string; label: string; logo: string }[] = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac", label: "HVAC", logo: "/images/sublogo_hvac.png" },
  { value: "pcg", label: "PCG", logo: "/images/sublogo_pcg.png" },
]

const FALLBACK_ICON = "Shapes"
const reg = Lucide as unknown as Record<string, React.ElementType>

function iconEl(name: string, className = "h-3.5 w-3.5 shrink-0 text-muted-foreground") {
  const I = reg[name || FALLBACK_ICON] ?? reg[FALLBACK_ICON]
  return <I className={className} />
}

type Sub = { vendor_id: string; display_name: string }

// ── Money input: $ fixed prefix, right-to-left cents mask ─────────────────────
function MoneyInput({ value, onChange, className, placeholder = "0.00" }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string
}) {
  const cents = value === "" ? 0 : Math.round(Number(value) * 100)
  const display = value === "" ? "" : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
      <input
        value={display} inputMode="numeric" placeholder={placeholder}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, "")
          onChange(digits === "" ? "" : String(parseInt(digits, 10) / 100))
        }}
        className="h-7 w-full rounded-md border border-input bg-transparent pl-5 pr-2 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring dark:bg-input/30"
      />
    </div>
  )
}

// ── Icon picker ───────────────────────────────────────────────────────────────
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
  const Cur = reg[value || FALLBACK_ICON] ?? reg[FALLBACK_ICON]
  const names = q.trim() ? ALL_ICON_NAMES.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 56) : CURATED_ICONS
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setQ("") }}>
      <PopoverTrigger className={cn(
        "flex h-7 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-transparent transition-colors hover:text-foreground dark:bg-input/30",
        value ? "text-foreground" : "text-muted-foreground"
      )}>
        <Cur className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icon…"
          className="mb-2 h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto no-scrollbar">
          {names.map(n => {
            const I = reg[n]
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

// ── Move sub to another category (or remove) ──────────────────────────────────
function SubRow({ sub, cats, currentCatId, onMove }: {
  sub: Sub; cats: Category[]; currentCatId: string | null; onMove: (target: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const targets = cats.filter(c => c.id !== currentCatId)
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/30", open && "bg-muted/30")}>
      <span className="flex-1 truncate text-sm" title={sub.display_name}>{sub.display_name}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
          <ArrowRightLeft className="h-3 w-3" /> Move
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Move to</p>
          <div className="flex max-h-48 flex-col overflow-y-auto no-scrollbar">
            {targets.map(c => (
              <button key={c.id} onClick={() => { onMove(c.id); setOpen(false) }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent">
                {iconEl(c.icon, "h-3.5 w-3.5 shrink-0 text-muted-foreground")}
                {c.name}
              </button>
            ))}
          </div>
          {currentCatId && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <button onClick={() => { onMove(null); setOpen(false) }}
                className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent">Remove from category</button>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Category accordion item ───────────────────────────────────────────────────
function CategoryItem({ cat, cats, subs, onSave, onDelete, onMove }: {
  cat: Category; cats: Category[]; subs: Sub[]
  onSave: (b: Partial<Category>) => void; onDelete: () => void
  onMove: (vendorId: string, target: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)
  const [icon, setIcon] = useState(cat.icon)
  const [max, setMax] = useState(cat.default_max != null ? String(cat.default_max) : "")
  const Head = reg[cat.icon || FALLBACK_ICON] ?? reg[FALLBACK_ICON]
  const maxDisplay = cat.default_max != null
    ? `$${cat.default_max.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—"

  function reset() { setName(cat.name); setIcon(cat.icon); setMax(cat.default_max != null ? String(cat.default_max) : "") }
  function save() { onSave({ name, icon, default_max: max === "" ? null : Number(max), sort_order: cat.sort_order, active: cat.active }); setEditing(false) }
  function cancel() { reset(); setEditing(false) }

  return (
    <AccordionItem value={cat.id}>
      {/* Header — interactive controls live OUTSIDE the chevron trigger */}
      <div className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/30">
        {editing ? (
          <>
            <IconPicker value={icon} onChange={setIcon} />
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
            <MoneyInput value={max} onChange={setMax} className="w-28 shrink-0" />
            <button onClick={onDelete} title="Delete"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={cancel} title="Cancel"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
            <button onClick={save} title="Save"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-500 transition-colors hover:bg-emerald-500/10">
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Head className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm font-medium">{cat.name}</span>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{maxDisplay}</span>
            <button onClick={() => setEditing(true)} title="Edit name / icon / max"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <AccordionPrimitive.Header className="flex shrink-0">
          <AccordionPrimitive.Trigger className="group flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronDown className="h-4 w-4 transition-transform group-aria-expanded:rotate-180" />
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
      </div>

      <AccordionContent className="px-3">
        {subs.length === 0 ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-1.5 text-center">
            <Users className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground/60">No subcontractors in this category yet.</p>
          </div>
        ) : (
          <div className="flex max-h-64 flex-col divide-y divide-border/30 overflow-y-auto no-scrollbar">
            {subs.map(s => (
              <SubRow key={s.vendor_id} sub={s} cats={cats} currentCatId={cat.id} onMove={(t) => onMove(s.vendor_id, t)} />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

// ── Manager ───────────────────────────────────────────────────────────────────
function CategoriesManager({ company, projectType, showNew, onCloseNew }: {
  company: string; projectType: ProjectType; showNew: boolean; onCloseNew: () => void
}) {
  const { data: cats, isLoading: catsLoading } = useCategories(projectType)
  const { create, update, remove } = useCategoryMutations()
  const { data: vendors, isLoading: vLoading } = useVendorMappings(company, projectType)
  const setVendor = useSetVendorMapping()

  const [newName, setNewName] = useState("")
  const [newMax, setNewMax] = useState("")
  const [newIcon, setNewIcon] = useState("")
  const [uncatOpen, setUncatOpen] = useState(true)

  if (catsLoading || vLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  const allCats = cats ?? []
  const allVendors = vendors ?? []
  const subsByCat = (id: string): Sub[] => allVendors.filter(v => v.category_id === id).map(v => ({ vendor_id: v.vendor_id, display_name: v.display_name }))
  const uncategorized: Sub[] = allVendors.filter(v => !v.category_id).map(v => ({ vendor_id: v.vendor_id, display_name: v.display_name }))
  const move = (vendorId: string, categoryId: string | null) =>
    setVendor.mutate({ company, vendor_id: vendorId, project_type: projectType, category_id: categoryId })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Add new category — shown only when "+ New" is clicked */}
      {showNew && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-2">
          <IconPicker value={newIcon} onChange={setNewIcon} />
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category name" autoFocus
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
          <MoneyInput value={newMax} onChange={setNewMax} className="w-36" />
          <button
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate({ project_type: projectType, name: newName.trim(), icon: newIcon || FALLBACK_ICON, default_max: newMax === "" ? null : Number(newMax) }, { onSuccess: () => { setNewName(""); setNewMax(""); setNewIcon(""); onCloseNew() } })}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </button>
          <button onClick={() => { setNewName(""); setNewMax(""); setNewIcon(""); onCloseNew() }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Content fills the viewport: categories (capped) + uncategorized (fills, scrolls inside) */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {allCats.length === 0 ? (
          <p className="shrink-0 px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <Accordion className="max-h-[45%] shrink-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-card/60 no-scrollbar">
            {allCats.map(cat => (
              <CategoryItem key={cat.id} cat={cat} cats={allCats} subs={subsByCat(cat.id)}
                onSave={(b) => update.mutate({ id: cat.id, body: b })}
                onDelete={() => remove.mutate(cat.id)}
                onMove={move} />
            ))}
          </Accordion>
        )}

        {/* Subcontractors without category — fills remaining height, scrolls inside */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/60">
          <button onClick={() => setUncatOpen(o => !o)}
            className="flex shrink-0 items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/30">
            <span className="font-semibold">Subcontractors without category</span>
            <span className="text-xs font-normal text-muted-foreground">· {uncategorized.length}</span>
            <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", uncatOpen && "rotate-180")} />
          </button>
          {uncatOpen && (
            uncategorized.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 border-t border-border/60 text-center">
                <Check className="h-6 w-6 text-emerald-500/50" />
                <p className="text-[11px] text-muted-foreground/60">All subcontractors are categorized.</p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col divide-y divide-border/30 overflow-y-auto no-scrollbar border-t border-border/60 px-3">
                {uncategorized.map(s => (
                  <SubRow key={s.vendor_id} sub={s} cats={allCats} currentCatId={null} onMove={(t) => move(s.vendor_id, t)} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BudgetManagePage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role)) || myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [projectType, setProjectType] = useState<ProjectType>("building")
  const [showNew, setShowNew] = useState(false)

  if (!canManage) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">You don&apos;t have permission to manage budget settings.</div>
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header — title left, navbars right (settings pattern) */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/budget-control"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Budget Control</h1>
            <p className="text-sm text-muted-foreground">Categorization · define categories per project type and assign subcontractors</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <Segmented
            label="Company"
            value={company}
            onChange={setCompany}
            options={COMPANIES.map(c => ({
              value: c.value,
              label: c.label,
              // eslint-disable-next-line @next/next/no-img-element
              icon: <img src={c.logo} alt="" className="h-3.5 w-3.5 object-contain" />,
            }))}
          />
          <Segmented
            label="Project Type"
            value={projectType}
            onChange={setProjectType}
            options={[
              { value: "building", label: "Building", icon: <Building2 className="h-3.5 w-3.5" /> },
              { value: "house", label: "House", icon: <Home className="h-3.5 w-3.5" /> },
            ]}
          />
          <button onClick={() => setShowNew(v => !v)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <CategoriesManager company={company} projectType={projectType} showNew={showNew} onCloseNew={() => setShowNew(false)} />
      </div>
    </div>
  )
}
