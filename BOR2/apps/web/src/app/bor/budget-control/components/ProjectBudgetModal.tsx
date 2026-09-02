"use client"

import { useState } from "react"
import {
  X, ChevronRight, Loader2, Building2, Home,
  Wallet, HandCoins, HardHat, Tag, ChevronDown, Check, Clock,
  SlidersHorizontal, CornerDownRight, LineChart as LineChartIcon,
  CalendarClock, Users, Hourglass, Forklift, MapPin, ArrowRightLeft,
  Pencil, Plus, Search, CalendarIcon, X as XIcon, Bookmark,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { qbtimeMappingService } from "@/services/qbtime-mapping.service"
import {
  LineChart as RLineChart, Line as RLine, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calendar } from "@/components/ui/calendar"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail, useSetAccountLimit, useSetAccountDeadline, useSetProjectStartDate, useAccountHistory, useAccountPayees, useIncomeHistory, useLaborEstimate } from "@/hooks/use-budget"
import { useCategories, useSetCategoryBudget, useSetVendorBudget, useSetProjectVendorCategory, useSetPayrollSupervisor, useBudgetSettings, usePresetAccounts, useSetPresetAccount } from "@/hooks/use-budget-taxonomy"
import type { CostAccount, CostCategory, CostVendor, BudgetProjectDetail } from "@/services/budget.service"
import * as LucideIcons from "lucide-react"

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const fmtMD = (s: string) => { if (!s) return ""; const [, m, d] = s.split("-"); return `${m}/${d}` }
// Linked QB Time address key ("Root › … › Address"); drop the root jobcode noise.
const addrLabel = (k: string) => { const p = k.split(" › "); return p.length > 1 ? p.slice(1).join(" › ") : k }
// QB Time payroll stores names as "Last, First"; show them as "First Last".
const flipName = (n: string) => {
  const i = n.indexOf(",")
  if (i < 0) return n
  const last = n.slice(0, i).trim()
  const first = n.slice(i + 1).trim()
  return first ? `${first} ${last}` : last
}
const pctStr = (part: number, whole: number) => `${pct(part, whole).toFixed(0)}%`

// ── Shared primitives ─────────────────────────────────────────────────────────

type SegDef = { value: number; color: string; label?: string; icon?: React.ComponentType<{ className?: string }> }

function SegBar({ total, segments, remainder }: {
  total: number
  segments: SegDef[]
  remainder?: { label: string; value: number }
}) {
  const filledPct = segments.reduce((sum, s) => sum + (total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0), 0)
  const remainPct = Math.max(100 - filledPct, 0)

  const tooltip = (label: string, value: number, color?: string) => (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-[10px] font-medium text-popover-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
      {color && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: color }} />}
      {label}: <span className="font-bold">{fmt(value)}</span>
    </div>
  )

  return (
    <div className="relative h-6 w-full">
      {/* Visual layer — overflow-hidden keeps rounding clean */}
      <div className="absolute inset-0 flex overflow-hidden rounded-full bg-muted/30">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={`v${i}`} className="flex h-full items-center justify-center transition-all" style={{ width: `${w}%`, backgroundColor: s.color }}>
              {s.icon && w > 10 && <s.icon className="h-3 w-3 text-white/80" />}
            </div>
          )
        })}
      </div>
      {/* Interaction layer — no overflow clip so tooltips escape upward */}
      <div className="absolute inset-0 flex">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={`i${i}`} className="group relative h-full" style={{ width: `${w}%` }}>
              {/* hover brightens matching visual segment via overlay */}
              <div className="absolute inset-0 rounded-sm bg-white/0 transition-colors group-hover:bg-white/15" />
              {s.label && tooltip(s.label, s.value, s.color)}
            </div>
          )
        })}
        {remainder && remainPct > 0 && (
          <div className="group relative h-full" style={{ width: `${remainPct}%` }}>
            <div className="absolute inset-0 rounded-sm bg-white/0 transition-colors group-hover:bg-white/5" />
            {tooltip(remainder.label, remainder.value)}
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, color, blur, pctOf, dot, strong, dimmed }: {
  label: string; value: number; color?: string; blur: string
  pctOf?: number; dot?: string; strong?: boolean; dimmed?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className={cn("text-[11px]", strong ? "font-medium text-foreground" : dimmed ? "text-muted-foreground/50" : "text-muted-foreground")}>{label}</span>
      <span className={cn("ml-auto tabular-nums", strong ? "text-[13px] font-bold" : "text-xs font-semibold", blur)}
        style={color ? { color } : undefined}>
        {fmt(value)}
      </span>
      {pctOf !== undefined && (
        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
          {pctStr(value, pctOf)}
        </span>
      )}
    </div>
  )
}

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  if (!Icon) return <Tag className={className} />
  return <Icon className={className} />
}

// ── Value cell ────────────────────────────────────────────────────────────────

