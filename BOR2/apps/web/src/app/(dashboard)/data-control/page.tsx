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
import { NewProjectCard, ProjectCard, type ViewTab } from "@/components/features/data-control/project-card"
import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { Database, FilePlus2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import React, { useMemo, useState } from "react"

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUSES: ForecastStatus[] = ["planned", "active", "completed", "cancelled"]
const PROJECT_TYPES = ["Building", "Lot", "House"]

const STATUS_BADGE: Record<ForecastStatus, string> = {
  planned: "secondary",
  active: "default",
  completed: "outline",
  cancelled: "destructive",
}

function fmtDate(val: string | null | undefined) {
  if (!val) return "â€”"
  const [y, m, d] = val.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtCurrency(val: number) {
  if (!val) return "â€”"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val)
}

// â”€â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Delete dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Catalog tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  <TableCell key={c.field} className="text-sm">{String(row[c.field] ?? "â€”")}</TableCell>
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

// â”€â”€â”€ View mode tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "info",      label: "Info & Dates" },
  { key: "fieldwire", label: "Fieldwire"    },
  { key: "machines",  label: "Machines"     },
  { key: "contract",  label: "Contract"     },
  { key: "optionals", label: "Optionals"    },
]

// â”€â”€â”€ New Project section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Edit Projects section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EditProjectSection() {
  const { data: projects, isLoading } = useForecast()
  const deleteMutation = useDeleteForecast()

  const [search, setSearch]               = useState("")
  const [clientFilter, setClientFilter]   = useState("all")
  const [jobSiteFilter, setJobSiteFilter] = useState("all")
  const [statusFilter, setStatusFilter]   = useState<ForecastStatus | "all">("all")
  const [viewMode, setViewMode]           = useState<ViewTab>("info")
  const [deletingProject, setDeletingProject] = useState<ForecastProject | null>(null)

  const clientOpts  = useMemo(() => ["all", ...Array.from(new Set(projects?.map(p => p.cliente).filter(Boolean) as string[])).sort()], [projects])
  const jobSiteOpts = useMemo(() => {
    const base = projects?.filter(p => clientFilter === "all" || p.cliente === clientFilter) ?? []
    return ["all", ...Array.from(new Set(base.map(p => p.jobSite).filter(Boolean) as string[])).sort()]
  }, [projects, clientFilter])

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter(p => {
      if (clientFilter  !== "all" && p.cliente !== clientFilter)  return false
      if (jobSiteFilter !== "all" && p.jobSite !== jobSiteFilter) return false
      if (statusFilter  !== "all" && p.status  !== statusFilter)  return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !(p.cliente  || "").toLowerCase().includes(q) &&
          !(p.jobSite  || "").toLowerCase().includes(q) &&
          !(p.loteBld  || "").toLowerCase().includes(q) &&
          !(p.team     || "").toLowerCase().includes(q) &&
          !(p.address  || "").toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [projects, clientFilter, jobSiteFilter, statusFilter, search])

  const availableClients  = useMemo(() => Array.from(new Set(projects?.map(p => p.cliente).filter(Boolean) as string[])).sort(), [projects])
  const availableJobSites = useMemo(() => Array.from(new Set(projects?.map(p => p.jobSite).filter(Boolean)  as string[])).sort(), [projects])

  const active    = projects?.filter(p => p.status === "active").length ?? 0
  const planned   = projects?.filter(p => p.status === "planned").length ?? 0
  const completed = projects?.filter(p => p.status === "completed").length ?? 0

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Edit Project</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-green-600">{active}</span> active Â·{" "}
          <span className="font-medium text-blue-600">{planned}</span> planned Â·{" "}
          <span className="font-medium">{completed}</span> completed Â·{" "}
          <span className="font-medium text-foreground">{projects?.length ?? 0} total</span>
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-7 pl-7 text-xs w-44" />
        </div>
        <select className="h-7 rounded border border-border bg-background px-2 text-xs" value={clientFilter} onChange={e => { setClientFilter(e.target.value); setJobSiteFilter("all") }}>
          <option value="all">All clients</option>
          {clientOpts.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="h-7 rounded border border-border bg-background px-2 text-xs" value={jobSiteFilter} onChange={e => setJobSiteFilter(e.target.value)}>
          <option value="all">All job sites</option>
          {jobSiteOpts.filter(j => j !== "all").map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <select className="h-7 rounded border border-border bg-background px-2 text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value as ForecastStatus | "all")}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        {(search || clientFilter !== "all" || jobSiteFilter !== "all" || statusFilter !== "all") && (
          <button className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => { setSearch(""); setClientFilter("all"); setJobSiteFilter("all"); setStatusFilter("all") }}>
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
        <div className="ml-4 flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          {VIEW_TABS.map(t => (
            <button key={t.key} onClick={() => setViewMode(t.key)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${viewMode === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
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

// â”€â”€â”€ Inner sidebar nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DCSection = "new-project" | "edit-project" | "catalog"

const DC_GROUPS: { label: string; items: { key: DCSection; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Forecast",
    items: [
      { key: "new-project",  label: "New Project",    icon: FilePlus2 },
      { key: "edit-project", label: "Edit Project",   icon: Pencil    },
      { key: "catalog",      label: "Catalog Tables", icon: Database  },
    ],
  },
]

function DataControlSidebar({
  active, onSelect,
}: {
  active: DCSection
  onSelect: (s: DCSection) => void
}) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
          Forecast Controls
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
      </div>
    </aside>
  )
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DataControlPage() {
  const [section, setSection] = useState<DCSection>("edit-project")

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">
      <DataControlSidebar active={section} onSelect={setSection} />
      <div className="flex-1 overflow-y-auto p-6">
        {section === "new-project"  && <NewProjectSection onCreated={() => setSection("edit-project")} />}
        {section === "edit-project" && <EditProjectSection />}
        {section === "catalog"      && <CatalogSection />}
      </div>
    </div>
  )
}
