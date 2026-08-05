"use client"

import { useState } from "react"
import {
  CalendarIcon, ChevronDown, CircleAlert, ExternalLink, HardHat, History, Info, KeyRound, Lock,
  Pencil, Plus, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { STATUS_META } from "../_lib/status-meta"
import {
  availableEventTypes, blockedReason, diffParams, eventDateBounds, eventDay, eventFlow,
  NAMES_SUBCONTRACTOR, newEventMinDay, nextEventId, nextStepHint, STEP_TONE, subcontractorOf,
} from "../_lib/events"
import {
  formatAmount, formatDate, formatDateTime, formatLeadTime, formatMoney, LEAD_TIME_UNITS,
  parseLeadTimeInput, parseMoneyInput,
} from "../_lib/format"
import { EVENT_STATUS, TRADE_EVENT_LABEL } from "../_lib/types"
import type {
  DocumentParams, LeadTimeUnit, ProjectTrade, Trade, TradeEvent, TradeEventEdit, TradeEventType,
} from "../_lib/types"
import { DeleteButton } from "./delete-button"
import { SubcontractorPicker } from "./subcontractor-picker"

// Events that put paper in front of the sub freeze what that paper said.
const CAPTURES_PARAMS: TradeEventType[] = ["bid_sent", "bid_approved", "contract_sent"]

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// A count and its scale. Weeks by default: it is how subs quote almost always.
function LeadTimeField({
  id, value, unit, onValue, onUnit,
}: {
  id: string
  value: number | null
  unit: LeadTimeUnit
  onValue: (value: number | null) => void
  onUnit: (unit: LeadTimeUnit) => void
}) {
  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        value={value === null ? "" : String(value)}
        onChange={e => onValue(parseLeadTimeInput(e.target.value))}
        inputMode="numeric"
        placeholder="0"
        className="h-8 w-14 shrink-0 text-right text-sm tabular-nums"
      />
      <Select value={unit} onValueChange={v => v && onUnit(v as LeadTimeUnit)}>
        <SelectTrigger className="h-8 flex-1">
          <span className="flex-1 truncate text-left text-sm">{unit}</span>
        </SelectTrigger>
        <SelectContent>
          {LEAD_TIME_UNITS.map(u => (
            <SelectItem key={u} value={u}>{u}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function EventTypeOption({ type, step }: { type: TradeEventType; step: number }) {
  const meta = STATUS_META[EVENT_STATUS[type]]
  const Icon = meta.icon
  return (
    <span className="flex items-center gap-2">
      <span className="w-3 shrink-0 text-xs tabular-nums text-muted-foreground">{step}</span>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.text}`} />
      {TRADE_EVENT_LABEL[type]}
    </span>
  )
}

function LogEventForm({
  flow, options, projectTrade, currentParams, currentSub, loggedBy, onClose, onLog,
}: {
  flow: TradeEventType[]
  currentSub: string
  loggedBy: string
  options: TradeEventType[]
  projectTrade: ProjectTrade
  currentParams: () => DocumentParams
  onClose: () => void
  onLog: (event: TradeEvent) => void
}) {
  // Nothing can have happened before the last thing that happened, so today is
  // only the default when today clears that floor.
  const minDay = newEventMinDay(projectTrade.events)
  const today = toISODate(new Date())

  const [type, setType] = useState<TradeEventType>(options[0])
  const [at, setAt] = useState(minDay && minDay > today ? minDay : today)
  const [note, setNote] = useState("")
  const [url, setUrl] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [leadTimeValue, setLeadTimeValue] = useState<number | null>(null)
  const [leadTimeUnit, setLeadTimeUnit] = useState<LeadTimeUnit>("weeks")
  const [sub, setSub] = useState(currentSub)
  const [pickingDate, setPickingDate] = useState(false)

  const selected = new Date(`${at}T00:00:00`)
  const min = minDay ? new Date(`${minDay}T00:00:00`) : null
  const needsUrl = type === "contract_signed"
  const needsPrice = type === "bid_received"
  const needsSub = NAMES_SUBCONTRACTOR.includes(type)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <Label>What happened</Label>
        <Select value={type} onValueChange={v => v && setType(v as TradeEventType)}>
          <SelectTrigger className="h-8 w-full">
            <span className="flex-1 truncate text-left text-sm">
              <EventTypeOption type={type} step={flow.indexOf(type) + 1} />
            </span>
          </SelectTrigger>
          {/* The whole ladder is listed; only the steps that make sense now can
              be picked. */}
          <SelectContent>
            {flow.map((t, i) => (
              <SelectItem key={t} value={t} disabled={!options.includes(t)}>
                <EventTypeOption type={t} step={i + 1} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>When it happened</Label>
        <Popover open={pickingDate} onOpenChange={setPickingDate}>
          <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50">
            <span className="flex-1 truncate text-left">{formatDate(selected.toISOString())}</span>
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-auto gap-0 p-0">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              disabled={min ? [{ before: min }] : []}
              onSelect={d => { if (d) { setAt(toISODate(d)); setPickingDate(false) } }}
            />
          </PopoverContent>
        </Popover>
        {min && (
          <p className="text-xs text-muted-foreground">
            No earlier than {formatDate(min.toISOString())}, when the last step happened.
          </p>
        )}
      </div>

      {needsSub && (
        <div className="flex flex-col gap-1.5">
          <Label>Subcontractor</Label>
          <SubcontractorPicker value={sub} onChange={setSub} />
          <p className="text-xs text-muted-foreground">
            Sending the paper is what assigns the sub to this trade.
          </p>
        </div>
      )}

      {needsPrice && (
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="event-amount">Bid amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="event-amount"
                value={formatAmount(amount)}
                onChange={e => setAmount(parseMoneyInput(e.target.value))}
                inputMode="numeric"
                placeholder="0.00"
                className="h-8 pl-6 text-right text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="event-lead">Lead time</Label>
            <LeadTimeField
              id="event-lead"
              value={leadTimeValue}
              unit={leadTimeUnit}
              onValue={setLeadTimeValue}
              onUnit={setLeadTimeUnit}
            />
          </div>
        </div>
      )}

      {needsUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-url">SharePoint link</Label>
          <Input
            id="event-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
            className="text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-note">Note</Label>
        <Input
          id="event-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          className="text-sm"
        />
      </div>

      {CAPTURES_PARAMS.includes(type) && (
        <p className="flex gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Freezes the answers and the catalog definition in use right now, so this
            document can be reproduced exactly as it went out.
          </span>
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          disabled={
            (needsUrl && !url.trim())
            || (needsPrice && amount === null)
            || (needsSub && !sub.trim())
          }
          onClick={() => {
            onLog({
              id: nextEventId(projectTrade),
              type,
              at: new Date(`${at}T12:00:00`).toISOString(),
              recordedAt: new Date().toISOString(),
              by: loggedBy,
              note: note.trim(),
              params: CAPTURES_PARAMS.includes(type) ? currentParams() : null,
              url: url.trim(),
              amount: needsPrice ? amount : null,
              leadTimeValue: needsPrice ? leadTimeValue : null,
              leadTimeUnit,
              subcontractor: needsSub ? sub.trim() : "",
            })
            onClose()
          }}
        >
          Log event
        </Button>
      </div>
    </div>
  )
}

// Correcting what was typed in, not re-telling the story: the step stays, and
// the day can only move inside the window its neighbours leave open.
function EditEventForm({
  event, bounds, onClose, onSave,
}: {
  event: TradeEvent
  bounds: { min: string | null; max: string | null }
  onClose: () => void
  onSave: (patch: TradeEventEdit) => void
}) {
  const [at, setAt] = useState(eventDay(event.at))
  const [note, setNote] = useState(event.note)
  const [url, setUrl] = useState(event.url)
  const [amount, setAmount] = useState(event.amount)
  const [leadTimeValue, setLeadTimeValue] = useState(event.leadTimeValue)
  const [leadTimeUnit, setLeadTimeUnit] = useState(event.leadTimeUnit)
  const [sub, setSub] = useState(event.subcontractor)
  const [pickingDate, setPickingDate] = useState(false)

  const selected = new Date(`${at}T00:00:00`)
  const needsUrl = event.type === "contract_signed"
  const needsPrice = event.type === "bid_received"
  const needsSub = NAMES_SUBCONTRACTOR.includes(event.type)

  const min = bounds.min ? new Date(`${bounds.min}T00:00:00`) : null
  const max = bounds.max ? new Date(`${bounds.max}T00:00:00`) : null
  const outOfRange = [
    ...(min ? [{ before: min }] : []),
    ...(max ? [{ after: max }] : []),
  ]

  const range = min && max
    ? `Between ${formatDate(min.toISOString())} and ${formatDate(max.toISOString())}`
    : min ? `No earlier than ${formatDate(min.toISOString())}`
    : max ? `No later than ${formatDate(max.toISOString())}`
    : null

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <Label>What happened</Label>
        {/* The step is what the rest of the ladder is read from — to change it,
            the event has to be removed and logged again. */}
        <span className="flex h-8 items-center gap-2 rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {TRADE_EVENT_LABEL[event.type]}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>When it happened</Label>
        <Popover open={pickingDate} onOpenChange={setPickingDate}>
          <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50">
            <span className="flex-1 truncate text-left">{formatDate(selected.toISOString())}</span>
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-auto gap-0 p-0">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              disabled={outOfRange}
              onSelect={d => { if (d) { setAt(toISODate(d)); setPickingDate(false) } }}
            />
          </PopoverContent>
        </Popover>
        {range && (
          <p className="text-xs text-muted-foreground">
            {range} — the steps around it happened then.
          </p>
        )}
      </div>

      {needsSub && (
        <div className="flex flex-col gap-1.5">
          <Label>Subcontractor</Label>
          <SubcontractorPicker value={sub} onChange={setSub} />
        </div>
      )}

      {needsPrice && (
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="edit-amount">Bid amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="edit-amount"
                value={formatAmount(amount)}
                onChange={e => setAmount(parseMoneyInput(e.target.value))}
                inputMode="numeric"
                placeholder="0.00"
                className="h-8 pl-6 text-right text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="edit-lead">Lead time</Label>
            <LeadTimeField
              id="edit-lead"
              value={leadTimeValue}
              unit={leadTimeUnit}
              onValue={setLeadTimeValue}
              onUnit={setLeadTimeUnit}
            />
          </div>
        </div>
      )}

      {needsUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-url">SharePoint link</Label>
          <Input
            id="edit-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
            className="text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-note">Note</Label>
        <Input
          id="edit-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          className="text-sm"
        />
      </div>

      {event.params && (
        <p className="flex gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The answers frozen with this document are not touched — the paper the
            sub received stays reproducible.
          </span>
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          disabled={
            (needsUrl && !url.trim())
            || (needsPrice && amount === null)
            || (needsSub && !sub.trim())
          }
          onClick={() => {
            onSave({
              at: new Date(`${at}T12:00:00`).toISOString(),
              note: note.trim(),
              url: url.trim(),
              amount: needsPrice ? amount : null,
              leadTimeValue: needsPrice ? leadTimeValue : null,
              leadTimeUnit,
              subcontractor: needsSub ? sub.trim() : "",
            })
            onClose()
          }}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}

export function EventTimeline({
  trade, projectTrade, complete, current, currentParams, staleApproval, open, onToggle, onLog,
  onUpdate, onDelete,
}: {
  trade: Trade
  projectTrade: ProjectTrade
  complete: boolean
  current: DocumentParams                // what the trade says right now
  currentParams: () => DocumentParams    // same, but freezing the definition
  staleApproval: DocumentParams | null   // the approved params, when they no longer match
  open: boolean
  onToggle: () => void
  onLog: (event: TradeEvent) => void
  onUpdate: (eventId: string, patch: TradeEventEdit) => void
  onDelete: (eventId: string) => void
}) {
  const { user } = useAuth()
  const [logging, setLogging] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const step = nextStepHint(trade, projectTrade, { complete, staleApproval: !!staleApproval })
  const flow = eventFlow(trade)
  const options = availableEventTypes(trade, projectTrade, { complete, current })
  const blocked = options.length === 0 ? blockedReason(trade, projectTrade, { complete }) : null
  const changes = staleApproval ? diffParams(trade, staleApproval, current) : []

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-border/60 ${open ? "min-h-0 flex-1" : "shrink-0"}`}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold leading-none">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            History
          </span>
          <span className="flex items-center text-xs leading-none text-muted-foreground">
            {projectTrade.events.length} {projectTrade.events.length === 1 ? "event" : "events"}
          </span>
        </button>

        <span className={`shrink-0 truncate text-xs leading-none ${STEP_TONE[step.tone]}`}>
          {step.label}
        </span>

        <Popover open={logging} onOpenChange={setLogging}>
          {blocked ? (
            // A disabled trigger swallows its own title — the reason has to come
            // from a tooltip on a wrapper.
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
                  <span className="pointer-events-none">
                    <Button size="sm" variant="outline" disabled>
                      <Plus className="h-3.5 w-3.5" />
                      Log event
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">{blocked}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <Plus className="h-3.5 w-3.5" />
              Log event
            </PopoverTrigger>
          )}
          {/* Hangs off the button towards the left, where there is room. */}
          <PopoverContent side="bottom" align="end" className="w-[320px] gap-0 p-0">
            {logging && (
              <LogEventForm
                flow={flow}
                options={options}
                projectTrade={projectTrade}
                currentParams={currentParams}
                currentSub={subcontractorOf(projectTrade)}
                loggedBy={user?.name ?? ""}
                onClose={() => setLogging(false)}
                onLog={onLog}
              />
            )}
          </PopoverContent>
        </Popover>

        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse history" : "Expand history"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-t border-border/50 p-4">
          {staleApproval && (
            // Same skeleton as an event card — only the accent colour sets it apart.
            <div className="flex shrink-0 items-start gap-3 rounded-lg border border-amber-500/40 bg-muted/40 p-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/[0.07] text-amber-500">
                <CircleAlert className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight text-amber-500">
                  Conditions changed — needs a new approval
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Put the answers back the way they were and the approval stands again.
                </p>
                {changes.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {changes.map(c => (
                      <li key={c.questionId} className="text-xs">
                        <span className="text-muted-foreground">{c.label}: </span>
                        <span className="line-through opacity-60">{c.approved}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{c.current}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <ol className="flex shrink-0 flex-col gap-2">
            {[...projectTrade.events].reverse().map(event => {
              const meta = STATUS_META[EVENT_STATUS[event.type]]
              const Icon = meta.icon
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/40 p-3"
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${meta.border} ${meta.bg} ${meta.text}`}>
                    <Icon className="h-3 w-3" />
                  </span>

                  {/* Left side is what the event says; when it happened and when
                      it was typed are metadata, and sit by the delete button. */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{TRADE_EVENT_LABEL[event.type]}</p>
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">{formatDate(event.at)}</span>
                      {event.note && <span className="text-muted-foreground"> · </span>}
                      {event.note}
                    </p>

                    {event.subcontractor && (
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        <HardHat className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {event.subcontractor}
                      </p>
                    )}
                    {(event.amount !== null || event.leadTimeValue !== null) && (
                      <p className="mt-1 text-xs">
                        {event.amount !== null && (
                          <span className="font-medium tabular-nums">{formatMoney(event.amount)}</span>
                        )}
                        {event.amount !== null && event.leadTimeValue !== null && (
                          <span className="text-muted-foreground"> · </span>
                        )}
                        {event.leadTimeValue !== null && (
                          <span className="text-muted-foreground">
                            {formatLeadTime(event.leadTimeValue, event.leadTimeUnit)}
                          </span>
                        )}
                      </p>
                    )}
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Signed contract
                      </a>
                    )}
                  </div>

                  {/* Audit only: when it was typed in, and which paper it froze.
                      The day it happened is what the event says, and sits on the
                      left. */}
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="flex flex-col items-end gap-0.5 text-right text-[11px] leading-tight text-muted-foreground/60">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                          {formatDateTime(event.recordedAt)}
                        </span>
                        {event.by && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-2.5 w-2.5 shrink-0" />
                            {event.by}
                          </span>
                        )}
                      </span>
                      {event.params && (
                        <span className="inline-flex items-center gap-1">
                          Answers and definition frozen ·
                          <KeyRound className="h-2.5 w-2.5 shrink-0" />
                          {event.params.tradeRevisionId.slice(-6)}
                        </span>
                      )}
                    </span>
                    {event.type !== "created" && (
                      <>
                        <Popover
                          open={editing === event.id}
                          onOpenChange={o => setEditing(o ? event.id : null)}
                        >
                          <PopoverTrigger
                            aria-label={`Edit ${TRADE_EVENT_LABEL[event.type]}`}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </PopoverTrigger>
                          <PopoverContent side="bottom" align="end" className="w-[320px] gap-0 p-0">
                            {editing === event.id && (
                              <EditEventForm
                                event={event}
                                bounds={eventDateBounds(projectTrade.events, event.id)}
                                onClose={() => setEditing(null)}
                                onSave={patch => onUpdate(event.id, patch)}
                              />
                            )}
                          </PopoverContent>
                        </Popover>
                        <DeleteButton
                          label={`Remove ${TRADE_EVENT_LABEL[event.type]}`}
                          confirm
                          onDelete={() => onDelete(event.id)}
                        />
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
