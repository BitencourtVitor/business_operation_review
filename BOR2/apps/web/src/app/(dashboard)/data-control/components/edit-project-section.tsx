"use client"

import { Input } from "@/components/ui/input"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { ProjectCard } from "@/components/features/data-control/project-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useForecast, useDeleteForecast } from "@/hooks/use-forecast"
import { useClients, useJobSites } from "@/hooks/use-clients"
import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { FileText, Package, Search, SlidersHorizontal, Truck, X } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { DeleteDialog } from "./delete-dialog"
import { VIEW_TABS, STATUS_SEARCH, DEFAULT_INTEG } from "../types"
import type { ViewTab, IntegFilters, IntegMode } from "../types"
import { dateSearchStr } from "../lib"

// ─── Integ filter helpers ─────────────────────────────────────────────────────

function isTruthy(v?: string | boolean | null): boolean {
  if (typeof v === "boolean") return v
  if (!v) return false
  return ["yes","sim","true","1","y","scheduled","dispensed","done","complete","completed"].includes(v.toLowerCase().trim())
}

function isFieldwireDone(p: ForecastProject)  { return !!p.fieldwire?.length && p.fieldwire.every(f => isTruthy(f.status)) }
function isMachinesDone(p: ForecastProject)   { return !!p.machines?.length  && p.machines.every(m => isTruthy(m.status))  }
function isContractDone(p: ForecastProject)   { return !!p.contractSteps?.length && p.contractSteps.every(c => isTruthy(c.status)) }

function applyInteg(mode: IntegMode, done: boolean) {
  if (mode === "all") return true
  return mode === "done" ? done : !done
}

// ─── IntegRow ─────────────────────────────────────────────────────────────────

function IntegRow({ label, value, onChange, icon }: {
  label: string; value: IntegMode; onChange: (v: IntegMode) => void; icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-5 items-center justify-center">{icon}</div>
      <span className="flex-1 text-xs font-medium">{label}</span>
      <div className="flex items-center rounded-md border text-[10px] font-semibold overflow-hidden">
        {(["all","done","pendent"] as IntegMode[]).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "px-2 py-1 capitalize transition-colors",
              value === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt === "pendent" ? "Pending" : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditProjectSectionProps {
  clientFilter:    string
  jobSiteFilter:   string
  statusFilter:    ForecastStatus | "all"
  onClientFilter:  (v: string) => void
  onJobSiteFilter: (v: string) => void
  onStatusFilter:  (v: ForecastStatus | "all") => void
  integ:           IntegFilters
  onInteg:         (k: keyof IntegFilters, v: IntegMode) => void
}

export function EditProjectSection({
  clientFilter,
  jobSiteFilter,
  statusFilter,
  onClientFilter,
  onJobSiteFilter,
  onStatusFilter,
  integ,
  onInteg,
}: EditProjectSectionProps) {
  const { data: projects, isLoading } = useForecast()
  const deleteMutation = useDeleteForecast()

  const [search, setSearch]                 = useState("")
  const [viewMode, setViewMode]             = useState<ViewTab>("info")
  const [deletingProject, setDeletingProject] = useState<ForecastProject | null>(null)

  const integActiveCount = useMemo(
    () => (Object.keys(DEFAULT_INTEG) as (keyof IntegFilters)[]).filter(k => integ[k] !== "all").length,
    [integ],
  )

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter(p => {
      if (clientFilter  !== "all" && p.cliente !== clientFilter)  return false
      if (jobSiteFilter !== "all" && p.jobSite !== jobSiteFilter) return false
      if (statusFilter  !== "all" && p.status  !== statusFilter)  return false
      if (!applyInteg(integ.fieldwire,    isFieldwireDone(p)))  return false
      if (!applyInteg(integ.buildertrend, p.buildertrend))      return false
      if (!applyInteg(integ.qbTime,       p.qbTime))            return false
      if (!applyInteg(integ.machines,     isMachinesDone(p)))   return false
      if (!applyInteg(integ.storage,      p.storage))           return false
      if (!applyInteg(integ.contract,     isContractDone(p)))   return false
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
    }).sort((a, b) => {
      const numA = parseInt((a.loteBld ?? "").replace(/\D/g, "") || "0", 10)
      const numB = parseInt((b.loteBld ?? "").replace(/\D/g, "") || "0", 10)
      if (numA !== numB) return numA - numB
      return (a.loteBld ?? "").localeCompare(b.loteBld ?? "")
    })
  }, [projects, clientFilter, jobSiteFilter, statusFilter, integ, search])

  const { data: catalogClients  = [] } = useClients()
  const { data: catalogJobSites = [] } = useJobSites()
  const availableClients  = useMemo(() => catalogClients.map(c => c.name).sort(),  [catalogClients])
  const availableJobSites = useMemo(() => catalogJobSites.map(s => s.name).sort(), [catalogJobSites])

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
          <span className="text-xs text-muted-foreground">
            {filtered.length} project{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {VIEW_TABS.map(t => (
              <button
                key={t.key}
                title={t.label}
                onClick={() => setViewMode(t.key)}
                className={`flex items-center justify-center rounded-md p-1.5 transition-all ${
                  viewMode === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
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
          {/* Integration filters popover */}
          <Popover>
            <PopoverTrigger
              render={
                <button className={cn(
                  "flex h-7 w-[72px] items-center justify-between rounded-lg border border-input bg-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30",
                  integActiveCount > 0 && "border-primary text-primary"
                )} />
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="tabular-nums">{integActiveCount}</span>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-64 gap-0 p-0">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
                {integActiveCount > 0 && (
                  <button
                    onClick={() => (Object.keys(DEFAULT_INTEG) as (keyof IntegFilters)[]).forEach(k => onInteg(k, "all"))}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">External Integrations</p>
                  <IntegRow label="Fieldwire"    value={integ.fieldwire}    onChange={v => onInteg("fieldwire", v)}
                    icon={<img src="/images/icon_fieldwire.png" alt="" className="h-4 w-4 object-contain" />} />
                  <IntegRow label="Buildertrend" value={integ.buildertrend} onChange={v => onInteg("buildertrend", v)}
                    icon={<><img src="/images/icon_buildertrend.png" alt="" className="h-4 w-4 object-contain dark:hidden" /><img src="/images/icon_buildertrend_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" /></>} />
                  <IntegRow label="QBTime"       value={integ.qbTime}       onChange={v => onInteg("qbTime", v)}
                    icon={<><img src="/images/icon_qbtime.png" alt="" className="h-4 w-4 object-contain dark:hidden" /><img src="/images/icon_qbtime_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" /></>} />
                </div>
                <div className="h-px bg-border" />
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal Resources</p>
                  <IntegRow label="Machines" value={integ.machines} onChange={v => onInteg("machines", v)}
                    icon={<Truck    className="h-4 w-4 text-muted-foreground" />} />
                  <IntegRow label="Storage"  value={integ.storage}  onChange={v => onInteg("storage", v)}
                    icon={<Package  className="h-4 w-4 text-muted-foreground" />} />
                  <IntegRow label="Contract" value={integ.contract} onChange={v => onInteg("contract", v)}
                    icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Card list */}
      <div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No projects found</p>
        ) : (
          filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              forcedTab={viewMode}
              availableClients={availableClients}
              availableJobSites={availableJobSites}
              onDelete={() => setDeletingProject(p)}
            />
          ))
        )}
      </div>

      <DeleteDialog
        project={deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(deletingProject!.id)
          setDeletingProject(null)
        }}
        deleting={deleteMutation.isPending}
      />
    </div>
  )
}
