"use client"

import { useMemo, useState } from "react"
import {
  ArrowDown01, ArrowDownAZ, ArrowLeft, ArrowUp01, ArrowUpZA, Check, ChevronDown,
  ChevronRight, FileOutput, FileSignature, HardHat, ListChecks, Loader2, Moon, Plus,
  Search, Sun, Trash2, X,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useCatalogStore } from "../_lib/catalog-store"
import { useCanEditBidRequests } from "../_lib/use-can-edit"
import { useProjectsStore, newProjectTrade, answerProgress } from "../_lib/projects-store"
import { useAsyncSave } from "../_lib/use-async-save"
import { tradeIcon } from "../_lib/trade-icons"
import { STATUS_META, PROJECT_STATUS_META } from "../_lib/status-meta"
import { formatMoney, formatAmount, parseMoneyInput, formatDate } from "../_lib/format"
import {
  bidAmountOf, currentStatus, lastOfType, leadTimeOf, questionnaireId, revisionId, sameParams,
  subcontractorOf,
} from "../_lib/events"
import { PROJECT_STATUS_LABEL, TRADE_STATUS_LABEL } from "../_lib/types"
import type {
  DocumentParams, Project, ProjectStatus, ProjectTrade, Trade, TradeEvent, TradeEventEdit,
} from "../_lib/types"
import { QuestionnaireForm } from "./questionnaire-form"
import { SubcontractorPicker } from "./subcontractor-picker"
import { DocumentPreviewModal } from "./document-preview-modal"
import { EventTimeline } from "./event-timeline"

const STATUSES: ProjectStatus[] = ["active", "on_hold", "completed"]

