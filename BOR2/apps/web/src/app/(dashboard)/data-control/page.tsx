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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import {
  useCreateForecast,
  useDeleteForecast,
  useForecast,
} from "@/hooks/use-forecast"
import {
  useCatalogTable,
  useAddCatalogItem,
  useDeleteCatalogItem,
} from "@/hooks/use-catalog"
import type { CatalogTable } from "@/services/catalog.service"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NewProjectCard, ProjectCard, type ViewTab } from "@/components/features/data-control/project-card"
import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { Building2, CircleDot, Database, FilePlus2, FileText, Info, MapPin, Pencil, Plus, Search, SlidersHorizontal, Trash2, Truck, X } from "lucide-react"
import React, { useMemo, useState } from "react"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES: ForecastStatus[] = ["planned", "active", "completed", "cancelled"]
const PROJECT_TYPES = ["Building", "Lot", "House"]

const STATUS_BADGE: Record<ForecastStatus, string> = {
  planned: "secondary",
  active: "default",
  completed: "outline",
  cancelled: "destructive",
}

function fmtDate(val: string | null | undefined) {
  if (!val) return "—"
  const [y, m, d] = val.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtCurrency(val: number) {
  if (!val) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val)
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = Omit<ForecastProject, "id" | "createdAt" | "updatedAt" | "fieldwire" | "machines" | "contractSteps">

const EMPTY_FORM: FormState = {
  company: "framing",
  name: "",
  status: "planned",
  startDate: "",
  endDate: "",
  contractValue: 0,
  team: "",
  qbTime: false,
  cliente: "",
  jobSite: "",
  type: "",
  loteBld: "",
  address: "",
  obs: "",
  hvac: false,
  buildertrend: false,
  storage: false,
  machineProvider: "",
  previousBeamsDate: null,
  previousStartDate: null,
  previousEndDate: null,
}

function dateVal(v: string | null | undefined): string {
  if (!v) return ""
  return v.slice(0, 10)
}

// Builds a searchable string from a date value covering multiple formats
function dateSearchStr(v: string | null | undefined): string {
  if (!v || v.length < 10) return ""
  const iso = v.slice(0, 10)
  const [y, m, d] = iso.split("-").map(Number)
  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  const mmddyyyy = `${mm}/${dd}/${y}`
  const localized = new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return `${iso} ${mmddyyyy} ${localized}`.toLowerCase()
}

const STATUS_SEARCH: Record<string, string> = {
  active:    "open",
  planned:   "not started",
  completed: "closed",
  cancelled: "cancelled",
}

const STATUS_OPTS: { value: ForecastStatus; label: string }[] = [
  { value: "planned",   label: "Not started" },
  { value: "active",    label: "Open"        },
  { value: "completed", label: "Closed"      },
]

// ─── Delete dialog ────────────────────────────────────────────────────────────

function DeleteDialog({
  project, onClose, onConfirm, deleting,
}: {
  project: ForecastProject | null
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <Dialog open={!!project} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Delete project?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete <span className="font-medium text-foreground">{project?.name}</span>. This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Catalog tab ──────────────────────────────────────────────────────────────

const CATALOG_TABS: { key: CatalogTable; label: string; cols: { field: string; label: string }[] }[] = [
  { key: "workforce",      label: "Workforce",          cols: [{ field: "name",               label: "Name"                }] },
  { key: "providers",      label: "Machine Providers",  cols: [{ field: "name",               label: "Name"                }] },
  { key: "contract-steps", label: "Contract Steps",     cols: [{ field: "step",               label: "Step"                }] },
  {
    key: "fieldwire", label: "Fieldwire Docs",
    cols: [
      { field: "category",       label: "Category" },
      { field: "document",       label: "Document" },
      { field: "where_location", label: "Where"    },
      { field: "notes",          label: "Notes"    },
    ],
  },
  {
    key: "machines", label: "Machines",
    cols: [
      { field: "category",           label: "Category"   },
      { field: "subcategory",        label: "Subcategory"},
      { field: "equipment_category", label: "Equip. Cat."},
      { field: "title",              label: "Title"      },
    ],
  },
]

function CatalogSection() {
  const [activeTable, setActiveTable] = useState<CatalogTable>("workforce")
  const tableDef = CATALOG_TABS.find(t => t.key === activeTable)!
  const { data: rows = [], isLoading } = useCatalogTable(activeTable)
  const addMutation    = useAddCatalogItem(activeTable)
  const deleteMutation = useDeleteCatalogItem(activeTable)
  const [form, setForm] = useState<Record<string, string>>({})

  // reset form when table changes
  useMemo(() => setForm({}), [activeTable])

  function handleAdd() {
    if (tableDef.cols.some(c => !form[c.field]?.trim())) return
    addMutation.mutate(form, { onSuccess: () => setForm({}) })
  }

  return (
    <div className="space-y-4">
      {/* Table selector */}
      <div className="flex flex-wrap gap-2">
        {CATALOG_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTable(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTable === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Add to {tableDef.label}</p>
        <div className="flex flex-wrap gap-2">
          {tableDef.cols.map(c => (
            <Input
              key={c.field}
              placeholder={c.label}
              value={form[c.field] ?? ""}
              onChange={e => setForm(f => ({ ...f, [c.field]: e.target.value }))}
              className="h-8 flex-1 min-w-[120px] text-sm"
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
            />
          ))}
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={addMutation.isPending || tableDef.cols.some(c => !form[c.field]?.trim())}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />Add
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              {tableDef.cols.map(c => <TableHead key={c.field}>{c.label}</TableHead>)}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={tableDef.cols.length + 2} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={tableDef.cols.length + 2} className="text-center py-8 text-muted-foreground">No items</TableCell></TableRow>
            ) : rows.map((row, i) => (
              <TableRow key={String(row.id ?? i)}>
                <TableCell className="text-xs text-muted-foreground">{String(row.id)}</TableCell>
                {tableDef.cols.map(c => (
                  <TableCell key={c.field} className="text-sm">{String(row[c.field] ?? "—")}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ─── View mode tabs ───────────────────────────────────────────────────────────

const VIEW_TABS: { key: ViewTab; label: string; icon: React.ReactNode }[] = [
  { key: "info",      label: "Info & Dates", icon: <Info              className="h-3.5 w-3.5" /> },
  { key: "fieldwire", label: "Fieldwire",    icon: <img src="/images/icon_fieldwire.png" alt="Fieldwire" className="h-3.5 w-3.5 object-contain" /> },
  { key: "machines",  label: "Machines",     icon: <Truck             className="h-3.5 w-3.5" /> },
  { key: "contract",  label: "Contract",     icon: <FileText          className="h-3.5 w-3.5" /> },
  { key: "optionals", label: "Optionals",    icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
]

// ─── New Project section ──────────────────────────────────────────────────────

function NewProjectSection({ onCreated }: { onCreated: () => void }) {
  const createMutation = useCreateForecast()
  const { data: projects } = useForecast()
  const availableClients  = useMemo(() => Array.from(new Set(projects?.map(p => p.cliente).filter(Boolean) as string[])).sort(), [projects])
  const availableJobSites = useMemo(() => Array.from(new Set(projects?.map(p => p.jobSite).filter(Boolean)  as string[])).sort(), [projects])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New Project</h1>
        <p className="text-sm text-muted-foreground">Fill in the fields below and click Create</p>
      </div>
      <NewProjectCard
        availableClients={availableClients}
        availableJobSites={availableJobSites}
        saving={createMutation.isPending}
        onCancel={onCreated}
        onSave={async data => {
          await createMutation.mutateAsync({
            ...data,
            company: "framing",
            name: "",
            startDate: "",
            endDate: "",
            contractValue: 0,
            previousBeamsDate: data.previousBeamsDate || null,
            previousStartDate: data.previousStartDate || null,
            previousEndDate:   data.previousEndDate   || null,
          })
          onCreated()
        }}
      />
    </div>
  )
}

// ─── Edit Projects section ────────────────────────────────────────────────────

function EditProjectSection({
  clientFilter,
  jobSiteFilter,
  statusFilter,
  onClientFilter,
  onJobSiteFilter,
  onStatusFilter,
}: {
  clientFilter:    string
  jobSiteFilter:   string
  statusFilter:    ForecastStatus | "all"
  onClientFilter:  (v: string) => void
  onJobSiteFilter: (v: string) => void
  onStatusFilter:  (v: ForecastStatus | "all") => void
}) {
  const { data: projects, isLoading } = useForecast()
  const deleteMutation = useDeleteForecast()

  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewTab>("info")
  const [deletingProject, setDeletingProject] = useState<ForecastProject | null>(null)

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter(p => {
      if (clientFilter  !== "all" && p.cliente !== clientFilter)  return false
      if (jobSiteFilter !== "all" && p.jobSite !== jobSiteFilter) return false
      if (statusFilter  !== "all" && p.status  !== statusFilter)  return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [
          p.cliente,
          p.jobSite,
          p.type,
          p.loteBld,
          p.address,
          p.obs,
          p.team,
          STATUS_SEARCH[p.status] ?? p.status,
          dateSearchStr(p.previousBeamsDate),
          dateSearchStr(p.previousStartDate),
          dateSearchStr(p.previousEndDate),
        ].map(v => (v || "").toLowerCase())
        if (!haystack.some(v => v.includes(q))) return false
      }
      return true
    })
  }, [projects, clientFilter, jobSiteFilter, statusFilter, search])

  const availableClients  = useMemo(() => Array.from(new Set(projects?.map(p => p.cliente).filter(Boolean) as string[])).sort(), [projects])
  const availableJobSites = useMemo(() => Array.from(new Set(projects?.map(p => p.jobSite).filter(Boolean)  as string[])).sort(), [projects])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Edit Project</h1>
          <p className="text-sm text-muted-foreground">Select a view and edit project details inline.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {VIEW_TABS.map(t => (
              <button
                key={t.key}
                title={t.label}
                onClick={() => setViewMode(t.key)}
                className={`flex items-center justify-center rounded-md p-1.5 transition-all ${viewMode === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.icon}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`h-7 text-xs w-44 pl-7 ${search ? "pr-7" : ""}`}
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
        </div>
      </div>

      {/* Card list */}
      <div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No projects found</p>
        ) : filtered.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            forcedTab={viewMode}
            availableClients={availableClients}
            availableJobSites={availableJobSites}
            onDelete={() => setDeletingProject(p)}
          />
        ))}
      </div>

      <DeleteDialog
        project={deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={async () => { await deleteMutation.mutateAsync(deletingProject!.id); setDeletingProject(null) }}
        deleting={deleteMutation.isPending}
      />
    </div>
  )
}

// ─── Inner sidebar nav ────────────────────────────────────────────────────────

type DCSection = "new-project" | "edit-project" | "catalog"

const DC_GROUPS: { label: string; items: { key: DCSection; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Options",
    items: [
      { key: "new-project",  label: "New Project",    icon: FilePlus2 },
      { key: "edit-project", label: "Edit Project",   icon: Pencil    },
      { key: "catalog",      label: "Catalog Tables", icon: Database  },
    ],
  },
]

function DataControlSidebar({
  active,
  onSelect,
  clientFilter,
  jobSiteFilter,
  statusFilter,
  clientOpts,
  jobSiteOpts,
  onClientFilter,
  onJobSiteFilter,
  onStatusFilter,
}: {
  active:          DCSection
  onSelect:        (s: DCSection) => void
  clientFilter:    string
  jobSiteFilter:   string
  statusFilter:    ForecastStatus | "all"
  clientOpts:      string[]
  jobSiteOpts:     string[]
  onClientFilter:  (v: string) => void
  onJobSiteFilter: (v: string) => void
  onStatusFilter:  (v: ForecastStatus | "all") => void
}) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
          Forecast Data Controls
        </p>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {DC_GROUPS.map(g => (
          <div key={g.label} className="mb-1">
            <p className="mb-0.5 px-4 pt-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {g.label}
            </p>
            <div className="px-2">
              {g.items.map(item => {
                const Icon = item.icon
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Edit Filters — only visible in edit-project mode */}
        {active === "edit-project" && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <div className="px-3 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-1">
                Edit Filters
              </p>

              {/* Client filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Client</p>
                <Select
                  value={clientFilter === "all" ? "" : clientFilter}
                  onValueChange={v => onClientFilter(v || "all")}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOpts.filter(c => c !== "all").map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Job site filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Job Site</p>
                <Select
                  value={jobSiteFilter === "all" ? "" : jobSiteFilter}
                  onValueChange={v => onJobSiteFilter(v || "all")}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobSiteOpts.filter(j => j !== "all").map(j => (
                      <SelectItem key={j} value={j}>{j}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Status</p>
                <Select
                  value={statusFilter === "all" ? "" : (STATUS_OPTS.find(o => o.value === statusFilter)?.label ?? "")}
                  onValueChange={v => {
                    const opt = STATUS_OPTS.find(o => o.label === v)
                    onStatusFilter(opt ? opt.value : "all")
                  }}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.map(o => (
                      <SelectItem key={o.value} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(clientFilter !== "all" || jobSiteFilter !== "all" || statusFilter !== "all") && (
                <button
                  className="flex w-full items-center justify-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  onClick={() => { onClientFilter("all"); onJobSiteFilter("all"); onStatusFilter("all") }}
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataControlPage() {
  const [section, setSection] = useState<DCSection>("edit-project")
  const { data: projects } = useForecast()

  const [clientFilter, setClientFilter]   = useState("all")
  const [jobSiteFilter, setJobSiteFilter] = useState("all")
  const [statusFilter, setStatusFilter]   = useState<ForecastStatus | "all">("all")

  const clientOpts = useMemo(
    () => ["all", ...Array.from(new Set(projects?.map(p => p.cliente).filter(Boolean) as string[])).sort()],
    [projects]
  )
  const jobSiteOpts = useMemo(() => {
    const base = projects?.filter(p => clientFilter === "all" || p.cliente === clientFilter) ?? []
    return ["all", ...Array.from(new Set(base.map(p => p.jobSite).filter(Boolean) as string[])).sort()]
  }, [projects, clientFilter])

  function handleClientFilter(v: string) {
    setClientFilter(v)
    setJobSiteFilter("all")
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">
      <DataControlSidebar
        active={section}
        onSelect={setSection}
        clientFilter={clientFilter}
        jobSiteFilter={jobSiteFilter}
        statusFilter={statusFilter}
        clientOpts={clientOpts}
        jobSiteOpts={jobSiteOpts}
        onClientFilter={handleClientFilter}
        onJobSiteFilter={setJobSiteFilter}
        onStatusFilter={setStatusFilter}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {section === "new-project"  && <NewProjectSection onCreated={() => setSection("edit-project")} />}
        {section === "edit-project" && (
          <EditProjectSection
            clientFilter={clientFilter}
            jobSiteFilter={jobSiteFilter}
            statusFilter={statusFilter}
            onClientFilter={handleClientFilter}
            onJobSiteFilter={setJobSiteFilter}
            onStatusFilter={setStatusFilter}
          />
        )}
        {section === "catalog" && <CatalogSection />}
      </div>
    </div>
  )
}
