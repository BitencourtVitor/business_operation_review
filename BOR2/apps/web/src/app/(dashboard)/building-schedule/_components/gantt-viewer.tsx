"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { buildingsService, type RowComment, type ScheduleEvent } from "@/services/buildings.service"
import { useAuth } from "@/hooks/use-auth"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  fmtDateShort,
  type ParsedSchedule,
  type ScheduleRow,
} from "@/lib/pdf-schedule-parser"
import {
  LEFT_W,
  ROW_H,
  YEAR_H,
  MONTH_H,
  PX_PER_DAY,
  EVENT_ROW_H,
  type RowMeta,
  type MonthInfo,
  type ViewRow,
  isEventRow,
  diffDays,
  fmtDateNum,
  commentRoleIcon,
  commentRoleColor,
  commentRoleBorder,
  fmtCommentTime,
  EventTypeIcon,
  useIsDark,
} from "../_lib/schedule-utils"
import { resBarColor, resIcon, toTitleCase } from "../_lib/trade-config"

export function GanttViewer({
  schedule,
  displayRows,
  visibleRows,
  mergedRows,
  hasKidsMap,
  expandedIds,
  toggleRow,
  rowPhaseIdx,
  phaseColors,
  oursSet,
  rowMetas,
  onMetaChange,
  buildingId,
  currentUserName,
  commentsMap,
  setCommentsMap,
  filterYear,
  filterMonth,
  onEditEvent,
  onDeleteEvent,
}: {
  schedule:        ParsedSchedule
  displayRows:     ScheduleRow[]
  visibleRows:     ScheduleRow[]
  mergedRows:      ViewRow[]
  hasKidsMap:      Record<string, boolean>
  expandedIds:     Set<string>
  toggleRow:       (id: string) => void
  rowPhaseIdx:     Record<string, number>
  phaseColors:     string[]
  oursSet:         Set<string>
  rowMetas:        Map<string, RowMeta>
  onMetaChange:    (rowId: string, patch: Partial<RowMeta>) => void
  buildingId:      string
  currentUserName: string
  commentsMap:     Map<string, RowComment[]>
  setCommentsMap:  React.Dispatch<React.SetStateAction<Map<string, RowComment[]>>>
  filterYear:      number | null
  filterMonth:     number | null
  onEditEvent:     (ev: ScheduleEvent) => void
  onDeleteEvent:   (ev: ScheduleEvent) => void
}) {
  const { user: currentUser } = useAuth()

  const ps     = schedule.projectStart!
  const pf     = schedule.projectFinish!
  const isDark = useIsDark()

  const [hoveredRowId,   setHoveredRowId]   = useState<string | null>(null)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const [lockedRowId,    setLockedRowId]    = useState<string | null>(null)

  const [commentsRowId,     setCommentsRowId]     = useState<string | null>(null)
  const [newComment,        setNewComment]        = useState("")
  const [submitting,        setSubmitting]        = useState(false)
  const [editingCommentId,  setEditingCommentId]  = useState<string | null>(null)
  const [editBody,          setEditBody]          = useState("")
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const commentsButtonsRef = useRef<HTMLDivElement>(null)
  const commentsPopupRef   = useRef<HTMLDivElement>(null)
  const newCommentRef      = useRef<HTMLTextAreaElement>(null)
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  useEffect(() => {
    if (!commentsRowId) return
    const handler = (e: MouseEvent) => {
      if (
        !commentsButtonsRef.current?.contains(e.target as Node) &&
        !commentsPopupRef.current?.contains(e.target as Node)
      ) {
        setCommentsRowId(null)
        setLockedRowId(null)
        setNewComment("")
        setDeletingCommentId(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [commentsRowId])

  useLayoutEffect(() => {
    if (!commentsRowId || !commentsButtonsRef.current) { setPopupPos(null); return }
    const rect    = commentsButtonsRef.current.getBoundingClientRect()
    const POPUP_H = 320
    const GAP     = 12
    const MARGIN  = 8
    const midY    = rect.top + rect.height / 2
    const centered = midY - POPUP_H / 2
    const right   = window.innerWidth - rect.left + GAP

    if (centered >= MARGIN && centered + POPUP_H <= window.innerHeight - MARGIN) {
      setPopupPos({ top: centered, right })
    } else if (midY >= window.innerHeight / 2) {
      setPopupPos({ bottom: window.innerHeight - rect.bottom, right })
    } else {
      setPopupPos({ top: Math.min(rect.top, window.innerHeight - POPUP_H - MARGIN), right })
    }
  }, [commentsRowId])

  function openComments(rowId: string) {
    setCommentsRowId(rowId)
    setLockedRowId(rowId)
    setNewComment("")
  }

  async function submitComment(rowId: string) {
    const text = newComment.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const comment = await buildingsService.addRowComment(buildingId, rowId, text, currentUserName, currentUser?.role ?? "")
      setCommentsMap(prev => {
        const next = new Map(prev)
        next.set(rowId, [...(next.get(rowId) ?? []), comment!])
        return next
      })
      setNewComment("")
      if (newCommentRef.current) newCommentRef.current.style.height = "auto"
    } catch {}
    setSubmitting(false)
  }

  async function saveEditComment(rowId: string, commentId: string) {
    const text = editBody.trim()
    if (!text) return
    try {
      const updated = await buildingsService.editRowComment(buildingId, commentId, text)
      setCommentsMap(prev => {
        const next = new Map(prev)
        next.set(rowId, (next.get(rowId) ?? []).map(c => c.id === commentId ? { ...c, body: updated?.body } : c))
        return next
      })
    } catch {}
    setEditingCommentId(null)
    setEditBody("")
  }

  async function removeComment(rowId: string, commentId: string) {
    setCommentsMap(prev => {
      const next = new Map(prev)
      next.set(rowId, (next.get(rowId) ?? []).filter(c => c.id !== commentId))
      return next
    })
    try { await buildingsService.deleteRowComment(buildingId, commentId) } catch {}
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const drag      = useRef({ on: false, startX: 0, scrollLeft: 0 })

  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerW(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rowVirtualizer = useVirtualizer({
    count:            mergedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     (i) => isEventRow(mergedRows[i]) ? EVENT_ROW_H : ROW_H,
    overscan:         10,
  })
  const [scrollLeft, setScrollLeft] = useState(0)

  function onMouseDown(e: React.MouseEvent) {
    if (!scrollRef.current) return
    drag.current = { on: true, startX: e.pageX, scrollLeft: scrollRef.current.scrollLeft }
    scrollRef.current.style.cursor     = "grabbing"
    scrollRef.current.style.userSelect = "none"
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.on || !scrollRef.current) return
    scrollRef.current.scrollLeft = drag.current.scrollLeft - (e.pageX - drag.current.startX)
  }
  function onMouseUp() {
    drag.current.on = false
    if (scrollRef.current) {
      scrollRef.current.style.cursor     = "grab"
      scrollRef.current.style.userSelect = ""
    }
  }

  const { months, yearGroups, timelineW, timelineStart, pxPerDay } = useMemo(() => {
    const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

    const tStart = filterYear != null
      ? filterMonth != null
        ? new Date(filterYear, filterMonth, 1)
        : new Date(filterYear, 0, 1)
      : new Date(ps.getFullYear(), ps.getMonth(), 1)

    const tEnd = filterYear != null
      ? filterMonth != null
        ? new Date(filterYear, filterMonth + 1, 0)
        : new Date(filterYear, 11, 31)
      : new Date(pf.getFullYear(), pf.getMonth() + 1, 0)

    const totalDays = Math.max(1, diffDays(tStart, tEnd) + 1)
    const availableW = containerW - LEFT_W
    const ppd = (filterYear != null && containerW > 0)
      ? Math.max(PX_PER_DAY, availableW / totalDays)
      : PX_PER_DAY

    const mths: MonthInfo[] = []
    const cur = new Date(tStart)
    while (cur <= tEnd) {
      const next      = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const startDay  = diffDays(tStart, cur)
      const daysInMth = diffDays(cur, next)
      mths.push({
        label:   MO[cur.getMonth()],
        year:    cur.getFullYear(),
        startPx: startDay * ppd,
        pxWidth: Math.max(4, daysInMth * ppd),
      })
      cur.setMonth(cur.getMonth() + 1)
    }

    const ygs: Array<{ year: number; startPx: number; pxWidth: number }> = []
    for (const m of mths) {
      const last = ygs[ygs.length - 1]
      if (!last || last.year !== m.year) ygs.push({ year: m.year, startPx: m.startPx, pxWidth: m.pxWidth })
      else last.pxWidth += m.pxWidth
    }

    return { months: mths, yearGroups: ygs, timelineW: totalDays * ppd, timelineStart: tStart, pxPerDay: ppd }
  }, [ps, pf, filterYear, filterMonth, containerW])

  const startLinePx = diffDays(timelineStart, ps) * pxPerDay
  const endLinePx   = diffDays(timelineStart, pf) * pxPerDay
  const today       = new Date(); today.setHours(0, 0, 0, 0)
  const todayPx     = diffDays(timelineStart, today) * pxPerDay
  const todayInRange = today >= timelineStart && today <= pf
  const _MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const currentMonthInfo = months.find(m => m.year === today.getFullYear() && m.label === _MO[today.getMonth()])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto cursor-grab select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)}
    >
      <div className="relative flex flex-col" style={{ minWidth: LEFT_W + timelineW }}>

        {/* Two-row sticky header */}
        <div className="sticky top-0 z-20">
          <div className="flex border-b border-border/60">
            <div className="sticky left-0 z-30 bg-background border-r border-border/60 shrink-0" style={{ width: LEFT_W, height: YEAR_H }} />
            {yearGroups.map((yg, i) => (
              <div
                key={i}
                className="shrink-0 flex items-center justify-center border-r border-border/40 bg-muted/30 text-[10px] font-semibold text-muted-foreground tracking-wide"
                style={{ width: yg.pxWidth, height: YEAR_H }}
              >
                {yg.pxWidth >= 40 ? yg.year : ""}
              </div>
            ))}
          </div>
          <div className="flex border-b border-border">
            <div className="sticky left-0 z-30 bg-background border-r border-border shrink-0 flex items-center px-3" style={{ width: LEFT_W, height: MONTH_H }}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Task</span>
            </div>
            {months.map((m, i) => {
              const isCurrentMonth = m.year === today.getFullYear() && m.label === _MO[today.getMonth()]
              return (
                <div
                  key={i}
                  className={cn(
                    "shrink-0 flex items-center justify-center border-r border-border/30 text-[10px]",
                    isCurrentMonth ? "bg-primary/10 text-primary font-semibold" : "bg-muted/10 text-muted-foreground",
                  )}
                  style={{ width: m.pxWidth, height: MONTH_H }}
                >
                  {m.pxWidth >= 26 ? m.label : m.label[0]}
                </div>
              )
            })}
          </div>
        </div>

        {/* Task rows */}
        <TooltipProvider>
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>

        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const item = mergedRows[virtualRow.index]

          if (isEventRow(item)) {
            const evStart    = new Date(item.event_date + "T12:00:00")
            const evEnd      = item.days_delayed > 1 ? new Date(evStart.getTime() + (item.days_delayed - 1) * 86_400_000) : null
            const evDatePx   = Math.max(0, diffDays(timelineStart, evStart) * pxPerDay)
            const evBarW     = Math.max(pxPerDay, item.days_delayed * pxPerDay)
            const evBg       = item.type_color + (isDark ? "0d" : "18")
            const evBgStrip  = item.type_color + (isDark ? "08" : "0d")
            const isEvActive = hoveredEventId === item.id
            const evS        = fmtDateShort(evStart) ?? ""
            const evF        = evEnd ? (fmtDateShort(evEnd) ?? "") : ""
            const evDateLabel = evF ? `${evS} – ${evF}` : evS
            return (
              <div
                key={`ev-${item.id}`}
                className="group/evrow flex"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: EVENT_ROW_H, transform: `translateY(${virtualRow.start}px)` }}
                onMouseEnter={() => setHoveredEventId(item.id)}
                onMouseLeave={() => setHoveredEventId(null)}
              >
                <div
                  className="sticky left-0 z-30 border-r border-border/30 shrink-0 flex items-center gap-1.5 pl-2 pr-1 overflow-hidden"
                  style={{ width: LEFT_W, height: EVENT_ROW_H, backgroundColor: evBg, borderLeftColor: item.type_color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
                >
                  <EventTypeIcon name={item.type_icon} className="h-3 w-3 shrink-0" style={{ color: item.type_color }} />
                  {item.type_name !== "Other" && (
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: item.type_color }}>{item.type_name}</span>
                  )}
                  {item.notes && (
                    <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">{item.notes}</span>
                  )}
                </div>
                <div className="relative flex-1 overflow-hidden" style={{ height: EVENT_ROW_H }}>
                  <div className="absolute inset-0" style={{ backgroundColor: evBgStrip }} />
                  <div className="absolute rounded-sm" style={{ left: evDatePx, width: evBarW, top: 4, bottom: 4, backgroundColor: item.type_color }} />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none select-none whitespace-nowrap overflow-hidden text-[9px] text-muted-foreground/70"
                    style={{
                      left:       evDatePx + evBarW + 6,
                      maxWidth:   isEvActive ? `${evDateLabel.length * 6.5}px` : "0px",
                      opacity:    isEvActive ? 1 : 0,
                      transition: "max-width 280ms ease-out, opacity 200ms ease-out",
                    }}
                  >
                    {evDateLabel}
                  </span>
                </div>
                <div className="sticky right-0 z-30 shrink-0 overflow-visible" style={{ width: 0, height: EVENT_ROW_H }}>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background/80 rounded-md px-0.5 shadow-sm opacity-0 group-hover/evrow:opacity-100 transition-opacity">
                    <button onClick={() => onEditEvent(item)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => onDeleteEvent(item)} className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          const row        = item
          const phaseColor = phaseColors[rowPhaseIdx[row.id] % phaseColors.length]
          const barColor   = row.resources.length > 0
            ? (resBarColor(row.resources[0], isDark) ?? phaseColor)
            : phaseColor
          const barAlpha   = row.isPhase ? 1 : row.level === 2 ? 0.85 : 0.65
          const barHPct    = row.isPhase ? 64 : row.level === 2 ? 50 : 38
          const indent     = 8 + (row.level - 1) * 14

          const startPx = row.startDate
            ? Math.max(0, diffDays(timelineStart, row.startDate) * pxPerDay)
            : null
          const barW = row.startDate && row.finishDate
            ? Math.max(4, diffDays(row.startDate, row.finishDate) * pxPerDay)
            : 0

          const TradeIcon = row.resources.length > 0 ? resIcon(row.resources[0]) : null

          const meta           = rowMetas.get(row.id)
          const isDone         = meta?.status === "done"
          const isOurs         = !isDone && row.resources.some(r => oursSet.has(r))
          const isRowActive    = hoveredRowId === row.id || lockedRowId === row.id
          const isCommentsOpen = commentsRowId === row.id
          const rowComments    = commentsMap.get(row.id) ?? []
          const hasComments    = commentsMap.has(row.id) && rowComments.length > 0

          return (
            <div
              key={row.id}
              className={cn(
                "group flex border-b border-border/20 transition-colors",
                isDone
                  ? "bg-green-500/[0.05] hover:bg-green-500/[0.09]"
                  : isOurs
                    ? "bg-foreground/[0.09] hover:bg-foreground/[0.14]"
                    : cn(virtualRow.index % 2 !== 0 && "bg-muted/[0.02]", "hover:bg-muted/[0.06]"),
              )}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: ROW_H, transform: `translateY(${virtualRow.start}px)` }}
              onMouseEnter={() => setHoveredRowId(row.id)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {/* Label — sticky left */}
              <div
                className={cn(
                  "sticky left-0 z-30 border-r border-border/50 shrink-0 flex items-center gap-1 pr-1 overflow-hidden group-hover:overflow-visible",
                  (isDone || isOurs) ? "bg-transparent" : "bg-background",
                  isOurs && "border-l-2 border-l-foreground/50",
                )}
                style={{ width: LEFT_W, height: ROW_H, paddingLeft: isOurs ? Math.max(0, indent - 2) : indent }}
              >
                {hasKidsMap[row.id] ? (
                  <button
                    onClick={() => toggleRow(row.id)}
                    onMouseDown={e => e.stopPropagation()}
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {expandedIds.has(row.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="text-[10px] text-muted-foreground/40 font-mono w-5 text-right shrink-0">{row.id}</span>
                {isOurs && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_black.png" alt="" aria-hidden className="shrink-0 h-3 w-3 object-contain opacity-60 dark:hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_white.png" alt="" aria-hidden className="hidden shrink-0 h-3 w-3 object-contain opacity-60 dark:block" />
                  </>
                )}
                <span
                  className={cn(
                    "text-[11px] ml-1 whitespace-nowrap",
                    isRowActive
                      ? "relative z-10 pr-1 overflow-visible"
                      : "overflow-hidden text-ellipsis flex-1 min-w-0",
                    row.isPhase     && "font-semibold uppercase tracking-wide",
                    !row.isPhase && row.level === 2 && "font-medium",
                    row.isMilestone && "text-amber-500 dark:text-amber-400",
                  )}
                >
                  {row.isMilestone && <span className="mr-0.5">◆</span>}
                  {row.name}
                </span>
              </div>

              {/* Timeline area */}
              <div className="relative shrink-0" style={{ width: timelineW, height: ROW_H }}>
                {currentMonthInfo && (
                  <div
                    className="absolute top-0 bottom-0 bg-primary/[0.08] pointer-events-none"
                    style={{ left: currentMonthInfo.startPx, width: currentMonthInfo.pxWidth }}
                  />
                )}
                {months.map((m, mi) => mi > 0 && (
                  <div key={mi} className="absolute top-0 bottom-0 w-px bg-border/15" style={{ left: m.startPx }} />
                ))}

                {!row.isMilestone && startPx != null && barW > 0 && (
                  <div
                    className="absolute rounded-[3px] overflow-hidden pointer-events-none"
                    style={{ left: startPx, top: `${(100 - barHPct) / 2}%`, width: barW, height: `${barHPct}%`, backgroundColor: barColor, opacity: barAlpha }}
                  >
                    {(row.isPhase || row.level === 2) && barW > 52 && (() => {
                      const PAD = 5
                      const textLeft = Math.min(Math.max(PAD, scrollLeft - startPx + PAD), barW - 40)
                      return (
                        <span
                          className="absolute top-1/2 -translate-y-1/2 text-[10px] text-white dark:text-gray-900 font-semibold leading-none select-none overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ left: textLeft, right: TradeIcon && barW > 20 ? 18 : PAD }}
                        >
                          {row.name}
                        </span>
                      )
                    })()}
                    {TradeIcon && barW > 20 && !row.isPhase && (
                      <TradeIcon className="absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-white/80 dark:text-gray-900/80 shrink-0" />
                    )}
                  </div>
                )}

                {!row.isPhase && !row.isMilestone && startPx != null && barW > 0 && TradeIcon && row.resources.length > 0 && (() => {
                  const GAP        = 6
                  const MIN        = 38
                  const leftSpace  = startPx - GAP
                  const rightSpace = timelineW - startPx - barW - GAP
                  if (leftSpace < MIN && rightSpace < MIN) return null
                  const showLeft = leftSpace > rightSpace && leftSpace >= MIN
                  const trade    = toTitleCase(row.resources[0])
                  const s        = row.startDate  ? fmtDateShort(row.startDate)  ?? "" : ""
                  const f        = row.finishDate ? fmtDateShort(row.finishDate) ?? "" : ""
                  const datePart = s && f ? (s === f ? ` · ${s}` : ` · ${s} – ${f}`) : ""

                  return (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 flex items-center pointer-events-none select-none leading-none"
                      style={showLeft ? { right: timelineW - startPx + GAP } : { left: startPx + barW + GAP }}
                    >
                      <span className={cn("whitespace-nowrap transition-colors duration-150", isRowActive ? "text-[9px] text-foreground/80" : "text-[9px] text-muted-foreground")}>
                        {trade}
                      </span>
                      <span
                        className="overflow-hidden whitespace-nowrap text-[9px] text-muted-foreground/70"
                        style={{
                          maxWidth:   isRowActive ? `${datePart.length * 6.5}px` : "0px",
                          opacity:    isRowActive ? 1 : 0,
                          transition: "max-width 280ms ease-out, opacity 200ms ease-out",
                        }}
                      >
                        {datePart}
                      </span>
                    </span>
                  )
                })()}

                {row.isMilestone && startPx != null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400 border border-amber-600 pointer-events-none"
                    style={{ left: startPx }}
                  />
                )}
              </div>

              {/* Floating action buttons (zero-width sticky anchor) */}
              <div className="sticky right-0 z-30 shrink-0 overflow-visible" style={{ width: 0, height: ROW_H }}>
                <div
                  ref={isCommentsOpen ? commentsButtonsRef : undefined}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background rounded-md px-0.5 shadow-sm transition-opacity",
                    (hasComments || isRowActive) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => onMetaChange(row.id, { status: isDone ? "pending" : "done" })}
                          className={cn(
                            "flex items-center justify-center w-5 h-5 rounded transition-colors",
                            isDone ? "text-green-500 hover:bg-green-500/10" : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                          )}
                        />
                      }
                    >
                      <Check className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="top">{isDone ? "Mark as pending" : "Mark as done"}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => {
                            if (isCommentsOpen) { setCommentsRowId(null); setLockedRowId(null) }
                            else openComments(row.id)
                          }}
                          className={cn(
                            "relative flex items-center justify-center w-5 h-5 rounded transition-colors",
                            isCommentsOpen
                              ? "text-primary bg-primary/10"
                              : hasComments
                                ? "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                          )}
                        />
                      }
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {hasComments && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary text-[7px] text-primary-foreground flex items-center justify-center leading-none font-bold pointer-events-none">
                          {rowComments.length > 9 ? "9+" : rowComments.length}
                        </span>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {hasComments ? `${rowComments.length} comment${rowComments.length > 1 ? "s" : ""}` : "Add comment"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          )
        })}

          {/* Date labels overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
            {todayInRange && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + todayPx, borderLeft: "1px dashed rgba(255,255,255,0.25)" }} />
            )}
            {!(filterYear != null && filterMonth != null) && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + startLinePx, borderLeft: "1px dashed #10b981" }}>
                <span className="absolute text-[9px] font-mono font-semibold bg-background/90 rounded whitespace-nowrap leading-none"
                  style={{ bottom: 8, left: 4, writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "4px 2px", color: "#10b981" }}>
                  {fmtDateNum(ps)}
                </span>
              </div>
            )}
            {!(filterYear != null && filterMonth != null) && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + endLinePx, borderLeft: "1px dashed #f43f5e" }}>
                <span className="absolute text-[9px] font-mono font-semibold bg-background/90 rounded whitespace-nowrap leading-none"
                  style={{ top: 8, left: -4, transform: "translateX(-100%) rotate(180deg)", writingMode: "vertical-rl", padding: "4px 2px", color: "#f43f5e" }}>
                  {fmtDateNum(pf)}
                </span>
              </div>
            )}
          </div>

        </div>
        </TooltipProvider>

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No tasks match the current filter.</div>
        )}
      </div>

      {/* Comment popup portal */}
      {commentsRowId && popupPos && typeof window !== "undefined" && createPortal(
        (() => {
          const commentsOpenRow = visibleRows.find(r => r.id === commentsRowId)
          if (!commentsOpenRow) return null
          const portalComments = commentsMap.get(commentsRowId) ?? []
          return (
            <div
              ref={commentsPopupRef}
              className="w-72 bg-popover border border-border rounded-lg shadow-xl flex flex-col cursor-default"
              style={{ position: "fixed", ...(popupPos.bottom !== undefined ? { bottom: popupPos.bottom } : { top: popupPos.top }), right: popupPos.right, maxHeight: 320, zIndex: 9999 }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="px-3 pt-2.5 pb-2 border-b border-border/50 shrink-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{commentsOpenRow.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {portalComments.length === 0 ? "No comments yet" : `${portalComments.length} comment${portalComments.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-0">
                {portalComments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 text-center py-3">Be the first to comment.</p>
                ) : portalComments.map(c => {
                  const isOwn     = !!c.created_by_id && c.created_by_id === currentUser?.id
                  const isEditing = editingCommentId === c.id
                  return (
                    <div key={c.id} className="group/comment flex gap-2">
                      {(() => { const Icon = commentRoleIcon(c.user_role); return (
                        <div className={cn("w-6 h-6 rounded-full bg-muted/60 border flex items-center justify-center shrink-0 mt-0.5", commentRoleBorder(c.user_role))}>
                          <Icon className={cn("w-3 h-3", commentRoleColor(c.user_role))} />
                        </div>
                      )})()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[11px] font-medium text-foreground truncate">{c.user_name || "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{fmtCommentTime(c.created_at)}</span>
                          {isOwn && !isEditing && (
                            deletingCommentId === c.id ? (
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-muted-foreground">Sure?</span>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setDeletingCommentId(null); removeComment(commentsRowId!, c.id) }}
                                  className="flex items-center justify-center w-4 h-4 rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(null)}
                                  className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">No</button>
                              </div>
                            ) : (
                              <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity shrink-0">
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(c.id); setEditBody(c.body) }}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors">
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(c.id)}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditComment(commentsRowId!, c.id) }
                                if (e.key === "Escape") { setEditingCommentId(null); setEditBody("") }
                              }}
                              rows={2} className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 resize-none text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                            <div className="flex gap-1">
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => saveEditComment(commentsRowId!, c.id)}
                                className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Save</button>
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(null); setEditBody("") }}
                                className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-foreground/80 break-words leading-snug">{c.body}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-border/50 p-2 shrink-0">
                <div className="flex gap-1.5 items-end">
                  <textarea ref={newCommentRef} value={newComment}
                    onChange={e => { setNewComment(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(commentsRowId!) } }}
                    placeholder="Write a comment… (Enter to send)" rows={1}
                    className="flex-1 text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 leading-normal resize-none overflow-hidden max-h-28 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onMouseDown={e => e.stopPropagation()} onClick={() => submitComment(commentsRowId!)}
                    disabled={!newComment.trim() || submitting}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0">
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}
    </div>
  )
}
