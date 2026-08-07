"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Building2, Plus, Search, SearchX, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCatalogStore } from "./_lib/catalog-store"
import { useCanEditBidRequests } from "./_lib/use-can-edit"
import { useProjectsStore, emptyProject } from "./_lib/projects-store"
import { PROJECT_STATUS_LABEL } from "./_lib/types"
import type { Project, ProjectStatus } from "./_lib/types"
import { ProjectCard } from "./_components/project-card"
import { ProjectModal } from "./_components/project-modal"

type Filter = ProjectStatus | "all"

const FILTERS: Filter[] = ["all", "active", "on_hold", "completed"]

export default function PCGBidRequestsPage() {
  const trades = useCatalogStore(s => s.trades)
  const { projects, addProject, deleteProject } = useProjectsStore()
  const canEdit = useCanEditBidRequests()

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projects.filter(p => {
      if (filter !== "all" && p.status !== filter) return false
      if (!term) return true
      return p.name.toLowerCase().includes(term) || p.address.toLowerCase().includes(term)
    })
  }, [projects, search, filter])

  // No create form — the project lands empty and every field saves on its own
  // from inside the modal.
  function openNew() {
    const project = { ...emptyProject(), name: "Untitled project" }
    addProject(project)
    setOpenProjectId(project.id)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center gap-3 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PCG Bids and Contracts</h1>
          <p className="text-sm text-muted-foreground">Bid requests and contract documents by project and trade</p>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects"
            className="h-8 w-[220px] pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : PROJECT_STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        <Button variant="outline" nativeButton={false} render={<Link href="/pcg-bid-requests/trades" />}>
          <Settings2 className="h-4 w-4" />
          Trades
        </Button>

        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="flex items-center text-sm font-semibold leading-none">Projects</span>
          <span className="flex items-center text-xs leading-none text-muted-foreground">
            {visible.length === projects.length ? projects.length : `${visible.length} of ${projects.length}`}
          </span>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {projects.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground">
                  {canEdit
                    ? "Create one, pick which trades it needs, and each gets its own bid request track."
                    : "Nothing has been set up yet. Ask someone with edit access to create the first project."}
                </p>
              </div>
              {canEdit && (
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  New project
                </Button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <SearchX className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No project matches this filter.</p>
            </div>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  trades={trades}
                  onOpen={() => setOpenProjectId(project.id)}
                  onDelete={canEdit ? () => setPendingDelete(project) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {openProjectId && (
        <ProjectModal projectId={openProjectId} onClose={() => setOpenProjectId(null)} />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={v => { if (!v) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every trade track on this project goes with it — bid answers, sub, and contract state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) deleteProject(pendingDelete.id); setPendingDelete(null) }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
