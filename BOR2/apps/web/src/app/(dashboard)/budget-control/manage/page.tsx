"use client"

import { useState } from "react"
import Link from "next/link"
import * as Lucide from "lucide-react"
import { ArrowLeft, Plus, Trash2, Loader2, Check, Building2, Home, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
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

function Loading() {
  return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
}

// ── Category accordion item (edit + its subcontractors) ───────────────────────
function CategoryItem({ cat, subs, onSave, onDelete, onUnassign }: {
  cat: Category
  subs: { vendor_id: string; display_name: string }[]
  onSave: (b: Partial<Category>) => void
  onDelete: () => void
  onUnassign: (vendorId: string) => void
}) {
  const [name, setName] = useState(cat.name)
  const [icon, setIcon] = useState(cat.icon)
  const [max, setMax] = useState(cat.default_max != null ? String(cat.default_max) : "")
  const dirty = name !== cat.name || icon !== cat.icon || (max === "" ? cat.default_max != null : Number(max) !== cat.default_max)
  const Head = reg[cat.icon || FALLBACK_ICON] ?? reg[FALLBACK_ICON]

  return (
    <AccordionItem value={cat.id}>
      <AccordionTrigger className="px-3">
        <span className="flex items-center gap-2">
          <Head className="h-4 w-4 text-muted-foreground" />
          <span>{cat.name}</span>
          {cat.default_max != null && (
            <span className="text-xs font-normal text-muted-foreground">· max ${cat.default_max.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          )}
          <span className="text-xs font-normal text-muted-foreground/60">· {subs.length} sub{subs.length === 1 ? "" : "s"}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-3">
        <div className="flex flex-col gap-3 pb-1">
          {/* Edit row */}
          <div className="flex items-center gap-2">
            <IconPicker value={icon} onChange={setIcon} />
            <input value={name} onChange={e => setName(e.target.value)}
              className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
            <MoneyInput value={max} onChange={setMax} className="w-36" />
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
          {/* Subs in this category */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Subcontractors</span>
            {subs.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground/50">None assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {subs.map(s => (
                  <span key={s.vendor_id} className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-0.5 pl-2 pr-1 text-[11px]">
                    {s.display_name}
                    <button onClick={() => onUnassign(s.vendor_id)} className="text-muted-foreground/60 hover:text-red-500" title="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// ── Manager (single view) ─────────────────────────────────────────────────────
function CategoriesManager({ company, projectType }: { company: string; projectType: ProjectType }) {
  const { data: cats, isLoading: catsLoading } = useCategories(projectType)
  const { create, update, remove } = useCategoryMutations()
  const { data: vendors, isLoading: vLoading } = useVendorMappings(company, projectType)
  const setVendor = useSetVendorMapping()

  const [newName, setNewName] = useState("")
  const [newMax, setNewMax] = useState("")
  const [newIcon, setNewIcon] = useState("")

  if (catsLoading || vLoading) return <Loading />

  const allCats = cats ?? []
  const allVendors = vendors ?? []
  const subsByCat = (id: string) => allVendors.filter(v => v.category_id === id).map(v => ({ vendor_id: v.vendor_id, display_name: v.display_name }))
  const uncategorized = allVendors.filter(v => !v.category_id)

  const assign = (vendorId: string, categoryId: string | null) =>
    setVendor.mutate({ company, vendor_id: vendorId, project_type: projectType, category_id: categoryId })

  return (
    <div className="flex flex-col gap-4">
      {/* Add new category */}
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-2">
        <IconPicker value={newIcon} onChange={setNewIcon} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category name"
          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        <MoneyInput value={newMax} onChange={setNewMax} className="w-36" />
        <button
          disabled={!newName.trim() || create.isPending}
          onClick={() => create.mutate({ project_type: projectType, name: newName.trim(), icon: newIcon || FALLBACK_ICON, default_max: newMax === "" ? null : Number(newMax) }, { onSuccess: () => { setNewName(""); setNewMax(""); setNewIcon("") } })}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </div>

      {/* Categories */}
      {allCats.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <Accordion className="rounded-lg border border-border/60">
          {allCats.map(cat => (
            <CategoryItem key={cat.id} cat={cat} subs={subsByCat(cat.id)}
              onSave={(b) => update.mutate({ id: cat.id, body: b })}
              onDelete={() => remove.mutate(cat.id)}
              onUnassign={(vid) => assign(vid, null)} />
          ))}
        </Accordion>
      )}

      {/* Subcontractors without category */}
      <Accordion className="rounded-lg border border-border/60">
        <AccordionItem value="uncategorized">
          <AccordionTrigger className="px-3">
            <span className="flex items-center gap-2">
              <span className="font-semibold">Subcontractors without category</span>
              <span className="text-xs font-normal text-muted-foreground">· {uncategorized.length}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3">
            {uncategorized.length === 0 ? (
              <p className="py-1 text-[11px] italic text-muted-foreground/50">All subcontractors are categorized.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border/30">
                {uncategorized.map(v => (
                  <div key={v.vendor_id} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1 truncate text-sm" title={v.display_name}>{v.display_name}</span>
                    <Select onValueChange={(cid) => assign(v.vendor_id, cid as string)}>
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <span className="flex-1 truncate text-left text-muted-foreground">Assign category…</span>
                      </SelectTrigger>
                      <SelectContent>
                        {allCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
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
          <h1 className="text-xl font-semibold tracking-tight">Budget — Categories &amp; Subcontractors</h1>
          <p className="text-sm text-muted-foreground">Define categories per project type and assign subcontractors to them</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
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
          value={projectType}
          onChange={setProjectType}
          options={[
            { value: "building", label: "Building", icon: <Building2 className="h-3.5 w-3.5" /> },
            { value: "house", label: "House", icon: <Home className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-2">
        <CategoriesManager company={company} projectType={projectType} />
      </div>
    </div>
  )
}
