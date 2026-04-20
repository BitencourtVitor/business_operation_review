"use client"

import { Input } from "@/components/ui/input"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { ProjectCard } from "@/components/features/data-control/project-card"
import { useForecast, useDeleteForecast } from "@/hooks/use-forecast"
import { useClients, useJobSites } from "@/hooks/use-clients"
import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { Search, X } from "lucide-react"
import { useMemo, useState } from "react"
import { DeleteDialog } from "./delete-dialog"
import { VIEW_TABS, STATUS_SEARCH } from "../types"
import type { ViewTab } from "../types"
import { dateSearchStr } from "../lib"

interface EditProjectSectionProps {
  clientFilter:    string
  jobSiteFilter:   string
  statusFilter:    ForecastStatus | "all"
  onClientFilter:  (v: string) => void
  onJobSiteFilter: (v: string) => void
  onStatusFilter:  (v: ForecastStatus | "all") => void
}

export function EditProjectSection({
  clientFilter,
  jobSiteFilter,
  statusFilter,
  onClientFilter,
  onJobSiteFilter,
  onStatusFilter,
}: EditProjectSectionProps) {
  const { data: projects, isLoading } = useForecast()
  const deleteMutation = useDeleteForecast()

  const [search, setSearch]                 = useState("")
  const [viewMode, setViewMode]             = useState<ViewTab>("info")
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
