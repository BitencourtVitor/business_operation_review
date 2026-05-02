"use client"

import { useMemo, useRef, useState } from "react"
import { CheckCircle2, Circle, Clock4, Search, StickyNote, SortAsc, SortDesc, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fmtDateUS, getStatusFromPercent,
  STATUS_COLOR, STATUS_LABEL,
  type GroupBy, type ProjectStatus,
} from "../_lib/utils"
import { ProjectDetailModal } from "./project-detail-modal"
import type { ProjectMonitoringEntry } from "@/services/project-monitoring.service"

// ── Status icons ──────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<ProjectStatus, React.ElementType> = {
  completed:   CheckCircle2,
  in_progress: Clock4,
  no_started:  Circle,
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectMonitoringEntry
  onClick: () => void
}) {
  const status = getStatusFromPercent(project)
  const Icon   = STATUS_ICONS[status]
  const color  = STATUS_COLOR[status]

  return (
    <button
      onClick={onClick}
      className="flex min-w-[220px] max-w-[250px] shrink-0 flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md text-left"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        {project.notes && (
          <StickyNote className="h-3 w-3 text-primary/60" />
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5">
        <p className="text-center text-sm font-bold leading-tight">
          {[project.lotNumber ? `Lot ${project.lotNumber}` : null, project.jobSite]
            .filter(Boolean).join(" – ")}
        </p>
        <p className="text-center text-xs text-muted-foreground">{project.city}</p>

        <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
          <span>Start: {fmtDateUS(project.startDate)}</span>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span>End: {fmtDateUS(project.finishDate)}</span>
        </div>

        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {project.team
            ? <span>Team {project.team} · <span className="font-semibold">{Math.round(project.percentCompleted ?? 0)}%</span></span>
            : <span className="font-semibold">{Math.round(project.percentCompleted ?? 0)}%</span>
          }
        </div>
      </div>
    </button>
  )
}

// ── Sort state type ───────────────────────────────────────────────────────────

type SortOrder = "off" | "asc" | "desc"

// ── Carousel ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: ProjectStatus[] = ["completed", "in_progress", "no_started"]

export function ProjectCarousel({
  data,
}: {
  data:    ProjectMonitoringEntry[]
  allData: ProjectMonitoringEntry[]
  groupBy: GroupBy
  year:    string
  month:   string
  week:    string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart  = useRef({ x: 0, scrollLeft: 0 })

  const [search,    setSearch]    = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("off")
  const [notesOnly, setNotesOnly] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected,  setSelected]  = useState<ProjectMonitoringEntry | null>(null)

  // Drag-to-scroll handlers
  function onMouseDown(e: React.MouseEvent) {
    if (!scrollRef.current) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, scrollLeft: scrollRef.current.scrollLeft }
    scrollRef.current.style.cursor = "grabbing"
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current || !scrollRef.current) return
    const dx = e.clientX - dragStart.current.x
    scrollRef.current.scrollLeft = dragStart.current.scrollLeft - dx
  }

  function onMouseUp() {
    isDragging.current = false
    if (scrollRef.current) scrollRef.current.style.cursor = "grab"
  }

  // Filter + sort
  const processedData = useMemo(() => {
    let result = [...data]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(p =>
        p.jobSite?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.lotNumber?.toLowerCase().includes(q)
      )
    }

    if (notesOnly) {
      result = result.filter(p => !!p.notes?.trim())
    }

    return result
  }, [data, search, notesOnly])

  // Group by status (percent-based, like BOR1 carousel)
  const groups = useMemo(() => {
    return STATUS_ORDER.map(status => {
      let projects = processedData.filter(p => getStatusFromPercent(p) === status)
      if (sortOrder === "asc")  projects = [...projects].sort((a, b) => (a.percentCompleted ?? 0) - (b.percentCompleted ?? 0))
      if (sortOrder === "desc") projects = [...projects].sort((a, b) => (b.percentCompleted ?? 0) - (a.percentCompleted ?? 0))
      return { status, projects }
    }).filter(g => g.projects.length > 0)
  }, [processedData, sortOrder])

  function cycleSortOrder() {
    setSortOrder(prev => prev === "off" ? "asc" : prev === "asc" ? "desc" : "off")
  }

  const SortIcon = sortOrder === "asc" ? SortAsc : sortOrder === "desc" ? SortDesc : SortAsc

  return (
    <div className="flex flex-col gap-2 h-full">

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-1">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search jobsite, city, lot…"
                className="h-7 w-48 text-xs"
                onBlur={() => { if (!search) setSearchOpen(false) }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => { setSearch(""); setSearchOpen(false) }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Sort by progress */}
        <Button
          size="sm"
          variant={sortOrder !== "off" ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={cycleSortOrder}
        >
          <SortIcon className="h-3 w-3" />
          Progress
          {sortOrder !== "off" && <span className="opacity-70">{sortOrder === "asc" ? "↑" : "↓"}</span>}
        </Button>

        {/* Notes filter */}
        <Button
          size="sm"
          variant={notesOnly ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={() => setNotesOnly(v => !v)}
        >
          <StickyNote className="h-3 w-3" />
          Notes
        </Button>

        {/* Total count */}
        <span className="ml-auto text-xs text-muted-foreground">
          {processedData.length} project{processedData.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scrollable carousel */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 gap-4 overflow-x-auto no-scrollbar select-none pb-2"
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No projects
          </div>
        ) : (
          groups.map(g => (
            <div key={g.status} className="flex shrink-0 flex-col gap-2">
              {/* Group header */}
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: STATUS_COLOR[g.status] }}
                />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {STATUS_LABEL[g.status]}
                </span>
                <span className="text-[11px] text-muted-foreground">({g.projects.length})</span>
              </div>
              {/* Cards row */}
              <div className="flex gap-2.5">
                {g.projects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onClick={() => setSelected(p)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ProjectDetailModal
          project={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
