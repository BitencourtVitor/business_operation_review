"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { buildingsService, type RowComment, type ScheduleEvent } from "@/services/buildings.service"
import { useAuth } from "@/hooks/use-auth"
import { useTradeOwnership } from "@/hooks/use-buildings"
import {
  hydrateSchedule,
  getVisibleRows,
  hasChildren,
  type ParsedSchedule,
} from "@/lib/pdf-schedule-parser"
import { type RowMeta, type ViewRow, useIsDark } from "../_lib/schedule-utils"
import { PHASE_COLORS_LIGHT, PHASE_COLORS_DARK } from "../_lib/trade-config"
import { GanttViewer } from "./gantt-viewer"
import { DatesViewer } from "./dates-viewer"
import { EditEventModal, DeleteEventModal } from "./event-modals"

export function ScheduleViewer({
  schedule,
  buildingId,
  viewMode,
  displayResources: _displayResources,
  filterYear,
  filterMonth,
  controlsRef,
  activeEvents = [],
}: {
  schedule:         ParsedSchedule
  buildingId:       string
  viewMode:         "gantt" | "dates"
  displayResources: string[]
  filterYear:       number | null
  filterMonth:      number | null
  controlsRef?:     React.MutableRefObject<{ expandAll: () => void; collapseAll: () => void } | null>
  activeEvents?:    ScheduleEvent[]
}) {
  const displayRows = useMemo(() => {
    let rows = schedule.rows

    if (filterYear != null) {
      const mStart = filterMonth != null ? new Date(filterYear, filterMonth, 1) : new Date(filterYear, 0, 1)
      const mEnd   = filterMonth != null ? new Date(filterYear, filterMonth + 1, 0) : new Date(filterYear, 11, 31)
      rows = rows.filter(r => {
        if (!r.startDate || !r.finishDate) return true
        return r.startDate <= mEnd && r.finishDate >= mStart
      })
    }

    return rows
  }, [schedule, filterYear, filterMonth])

  const rowPhaseIdx = useMemo(() => {
    const map: Record<string, number> = {}
    let idx = -1
    for (const r of displayRows) { if (r.isPhase) idx++; map[r.id] = Math.max(0, idx) }
    return map
  }, [displayRows])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(schedule.rows.map(r => r.id))
    const saved = localStorage.getItem(`bs:expanded:${buildingId}`)
    if (saved) {
      try { return new Set(JSON.parse(saved) as string[]) } catch {}
    }
    return new Set(schedule.rows.map(r => r.id))
  })

  useEffect(() => {
    localStorage.setItem(`bs:expanded:${buildingId}`, JSON.stringify([...expandedIds]))
  }, [expandedIds, buildingId])

  if (controlsRef) {
    controlsRef.current = {
      expandAll:   () => setExpandedIds(new Set(displayRows.map(r => r.id))),
      collapseAll: () => setExpandedIds(new Set()),
    }
  }

  function toggleRow(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const visibleRows = useMemo(
    () => getVisibleRows(displayRows, expandedIds, new Set()),
    [displayRows, expandedIds],
  )
  const hasKidsMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    displayRows.forEach((_, i) => { m[displayRows[i].id] = hasChildren(displayRows, i) })
    return m
  }, [displayRows])

  const isDark = useIsDark()
  const phaseColors = isDark ? PHASE_COLORS_DARK : PHASE_COLORS_LIGHT

  const { data: ownershipData = [] } = useTradeOwnership(buildingId)
  const oursSet = useMemo(
    () => new Set(ownershipData.filter(o => o.is_ours).map(o => o.trade_name)),
    [ownershipData],
  )

  const { user: currentUser } = useAuth()
  const currentUserName = currentUser?.name || currentUser?.email || "Unknown"

  const [editingEvent,  setEditingEvent]  = useState<ScheduleEvent | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)

  const [commentsMap, setCommentsMap] = useState<Map<string, RowComment[]>>(new Map())

  useEffect(() => {
    if (!buildingId) return
    setCommentsMap(new Map())
    buildingsService.getAllRowComments(buildingId)
      .then(items => {
        const map = new Map<string, RowComment[]>()
        for (const c of (items ?? [])) {
          const key = String(c.row_id)
          if (!map.has(key)) map.set(key, [])
          map.get(key)?.push(c)
        }
        setCommentsMap(map)
      })
      .catch(() => {})
  }, [buildingId])

  const [rowMetas, setRowMetas] = useState<Map<string, RowMeta>>(new Map())

  useEffect(() => {
    if (!buildingId) return
    buildingsService.getScheduleRowMeta(buildingId)
      .then(items => {
        const map = new Map<string, RowMeta>()
        for (const item of (items ?? [])) {
          map.set(String(item.row_id), {
            status:      item.status,
            observation: item.observation,
            real_start:  item.real_start  ?? null,
            real_finish: item.real_finish ?? null,
            is_finished: item.is_finished ?? false,
            is_ours:     item.is_ours     ?? false,
          })
        }
        setRowMetas(map)
      })
      .catch(() => {})
  }, [buildingId])

  const onMetaChange = useCallback((rowId: string, patch: Partial<RowMeta>) => {
    setRowMetas(prev => {
      const next    = new Map(prev)
      const current = next.get(rowId) ?? { status: "pending", observation: "", real_start: null, real_finish: null, is_finished: false, is_ours: false }
      next.set(rowId, { ...current, ...patch })
      return next
    })
    buildingsService.upsertScheduleRowMeta(buildingId, rowId, patch).catch(() => {})
  }, [buildingId])

  const mergedRows = useMemo<ViewRow[]>(() => {
    if (!activeEvents.length) return visibleRows
    const queue = [...activeEvents].sort((a, b) => a.event_date.localeCompare(b.event_date))
    const result: ViewRow[] = []
    let qi = 0
    for (const row of visibleRows) {
      const rowDate = row.startDate?.toISOString().slice(0, 10) ?? null
      while (qi < queue.length && rowDate && queue[qi].event_date <= rowDate) {
        result.push({ ...queue[qi++], _kind: "event" })
      }
      result.push(row)
    }
    while (qi < queue.length) result.push({ ...queue[qi++], _kind: "event" })
    return result
  }, [visibleRows, activeEvents])

  const shared    = { displayRows, visibleRows, mergedRows, hasKidsMap, expandedIds, toggleRow, rowPhaseIdx, phaseColors, oursSet }
  const datesShared = { displayRows, visibleRows, mergedRows, hasKidsMap, expandedIds, toggleRow, rowPhaseIdx, phaseColors }
  const evCallbacks = {
    onEditEvent:   (ev: ScheduleEvent) => setEditingEvent(ev),
    onDeleteEvent: (ev: ScheduleEvent) => setDeletingEvent(ev),
  }

  return (
    <>
      {editingEvent && (
        <EditEventModal buildingId={buildingId} event={editingEvent} onClose={() => setEditingEvent(null)} />
      )}
      {deletingEvent && (
        <DeleteEventModal buildingId={buildingId} event={deletingEvent} onClose={() => setDeletingEvent(null)} />
      )}
      {viewMode === "gantt" && schedule.projectStart && schedule.projectFinish
        ? <GanttViewer schedule={schedule} {...shared} rowMetas={rowMetas} onMetaChange={onMetaChange} buildingId={buildingId} currentUserName={currentUserName} commentsMap={commentsMap} setCommentsMap={setCommentsMap} filterYear={filterYear} filterMonth={filterMonth} {...evCallbacks} />
        : <DatesViewer {...datesShared} rowMetas={rowMetas} onMetaChange={onMetaChange} buildingId={buildingId} currentUserName={currentUserName} commentsMap={commentsMap} setCommentsMap={setCommentsMap} {...evCallbacks} />
      }
    </>
  )
}