export function ProjectModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const trades = useCatalogStore(s => s.trades)
  const project = useProjectsStore(s => s.projects.find(p => p.id === projectId))
  const updateProject = useProjectsStore(s => s.updateProject)
  const updateProjectTrade = useProjectsStore(s => s.updateProjectTrade)
  const addTradeEvent = useProjectsStore(s => s.addTradeEvent)
  const updateTradeEvent = useProjectsStore(s => s.updateTradeEvent)
  const deleteTradeEvent = useProjectsStore(s => s.deleteTradeEvent)
  const { user } = useAuth()
  const canEdit = useCanEditBidRequests()
  const { resolvedTheme, setTheme } = useTheme()

  const { save, isSaving, stateOf } = useAsyncSave()
  const [openTradeId, setOpenTradeId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [tradeSearch, setTradeSearch] = useState("")
  const [pendingRemove, setPendingRemove] = useState<{ tradeId: string; name: string; answered: number } | null>(null)
  const [sortBy, setSortBy] = useState<"name" | "answered">("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [previewing, setPreviewing] = useState<"bid" | "contract" | null>(null)

  if (!project) return null

  // Every write lands immediately and settles on its own — no global save.
  function patchProject(key: string, p: Partial<Project>) {
    save(key, () => updateProject(projectId, p))
  }

  function patchTrade(tradeId: string, key: string, p: Partial<ProjectTrade>) {
    save(key, () => updateProjectTrade(projectId, tradeId, p))
  }

  function addTrade(tradeId: string) {
    save(`trade:${tradeId}`, () => updateProject(projectId, {
      trades: [...project!.trades, newProjectTrade(tradeId, user?.name ?? "")],
    }))
    setPicking(false)
    setTradeSearch("")
  }

  function removeTrade(tradeId: string) {
    updateProject(projectId, { trades: project!.trades.filter(t => t.tradeId !== tradeId) })
    if (openTradeId === tradeId) setOpenTradeId(null)
    setPendingRemove(null)
  }

  // Nothing answered means nothing to lose — only ask when there's work in it.
  function requestRemove(tradeId: string, name: string, answered: number) {
    if (answered === 0) removeTrade(tradeId)
    else setPendingRemove({ tradeId, name, answered })
  }

  const openTrade = openTradeId ? project.trades.find(t => t.tradeId === openTradeId) : null
  const openCatalog = openTrade ? trades.find(t => t.id === openTrade.tradeId) : null
  const available = trades.filter(t => !project.trades.some(pt => pt.tradeId === t.id))
  const matchingTrades = available.filter(t => {
    const term = tradeSearch.trim().toLowerCase()
    if (!term) return true
    return t.name.toLowerCase().includes(term) || (t.code ?? "").toLowerCase().includes(term)
  })

  const sortedTrades = [...project.trades].sort((a, b) => {
    const ta = trades.find(t => t.id === a.tradeId)
    const tb = trades.find(t => t.id === b.tradeId)
    const cmp = sortBy === "name"
      ? (ta?.name ?? "").localeCompare(tb?.name ?? "")
      : (ta ? answerProgress(ta, a.answers).answered : 0) - (tb ? answerProgress(tb, b.answers).answered : 0)
    return sortAsc ? cmp : -cmp
  })

  const OpenTradeIcon = openCatalog ? tradeIcon(openCatalog.icon) : tradeIcon("general")

  const SortIcon = sortBy === "name"
    ? (sortAsc ? ArrowDownAZ : ArrowUpZA)
    : (sortAsc ? ArrowDown01 : ArrowUp01)

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[86vh] w-[min(96vw,64rem)] max-w-none! flex-col gap-0 p-0"
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
          {openCatalog ? (
            <>
              <button
                onClick={() => setOpenTradeId(null)}
                aria-label="Back to project"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="h-8 w-px bg-border" />
              <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                <OpenTradeIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{openCatalog.name}</span>
              </DialogTitle>
              <div className="h-4 w-px bg-border/50" />
              <span className="min-w-0 truncate text-sm text-muted-foreground">{project.name}</span>
              <span className="flex-1" />
            </>
          ) : (
            <DialogTitle className="min-w-0 flex-1 truncate text-base">{project.name}</DialogTitle>
          )}
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            Added {formatDate(project.createdAt)}
          </span>
          {/* The documents are read against the theme — flipping it without
              leaving the modal saves a round trip. next-themes persists it. */}
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {openTrade && openCatalog ? (
          <TradeView
            projectTrade={openTrade}
            trade={openCatalog}
            canEdit={canEdit}
            isSaving={isSaving}
            stateOf={stateOf}
            onPatch={(key, p) => patchTrade(openTrade.tradeId, key, p)}
            onGenerate={kind => setPreviewing(kind)}
            onLogEvent={event => addTradeEvent(projectId, openTrade.tradeId, event)}
            onUpdateEvent={(eventId, patch) => updateTradeEvent(projectId, openTrade.tradeId, eventId, patch)}
            onDeleteEvent={eventId => deleteTradeEvent(projectId, openTrade.tradeId, eventId)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
            {/* ── Project metadata ─────────────────────────────────────── */}
            <div className="shrink-0 overflow-hidden rounded-xl border border-border/60 bg-card/40">
              <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
                <span className="flex items-center text-sm font-semibold leading-none">Project details</span>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <FieldWithState label="Title" htmlFor="project-name" saving={isSaving("project:name")}>
                  <Input
                    id="project-name"
                    value={project.name}
                    onChange={e => patchProject("project:name", { name: e.target.value })}
                    disabled={!canEdit}
                    placeholder="e.g. Bates Quarry Lot 19"
                    className="h-8 text-sm"
                  />
                </FieldWithState>
                <FieldWithState label="Address" htmlFor="project-address" saving={isSaving("project:address")}>
                  <Input
                    id="project-address"
                    value={project.address}
                    onChange={e => patchProject("project:address", { address: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Street, city, state, ZIP"
                    className="h-8 text-sm"
                  />
                </FieldWithState>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label="Status" saving={isSaving("project:status")} />
                  <div className="flex h-8 w-fit items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
                    {STATUSES.map(s => {
                      const meta = PROJECT_STATUS_META[s]
                      const Icon = meta.icon
                      const on = project.status === s
                      return (
                        <button
                          key={s}
                          onClick={() => patchProject("project:status", { status: s })}
                          disabled={!canEdit}
                          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none ${
                            on ? `bg-background shadow-sm ${meta.text}` : "text-muted-foreground hover:text-foreground"
                          } ${!canEdit && !on ? "opacity-50" : ""}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {PROJECT_STATUS_LABEL[s]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Trades ───────────────────────────────────────────────── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
              <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
                <span className="flex items-center text-sm font-semibold leading-none">Trades on this project</span>
                <span className="flex items-center text-xs leading-none text-muted-foreground">
                  {project.trades.length}
                </span>
                <div className="ml-auto flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
                  {/* No leading-none: uppercase-only text in a tight line box
                      renders visually high inside the 28px row. */}
                  <span className="flex h-full items-center border-r border-input bg-muted/40 px-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    Order by
                  </span>
                  <button
                    onClick={() => setSortBy("name")}
                    className={`flex h-full items-center px-2 text-[11px] font-medium leading-none transition-colors ${
                      sortBy === "name" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Name
                  </button>
                  <button
                    onClick={() => setSortBy("answered")}
                    className={`flex h-full items-center px-2 text-[11px] font-medium leading-none transition-colors ${
                      sortBy === "answered" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Answered
                  </button>
                  <button
                    onClick={() => setSortAsc(v => !v)}
                    aria-label="Toggle sort direction"
                    className="flex h-full items-center border-l border-input px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <SortIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {/* Add sits at the head of the list, as a row of the list itself —
                      and steps aside while the picker it opened is on screen. */}
                  {canEdit && !picking && (
                    <button
                      onClick={() => setPicking(true)}
                      className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Add trade</span>
                        <span className="block text-xs text-muted-foreground">
                          {available.length} available in the catalog
                        </span>
                      </span>
                    </button>
                  )}

                  {picking && (
                    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            autoFocus
                            value={tradeSearch}
                            onChange={e => setTradeSearch(e.target.value)}
                            placeholder="Search trades"
                            className="h-8 pl-8 pr-8 text-sm"
                          />
                          {tradeSearch && (
                            <button
                              onClick={() => setTradeSearch("")}
                              aria-label="Clear search"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPicking(false); setTradeSearch("") }}
                        >
                          Cancel
                        </Button>
                      </div>

                      {available.length === 0 ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          Every trade in the catalog is already on this project.
                        </p>
                      ) : matchingTrades.length === 0 ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          No trade matches this search.
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-3">
                          {matchingTrades.map(trade => {
                            const Icon = tradeIcon(trade.icon)
                            return (
                              <button
                                key={trade.id}
                                onClick={() => addTrade(trade.id)}
                                className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">{trade.name}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {trade.code ?? "Direct contract"}
                                  </span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {sortedTrades.map(pt => {
                    const trade = trades.find(t => t.id === pt.tradeId)
                    if (!trade) return null
                    return (
                      <TradeRow
                        key={pt.tradeId}
                        projectTrade={pt}
                        trade={trade}
                        loading={isSaving(`trade:${pt.tradeId}`)}
                        onOpen={() => setOpenTradeId(pt.tradeId)}
                        onRemove={canEdit ? answered => requestRemove(pt.tradeId, trade.name, answered) : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {previewing && openTrade && openCatalog && (
        <DocumentPreviewModal
          kind={previewing}
          project={project}
          projectTrade={openTrade}
          trade={openCatalog}
          onClose={() => setPreviewing(null)}
        />
      )}

      <AlertDialog open={!!pendingRemove} onOpenChange={v => { if (!v) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove?.answered} answered {pendingRemove?.answered === 1 ? "question" : "questions"} go with it,
              along with the sub and bid on this trade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRemove && removeTrade(pendingRemove.tradeId)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

// ── Small helpers for the inline save indicator ─────────────────────────────

function FieldLabel({ label, saving }: { label: string; saving: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label>{label}</Label>
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </span>
  )
}

function FieldWithState({
  label, htmlFor, saving, children,
}: {
  label: string
  htmlFor: string
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </span>
      {children}
    </div>
  )
}

// ── Row in the project overview ─────────────────────────────────────────────

function TradeRow({
  projectTrade, trade, loading, onOpen, onRemove,
}: {
  projectTrade: ProjectTrade
  trade: Trade
  loading: boolean
  onOpen: () => void
  onRemove?: (answered: number) => void   // absent for read-only access
}) {
  const Icon = tradeIcon(trade.icon)
  const status = currentStatus(trade, projectTrade)
  const meta = STATUS_META[status]
  const StatusIcon = meta.icon
  const { answered, total } = answerProgress(trade, projectTrade.answers)
  const complete = total > 0 && answered === total

  // The row lands right away and settles on its own — the rest of the modal
  // stays usable while this one is still coming up.
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/40 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground/60" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight text-muted-foreground">{trade.name}</span>
          <span className="block text-xs text-muted-foreground">Setting up this trade…</span>
        </span>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen() } }}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:ring-1 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${meta.border}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium leading-tight">{trade.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground/50">|</span>
          <span className="truncate text-xs text-muted-foreground">{trade.code ?? "Direct contract"}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <HardHat className="h-3 w-3 shrink-0" />
          <span className="truncate">{subcontractorOf(projectTrade) || "No sub assigned"}</span>
        </span>
      </span>

      {bidAmountOf(projectTrade) !== null && (
        <span className="shrink-0 text-xs font-medium tabular-nums">{formatMoney(bidAmountOf(projectTrade))}</span>
      )}

      <Badge variant="outline" className={`shrink-0 gap-1 text-[10px] ${meta.text} ${meta.border} ${meta.bg}`}>
        <StatusIcon className="h-3 w-3" />
        {TRADE_STATUS_LABEL[status]}
      </Badge>

      <Badge
        variant="outline"
        className={`shrink-0 gap-1 text-[10px] ${
          complete ? "border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-500" : "text-muted-foreground"
        }`}
      >
        {complete && <Check className="h-3 w-3" />}
        {answered}/{total} answered
      </Badge>

      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(answered) }}
          aria-label={`Remove ${trade.name}`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

// A disabled button explains itself — the reason is never obvious from the
// button alone, and a native title does not fire on a disabled control.
function DocButton({
  label, icon: Icon, variant, blocked, onClick,
}: {
  label: string
  icon: React.ElementType
  variant?: "outline"
  blocked: string | null
  onClick: () => void
}) {
  const button = (
    <Button size="sm" variant={variant} disabled={!!blocked} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  )

  if (!blocked) return button

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
          <span className="pointer-events-none">{button}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">{blocked}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Trade view inside the modal ─────────────────────────────────────────────

function TradeView({
  projectTrade: rawTrade, trade, canEdit, isSaving, stateOf, onPatch, onGenerate, onLogEvent,
  onUpdateEvent, onDeleteEvent,
}: {
  projectTrade: ProjectTrade
  trade: Trade
  canEdit: boolean
  isSaving: (key: string) => boolean
  stateOf: (key: string) => "idle" | "saving" | "saved"
  onPatch: (key: string, patch: Partial<ProjectTrade>) => void
  onGenerate: (kind: "bid" | "contract") => void
  onLogEvent: (event: TradeEvent) => void
  onUpdateEvent: (eventId: string, patch: TradeEventEdit) => void
  onDeleteEvent: (eventId: string) => void
}) {
  const captureRevision = useCatalogStore(s => s.captureRevision)
  const documentBlocks = useCatalogStore(s => s.documentBlocks)
  const revisions = useCatalogStore(s => s.revisions)

  // Params frozen before the questionnaire had a fingerprint of its own carry
  // only the full revision id. The definition they froze is still on file, so
  // the fingerprint is recomputed from that paper instead of guessed — an old
  // approval is judged by the same rule as a new one.
  const projectTrade = useMemo(() => ({
    ...rawTrade,
    events: rawTrade.events.map(event => {
      if (!event.params || event.params.questionnaireId) return event
      const frozen = revisions[event.params.tradeRevisionId]
      return {
        ...event,
        params: {
          ...event.params,
          questionnaireId: questionnaireId(frozen?.trade ?? trade, frozen?.blocks ?? documentBlocks),
        },
      }
    }),
  }), [rawTrade, revisions, trade, documentBlocks])
  const { answered, total } = answerProgress(trade, projectTrade.answers)
  const complete = total > 0 && answered === total
  // One at a time, like the trade editor — whichever is open takes the height
  // that is left and scrolls inside itself. A finished questionnaire has nothing
  // left to answer, so the trade opens on the history, where the next move is.
  const [openSection, setOpenSection] = useState<"questions" | "history">(
    complete ? "history" : "questions",
  )
  const showQuestions = openSection === "questions"
  const status = currentStatus(trade, projectTrade)
  const meta = STATUS_META[status]
  const prefix = `trade:${projectTrade.tradeId}`
  const bidAmount = bidAmountOf(projectTrade)
  const leadTime = leadTimeOf(projectTrade)
  const subcontractor = subcontractorOf(projectTrade)

  const currentParams = (): DocumentParams => ({
    tradeRevisionId: captureRevision(trade),
    questionnaireId: questionnaireId(trade, documentBlocks),
    answers: projectTrade.answers,
  })

  // What the trade says right now — the yardstick every frozen paper is measured
  // against. Computed without capturing, so rendering writes nothing.
  const current: DocumentParams = {
    tradeRevisionId: revisionId(trade, documentBlocks),
    questionnaireId: questionnaireId(trade, documentBlocks),
    answers: projectTrade.answers,
  }

  // The approval only holds while the paper behind it still matches the answers.
  const approved = lastOfType(projectTrade, "bid_approved")
  const staleApproval = approved?.params && !sameParams(approved.params, current)
    ? approved.params
    : null

  const contractReady = trade.hasBidForm
    ? !!approved && !staleApproval
    : complete

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
      {/* ── Metadata ───────────────────────────────────────────────────── */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="flex items-center text-sm font-semibold leading-none">Details</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            {/* Read-only on purpose: status is the tail of the history below. */}
            <FieldLabel label="Condition" saving={false} />
            <div className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm ${meta.text} ${meta.border} ${meta.bg}`}>
              <meta.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{TRADE_STATUS_LABEL[status]}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Read-only: the sub is whoever the last paper went to. */}
            <FieldLabel label="Subcontractor" saving={false} />
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm dark:bg-input/30">
              <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className={`truncate ${subcontractor ? "" : "text-muted-foreground"}`}>
                {subcontractor || "Not assigned yet"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Read-only: the price comes from the bid received event, so it can
                never say something the history does not back. */}
            <FieldLabel label="Bid amount" saving={false} />
            <div className="flex h-8 items-center justify-between gap-2 rounded-lg border border-input px-2.5 text-sm dark:bg-input/30">
              {bidAmount === null ? (
                <span className="text-muted-foreground">Not received yet</span>
              ) : (
                <>
                  <span className="truncate text-xs text-muted-foreground">{leadTime}</span>
                  <span className="font-medium tabular-nums">{formatMoney(bidAmount)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Questionnaire ──────────────────────────────────────────────── */}
      <div className={`flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 ${showQuestions ? "min-h-0 flex-1" : "shrink-0"}`}>
        <div className="flex shrink-0 items-center gap-3 px-4 py-3">
          <button
            onClick={() => setOpenSection("questions")}
            aria-expanded={showQuestions}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold leading-none">
              <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
              Questionnaire
            </span>
            <span className={`flex items-center text-xs leading-none ${complete ? "text-emerald-500" : "text-muted-foreground"}`}>
              {answered}/{total} answered
            </span>
          </button>
          <span className="flex-1" />
          {trade.hasBidForm && (
            <DocButton
              label="Bid request"
              icon={FileOutput}
              variant="outline"
              blocked={complete ? null : `Answer all ${total} questions first`}
              onClick={() => onGenerate("bid")}
            />
          )}
          <DocButton
            label="Contract"
            icon={FileSignature}
            blocked={
              contractReady ? null
              : !complete ? `Answer all ${total} questions first`
              : staleApproval ? "The answers changed — the bid needs a new approval"
              : "The bid has to be approved first"
            }
            onClick={() => onGenerate("contract")}
          />
          <button
            onClick={() => setOpenSection("questions")}
            aria-expanded={showQuestions}
            aria-label={showQuestions ? "Collapse questionnaire" : "Expand questionnaire"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showQuestions ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showQuestions && (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto border-t border-border/50 p-4">
            <QuestionnaireForm
              questions={trade.questions}
              answers={projectTrade.answers}
              readOnly={!canEdit}
              saveStateOf={questionId => stateOf(`${prefix}:q:${questionId}`)}
              onChange={(questionId, value) => onPatch(`${prefix}:q:${questionId}`, {
                answers: { ...projectTrade.answers, [questionId]: value },
              })}
            />
          </div>
        )}
      </div>

      {/* ── History ────────────────────────────────────────────────────── */}
      <EventTimeline
        trade={trade}
        projectTrade={projectTrade}
        canEdit={canEdit}
        complete={complete}
        current={current}
        currentParams={currentParams}
        staleApproval={staleApproval}
        open={openSection === "history"}
        onToggle={() => setOpenSection(s => (s === "history" ? "questions" : "history"))}
        onLog={onLogEvent}
        onUpdate={onUpdateEvent}
        onDelete={onDeleteEvent}
      />
    </div>
  )
}
