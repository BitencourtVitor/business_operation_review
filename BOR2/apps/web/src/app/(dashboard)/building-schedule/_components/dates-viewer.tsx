"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { buildingsService, type RowComment, type ScheduleEvent } from "@/services/buildings.service"
import { useAuth } from "@/hooks/use-auth"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { fmtDateShort, type ScheduleRow } from "@/lib/pdf-schedule-parser"
import {
  EVENT_ROW_H,
  type RowMeta,
  type ViewRow,
  isEventRow,
  isoDate,
  commentRoleIcon,
  commentRoleColor,
  commentRoleBorder,
  fmtCommentTime,
  EventTypeIcon,
  useIsDark,
} from "../_lib/schedule-utils"
import { resColor, resIcon, toTitleCase } from "../_lib/trade-config"

export function DatesViewer({
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
  onEditEvent,
  onDeleteEvent,
}: {
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
  onEditEvent:     (ev: ScheduleEvent) => void
  onDeleteEvent:   (ev: ScheduleEvent) => void
}) {
  const { user: currentUser } = useAuth()
  const isDark = useIsDark()

  const [hoveredRowId,      setHoveredRowId]      = useState<string | null>(null)
  const [lockedRowId,       setLockedRowId]       = useState<string | null>(null)
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

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const [dateEditState, setDateEditState] = useState<{
    rowId:      string
    realStart:  string
    realFinish: string
  } | null>(null)

  return (
    <div className="flex-1 overflow-auto">
      <TooltipProvider>
      <div className="min-w-[840px] flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-30 flex border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-[28px]">
          <div className="sticky left-0 z-20 bg-muted/90 border-r border-border/50 w-[280px] shrink-0 self-stretch flex items-center px-3">Task</div>
          <div className="sticky left-[280px] z-20 bg-muted/90 w-[80px] shrink-0 self-stretch flex items-center justify-center">Duration</div>
          <div className="sticky left-[360px] z-20 bg-muted/90 w-[88px] shrink-0 self-stretch flex items-center justify-center">Start</div>
          <div className="sticky left-[448px] z-20 bg-muted/90 w-[88px] shrink-0 self-stretch flex items-center justify-center">Finish</div>
          <div className="bg-muted/90 w-[100px] shrink-0 self-stretch flex items-center justify-center">Real Start</div>
          <div className="bg-muted/90 border-r border-border/50 w-[100px] shrink-0 self-stretch flex items-center justify-center">Real Finish</div>
          <div className="bg-muted/90 flex-1 min-w-[160px] flex items-center pl-3">Trades</div>
        </div>

        {mergedRows.map((item, i) => {
          if (isEventRow(item)) {
            const label    = item.notes
              ? item.notes
              : new Date(item.event_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
            const evBg     = item.type_color + (isDark ? "0d" : "18")
            const evStart  = new Date(item.event_date + "T12:00:00")
            const evFinish = item.days_delayed > 1
              ? new Date(evStart.getTime() + (item.days_delayed - 1) * 86_400_000)
              : null
            const evDuration = `${item.days_delayed} day${item.days_delayed !== 1 ? "s" : ""}`
            return (
              <div
                key={`ev-${item.id}`}
                className="group/evrow flex items-center border-b border-border/20"
                style={{ height: EVENT_ROW_H, backgroundColor: evBg, borderLeftColor: item.type_color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
              >
                <div className="sticky left-0 z-10 w-[280px] shrink-0 self-stretch flex items-center gap-1.5 pl-2 pr-1 overflow-hidden" style={{ backgroundColor: evBg }}>
                  <EventTypeIcon name={item.type_icon} className="h-3 w-3 shrink-0" style={{ color: item.type_color }} />
                  {item.type_name !== "Other" && (
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: item.type_color }}>{item.type_name}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">{label}</span>
                </div>
                <div className="sticky left-[280px] z-10 w-[80px] shrink-0 self-stretch flex items-center justify-center text-[10px]" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evDuration}
                </div>
                <div className="sticky left-[360px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-[10px] font-medium" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="sticky left-[448px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-[10px] font-medium" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evFinish ? evFinish.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </div>
                <div className="flex-1 self-stretch flex items-center justify-end pr-2" style={{ backgroundColor: evBg }}>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/evrow:opacity-100 transition-opacity">
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

          const row             = item
          const phaseColor      = phaseColors[rowPhaseIdx[row.id] % phaseColors.length]
          const indent          = 8 + (row.level - 1) * 14
          const meta            = rowMetas.get(row.id)
          const isDone          = meta?.status === "done"
          const isOurs          = !isDone && row.resources.some(r => oursSet.has(r))
          const isStartOverdue  = !isDone && !!row.startDate  && row.startDate  < today
          const isFinishOverdue = !isDone && !!row.finishDate && row.finishDate < today
          const isRowActive     = hoveredRowId === row.id || lockedRowId === row.id
          const isCommentsOpen  = commentsRowId === row.id
          const rowComments     = commentsMap.get(row.id) ?? []
          const hasComments     = commentsMap.has(row.id) && rowComments.length > 0

          return (
            <div
              key={row.id}
              className={cn(
                "group flex items-center border-b border-border/20 transition-colors min-h-[32px]",
                isDone
                  ? "bg-green-500/[0.05] hover:bg-green-500/[0.09]"
                  : isOurs
                    ? "bg-foreground/[0.09] hover:bg-foreground/[0.14]"
                    : cn(i % 2 !== 0 && "bg-muted/[0.02]", "hover:bg-muted/[0.06]"),
              )}
              onMouseEnter={() => setHoveredRowId(row.id)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {/* Task label */}
              <div
                className={cn(
                  "sticky left-0 z-10 border-r border-border/50 w-[280px] shrink-0 self-stretch flex items-center gap-1 pr-2",
                  (isDone || isOurs) ? "bg-transparent" : "bg-background",
                  isOurs && "border-l-2 border-l-foreground/50",
                )}
                style={{ paddingLeft: isOurs ? Math.max(0, indent - 2) : indent }}
              >
                {row.isPhase && (
                  <span className="w-1 h-4 rounded-sm shrink-0 mr-0.5" style={{ backgroundColor: phaseColor }} />
                )}
                {hasKidsMap[row.id] ? (
                  <button onClick={() => toggleRow(row.id)} className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground">
                    {expandedIds.has(row.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                ) : <span className="w-4 shrink-0" />}
                <span className="text-[10px] text-muted-foreground/40 font-mono w-5 text-right shrink-0">{row.id}</span>
                {isOurs && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_black.png" alt="" aria-hidden className="shrink-0 h-3 w-3 object-contain opacity-60 dark:hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_white.png" alt="" aria-hidden className="hidden shrink-0 h-3 w-3 object-contain opacity-60 dark:block" />
                  </>
                )}
                <span className={cn("text-[11px] truncate ml-1",
                  row.isPhase && "font-semibold uppercase tracking-wide",
                  !row.isPhase && row.level === 2 && "font-medium",
                  row.isMilestone && "text-amber-500")}>
                  {row.isMilestone && "◆ "}{row.name}
                </span>
              </div>

              {/* Duration */}
              <div className={cn("sticky left-[280px] z-10 w-[80px] shrink-0 self-stretch flex items-center justify-center text-xs text-muted-foreground", (isDone || isOurs) ? "bg-transparent" : "bg-background")}>
                {row.isMilestone ? "◆" : row.durationText}
              </div>

              {/* Start */}
              <div className={cn("sticky left-[360px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-xs", (isDone || isOurs) ? "bg-transparent" : "bg-background", isStartOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                {fmtDateShort(row.startDate)}
              </div>

              {/* Finish */}
              <div className={cn("sticky left-[448px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-xs", (isDone || isOurs) ? "bg-transparent" : "bg-background", isFinishOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                {fmtDateShort(row.finishDate)}
              </div>

              {/* Real Start */}
              {(() => {
                const isEditing = dateEditState?.rowId === row.id
                const rsDate = isEditing
                  ? (dateEditState!.realStart ? new Date(dateEditState!.realStart + "T00:00:00") : undefined)
                  : (meta?.real_start ? new Date(meta.real_start + "T00:00:00") : undefined)
                return (
                  <div className="w-[100px] shrink-0 self-stretch flex items-center justify-center text-xs">
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger className={cn("w-[88px] text-[11px] text-center border border-primary rounded px-1 py-0.5 hover:bg-muted/50 transition-colors truncate", dateEditState!.realStart ? "text-foreground" : "text-muted-foreground")}>
                          {dateEditState!.realStart ? new Date(dateEditState!.realStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Start…"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="bottom" align="center">
                          <CalendarPicker mode="single" selected={rsDate} defaultMonth={rsDate}
                            onSelect={d => setDateEditState(s => s && ({ ...s, realStart: d ? isoDate(d) : "" }))} />
                          {dateEditState!.realStart && (
                            <div className="border-t border-border px-3 py-2">
                              <button onClick={() => setDateEditState(s => s && ({ ...s, realStart: "" }))} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className={cn("text-[11px]", meta?.real_start ? "text-foreground" : "text-muted-foreground/30")}>
                        {meta?.real_start ? new Date(meta.real_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Real Finish */}
              {(() => {
                const isEditing = dateEditState?.rowId === row.id
                const rfDate = isEditing
                  ? (dateEditState!.realFinish ? new Date(dateEditState!.realFinish + "T00:00:00") : undefined)
                  : (meta?.real_finish ? new Date(meta.real_finish + "T00:00:00") : undefined)
                return (
                  <div className="border-r border-border/50 w-[100px] shrink-0 self-stretch flex items-center justify-center text-xs">
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger className={cn("w-[88px] text-[11px] text-center border border-primary rounded px-1 py-0.5 hover:bg-muted/50 transition-colors truncate", dateEditState!.realFinish ? "text-foreground" : "text-muted-foreground")}>
                          {dateEditState!.realFinish ? new Date(dateEditState!.realFinish + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Finish…"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="bottom" align="center">
                          <CalendarPicker mode="single" selected={rfDate} defaultMonth={rfDate}
                            onSelect={d => setDateEditState(s => s && ({ ...s, realFinish: d ? isoDate(d) : "" }))} />
                          {dateEditState!.realFinish && (
                            <div className="border-t border-border px-3 py-2">
                              <button onClick={() => setDateEditState(s => s && ({ ...s, realFinish: "" }))} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className={cn("text-[11px]", meta?.real_finish ? "text-foreground" : "text-muted-foreground/30")}>
                        {meta?.real_finish ? new Date(meta.real_finish + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Trades */}
              <div className="flex-1 min-w-[160px] flex flex-wrap gap-x-3 gap-y-1 px-3 py-1 items-center">
                {row.resources.map(r => {
                  const Icon = resIcon(r)
                  return (
                    <span key={r} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", resColor(r))}>
                        {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0, 2)}</span>}
                      </span>
                      <span>{toTitleCase(r)}</span>
                    </span>
                  )
                })}
              </div>

              {/* Floating action buttons (zero-width sticky anchor) */}
              <div className="sticky right-0 z-20 shrink-0 overflow-visible" style={{ width: 0, alignSelf: "stretch" }}>
                <div
                  ref={isCommentsOpen ? commentsButtonsRef : undefined}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background rounded-md px-0.5 shadow-sm transition-opacity",
                    (hasComments || isRowActive || dateEditState?.rowId === row.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {dateEditState?.rowId === row.id ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                              onMetaChange(row.id, {
                                real_start:  dateEditState.realStart  || null,
                                real_finish: dateEditState.realFinish || null,
                              })
                              setDateEditState(null)
                            }}
                            className="flex items-center justify-center w-5 h-5 rounded text-green-500 hover:bg-green-500/10 transition-colors"
                          />
                        }>
                          <Check className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Confirm</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setDateEditState(null)}
                            className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          />
                        }>
                          <X className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Cancel</TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setDateEditState({ rowId: row.id, realStart: meta?.real_start ?? "", realFinish: meta?.real_finish ?? "" })}
                            className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/80 transition-colors"
                          />
                        }>
                          <Pencil className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Edit real dates</TooltipContent>
                      </Tooltip>

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
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No tasks match the current filter.</div>
        )}
      </div>
      </TooltipProvider>

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