function ValueCell({ value, color, blur, sm }: { value: number; color?: string; blur: string; sm?: boolean }) {
  return (
    <div className="w-20 text-right">
      <span
        className={cn("tabular-nums font-semibold", sm ? "text-[10px]" : "text-[11px]", blur)}
        style={color ? { color } : undefined}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Money input (cost budget editing) ──────────────────────────────────────────

function MoneyInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  // draft holds the raw digit string in CENTS (so typing "50000" = $500.00).
  const [draft, setDraft] = useState(value > 0 ? String(Math.round(value * 100)) : "")
  const display = draft === "" ? "" : (Number(draft) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="relative w-20" onClick={e => e.stopPropagation()}>
      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">$</span>
      <input
        value={display}
        inputMode="numeric"
        placeholder="0.00"
        onChange={e => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={() => { const n = draft === "" ? 0 : Number(draft) / 100; if (n !== value) onCommit(n) }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
        className="h-6 w-full rounded border border-input bg-transparent pl-4 pr-1.5 text-right text-[10px] tabular-nums outline-none focus:ring-1 focus:ring-ring dark:bg-input/30"
      />
    </div>
  )
}

// ── Date picker (compact, click-to-edit — ShadcnUI Calendar + Popover) ────────

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function DatePickerBadge({ value, onSelect, placeholder, className, iconOnly }: {
  value: string | null; onSelect: (iso: string | null) => void
  placeholder: string; className?: string; iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={e => e.stopPropagation()}
        title={iconOnly && !value ? placeholder : undefined}
        className={cn("flex items-center gap-1 rounded transition-colors hover:text-foreground", className)}
      >
        <CalendarIcon className="h-3 w-3 shrink-0" />
        {value ? fmtDate(value) : (iconOnly ? null : placeholder)}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={4} className="w-auto p-0" onClick={e => e.stopPropagation()}>
        <Calendar mode="single" selected={value ? toDate(value) : undefined}
          onSelect={d => { if (d) { onSelect(toISO(d)); setOpen(false) } }}
          defaultMonth={value ? toDate(value) : undefined} />
        {value && (
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className="flex w-full items-center justify-center gap-1 border-t border-border/40 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="h-3 w-3" /> Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Account row (By Account tree with expandable children) ───────────────────

function AccountRow({ ca, blur, editing, budgetValue, onDraftBudget, onSetDeadline, company, projectID, startDate, projectType }: {
  ca: CostAccount; blur: string; editing: boolean
  budgetValue: number
  onDraftBudget: (accountID: string, amount: number) => void
  onSetDeadline: (accountID: string, deadline: string | null) => void
  company: string; projectID: string; startDate?: string | null; projectType?: string
}) {
  const [open, setOpen] = useState(false)
  const hasChildren = (ca.children?.length ?? 0) > 0
  const settled = ca.outstanding === 0 && ca.amount !== 0
  const overBudget = ca.budget_limit > 0 && ca.amount > ca.budget_limit
  return (
    <>
      <div
        className={cn(
          "flex items-center border-t border-border/10 px-3 py-1",
          hasChildren && "cursor-pointer hover:bg-muted/10",
          settled && "text-muted-foreground"
        )}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <div className="w-4 shrink-0 mr-0.5">
          {hasChildren && (
            <ChevronRight className={cn("h-2.5 w-2.5 text-muted-foreground/30 transition-transform", open && "rotate-90")} />
          )}
        </div>
        <div className="flex flex-1 min-w-0 items-center gap-1.5">
          {ca.name === "Contractors" && <HardHat className={cn("h-3 w-3 shrink-0", settled ? "text-muted-foreground/60" : "text-yellow-500/70")} />}
          <span className={cn("truncate text-[11px] font-medium", settled ? "text-muted-foreground" : ca.name === "Contractors" ? "text-yellow-500/80" : "text-foreground/80")} title={ca.name}>{ca.name}</span>
          {ca.is_preset && (
            <TooltipProvider delay={0}>
              <Tooltip>
                <TooltipTrigger render={<span className="flex shrink-0" />}>
                  <Bookmark className="h-2.5 w-2.5 text-muted-foreground/40" />
                </TooltipTrigger>
                <TooltipContent>Preset — not posted in QuickBooks yet, budget set in advance</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {settled && <Check className="h-3 w-3 shrink-0 text-red-500/60" />}
          {/* Budget deadline — pairs with the project start date to draw a
              progressive adherence line instead of a flat ceiling. */}
          {editing && !ca.locked ? (
            <DatePickerBadge value={ca.deadline} onSelect={d => onSetDeadline(ca.id, d)} placeholder="Deadline" iconOnly
              className="shrink-0 text-[9px] text-muted-foreground/50" />
          ) : ca.deadline ? (
            <span className="flex shrink-0 items-center gap-1 text-[9px] text-muted-foreground/40" title={`Budget deadline: ${fmtDate(ca.deadline)}`}>
              <CalendarIcon className="h-2.5 w-2.5" /> {fmtDate(ca.deadline)}
            </span>
          ) : null}
        </div>
        {/* Cost budget ceiling per account — first value column */}
        {editing && !ca.locked ? (
          <div className="flex w-20 justify-end">
            <MoneyInput value={budgetValue} onCommit={v => onDraftBudget(ca.id, v)} />
          </div>
        ) : (
          <span className={cn("flex w-20 items-center justify-end gap-1 text-right text-[11px] font-semibold tabular-nums", blur,
            ca.locked ? "text-yellow-500/80" : overBudget ? "text-amber-500" : ca.budget_limit > 0 ? "text-foreground/70" : "text-muted-foreground/30")}>
            {ca.budget_limit > 0 ? fmt(ca.budget_limit) : "—"}
          </span>
        )}
        {overBudget ? (
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger render={<span className={cn("w-20 cursor-help text-right text-[11px] font-semibold tabular-nums text-red-500", blur)} />}>
                {fmt(ca.amount)}
              </TooltipTrigger>
              <TooltipContent>Billed value exceeds budget</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, !settled && ca.amount < 0 && "text-emerald-500")}>{fmt(ca.amount)}</span>
        )}
        <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur)}>{fmt(ca.paid)}</span>
        <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, !settled && ca.outstanding > 0 ? "text-orange-500" : !settled ? "text-muted-foreground/40" : "")}>{fmt(ca.outstanding)}</span>
        {/* Payee breakdown — flag the supervisor, split supervisor vs normal labor.
            Only Building's Payroll - COGS has a supervisor to segregate from normal
            labor, and only once there's real activity — a preset has no payees yet. */}
        {ca.name === "Payroll - COGS" && projectType === "building" && !ca.is_preset ? (
          <Popover>
            <PopoverTrigger
              onClick={e => e.stopPropagation()}
              title="Payees · flag supervisor"
              className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Users className="h-3 w-3" />
            </PopoverTrigger>
            <PopoverContent align="start" side="right" className="w-[26rem]" onClick={e => e.stopPropagation()}>
              <AccountPayeesPanel company={company} projectID={projectID} account={ca} />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="ml-1 h-5 w-5 shrink-0" />
        )}
        {/* Paid-over-time chart — floating popover anchored to the icon. Nothing to
            chart on a preset (no real activity yet), so skip it there too. */}
        {!ca.is_preset ? (
          <Popover>
            <PopoverTrigger
              onClick={e => e.stopPropagation()}
              title="Paid distribution over time"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
            >
              <LineChartIcon className="h-3 w-3" />
            </PopoverTrigger>
            <PopoverContent align="start" side="right" className="w-[24rem]" onClick={e => e.stopPropagation()}>
              <AccountChartPanel company={company} projectID={projectID} account={ca} startDate={startDate} />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
      </div>
      {open && ca.children?.map((child, j) => {
        const settled = child.outstanding === 0 && child.amount !== 0
        return (
          <div key={j} className="flex items-center border-t border-border/10 bg-muted/5 px-3 py-1 pl-7">
            <div className="w-4 shrink-0 mr-0.5 flex items-center justify-center">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="flex flex-1 min-w-0 items-center gap-1">
              <span className={cn("truncate text-[10px]", settled ? "text-muted-foreground/40" : "text-muted-foreground/60")} title={child.name}>{child.name}</span>
              {settled && <Check className="h-2.5 w-2.5 shrink-0 text-red-500/60" />}
            </div>
            <span className="w-20 shrink-0" />
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/40" : "text-foreground/80")}>{fmt(child.amount)}</span>
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/40" : "")}>{fmt(child.paid)}</span>
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, child.outstanding > 0 ? "text-orange-500" : "text-muted-foreground/40")}>{fmt(child.outstanding)}</span>
            <span className="ml-1 w-5 shrink-0" />
          </div>
        )
      })}
    </>
  )
}

// ── Add preset account (By Account) ───────────────────────────────────────────
// Lets the user pull in a company account that hasn't posted any activity to
// this project yet. Picking a name and setting its budget is one action — a
// preset only actually shows up once a budget is set, so there's no separate
// "add empty, edit later" step. Same catalog as the Manage > Preset Accounts
// admin page; picking one here also registers it there for future reuse.
function AddPresetAccountButton({ company, projectID, existingIDs, variant = "row" }: {
  company: string; projectID: string; existingIDs: Set<string>
  variant?: "row" | "empty"
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [amount, setAmount] = useState("")
  const { data: options } = usePresetAccounts(company)
  const setPreset = useSetPresetAccount()
  const setAccountLimit = useSetAccountLimit()
  const qc = useQueryClient()

  const available = (options ?? [])
    .filter(o => !existingIDs.has(o.account_ref_id))
    .filter(o => !search || o.account_name.toLowerCase().includes(search.toLowerCase()))

  function reset() {
    setOpen(false); setSearch(""); setSelected(null); setAmount("")
  }

  function confirmAdd() {
    if (!selected) return
    const amt = Number(amount)
    if (!(amt > 0)) return
    setAccountLimit.mutate({ company, project_id: projectID, account_id: selected.id, amount: amt }, {
      onSuccess: () => {
        if (!selected.name) return
        setPreset.mutate({ company, account_ref_id: selected.id, active: true })
        qc.invalidateQueries({ queryKey: ["budget-detail", company, projectID] })
        reset()
      },
    })
  }

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) reset() }}>
      {variant === "row" ? (
        <PopoverTrigger className="flex w-full items-center justify-center gap-1.5 border-t border-border/20 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground">
          <Plus className="h-3 w-3" /> Add account
        </PopoverTrigger>
      ) : (
        <PopoverTrigger className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground dark:bg-input/30">
          <Plus className="h-3 w-3" /> Add account
        </PopoverTrigger>
      )}
      <PopoverContent align="center" side="bottom" className="w-64 p-0">
        {!selected ? (
          <>
            <div className="border-b border-border/20 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…" autoFocus
                  className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 dark:bg-input/30" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {available.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No matching accounts</p>
              ) : available.map(o => (
                <button key={o.account_ref_id} onClick={() => setSelected({ id: o.account_ref_id, name: o.account_name })}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted">
                  {o.account_name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <p className="truncate text-xs font-medium" title={selected.name}>{selected.name}</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">$</span>
              <input value={amount} inputMode="decimal" autoFocus placeholder="Budget amount"
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={e => { if (e.key === "Enter") confirmAdd() }}
                className="h-8 w-full rounded-md border border-input bg-transparent pl-5 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Back
              </button>
              <button onClick={confirmAdd} disabled={!(Number(amount) > 0) || setAccountLimit.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
                {setAccountLimit.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Add
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Move-to-category popover (per-project subcontractor reassignment) ─────────

function MoveCategoryPopover({ currentCatId, categories, onMove }: {
  currentCatId: string
  categories: { id: string; name: string; icon: string }[]
  onMove: (target: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const targets = categories.filter(c => c.id !== currentCatId)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={e => e.stopPropagation()}
        title="Move to another category for this project"
        className="flex h-5 shrink-0 items-center justify-center rounded border border-input bg-transparent px-1 text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30"
      >
        <ArrowRightLeft className="h-2.5 w-2.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1" onClick={e => e.stopPropagation()}>
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Move to</p>
        <div className="flex max-h-52 flex-col overflow-y-auto no-scrollbar">
          {targets.map(c => (
            <button key={c.id} onClick={() => { onMove(c.id); setOpen(false) }}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-accent">
              <CategoryIcon name={c.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {c.name}
            </button>
          ))}
          {currentCatId && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <button onClick={() => { onMove(null); setOpen(false) }}
                className="rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent">
                Reset to default mapping
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Vendor row ────────────────────────────────────────────────────────────────

function VendorRow({ vendor, blur, editing, catId, company, projectID, categories }: {
  vendor: CostVendor; blur: string; editing: boolean; catId: string
  company: string; projectID: string
  categories: { id: string; name: string; icon: string }[]
}) {
  const setVendorBudget = useSetVendorBudget()
  const setMove = useSetProjectVendorCategory()
  // Synthetic vendors (PO with no QB vendor) carry a "__name" id → can't be budgeted/moved.
  const editable = !!vendor.vendor_id && !vendor.vendor_id.startsWith("__")
  const bcTotal = vendor.back_charges?.reduce((s, bc) => s + bc.amount, 0) ?? 0
  const netPaid = vendor.paid - bcTotal
  const netBilled = vendor.billed - bcTotal
  const outstanding = Math.max(netBilled - netPaid, 0)
  const isSettled = vendor.committed > 0 && vendor.paid >= vendor.committed
  const over = vendor.budget_limit > 0 && vendor.committed > vendor.budget_limit

  return (
    <div className={cn("flex items-center gap-2 border-t border-border/10 py-1.5 pl-4 pr-4", isSettled && "text-muted-foreground")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Reserved column matching the category icon above, so the move
            button lines up in the same rail whether or not it's shown. */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center">
          {editing && editable && (
            <MoveCategoryPopover currentCatId={catId} categories={categories}
              onMove={target => setMove.mutate({ company, project_id: projectID, vendor_id: vendor.vendor_id, category_id: target })} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={cn("truncate text-[11px]", isSettled ? "text-muted-foreground" : "text-muted-foreground/80")} title={vendor.vendor_name}>{vendor.vendor_name || "—"}</span>
          {isSettled && <Check className="h-3 w-3 shrink-0 text-yellow-500/70" />}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {editing && editable && catId ? (
          <MoneyInput value={vendor.budget_limit} onCommit={v => setVendorBudget.mutate({ company, project_id: projectID, category_id: catId, vendor_id: vendor.vendor_id, amount: v })} />
        ) : (
          <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, over ? "text-amber-500" : vendor.budget_limit > 0 ? "text-foreground/70" : "text-muted-foreground/30")}>
            {vendor.budget_limit > 0 ? fmt(vendor.budget_limit) : "—"}
          </span>
        )}
        <ValueCell value={vendor.committed} blur={blur} sm />
        <ValueCell value={netBilled} blur={blur} sm />
        <ValueCell value={netPaid} color={isSettled ? undefined : "#22c55e"} blur={blur} sm />
        <ValueCell value={outstanding} color={isSettled ? undefined : outstanding > 0 ? "#f97316" : undefined} blur={blur} sm />
      </div>
    </div>
  )
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({ cat, blur, isOpen, onToggle, editing, company, projectID, categories }: {
  cat: CostCategory; blur: string; isOpen: boolean; onToggle: () => void
  editing: boolean; company: string; projectID: string
  categories: { id: string; name: string; icon: string }[]
}) {
  const setCatBudget = useSetCategoryBudget()
  const isUncategorized = !cat.category_id
  const bcTotal = cat.vendors.reduce((s, v) => s + (v.back_charges?.reduce((s2, bc) => s2 + bc.amount, 0) ?? 0), 0)
  const netPaid = cat.paid - bcTotal
  const netBilled = cat.billed - bcTotal
  const outstanding = Math.max(netBilled - netPaid, 0)
  const budget = cat.budget_limit
  const isSettled = cat.committed > 0 && cat.paid >= cat.committed
  const over = budget > 0 && cat.committed > budget
  const subBudgetSum = cat.vendors.reduce((s, v) => s + (v.budget_limit || 0), 0)

  return (
    <div className={cn("border-b border-border/30 last:border-b-0", isUncategorized && "opacity-60")}>
      <div className={cn("flex items-center gap-3 px-4 py-1.5 hover:bg-muted/10", isSettled && "text-muted-foreground")}>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/30">
            <CategoryIcon name={cat.icon} className="h-3 w-3 text-muted-foreground/70" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn("min-w-0 truncate text-[11px] font-semibold", isSettled && "text-muted-foreground")}>{cat.category_name}</span>
            {isSettled && <Check className="h-3 w-3 shrink-0 text-yellow-500/70" />}
          </div>
        </button>

        {/* Budget (editable) + 4 value columns */}
        <div className="flex shrink-0 items-center">
          {editing && cat.category_id ? (
            <MoneyInput value={budget} onCommit={v => setCatBudget.mutate({ company, project_id: projectID, category_id: cat.category_id, max_value: v })} />
          ) : (
            <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, over ? "text-amber-500" : budget > 0 ? "text-foreground/80" : "text-muted-foreground/30")}>
              {budget > 0 ? fmt(budget) : "—"}
            </span>
          )}
          <ValueCell value={cat.committed} blur={blur} />
          <ValueCell value={netBilled} blur={blur} />
          <ValueCell value={netPaid} color={isSettled ? undefined : "#22c55e"} blur={blur} />
          <ValueCell value={outstanding} color={isSettled ? undefined : outstanding > 0 ? "#f97316" : undefined} blur={blur} />
        </div>

        <button onClick={onToggle} className="shrink-0">
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-border/20 bg-background/20 pb-1">
          {cat.vendors.length === 0 ? (
            <p className="py-2 pl-[52px] text-[10px] italic text-muted-foreground/40">No subcontractors with spend yet.</p>
          ) : cat.vendors.map(v => (
            <VendorRow key={v.vendor_id || v.vendor_name} vendor={v} blur={blur} editing={editing} catId={cat.category_id}
              company={company} projectID={projectID} categories={categories} />
          ))}
          {editing && cat.category_id && subBudgetSum > 0 && (
            <div className="flex items-center gap-2 border-t border-border/20 px-4 py-1 pl-[52px]">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Σ subs</span>
              <span className={cn("text-[10px] font-semibold tabular-nums", subBudgetSum > budget && budget > 0 ? "text-amber-500" : "text-muted-foreground")}>{fmt(subBudgetSum)}</span>
              <span className="text-[9px] text-muted-foreground/40">of {budget > 0 ? fmt(budget) : "category"}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Account paid-over-time chart (popup) ────────────────────────────────────────

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
const fmtMonth = (s: string) => {
  const [y, m] = s.split("-")
  return `${m}/${y.slice(2)}`
}

// Shared distribution chart: cumulative (default) vs month-by-month, preference
// cached. Used for cost accounts (red, with budget line) and income types (green).
// "YYYY-MM" → absolute month index, for interval math (elapsed/total months).
function ymIndex(ym: string): number {
  const [y, m] = ym.slice(0, 7).split("-").map(Number)
  return y * 12 + (m - 1)
}
function ymFromIndex(idx: number): string {
  const y = Math.floor(idx / 12), m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}`
}

function DistributionChart({ title, subtitle, valueLabel, emptyLabel, series, isLoading, color, budget = 0, startDate, deadline }: {
  title: string; subtitle: string; valueLabel: string; emptyLabel: string
  series: { month: string; value: number }[]; isLoading: boolean; color: string; budget?: number
  startDate?: string | null; deadline?: string | null
}) {
  const [mode, setMode] = useState<"cumulative" | "cashflow">(() => {
    if (typeof window === "undefined") return "cumulative"
    return localStorage.getItem("budget-chart-mode") === "cashflow" ? "cashflow" : "cumulative"
  })
  const pickMode = (m: "cumulative" | "cashflow") => {
    setMode(m)
    if (typeof window !== "undefined") localStorage.setItem("budget-chart-mode", m)
  }

  // Progressive budget line: the ceiling accrues proportionally across the
  // start_date → deadline window (e.g. a 3-month, $60k budget accrues $20k/mo),
  // so overspend early and catch-up later both show against the real pace
  // instead of a flat end-of-project cap. Falls back to the flat ceiling when
  // either date is missing.
  const hasProgressive = !!startDate && !!deadline && budget > 0
  const startIdx = hasProgressive ? ymIndex(startDate!) : 0
  const endIdx = hasProgressive ? Math.max(startIdx, ymIndex(deadline!)) : 0
  const totalMonths = hasProgressive ? endIdx - startIdx + 1 : 0
  const monthlyTarget = hasProgressive ? budget / totalMonths : 0

  // Plot magnitude: back charges are negative but should rise on the Y axis.
  let data: { month: string; value: number; cumulative: number; budgetTarget?: number }[]
  if (hasProgressive) {
    // Merge the actual-activity months with the full budget window, so the
    // target line spans the whole interval even past the last paid month.
    const byMonth = new Map(series.map(p => [p.month.slice(0, 7), Math.abs(p.value)]))
    const seriesIdx = series.map(p => ymIndex(p.month))
    const minIdx = Math.min(startIdx, ...(seriesIdx.length ? seriesIdx : [startIdx]))
    const maxIdx = Math.max(endIdx, ...(seriesIdx.length ? seriesIdx : [endIdx]))
    let running = 0
    data = []
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      const month = ymFromIndex(idx)
      const value = byMonth.get(month) ?? 0
      running += value
      const elapsed = Math.min(Math.max(idx - startIdx + 1, 0), totalMonths)
      data.push({
        month, value, cumulative: running,
        budgetTarget: mode === "cumulative" ? elapsed * monthlyTarget : (idx >= startIdx && idx <= endIdx ? monthlyTarget : 0),
      })
    }
  } else {
    let running = 0
    data = series.map(p => { const v = Math.abs(p.value); running += v; return { month: p.month, value: v, cumulative: running } })
  }
  // Flat ceiling fallback only applies to the cumulative view, and only when
  // there isn't enough data (start/deadline) to draw the progressive line.
  const showFlatBudget = mode === "cumulative" && budget > 0 && !hasProgressive
  const targetVals = hasProgressive ? data.map(d => d.budgetTarget ?? 0) : []
  const maxVal = mode === "cumulative"
    ? Math.max(data.at(-1)?.cumulative ?? 0, budget, ...targetVals)
    : Math.max(0, ...data.map(d => d.value), ...targetVals)
  const yMax = maxVal * 1.1 || 1
  const dataKey = mode === "cumulative" ? "cumulative" : "value"

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold leading-tight" title={title}>{title}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center overflow-hidden rounded-md border border-input text-[9px] font-medium">
          {([["cumulative", "Cumulative"], ["cashflow", "Month by month"]] as const).map(([val, label], i) => (
            <button key={val} onClick={() => pickMode(val)}
              className={cn("px-1.5 py-0.5 transition-colors", i > 0 && "border-l border-input",
                mode === val ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-56 w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground/60" />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground/60" width={48} domain={[0, yMax]} />
              <RTooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                labelFormatter={(l) => fmtMonth(String(l))}
                formatter={(v, name) => [fmt(Number(v)), name === "cumulative" ? `Cumulative ${valueLabel.toLowerCase()}`
                  : name === "budgetTarget" ? "Budget target" : `${valueLabel} this month`]}
              />
              {showFlatBudget && (
                <ReferenceLine y={budget} strokeDasharray="6 4" stroke="#f59e0b"
                  label={{ value: `Budget ${fmtShort(budget)}`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
              )}
              {hasProgressive && (
                <RLine type="monotone" dataKey="budgetTarget" stroke="#f59e0b" strokeWidth={1.5}
                  strokeDasharray="6 4" dot={false} activeDot={{ r: 3 }} />
              )}
              <RLine type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            </RLineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}

// Payee breakdown of a cost account (Payroll-COGS being the main case): list the
// vendors/employees whose bills compose it and let the user flag the supervisor,
// splitting the account into supervisor vs normal labor.
function AccountPayeesPanel({ company, projectID, account }: {
  company: string; projectID: string; account: CostAccount
}) {
  const { data: payees, isLoading } = useAccountPayees({ company, project_id: projectID, account_id: account.id })
  const setSup = useSetPayrollSupervisor()
  const list = payees ?? []
  const supTotal = list.filter(p => p.is_supervisor).reduce((s, p) => s + p.amount, 0)
  const normalTotal = list.filter(p => !p.is_supervisor).reduce((s, p) => s + p.amount, 0)

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="truncate text-xs font-semibold leading-tight" title={account.name}>{account.name}</p>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Click a person to flag the supervisor</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-blue-500/25 bg-blue-500/[0.05] px-2.5 py-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Supervisor</p>
          <p className="text-sm font-bold tabular-nums text-blue-500">{fmt(supTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Normal labor</p>
          <p className="text-sm font-bold tabular-nums">{fmt(normalTotal)}</p>
        </div>
      </div>
      <div className="flex max-h-56 flex-col overflow-y-auto no-scrollbar rounded-lg border border-input">
        {isLoading ? (
          <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] italic text-muted-foreground/50">No vendor bills on this account.</p>
        ) : list.map(p => (
          <button key={p.vendor_id}
            onClick={() => setSup.mutate({ company, project_id: projectID, account_id: account.id, vendor_id: p.vendor_id, is_supervisor: !p.is_supervisor })}
            className="flex items-center gap-2 border-t border-border/10 px-3 py-1.5 text-left transition-colors first:border-t-0 hover:bg-muted/20">
            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors", p.is_supervisor ? "border-blue-500 bg-blue-500 text-white" : "border-border")}>
              {p.is_supervisor && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-[11px]", p.is_supervisor ? "font-medium text-blue-500" : "text-foreground/80")} title={p.vendor_name}>{flipName(p.vendor_name)}</span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{fmt(p.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AccountChartPanel({ company, projectID, account, startDate }: {
  company: string; projectID: string; account: CostAccount; startDate?: string | null
}) {
  const accountIDs = [account.id, ...(account.children?.map(c => c.id) ?? [])]
  const { data: history, isLoading } = useAccountHistory({ company, project_id: projectID, account_ids: accountIDs })
  const series = (history ?? []).map(p => ({ month: p.month, value: p.paid }))
  return (
    <DistributionChart title={account.name} subtitle="Paid over time" valueLabel="Paid"
      emptyLabel="No payments recorded for this account." series={series} isLoading={isLoading}
      color="#ef4444" budget={account.budget_limit} startDate={startDate} deadline={account.deadline} />
  )
}

function IncomeChartPanel({ company, projectID, typeName }: {
  company: string; projectID: string; typeName: string
}) {
  const { data: history, isLoading } = useIncomeHistory({ company, project_id: projectID, type: typeName })
  const series = (history ?? []).map(p => ({ month: p.month, value: p.amount }))
  return (
    <DistributionChart title={typeName} subtitle="Invoiced over time" valueLabel="Invoiced"
      emptyLabel="No invoices recorded for this type." series={series} isLoading={isLoading}
      color="#22c55e" />
  )
}

// ── Labor address mapping (inline link/replace/unlink in the modal) ────────────

function LaborAddressManager({ company, projectID, addresses }: {
  company: string; projectID: string; addresses: string[]
}) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budget-labor-estimate", company, projectID] })
    qc.invalidateQueries({ queryKey: ["budget-labor-summary", company] })
  }
  const accept = useMutation({ mutationFn: qbtimeMappingService.accept, onSuccess: invalidate })
  const unlink = useMutation({ mutationFn: qbtimeMappingService.unlink, onSuccess: invalidate })
  const { data: queue } = useQuery({
    queryKey: ["qbtime-mapping-queue", company],
    queryFn: () => qbtimeMappingService.queue(company),
    staleTime: 60_000,
  })

  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [replaceKey, setReplaceKey] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const linked = new Set(addresses)
  const available = (queue ?? []).filter(it =>
    !linked.has(it.address_key) && (!q || it.address_key.toLowerCase().includes(q.toLowerCase())))

  const pick = (addressKey: string, replace?: string) => {
    if (replace) unlink.mutate({ company, address_key: replace })
    accept.mutate({ company, address_key: addressKey, customer_id: projectID })
    setAddOpen(false); setReplaceKey(null); setQ("")
  }

  const picker = (onPick: (addr: string) => void) => (
    <>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search QB Time address…"
          className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-[11px] outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
      </div>
      <div className="flex max-h-60 flex-col overflow-y-auto no-scrollbar">
        {available.length === 0 ? (
          <p className="px-1 py-1.5 text-[11px] italic text-muted-foreground/50">No unmapped addresses.</p>
        ) : available.slice(0, 60).map(it => (
          <button key={it.address_key} onClick={() => onPick(it.address_key)}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent">
            <MapPin className="h-3 w-3 shrink-0 text-blue-500/50" />
            <span className="min-w-0 flex-1 truncate" title={it.address_key}>{addrLabel(it.address_key)}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div className="flex flex-col gap-0.5">
      {addresses.map(a => (
        <div key={a} className="group flex items-center gap-1.5 text-[10px] text-muted-foreground/55">
          <MapPin className="h-3 w-3 shrink-0 text-blue-500/40" />
          <span className="min-w-0 flex-1 truncate" title={a}>{addrLabel(a)}</span>
          {confirmDel === a ? (
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Sure?</span>
              <button onClick={() => { unlink.mutate({ company, address_key: a }); setConfirmDel(null) }}
                className="rounded px-1 text-[9px] font-semibold text-red-500 transition-colors hover:bg-red-500/10">Yes</button>
              <button onClick={() => setConfirmDel(null)}
                className="rounded px-1 text-[9px] text-muted-foreground transition-colors hover:bg-muted">No</button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Popover open={replaceKey === a} onOpenChange={o => { setReplaceKey(o ? a : null); setQ("") }}>
                <PopoverTrigger title="Replace this address" className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground">
                  <Pencil className="h-2.5 w-2.5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-2">{picker(addr => pick(addr, a))}</PopoverContent>
              </Popover>
              <button onClick={() => setConfirmDel(a)} title="Remove" className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-red-500">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
        </div>
      ))}
      <Popover open={addOpen} onOpenChange={o => { setAddOpen(o); setQ("") }}>
        <PopoverTrigger className="mt-0.5 flex w-fit items-center gap-1 rounded text-[10px] text-blue-500/70 transition-colors hover:text-blue-500">
          <Plus className="h-3 w-3" /> Link address
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">{picker(addr => pick(addr))}</PopoverContent>
      </Popover>
    </div>
  )
}

// ── Cost Forecast (current pay period labor) ───────────────────────────────────

// Labor accruing in the open pay period: hours logged in QB Time but not yet
// posted as a QB cost. The 4th panel color (blue) sets it apart from
// Income (green) / Cost (red) / Contractors (yellow).
function LaborForecastBlock({ company, projectID, blur }: { company: string; projectID: string; blur: string }) {
  const { data, isLoading } = useLaborEstimate({ company, project_id: projectID })
  const [showEmployees, setShowEmployees] = useState(false)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.04] p-4">
      {/* Title row */}
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold leading-tight text-blue-500">In-Progress Costs</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
          <span className={cn("text-base font-bold tabular-nums text-blue-500", blur)}>{fmt(data?.total_cost ?? 0)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
      {/* Labor sub-section */}
      <div className="col-span-2 flex flex-col gap-3 rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-blue-500/80" />
          <span className="text-[12px] font-semibold text-blue-500/90">Labor · QuickBooks Time</span>
          {data?.period_start && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground/60">
              <span title={`Observed pay period: ${data.period_start} to ${data.period_end}`}>{fmtMD(data.period_start)} – {fmtMD(data.period_end)}</span>
              {data.has_data && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="font-medium text-foreground/70">{(data.total_hours ?? 0).toFixed(1)}h</span>
                </>
              )}
            </div>
          )}
        </div>

        <LaborAddressManager company={company} projectID={projectID} addresses={data?.addresses ?? []} />

        {isLoading ? (
          <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : !data?.has_data ? (
          <div className="px-3 py-5 text-center text-[11px] italic leading-relaxed text-muted-foreground/50">
            No hours logged this pay period for this jobsite. Nothing accruing toward the next payroll close.
          </div>
        ) : (
          <>
            <SegBar
              total={Math.max(data.total_cost, 1)}
              segments={[
                { value: data.regular_cost, color: "#3b82f6", label: "Regular", icon: Clock },
                { value: data.ot_cost, color: "#f97316", label: "Overtime", icon: Hourglass },
              ]}
            />
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Regular · {data.regular_hours.toFixed(1)}h</span>
                <span className={cn("text-lg font-bold tabular-nums text-blue-500", blur)}>{fmt(data.regular_cost)}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Overtime · {data.ot_hours.toFixed(1)}h</span>
                <span className={cn("text-lg font-bold tabular-nums", data.ot_cost > 0 ? "text-orange-500" : "text-muted-foreground/50", blur)}>{fmt(data.ot_cost)}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Est. Total</span>
                <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.total_cost)}</span>
              </div>
            </div>

            {data.employees.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-input">
                <button
                  onClick={() => setShowEmployees(o => !o)}
                  className="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left transition-colors hover:bg-muted/20 dark:bg-input/30"
                >
                  <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">By Employee</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{data.employees.length}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showEmployees && "rotate-180")} />
                </button>
                {showEmployees && (
                  <div className="border-t border-border/20">
                    <div className="flex items-center bg-muted/10 px-3 py-1">
                      <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Employee</span>
                      <div className="flex shrink-0">
                        <div className="w-16 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Regular</div>
                        <div className="w-16 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Overtime</div>
                        <div className="w-24 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Cost</div>
                      </div>
                    </div>
                    {data.employees.map(e => (
                      <div key={e.name} className="flex items-center border-t border-border/10 px-3 py-1">
                        <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-foreground/80" title={flipName(e.name)}>{flipName(e.name)}</span>
                        <div className="flex shrink-0">
                          <span className={cn("w-16 text-right text-[11px] tabular-nums text-muted-foreground", blur)}>{e.regular_hours.toFixed(1)}</span>
                          <span className={cn("w-16 text-right text-[11px] tabular-nums", e.ot_hours > 0 ? "text-orange-500" : "text-muted-foreground/40", blur)}>{e.ot_hours.toFixed(1)}</span>
                          <span className={cn("w-24 text-right text-[11px] font-semibold tabular-nums text-blue-500", blur)}>{fmt(e.total_cost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Machines sub-section — coming soon */}
      <div className="col-span-1 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/40 bg-muted/10 p-3 text-center">
        <Forklift className="h-5 w-5 text-muted-foreground/40" />
        <span className="text-[12px] font-medium text-muted-foreground/60">Machines</span>
        <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Soon</span>
      </div>
      </div>
    </div>
  )
}

// ── Health indicator: cost progress vs income progress within a tolerance band ──
// Compact, lives in the modal header next to Profit Margin.
function HealthStrip({ data, variability, blur }: {
  data: BudgetProjectDetail; variability: number; blur: string
}) {
  // Must mirror EXACTLY the Income and Cost container headline percentages:
  // income = income_actual / projected_receive, cost = cost_total / cost_ceiling.
  const incomeProg = data.projected_receive > 0 ? (data.income_actual / data.projected_receive) * 100 : 0
  const costProg = data.cost_ceiling > 0 ? (data.cost_total / data.cost_ceiling) * 100 : 0
  const delta = costProg - incomeProg
  const status = delta > variability ? "over" : delta < -variability ? "under" : "ok"
  const cfg = {
    ok:    { label: "On track",       chip: "border-emerald-500/40 text-emerald-500" },
    over:  { label: "Overspending",    chip: "border-red-500/40 text-red-500" },
    under: { label: "Behind on spend", chip: "border-amber-500/40 text-amber-500" },
  }[status]
  return (
    <div className="flex flex-col items-end gap-0.5" title={`Income ${incomeProg.toFixed(0)}% of estimate · Cost ${costProg.toFixed(0)}% of budget · gap ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} pts · tolerance ±${variability}%`}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Spend vs Income</span>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-sm font-bold tabular-nums text-emerald-500", blur)}>{incomeProg.toFixed(0)}%</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
        <span className={cn("text-sm font-bold tabular-nums text-red-500", blur)}>{costProg.toFixed(0)}%</span>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-bold", cfg.chip)}>{cfg.label}</span>
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ProjectBudgetModal({ company, projectID, onClose }: {
  company: string; projectID: string; onClose: () => void
}) {
  const { data, isLoading } = useBudgetDetail({ company, project_id: projectID })
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""
  const [showAccounts, setShowAccounts] = useState(false)
  const [showByType, setShowByType] = useState(false)
  const [openCatId, setOpenCatId] = useState<string | null>(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [draftBudgets, setDraftBudgets] = useState<Record<string, number>>({})
  const [editingContractors, setEditingContractors] = useState(false)
  const setAccountLimit = useSetAccountLimit()
  const setAccountDeadline = useSetAccountDeadline()
  const setProjectStartDate = useSetProjectStartDate()

  const { data: allCats } = useCategories(data?.project_type)
  const categoryOptions = (allCats ?? []).map(c => ({ id: c.id, name: c.name, icon: c.icon }))
  const { data: settings } = useBudgetSettings(company)

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  const incomeAccounts = data?.income_accounts ?? []
  const costCategories = (data?.cost_categories ?? []).slice().sort((a, b) => {
    if (!a.category_id) return 1
    if (!b.category_id) return -1
    return 0
  })
  const costAccounts = data?.cost_accounts ?? []
  const costCeiling = data?.cost_ceiling ?? 0

  // Budget value to show per account: the live draft while editing, else the saved limit.
  const budgetFor = (a: CostAccount) =>
    a.locked ? a.budget_limit : editingBudget ? (draftBudgets[a.id] ?? a.budget_limit ?? 0) : a.budget_limit
  const allocatedBudget = costAccounts.reduce((s, a) => s + (budgetFor(a) || 0), 0)

  const startEditing = () => {
    const init: Record<string, number> = {}
    for (const a of costAccounts) if (!a.locked) init[a.id] = a.budget_limit || 0
    setDraftBudgets(init)
    setEditingBudget(true)
    setShowAccounts(true)
  }
  const cancelEditing = () => { setEditingBudget(false); setDraftBudgets({}) }
  const saveEditing = () => {
    for (const a of costAccounts) {
      if (a.locked) continue
      const next = draftBudgets[a.id] ?? a.budget_limit ?? 0
      if (next !== (a.budget_limit || 0)) {
        setAccountLimit.mutate({ company, project_id: projectID, account_id: a.id, amount: next })
      }
    }
    setEditingBudget(false)
    setDraftBudgets({})
  }
  const onDraftBudget = (accountID: string, amount: number) =>
    setDraftBudgets(prev => ({ ...prev, [accountID]: amount }))

  const catTotals = costCategories.reduce(
    (acc, c) => {
      const bcTotal = c.vendors.reduce((s, v) => s + (v.back_charges?.reduce((s2, bc) => s2 + bc.amount, 0) ?? 0), 0)
      return { committed: acc.committed + c.committed, billed: acc.billed + c.billed, paid: acc.paid + c.paid, open: acc.open + c.open, backCharges: acc.backCharges + bcTotal }
    },
    { committed: 0, billed: 0, paid: 0, open: 0, backCharges: 0 }
  )
  const catNetPaid = catTotals.paid - catTotals.backCharges
  const catNetBilled = catTotals.billed - catTotals.backCharges
  const catNetOpen = catTotals.open + catTotals.backCharges

  // BC-25: forward-looking exposure — what's still expected to happen, on the
  // income side and on the contractors side (general cost is excluded on purpose).
  // Over-invoiced/over-billed means nothing is left on that side — clamp at 0
  // instead of letting it cancel out real outstanding AR / unpaid bills.
  const pendingIncomeVal = data ? Math.max(data.projected_receive - data.income_actual, 0) + data.to_receive : 0
  const pendingContractorsVal = Math.max(catTotals.committed - catNetBilled, 0) + Math.max(catNetBilled - catNetPaid, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-[min(1560px,97vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            {data?.project_type === "building"
              ? <Building2 className="h-4 w-4 text-muted-foreground" />
              : <Home className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="text-sm font-semibold leading-tight">{data?.name ?? "Project"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {data?.client_name ? `${data.client_name} · ` : ""}{data?.project_type ?? ""} · target margin {data ? Math.round(data.margin_target * 100) : 30}%
              </p>
              {/* Manual ground-broken date — paired with each account's deadline to
                  draw a progressive budget-adherence line instead of a flat ceiling. */}
              <DatePickerBadge value={data?.start_date ?? null}
                onSelect={d => setProjectStartDate.mutate({ company, project_id: projectID, start_date: d ?? "" })}
                placeholder="Set start date" className="mt-0.5 text-[10px] text-muted-foreground/60" />
            </div>
          </div>
          {data && (() => {
            const profit = data.income_actual - data.cost_total
            const marginPct = data.income_actual > 0 ? Math.round((profit / data.income_actual) * 100) : 0
            const positive = profit >= 0
            return (
              <div className="ml-auto flex items-center gap-4">
                <HealthStrip data={data} variability={settings?.variability_pct ?? 5} blur={blur} />
                <div className="h-8 w-px bg-border/60" />
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Profit Margin</span>
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-sm font-bold tabular-nums", positive ? "text-primary" : "text-destructive", blur)}>{fmt(profit)}</span>
                    <span className={cn("text-sm font-bold tabular-nums", positive ? "text-primary" : "text-destructive", blur)}>{marginPct}%</span>
                  </div>
                </div>
              </div>
            )
          })()}
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data found</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">

              {/* ── Left col: Income + Cost stacked ────────────────────────── */}
              <div className="flex flex-col gap-4">

                {/* INCOME */}
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-500">Income</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                      <span className={cn("text-base font-bold tabular-nums text-emerald-500", blur)}>{fmt(data.income_actual)}</span>
                      <div className="h-3.5 w-px bg-border/50" />
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Pending</span>
                      <span className={cn("text-base font-bold tabular-nums text-blue-400", blur)}>{fmt(pendingIncomeVal)}</span>
                      <div className="h-3.5 w-px bg-border/50" />
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground/60">{pctStr(data.income_actual, data.projected_receive)}</span>
                    </div>
                  </div>
                  <SegBar
                    total={Math.max(data.income_actual, data.projected_receive)}
                    segments={[
                      { value: data.received, color: "#22c55e", label: "Received", icon: Check },
                      { value: data.to_receive, color: "#f97316", label: "Outstanding", icon: Clock },
                    ]}
                    remainder={{ label: "Remaining", value: Math.max(data.projected_receive - data.income_actual, 0) }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Received</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.received)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                      <span className={cn("text-lg font-bold tabular-nums text-orange-500", blur)}>{fmt(data.to_receive)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Estimated</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.projected_receive)}</span>
                    </div>
                  </div>
                  {incomeAccounts.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-input">
                      <button
                        onClick={() => setShowByType(o => !o)}
                        className="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left transition-colors hover:bg-muted/20 dark:bg-input/30"
                      >
                        <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">By Type</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showByType && "rotate-180")} />
                      </button>
                      {showByType && (
                        <div className="border-t border-border/20">
                          <div className="flex items-center bg-muted/10 px-3 py-1">
                            <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Type</span>
                            <div className="flex shrink-0">
                              {["Invoiced", "Received", "Outstanding"].map(h => (
                                <div key={h} className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{h}</div>
                              ))}
                            </div>
                            <div className="ml-1 w-5 shrink-0" />
                          </div>
                          {incomeAccounts.map(ia => {
                            const receivedForType = Math.max(ia.amount - ia.outstanding, 0)
                            const settled = ia.outstanding === 0
                            const receivedOver = ia.amount > 0 && receivedForType > ia.amount
                            return (
                              <div key={ia.name} className="flex items-center border-t border-border/20 px-3 py-1.5">
                                <div className="flex flex-1 items-center gap-1.5 min-w-0">
                                  <span className={cn("truncate text-[11px]", settled ? "text-muted-foreground/50" : "text-muted-foreground")}>{ia.name}</span>
                                  <div className="w-3.5 shrink-0">
                                    {settled && <Check className="h-3 w-3 text-emerald-500" />}
                                  </div>
                                </div>
                                <div className="flex shrink-0">
                                  <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                    {fmt(ia.amount)}
                                  </span>
                                  {receivedOver ? (
                                    <TooltipProvider delay={0}>
                                      <Tooltip>
                                        <TooltipTrigger render={<span className={cn("w-20 cursor-help text-right text-[11px] font-semibold tabular-nums text-emerald-500", blur)} />}>
                                          {fmt(receivedForType)}
                                        </TooltipTrigger>
                                        <TooltipContent>Received value exceeds invoiced</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                      {fmt(receivedForType)}
                                    </span>
                                  )}
                                  <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/50" : "text-orange-500")}>
                                    {fmt(ia.outstanding)}
                                  </span>
                                </div>
                                {/* Invoiced-over-time chart popover for this income type */}
                                <Popover>
                                  <PopoverTrigger
                                    title="Distribution over time"
                                    className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    <LineChartIcon className="h-3 w-3" />
                                  </PopoverTrigger>
                                  <PopoverContent align="start" side="right" className="w-[24rem]">
                                    <IncomeChartPanel company={company} projectID={projectID} typeName={ia.name} />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* COST OVERVIEW */}
                <div className={cn("flex flex-col gap-3 rounded-xl border p-4",
                  overCeiling ? "border-red-500/30 bg-red-500/[0.04]" : "border-red-500/20 bg-red-500/[0.03]")}>
                  <div className="flex items-center gap-2">
                    <HandCoins className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-500">Cost</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                      <span className={cn("text-base font-bold tabular-nums text-red-500", blur)}>
                        {fmt(data.cost_total)}
                      </span>
                      <div className="h-3.5 w-px bg-border/50" />
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground/60">{pctStr(data.cost_total, data.cost_ceiling)}</span>
                    </div>
                    {(showAccounts || editingBudget) && (editingBudget ? (
                      <div className="flex h-6 shrink-0 items-center">
                        <button
                          onClick={saveEditing}
                          className="flex h-full items-center gap-1 rounded-l-md border border-red-500/40 bg-red-500/10 px-1.5 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/20"
                          title="Save the cost budget"
                        >
                          <Check className="h-3 w-3" /> Done
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex h-full w-6 items-center justify-center rounded-r-md border border-l-0 border-input bg-transparent text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30"
                          title="Discard changes"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startEditing}
                        className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-input bg-transparent px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30"
                        title="Map the cost budget across accounts"
                      >
                        <SlidersHorizontal className="h-3 w-3" /> Map budget
                      </button>
                    ))}
                  </div>
                  <SegBar
                    total={Math.max(data.cost_ceiling, data.cost_total)}
                    segments={[
                      { value: data.paid, color: "#ef4444", label: "Paid", icon: Check },
                      { value: data.open_payable, color: "#f97316", label: "Outstanding", icon: Clock },
                    ]}
                    remainder={{ label: "Remaining", value: Math.max(data.cost_ceiling - data.cost_total, 0) }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Paid</span>
                      <span className={cn("text-lg font-bold tabular-nums text-red-500", blur)}>{fmt(data.paid)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                      <span className={cn("text-lg font-bold tabular-nums text-orange-500", blur)}>{fmt(data.open_payable)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Cost Budget</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.cost_ceiling)}</span>
                    </div>
                  </div>
                  {/* By Account collapsible */}
                  <div className="overflow-hidden rounded-lg border border-input">
                    <button
                      onClick={() => setShowAccounts(o => !o)}
                      className="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left transition-colors hover:bg-muted/20 dark:bg-input/30"
                    >
                      <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">By Account</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showAccounts && "rotate-180")} />
                    </button>
                    {showAccounts && (
                      <div className="border-t border-border/20">
                        {costAccounts.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 px-3 py-6">
                            <p className="text-[11px] text-muted-foreground">No accounts yet for this project</p>
                            <AddPresetAccountButton company={company} projectID={projectID}
                              existingIDs={new Set()} variant="empty" />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center bg-muted/10 px-3 py-1">
                              <div className="w-4 shrink-0 mr-0.5" />
                              <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Account</span>
                              <div className="flex shrink-0">
                                <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Budget</div>
                                <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Billed</div>
                                <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Paid</div>
                                <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Outstanding</div>
                                <div className="ml-1 w-5 shrink-0" />
                                <div className="w-5 shrink-0" />
                              </div>
                            </div>
                            {costAccounts.map((ca, i) => (
                              <AccountRow key={ca.id || i} ca={ca} blur={blur}
                                editing={editingBudget} budgetValue={budgetFor(ca)} onDraftBudget={onDraftBudget}
                                onSetDeadline={(accountID, deadline) => setAccountDeadline.mutate({ company, project_id: projectID, account_id: accountID, deadline: deadline ?? "" })}
                                company={company} projectID={projectID} startDate={data?.start_date} projectType={data?.project_type} />
                            ))}
                            {editingBudget && (
                              <AddPresetAccountButton company={company} projectID={projectID}
                                existingIDs={new Set(costAccounts.map(ca => ca.id))} />
                            )}
                            {/* Allocation footer (visible while mapping) */}
                            {editingBudget && (
                              <div className="flex items-center gap-2.5 border-t border-border/20 bg-muted/10 px-3 py-2.5">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Allocated</span>
                                <span className={cn("text-sm font-bold tabular-nums", allocatedBudget > costCeiling ? "text-amber-500" : "text-foreground")}>
                                  {fmt(allocatedBudget)}
                                </span>
                                <span className="text-[11px] text-muted-foreground/50">of</span>
                                <span className="text-sm font-bold tabular-nums text-muted-foreground">{fmt(costCeiling)}</span>
                                <span className={cn("ml-auto rounded-md px-2 py-1 text-[12px] font-bold tabular-nums",
                                  costCeiling - allocatedBudget < 0 ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground")}>
                                  {costCeiling - allocatedBudget >= 0 ? `${fmt(costCeiling - allocatedBudget)} left` : `${fmt(allocatedBudget - costCeiling)} over`}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right col: Subcontractor Costs + Cost Forecast ───────────── */}
              <div className="self-start flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.04] p-4">

                {/* Title row */}
                <div className="flex items-center gap-2">
                  <HardHat className="h-4 w-4 text-yellow-500" />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold leading-tight text-yellow-500">Contractors Costs</span>
                    <span className="flex items-start gap-1 text-[11px] text-muted-foreground/60">
                      <CornerDownRight className="mt-px h-3 w-3 shrink-0 text-yellow-500/40" />
                      <span>Budget by category ·<br />PO commitment is the fill</span>
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 self-start">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Budget</span>
                    <span className={cn("text-base font-bold tabular-nums text-yellow-500", blur)}>{fmt(data.labor_budget)}</span>
                    <div className="h-3.5 w-px bg-border/50" />
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Pending</span>
                    <span className={cn("text-base font-bold tabular-nums text-blue-400", blur)}>{fmt(pendingContractorsVal)}</span>
                    <div className="h-3.5 w-px bg-border/50" />
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground/60">{pctStr(catTotals.committed, data.labor_budget)}</span>
                  </div>
                  <button
                    onClick={() => setEditingContractors(v => !v)}
                    className={cn("flex h-6 shrink-0 items-center gap-1 self-start rounded-md border px-1.5 text-[10px] font-medium transition-colors",
                      editingContractors ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-500" : "border-input bg-transparent text-muted-foreground hover:text-foreground dark:bg-input/30")}
                    title="Edit category and subcontractor budgets"
                  >
                    {editingContractors ? <><Check className="h-3 w-3" /> Done</> : <><SlidersHorizontal className="h-3 w-3" /> Budgets</>}
                  </button>
                </div>

                {/* SegBar — committed (paid/outstanding) vs budget */}
                <SegBar
                  total={Math.max(data.labor_budget, catTotals.committed, 1)}
                  segments={[
                    { value: catNetPaid, color: "#eab308", label: "Paid", icon: Check },
                    { value: Math.max(catNetBilled - catNetPaid, 0), color: "#f97316", label: "Outstanding", icon: Clock },
                  ]}
                  remainder={{ label: "Remaining vs budget", value: Math.max(data.labor_budget - catTotals.committed, 0) }}
                />

                {/* KPI grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Budget</span>
                    <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.labor_budget)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Committed · PO</span>
                    <span className={cn("text-lg font-bold tabular-nums text-yellow-500", blur)}>{fmt(catTotals.committed)}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Paid</span>
                    <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(catNetPaid)}</span>
                  </div>
                </div>

                {/* Category list — always visible */}
                <div className="overflow-hidden rounded-lg border border-yellow-500/20">
                  {/* Column header */}
                  <div className="flex items-center gap-3 border-b border-yellow-500/20 bg-muted/10 px-4 py-1">
                    <div className="h-6 w-6 shrink-0" />
                    <div className="min-w-0 flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Category</div>
                    <div className="flex shrink-0 items-center">
                      {(["Budget", "Committed", "Billed", "Paid", "Outstanding"] as const).map(lbl => (
                        <div key={lbl} className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">{lbl}</div>
                      ))}
                    </div>
                    <div className="w-3.5 shrink-0" />
                  </div>
                  {costCategories.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-[11px] italic text-muted-foreground/40">
                      No categories with budget or spend yet.
                    </div>
                  ) : (
                    costCategories.map(cat => {
                      const id = cat.category_id || cat.category_name
                      return (
                        <CategoryRow
                          key={id}
                          cat={cat}
                          blur={blur}
                          isOpen={openCatId === id}
                          onToggle={() => setOpenCatId(prev => prev === id ? null : id)}
                          editing={editingContractors}
                          company={company}
                          projectID={projectID}
                          categories={categoryOptions}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <LaborForecastBlock company={company} projectID={projectID} blur={blur} />
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  )
}
