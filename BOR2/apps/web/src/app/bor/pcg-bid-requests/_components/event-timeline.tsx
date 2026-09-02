"use client"

import { useState } from "react"
import {
  CalendarIcon, ChevronDown, CircleAlert, ExternalLink, FilePen, HardHat, History, Info, KeyRound,
  Lock, Pencil, Plus, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { eventMeta } from "../_lib/status-meta"
import {
  availableEventTypes, bidAmountOf, blockedReason, compareEvents, diffParams, eventDateBounds,
  eventDay, eventFlow, NAMES_SUBCONTRACTOR, newEventMinDay, nextEventId, nextStepHint, roundBids,
  SETS_SCHEDULE, STEP_TONE, subcontractorOf,
} from "../_lib/events"
import {
  formatAmount, formatDate, formatDateTime, formatLeadTime, formatMoney, LEAD_TIME_UNITS,
  parseLeadTimeInput, parseMoneyInput,
} from "../_lib/format"
import { TRADE_EVENT_LABEL } from "../_lib/types"
import type {
  DocumentParams, LeadTimeUnit, PaymentMilestone, ProjectTrade, Trade, TradeEvent, TradeEventEdit,
  TradeEventType,
} from "../_lib/types"
import { DeleteButton } from "./delete-button"
import { PaymentSchedulePopover } from "./payment-schedule-popover"
import { SubcontractorPicker } from "./subcontractor-picker"

// Events that put paper in front of the sub freeze what that paper said.
const CAPTURES_PARAMS: TradeEventType[] = [
  "bid_sent", "bid_approved", "bid_adjustment", "contract_sent",
]

// A link typed without a scheme is still a link to somewhere else. Left as
// typed, "premiumgroup.sharepoint.com/..." resolves against this app's own
// origin and lands on a page of the dashboard that does not exist.
function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
}

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

// Steps that end in one of two ways. Neither partner is a step of its own — it
// is the other outcome of the step it is paired with — so the two share a row
// and a number instead of the second one being exiled below the ladder.
// What the two outcomes have in common is written once, at the head of the row:
// side by side, "Contract signed" and "Contract adjusted" spend most of their
// width repeating the word the row is already about.
const SHARED_STEP: Partial<Record<TradeEventType, {
  partner: TradeEventType
  noun: string
  label: string
  partnerLabel: string
}>> = {
  bid_approved: {
    partner: "bid_declined", noun: "Bid", label: "Approved", partnerLabel: "Declined",
  },
  contract_signed: {
    partner: "contract_adjustment", noun: "Contract", label: "Signed", partnerLabel: "Adjusted",
  },
}

const STEP_OWNER = Object.fromEntries(
  Object.entries(SHARED_STEP).map(([owner, pair]) => [pair.partner, owner]),
) as Partial<Record<TradeEventType, TradeEventType>>

// The number a type is shown with, in the list and on the trigger alike. A
// partner borrows its step's. Anything genuinely off the ladder comes back 0.
function stepOf(flow: TradeEventType[], type: TradeEventType): number {
  return flow.indexOf(STEP_OWNER[type] ?? type) + 1
}

// Equal halves of the row, whatever they hold — so the pair reads as one control
// with two sides rather than two labels of different lengths. The text is
// centred in the half it got: the item's own `justify-center` cannot do it while
// SelectItemText is `flex-1` and fills the box, so that one is pinned back to
// its content width.
const PAIR_ITEM =
  "min-w-0 flex-1 justify-center px-1 [&>div]:flex-none data-[selected]:bg-accent/60"

function EventTypeOption({
  type, step, showStep = true, label,
}: { type: TradeEventType; step: number; showStep?: boolean; label?: string }) {
  const meta = eventMeta(type)
  const Icon = meta.icon
  return (
    <span className="flex items-center gap-2">
      {/* Step 0 means "not a step": an off-ladder event keeps the column so the
          labels stay aligned, but carries no number. Dropped outright inside a
          shared row, where the number is already at the head of the row. */}
      {showStep && (
        <span className="w-3 shrink-0 text-xs tabular-nums text-muted-foreground">{step || ""}</span>
      )}
      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.text}`} />
      {label ?? TRADE_EVENT_LABEL[type]}
    </span>
  )
}

function LogEventForm({
  flow, options, projectTrade, current, currentParams, currentSub, loggedBy, onClose, onLog,
}: {
  flow: TradeEventType[]
  currentSub: string
  loggedBy: string
  options: TradeEventType[]
  projectTrade: ProjectTrade
  current: DocumentParams
  currentParams: () => DocumentParams
  onClose: () => void
  onLog: (event: TradeEvent) => void
}) {
  const today = toISODate(new Date())

  const [type, setType] = useState<TradeEventType>(options[0])
  // Nothing can have happened before the last thing that happened, so today is
  // only the default when today clears that floor. The floor moves with the
  // step being logged — a send has none.
  const minDay = newEventMinDay(projectTrade.events, type)
  const [at, setAt] = useState(() => {
    const floor = newEventMinDay(projectTrade.events, options[0])
    return floor && floor > today ? floor : today
  })

  // Switching step can raise the floor above the day already picked — a send is
  // free to be backdated, and what follows it is not.
  const changeType = (next: TradeEventType) => {
    setType(next)
    const floor = newEventMinDay(projectTrade.events, next)
    if (floor && at < floor) setAt(floor)
  }
  const [note, setNote] = useState("")
  const [url, setUrl] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [leadTimeValue, setLeadTimeValue] = useState<number | null>(null)
  const [leadTimeUnit, setLeadTimeUnit] = useState<LeadTimeUnit>("weeks")
  // Blank on purpose: a second envelope goes to a different company, so
  // pre-filling the last one would quietly send the same sub two forms.
  const [sub, setSub] = useState("")
  const [pickingDate, setPickingDate] = useState(false)

  const selected = new Date(`${at}T00:00:00`)
  const min = minDay ? new Date(`${minDay}T00:00:00`) : null
  const needsUrl = type === "contract_signed"
  const needsPrice = type === "bid_received"
  const needsSub = NAMES_SUBCONTRACTOR.includes(type)

  // A price comes back from one of the subs the form went to; an approval or a
  // refusal decides one of the subs who answered. Neither is free text — the
  // name has to be one already in the round.
  // `current`, never `currentParams()`: the capturing one writes a revision to
  // the catalog, and doing that while rendering updates a store mid-render.
  const bids = roundBids(projectTrade, current)
  const eligible =
    type === "bid_received" ? bids.filter(b => !b.receivedAt)
    : type === "bid_approved" || type === "bid_declined" ? bids.filter(b => b.receivedAt && !b.outcome)
    : []
  const pickFromRound = eligible.length > 0
  const chosenSub = pickFromRound
    ? (eligible.some(b => b.subcontractor === sub) ? sub : eligible[0].subcontractor)
    : sub

  // The name that will actually be written to the event: the round's pick, the
  // sub the contract is already going to, or whatever was typed.
  const savedSub = type === "contract_sent" && currentSub ? currentSub : chosenSub

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <Label>What happened</Label>
        <Select value={type} onValueChange={v => v && changeType(v as TradeEventType)}>
          <SelectTrigger className="h-8 w-full">
            <span className="flex-1 truncate text-left text-sm">
              <EventTypeOption type={type} step={stepOf(flow, type)} />
            </span>
          </SelectTrigger>
          {/* The whole ladder is listed; only the steps that make sense now can
              be picked. Below it, what is available but is not a step: adjusting
              a bid moves nothing forward, so it has no number — and listing only
              the ladder would hide it.
              A step that ends in one of two ways takes a row of its own: the
              number and the thing both outcomes are about on the left, then the
              two outcomes side by side. */}
          <SelectContent>
            {flow.map((t, i) => {
              const pair = SHARED_STEP[t]
              // Both outcomes are always on screen, greyed when they cannot be
              // picked — same as the steps already behind us. A step that shows
              // one outcome today and two tomorrow reads as a menu that changes
              // shape, and you cannot learn a ladder that keeps rearranging.
              return pair ? (
                <div key={t} className="flex items-center gap-2 pl-1.5">
                  {/* The noun heads the row, it is not one of the choices: same
                      type and same colour as the step number it sits next to, so
                      the only thing standing out in the row is what there is to
                      pick.
                      Floored at the width of the longest noun, so every shared
                      step hands its options the same slot and they line up down
                      the list instead of starting wherever the word ended.
                      Dimmed with the row when neither outcome can be picked: it
                      sits outside the items, so the disabled styling they get for
                      free never reaches it. One outcome still open leaves the
                      head lit — the step is reachable. */}
                  <span
                    className={`flex w-17 shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground ${
                      options.includes(t) || options.includes(pair.partner) ? "" : "opacity-50"
                    }`}
                  >
                    <span className="w-3 shrink-0">{i + 1}</span>
                    {pair.noun}
                  </span>
                  <div className="flex min-w-0 flex-1 gap-1">
                    <SelectItem
                      value={t}
                      disabled={!options.includes(t)}
                      indicator={false}
                      className={PAIR_ITEM}
                    >
                      <EventTypeOption type={t} step={0} showStep={false} label={pair.label} />
                    </SelectItem>
                    <SelectItem
                      value={pair.partner}
                      disabled={!options.includes(pair.partner)}
                      indicator={false}
                      className={PAIR_ITEM}
                    >
                      <EventTypeOption
                        type={pair.partner}
                        step={0}
                        showStep={false}
                        label={pair.partnerLabel}
                      />
                    </SelectItem>
                  </div>
                </div>
              ) : (
                <SelectItem key={t} value={t} disabled={!options.includes(t)}>
                  <EventTypeOption type={t} step={i + 1} />
                </SelectItem>
              )
            })}
            {/* Whatever is available and belongs to no step at all. A partner is
                never listed here — it is already up in its step's row. */}
            {options.filter(t => !flow.includes(t) && !STEP_OWNER[t]).map(t => (
              <SelectItem key={t} value={t}>
                <EventTypeOption type={t} step={stepOf(flow, t)} />
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
          {/* The contract goes to whoever priced and won the bid. Offering a
              picker here would let the paper leave for a company that never
              quoted the job. */}
          {type === "contract_sent" && currentSub ? (
            <>
              {/* Same face as the picker and the round's select — all three are
                  the subcontractor field, whatever the event lets you do with
                  it. */}
              <p className="flex h-8 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 text-sm">
                <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{currentSub}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                The contract goes to the sub the bid was approved with.
              </p>
            </>
          ) : pickFromRound ? (
            <>
              {/* One candidate is not a choice. The field still says who it is,
                  because the event is about them — it just stops pretending
                  there is something to pick. */}
              <Select
                value={chosenSub}
                onValueChange={v => v && setSub(v)}
                disabled={eligible.length === 1}
              >
                <SelectTrigger className="h-8 w-full">
                  <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left text-sm">{chosenSub}</span>
                </SelectTrigger>
                <SelectContent>
                  {eligible.map(b => (
                    <SelectItem key={b.subcontractor} value={b.subcontractor}>
                      {b.subcontractor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {eligible.length === 1
                  ? type === "bid_received"
                    ? "The only sub this form is still waiting on."
                    : "The only sub who answered and is still without a decision."
                  : type === "bid_received"
                    ? "Of the subs this form went to, still waiting on a price."
                    : "Of the subs who answered, still without a decision."}
              </p>
            </>
          ) : (
            <>
              <SubcontractorPicker value={sub} onChange={setSub} />
              <p className="text-xs text-muted-foreground">
                Sending the paper is what assigns the sub to this trade.
              </p>
            </>
          )}
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
            <Label htmlFor="event-lead">Term set by PCG</Label>
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
        {/* A note is prose, not a value — it grows with what is written. */}
        <Textarea
          id="event-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          rows={2}
          className="min-h-14 text-sm"
        />
      </div>

      {CAPTURES_PARAMS.includes(type) && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
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
            // The name that will be saved — for a step decided inside the round
            // that is what the select resolved to, not the untouched state.
            || (needsSub && !savedSub.trim())
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
              subcontractor: needsSub ? savedSub.trim() : "",
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
  event, bounds, subLocked, onClose, onSave,
}: {
  event: TradeEvent
  bounds: { min: string | null; max: string | null }
  // A contract that already went out names a company. Correcting a typo in the
  // history cannot quietly move the paper to a different sub.
  subLocked: boolean
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
          {subLocked ? (
            <>
              <p className="flex h-8 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 text-sm">
                <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{sub || "—"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                The contract is already out; the sub it names cannot be changed here.
              </p>
            </>
          ) : (
            <SubcontractorPicker value={sub} onChange={setSub} />
          )}
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
            <Label htmlFor="edit-lead">Term set by PCG</Label>
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
        <Textarea
          id="edit-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          rows={2}
          className="min-h-14 text-sm"
        />
      </div>

      {event.params && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
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
  trade, projectTrade, canEdit, complete, current, currentParams, staleApproval, open, onToggle,
  onLog, onUpdate, onDelete, onEditTerms, onSaveSchedule, overrideCount,
}: {
  trade: Trade
  projectTrade: ProjectTrade
  canEdit: boolean
  complete: boolean
  current: DocumentParams                // what the trade says right now
  currentParams: () => DocumentParams    // same, but freezing the definition
  staleApproval: DocumentParams | null   // the approved params, when they no longer match
  open: boolean
  onToggle: () => void
  onLog: (event: TradeEvent) => void
  onUpdate: (eventId: string, patch: TradeEventEdit) => void
  onDelete: (eventId: string) => void
  onEditTerms: () => void
  onSaveSchedule: (eventId: string, schedule: PaymentMilestone[]) => void
  overrideCount: number
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

        <Popover open={logging && canEdit} onOpenChange={setLogging}>
          {!canEdit ? null : blocked ? (
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
          {/* Hangs off the button towards the left, where there is room. Stays
              on the vertical axis whatever happens: once the history is long
              enough that the form no longer fits under the button, the default
              is to throw it out to the side, where it lands against the viewport
              edge reading as if it belonged to nothing. Above, below, or scrolled
              — but always off this button. */}
          <PopoverContent
            side="bottom"
            align="end"
            collisionAvoidance={{ fallbackAxisSide: "none" }}
            className="max-h-(--available-height) w-[320px] gap-0 overflow-y-auto p-0"
          >
            {logging && (
              <LogEventForm
                flow={flow}
                options={options}
                projectTrade={projectTrade}
                current={current}
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/[0.07] text-amber-500">
                <CircleAlert className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight text-amber-500">
                  Conditions changed — needs a new approval
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Put the answers back the way they were and the approval stands again. If the
                  change came from the sub, log a bid adjustment and the approval moves onto it.
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

          {/* Sorted here and not only on write: histories stored before a type
              had its place in the ladder keep the order they were saved in, and
              nothing would ever re-sort them. */}
          <ol className="flex shrink-0 flex-col gap-2">
            {[...projectTrade.events].sort(compareEvents).reverse().map(event => {
              const meta = eventMeta(event.type)
              const Icon = meta.icon
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/40 p-3"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${meta.border} ${meta.bg} ${meta.text}`}>
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
                    {/* Logging the adjustment says a change was agreed; this is
                        where it gets written down. The terms live here and
                        nowhere else — an adjustment nobody spelled out is a note
                        saying something changed without saying what. */}
                    <div className="flex flex-wrap items-center gap-2 empty:hidden">
                    {event.url && (
                      // With the other actions of the row, and looking like them:
                      // it is one more thing to open, not a footnote.
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        // It looks like the buttons beside it, but it is a link:
                        // told to the primitive so it keeps link semantics
                        // instead of claiming to be a button it is not.
                        nativeButton={false}
                        render={<a href={externalHref(event.url)} target="_blank" rel="noreferrer" />}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Signed contract
                      </Button>
                    )}
                    {event.type === "contract_adjustment" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={onEditTerms}
                      >
                        <FilePen className="h-3.5 w-3.5" />
                        {overrideCount
                          ? `Terms · ${overrideCount} rewritten`
                          : "Specify what changed"}
                      </Button>
                    )}
                    {/* The approval is where the price is settled, so it is where
                        the schedule that divides it is kept. An adjustment gets
                        the same control: renegotiating a contract is as often
                        about when the money lands as about the wording. */}
                    {SETS_SCHEDULE.includes(event.type) && (
                      <PaymentSchedulePopover
                        schedule={event.paymentSchedule ?? []}
                        bidAmount={bidAmountOf(projectTrade)}
                        canEdit={canEdit}
                        onSave={schedule => onSaveSchedule(event.id, schedule)}
                      />
                    )}
                    </div>
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
                    {canEdit && event.type !== "created" && (
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
                          <PopoverContent
                            side="bottom"
                            align="end"
                            collisionAvoidance={{ fallbackAxisSide: "none" }}
                            className="max-h-(--available-height) w-[320px] gap-0 overflow-y-auto p-0"
                          >
                            {editing === event.id && (
                              <EditEventForm
                                event={event}
                                subLocked={projectTrade.events.some(e => e.type === "contract_sent")}
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
