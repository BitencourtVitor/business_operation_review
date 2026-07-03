"use client"

import { createPortal } from "react-dom"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch }   from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useUpdateForecast } from "@/hooks/use-forecast"
import { useCatalogTable } from "@/hooks/use-catalog"

import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { getForecastDisplayStatus } from "@bor2/shared"
import { Ban, CalendarIcon, Check, ChevronsUpDown, FileText, Hash, Info, Loader2, Package, Plus, SlidersHorizontal, Trash2, Truck, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useToggleFieldwire, useToggleMachine, useUpdateMachineUnit, useToggleContractStep, useDeleteContractTeam, useAddContractTeam } from "@/hooks/use-forecast"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViewTab = "info" | "fieldwire" | "machines" | "contract" | "optionals"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    "#22c55e",
  planned:   "#3b82f6",
  overdue:   "#ef4444",
  completed: "#6b7280",
  cancelled: "#6b7280",
}

const STATUS_LABELS: Record<ForecastStatus, string> = {
  active:    "Open",
  planned:   "Not Started",
  completed: "Closed",
  cancelled: "Cancelled",
}

const PROJECT_TYPES = ["Building", "Lot", "House"]

const TABS: { key: ViewTab; label: string; icon: React.ReactNode }[] = [
  { key: "info",      label: "Info & Dates", icon: <Info             className="h-3 w-3" /> },
  { key: "fieldwire", label: "Fieldwire",    icon: <img src="/images/icon_fieldwire.png" alt="" className="h-3 w-3 object-contain" /> },
  { key: "machines",  label: "Machines",     icon: <Truck            className="h-3 w-3" /> },
  { key: "contract",  label: "Contract",     icon: <FileText         className="h-3 w-3" /> },
  { key: "optionals", label: "Optionals",    icon: <SlidersHorizontal className="h-3 w-3" /> },
]

const TOGGLES: { key: "buildertrend" | "storage" | "qbTime" | "hasOrders" | "hvac"; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    key: "buildertrend", label: "Buildertrend", desc: "Project tracked in Buildertrend",
    icon: (
      <>
        <img src="/images/icon_buildertrend.png"      alt="" className="h-4 w-4 object-contain dark:hidden" />
        <img src="/images/icon_buildertrend_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" />
      </>
    ),
  },
  {
    key: "storage", label: "Storage", desc: "Storage unit required on site",
    icon: <Package className="h-4 w-4 text-muted-foreground" />,
  },
  {
    key: "qbTime", label: "QB Time", desc: "Time tracked in QuickBooks",
    icon: (
      <>
        <img src="/images/icon_qbtime.png"      alt="" className="h-4 w-4 object-contain dark:hidden" />
        <img src="/images/icon_qbtime_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" />
      </>
    ),
  },
  {
    key: "hasOrders", label: "Has Orders", desc: "Orders page has this project's dates",
    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
  },
  {
    key: "hvac", label: "HVAC", desc: "HVAC work included",
    icon: <img src="/images/sublogo_hvac.png" alt="" className="h-4 w-4 object-contain" />,
  },
]

// Shared trigger className — matches SelectTrigger anatomy exactly
const TRIGGER_CLS =
  "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-muted px-2.5 text-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground"

function dateVal(v: string | null | undefined) {
  return v ? v.slice(0, 10) : ""
}

// ─── Field label ──────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-muted-foreground">{children}</p>
}

// ─── Combobox with search + create-new ───────────────────────────────────────

function ComboboxField({
  label, value, options, onChange, placeholder, allowNew, isSaving,
}: {
  label:       string
  value:       string
  options:     string[]
  onChange:    (v: string) => void
  placeholder?: string
  allowNew?:   boolean
  isSaving?:   boolean
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState("")
  const triggerRef        = useRef<HTMLButtonElement>(null)
  const [rect, setRect]   = useState<DOMRect | null>(null)

  function openDropdown() {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-combobox-drop]") &&
          e.target !== triggerRef.current) {
        setOpen(false); setQuery("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
  const canCreate = allowNew && query.trim() && !options.some(o => o.toLowerCase() === query.toLowerCase())

  function select(v: string) { onChange(v); setOpen(false); setQuery("") }

  const dropdown = open && rect && createPortal(
    <div
      data-combobox-drop
      className="rounded-lg border border-border bg-popover shadow-md"
      style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <svg className="h-3.5 w-3.5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          className="h-8 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="max-h-48 overflow-y-auto py-1">
        {filtered.length === 0 && !canCreate && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
        )}
        {filtered.map(o => (
          <button key={o} type="button" onClick={() => select(o)}
            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent ${value === o ? "font-medium text-primary" : ""}`}>
            {o}
          </button>
        ))}
        {canCreate && (
          <button type="button" onClick={() => select(query.trim())}
            className="w-full px-3 py-1.5 text-left text-xs text-primary hover:bg-accent">
            + Create "{query.trim()}"
          </button>
        )}
      </div>
    </div>,
    document.body
  )

  return (
    <div className="min-w-0">
      <FL>{label}</FL>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        onClick={openDropdown}
        className={TRIGGER_CLS}
      >
        <span className="flex-1 truncate text-left">
          {value
            ? value
            : <span className="text-muted-foreground">{placeholder ?? "Select…"}</span>}
        </span>
        {isSaving
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {dropdown}
    </div>
  )
}

// ─── Date picker ──────────────────────────────────────────────────────────────

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${m}/${d}/${y}`
}

function displayToIso(display: string): string {
  const digits = display.replace(/\D/g, "")
  if (digits.length < 8) return ""
  const m = parseInt(digits.slice(0, 2), 10)
  const d = parseInt(digits.slice(2, 4), 10)
  const y = parseInt(digits.slice(4, 8), 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return ""
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return ""
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function DatePickerField({ label, value, onBlur, isSaving }: { label: string; value: string; onBlur: (v: string) => void; isSaving?: boolean }) {
  const [inputText, setInputText] = useState(isoToDisplay(value))
  const [open, setOpen] = useState(false)

  useEffect(() => setInputText(isoToDisplay(value)), [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8)
    let fmt = raw
    if (raw.length > 4) fmt = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`
    else if (raw.length > 2) fmt = `${raw.slice(0, 2)}/${raw.slice(2)}`
    setInputText(fmt)
  }

  function handleBlur() {
    const iso = displayToIso(inputText)
    onBlur(iso)
    setInputText(iso ? isoToDisplay(iso) : "")
  }

  const selectedDate = (() => {
    if (!value || value.length < 10) return undefined
    const [y, m, d] = value.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d)
  })()

  function handleDaySelect(date: Date | undefined) {
    if (!date) return
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    const iso = `${y}-${m}-${d}`
    setInputText(isoToDisplay(iso))
    onBlur(iso)
    setOpen(false)
  }

  return (
    <div>
      <FL>{label}</FL>
      <div className="flex h-8 items-center overflow-hidden rounded-lg border border-input bg-muted">
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground"
          placeholder="mm/dd/yyyy"
          value={inputText}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:bg-muted/50">
            {isSaving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CalendarIcon className="h-3.5 w-3.5" />}
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={4}
            className="p-0 w-auto"
            positionerStyle={{ width: "auto" }}
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              defaultMonth={selectedDate}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function InfoTab({ p, onSave, savingField }: { p: ForecastProject; onSave: (f: string, v: unknown) => void; savingField: string | null }) {
  const [obs, setObs] = useState(p.obs || "")
  useEffect(() => setObs(p.obs || ""), [p.obs])
  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <FL>Observations</FL>
          {savingField === "obs" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <Textarea className="flex-1 resize-none text-xs" value={obs}
          onChange={e => setObs(e.target.value)} onBlur={() => onSave("obs", obs)}
          placeholder="Observations..." />
      </div>
      <div className="flex w-36 flex-col gap-2">
        <DatePickerField label="Beams Date"  value={dateVal(p.previousBeamsDate)} onBlur={v => onSave("previousBeamsDate", v ? `${v}T00:00:00Z` : null)} isSaving={savingField === "previousBeamsDate"} />
        <DatePickerField label="Prev. Start" value={dateVal(p.previousStartDate)} onBlur={v => onSave("previousStartDate", v ? `${v}T00:00:00Z` : null)} isSaving={savingField === "previousStartDate"} />
        <DatePickerField label="Prev. End"   value={dateVal(p.previousEndDate)}   onBlur={v => onSave("previousEndDate",   v ? `${v}T00:00:00Z` : null)} isSaving={savingField === "previousEndDate"} />
      </div>
    </div>
  )
}

function FieldwireTab({ p }: { p: ForecastProject }) {
  const fw     = p.fieldwire ?? []
  const toggle = useToggleFieldwire()
  const isOk   = (f: typeof fw[0]) => f.status === "true" || f.status === true || f.status === "t" || f.status === "1"
  const done   = fw.filter(isOk).length

  // Group by category
  const groups = fw.reduce<Record<string, typeof fw>>((acc, f) => {
    const cat = f.category?.trim() || "General"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fieldwire Docs</span>
        <span className={`ml-auto text-xs font-semibold ${done === fw.length && fw.length > 0 ? "text-green-600" : "text-muted-foreground"}`}>
          {done} / {fw.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {fw.length === 0 && (
          <span className="py-4 text-center text-xs text-muted-foreground">No documents linked</span>
        )}
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{cat}</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {items.map((f, i) => {
                const checked    = isOk(f)
                const isToggling = toggle.isPending && toggle.variables?.fwId === f.id
                return (
                  <label
                    key={f.id ?? i}
                    className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 transition-opacity hover:bg-muted/40 ${isToggling ? "opacity-50" : ""}`}
                  >
                    {isToggling
                      ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      : <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0 accent-primary"
                          checked={checked}
                          onChange={e => {
                            if (f.id != null) toggle.mutate({ fwId: f.id, status: e.target.checked })
                          }}
                        />
                    }
                    <span className={`flex-1 truncate text-xs ${checked ? "text-muted-foreground line-through" : ""}`}>
                      {f.document?.trim() || `Doc #${f.id ?? i + 1}`}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// A unit is "dispensed" when it stores a justification string rather than a unit code.
// BOR1 legacy: dispensed machines had unit = ISO timestamp (e.g. "2025-12-12T18:04:32Z").
// BOR2 onwards: any non-empty string that isn't a plain unit code (letters+digits, max ~10 chars).
function isDispensedUnit(unit: string | null | undefined): boolean {
  if (!unit) return false
  if (/^\d{4}-\d{2}-\d{2}T/.test(unit)) return true   // BOR1 legacy timestamp
  return !/^[A-Za-z]{0,3}\d{1,8}$/.test(unit.trim())  // not a unit code
}

type MachineState = "none" | "yes" | "dispensed"

function MachinesTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  const mach       = p.machines ?? []
  const toggle     = useToggleMachine()
  const updateUnit = useUpdateMachineUnit()

  const { data: providerRows = [] } = useCatalogTable("providers")
  const providers = (providerRows as { name?: string }[]).map(r => r.name ?? "").filter(Boolean)

  function getMachineState(m: typeof mach[0]): MachineState {
    if (isDispensedUnit(m.unit) || m.status === "dispensed") return "dispensed"
    if (m.status && m.status !== "false" && m.status !== "0") return "yes"
    return "none"
  }

  function setState(m: typeof mach[0], next: MachineState) {
    if (m.id == null) return
    if (next === "yes") {
      toggle.mutate({ machId: m.id, status: "scheduled" })
      updateUnit.mutate({ machId: m.id, unit: "" })
    } else if (next === "dispensed") {
      toggle.mutate({ machId: m.id, status: "dispensed" })
      updateUnit.mutate({ machId: m.id, unit: "" })
    } else {
      toggle.mutate({ machId: m.id, status: "" })
      updateUnit.mutate({ machId: m.id, unit: "" })
    }
  }

  const scheduled   = mach.filter(m => getMachineState(m) === "yes").length
  const dispensedCt = mach.filter(m => getMachineState(m) === "dispensed").length

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">

      {/* Provider row */}
      <div className="flex items-center gap-2 px-1">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Provider</span>
        <div className="min-w-0 flex-1">
          <ComboboxField
            label=""
            value={p.machineProvider || ""}
            options={providers}
            onChange={v => onSave("machineProvider", v)}
            placeholder="Select provider…"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className={scheduled > 0 ? "text-green-600 dark:text-green-400" : ""}>{scheduled}</span>
          <span>/</span>
          <span>{mach.length}</span>
          {dispensedCt > 0 && (
            <span className="text-amber-500" title={`${dispensedCt} dispensed`}>
              <Ban className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      {/* Machine cards — flex-1 fills remaining panel height; scrolls when overflow */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {mach.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No machines linked to this project</p>
        )}
        {mach.map((m, i) => {
          const state      = getMachineState(m)
          const isToggling = toggle.isPending && toggle.variables?.machId === m.id
          const isUpdating = updateUnit.isPending && updateUnit.variables?.machId === m.id
          const title      = m.title?.trim() || `Machine #${m.id ?? i + 1}`
          const unitVal    = /^\d{4}-\d{2}-\d{2}T/.test(m.unit ?? "") ? "" : (m.unit || "")

          return (
            <div
              key={m.id ?? i}
              className={[
                "rounded border px-2 py-1 transition-colors",
                state === "yes"       ? "border-primary/30 bg-primary/5"     : "",
                state === "dispensed" ? "border-amber-500/30 bg-amber-500/5" : "",
                state === "none"      ? "border-border bg-card"              : "",
              ].join(" ")}
            >
              {/* Single fixed-height row: icon + name (flex-1) + toggle + input (fixed, conditional) */}
              <div className="flex items-center gap-1.5">
                <Truck className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{title}</span>
                <div className="flex shrink-0 overflow-hidden rounded border border-border text-[10px] font-semibold">
                  {(["none", "yes", "dispensed"] as MachineState[]).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      disabled={isToggling}
                      onClick={() => setState(m, opt)}
                      className={[
                        "flex items-center gap-1 px-1.5 py-0.5 transition-colors disabled:opacity-50",
                        state === opt
                          ? opt === "dispensed"
                            ? "bg-amber-600 text-white"
                            : opt === "yes"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {opt === "none"      && "—"}
                      {opt === "yes"       && <><Check className="h-2.5 w-2.5" />Yes</>}
                      {opt === "dispensed" && <><Ban   className="h-2.5 w-2.5" />Dispensed</>}
                    </button>
                  ))}
                </div>
                {/* Input — fixed width, only rendered when a state is active */}
                {isToggling && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
                {!isToggling && (state === "yes" || state === "dispensed") && (
                  <div className="relative w-28 shrink-0">
                    <div className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2">
                      {state === "dispensed"
                        ? <FileText className="h-2.5 w-2.5 text-amber-500/70" />
                        : <Hash     className="h-2.5 w-2.5 text-muted-foreground/60" />
                      }
                    </div>
                    <input
                      key={`${m.id}-${state}`}
                      type="text"
                      defaultValue={unitVal}
                      placeholder={state === "dispensed" ? "Justification…" : "Unit"}
                      className={[
                        "w-full rounded border py-0.5 pl-5 pr-2 text-[11px] outline-none transition-colors",
                        "bg-transparent placeholder:text-muted-foreground/50 focus:bg-background",
                        state === "dispensed"
                          ? "border-amber-500/40 italic focus:border-amber-500"
                          : "border-input focus:border-ring",
                        isUpdating ? "opacity-50" : "",
                      ].join(" ")}
                      onBlur={e => {
                        if (m.id == null) return
                        if (e.target.value !== unitVal) updateUnit.mutate({ machId: m.id, unit: e.target.value })
                      }}
                    />
                    {isUpdating && (
                      <Loader2 className="absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContractTab({ p }: { p: ForecastProject }) {
  const steps      = p.contractSteps ?? []
  const toggleStep = useToggleContractStep()
  const addTeam    = useAddContractTeam()
  const deleteTeam = useDeleteContractTeam()

  const { data: workforceRows   = [] } = useCatalogTable("workforce")
  const { data: catalogStepRows = [] } = useCatalogTable("contract-steps")

  const catalogTeams     = (workforceRows   as { name?: string }[]).map(r => r.name ?? "").filter(Boolean)
  const catalogStepOrder = (catalogStepRows as { step?: string }[]).map(r => r.step ?? "")

  const isOk = (s: typeof steps[0]) =>
    s.status === "true" || (s.status as unknown) === true || s.status === "t" || s.status === "1"

  const dbTeams = useMemo(
    () => [...new Set(steps.map(s => s.team).filter(Boolean))] as string[],
    [steps],
  )

  const [selectedTeam,  setSelectedTeam]  = useState<string | null>(null)
  const [addingTeam,    setAddingTeam]    = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const addTriggerRef                     = useRef<HTMLButtonElement>(null)
  const [dropRect,      setDropRect]      = useState<DOMRect | null>(null)

  useEffect(() => {
    setSelectedTeam(prev => {
      if (prev && dbTeams.includes(prev)) return prev
      return dbTeams[0] ?? null
    })
  }, [dbTeams.includes, dbTeams[0]])

  useEffect(() => {
    if (!addingTeam) return
    function handleClick(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-team-drop]") && e.target !== addTriggerRef.current) {
        setAddingTeam(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [addingTeam])

  const teamSteps = steps.filter(s => s.team === selectedTeam)

  // Sort by catalog seq — position never shifts on toggle
  const sortedTeamSteps = useMemo(() => {
    if (catalogStepOrder.length === 0) return teamSteps
    return [...teamSteps].sort((a, b) => {
      const ia = catalogStepOrder.indexOf(a.step ?? "")
      const ib = catalogStepOrder.indexOf(b.step ?? "")
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }, [teamSteps, catalogStepOrder])

  const doneCt        = sortedTeamSteps.filter(isOk).length
  const availableTeams = catalogTeams.filter(t => !dbTeams.includes(t))

  function openAddTeam() {
    setDropRect(addTriggerRef.current?.getBoundingClientRect() ?? null)
    setAddingTeam(true)
  }

  function selectTeamFromCatalog(team: string) {
    setAddingTeam(false)
    addTeam.mutate(
      { projectId: p.id, team },
      { onSuccess: () => setSelectedTeam(team) },
    )
  }

  const teamDropdown = addingTeam && dropRect && createPortal(
    <div
      data-team-drop
      className="rounded-lg border border-border bg-popover shadow-md"
      style={{ position: "fixed", top: dropRect.bottom + 4, left: dropRect.left, width: Math.max(dropRect.width, 140), zIndex: 9999 }}
    >
      {availableTeams.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">All teams assigned</p>
      ) : (
        <div className="max-h-40 overflow-y-auto py-1">
          {availableTeams.map(t => (
            <button key={t} type="button" onClick={() => selectTeamFromCatalog(t)}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )

  return (
    <div className="flex h-full gap-2 overflow-hidden">

      {/* ── Left: Teams panel ─────────────────────────────────────────── */}
      <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex flex-1 flex-col overflow-y-auto">
          {dbTeams.length === 0 && !addTeam.isPending && (
            <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">No teams</p>
          )}
          {dbTeams.map(team => (
            <div
              key={team}
              onClick={() => { setSelectedTeam(team); setConfirmDelete(null) }}
              className={`group flex cursor-pointer items-center gap-1 px-2 py-1.5 hover:bg-muted/50 ${selectedTeam === team ? "bg-muted" : ""}`}
            >
              <span className="flex-1 truncate text-xs font-medium">{team}</span>

              {/* Inline delete confirmation */}
              {confirmDelete === team ? (
                <div className="flex shrink-0 items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() =>
                      deleteTeam.mutate(
                        { projectId: p.id, team },
                        {
                          onSuccess: () => {
                            setConfirmDelete(null)
                            if (selectedTeam === team)
                              setSelectedTeam(dbTeams.find(t => t !== team) ?? null)
                          },
                        },
                      )
                    }
                    className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                    title="Confirm delete"
                  >
                    {deleteTeam.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Check    className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(team) }}
                  className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                  title="Delete team"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add button / loading */}
        <div className="border-t border-border p-1">
          {addTeam.isPending ? (
            <div className="flex items-center justify-center py-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <button
              ref={addTriggerRef}
              onClick={openAddTeam}
              className="flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>
        {teamDropdown}
      </div>

      {/* ── Right: Steps panel ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedTeam ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Select a team</p>
        ) : (
          <>
            <div className="mb-1 flex items-center">
              <span className="truncate text-xs font-semibold text-muted-foreground">{selectedTeam}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{doneCt} / {sortedTeamSteps.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {sortedTeamSteps.length === 0 && (
                <p className="py-2 text-center text-[10px] text-muted-foreground">No steps</p>
              )}
              {sortedTeamSteps.map((s, i) => {
                const ok          = isOk(s)
                const isToggling  = toggleStep.isPending && toggleStep.variables?.stepId === s.id
                return (
                  <label
                    key={s.id ?? i}
                    className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 transition-opacity hover:bg-muted/40 ${isToggling ? "opacity-50" : ""}`}
                  >
                    {isToggling
                      ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      : <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0 accent-primary"
                          checked={ok}
                          onChange={e => {
                            if (s.id != null) toggleStep.mutate({ stepId: s.id, status: e.target.checked })
                          }}
                        />
                    }
                    <span className={`flex-1 truncate text-xs ${ok ? "text-muted-foreground line-through" : ""}`}>
                      {s.step?.trim() || `Step #${s.id ?? i + 1}`}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OptionalsTab({ p, onSave, savingField }: { p: ForecastProject; onSave: (f: string, v: unknown) => void; savingField: string | null }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 content-center">
      {TOGGLES.map(({ key, label, desc, icon }) => {
        const isSaving = savingField === key
        return (
          <div key={key} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
            {isSaving
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              : <Switch checked={!!p[key]} onCheckedChange={v => onSave(key, v)} id={`${p.id}-${key}`} />
            }
            <span className="flex shrink-0 items-center">{icon}</span>
            <div className="flex min-w-0 flex-col">
              <Label htmlFor={`${p.id}-${key}`} className={`text-xs font-medium leading-tight ${isSaving ? "" : "cursor-pointer"}`}>{label}</Label>
              <span className="truncate text-[10px] text-muted-foreground">{desc}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Left panel — shared between New and Edit ─────────────────────────────────

function LeftPanel({
  cliente, jobSite, type, loteBld, status, address,
  availableClients, availableJobSites,
  onClienteChange, onJobSiteChange, onTypeChange, onLoteBldChange, onLoteBldBlur, onStatusChange, onAddressChange, onAddressBlur,
  statusFixed, onDelete, savingField,
}: {
  cliente:           string
  jobSite:           string
  type:              string
  loteBld:           string
  status:            ForecastStatus
  address:           string
  availableClients:  string[]
  availableJobSites: string[]
  onClienteChange:   (v: string) => void
  onJobSiteChange:   (v: string) => void
  onTypeChange:      (v: string) => void
  onLoteBldChange:   (v: string) => void
  onLoteBldBlur?:    (v: string) => void
  onStatusChange:    (v: ForecastStatus) => void
  onAddressChange:   (v: string) => void
  onAddressBlur?:    (v: string) => void
  statusFixed?:      boolean
  onDelete?:         () => void
  savingField?:      string | null
}) {
  return (
    <div className="flex w-[40%] shrink-0 flex-col gap-3 border-r border-border p-3">

      {/* Client + Job Site — comboboxes */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "0.75fr 1.75fr" }}>
        <ComboboxField
          label="Client"
          value={cliente}
          options={availableClients}
          onChange={onClienteChange}
          placeholder="Select client"
          allowNew
          isSaving={savingField === "cliente"}
        />
        <ComboboxField
          label="Job Site"
          value={jobSite}
          options={availableJobSites}
          onChange={onJobSiteChange}
          placeholder="Select job site"
          allowNew
          isSaving={savingField === "jobSite"}
        />
      </div>

      {/* Type+Number joined + Status */}
      <div className="grid grid-cols-2 gap-2">
        {/* Type + Number */}
        <div>
          <div className="mb-1 flex items-center gap-1">
            <p className="text-xs font-medium text-muted-foreground">Type / Number</p>
            {savingField === "type" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex h-8 items-center overflow-hidden rounded-lg border border-input">
            <Select value={type || "__none"} onValueChange={v => onTypeChange(v === "__none" ? "" : v as string)}>
              <SelectTrigger className="h-8 w-[70%] !rounded-none border-0 border-r border-input text-xs focus-visible:ring-0 focus-visible:ring-offset-0">
                <SelectValue>{type || <span className="text-muted-foreground">Type</span>}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="h-8 w-[30%] rounded-none border-0 text-xs shadow-none focus-visible:ring-0"
              value={loteBld}
              onChange={e => onLoteBldChange(e.target.value)}
              onBlur={e => onLoteBldBlur?.(e.target.value)}
              placeholder="#"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="mb-1 flex items-center gap-1">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            {savingField === "status" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {statusFixed ? (
            <div className={`${TRIGGER_CLS} cursor-default`}>
              <span className="flex-1 text-left">{STATUS_LABELS[status]}</span>
            </div>
          ) : (
            <Select value={status} onValueChange={v => onStatusChange(v as ForecastStatus)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>{STATUS_LABELS[status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as ForecastStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Address + optional Delete button */}
      <div>
        <div className="mb-1 flex items-center gap-1">
          <p className="text-xs font-medium text-muted-foreground">Address</p>
          {savingField === "address" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-1">
          <Input
            className="h-8 flex-1 text-xs"
            value={address}
            onChange={e => onAddressChange(e.target.value)}
            onBlur={e => onAddressBlur?.(e.target.value)}
            placeholder="Street address"
          />
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive hover:text-red-700"
              onClick={onDelete}
              title="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── New Project Card ─────────────────────────────────────────────────────────

type NewFormTab = "info" | "optionals"

const NEW_FORM_TABS: { key: NewFormTab; label: string }[] = [
  { key: "info",      label: "Info & Dates" },
  { key: "optionals", label: "Optionals"    },
]

export type NewFormState = {
  cliente: string; jobSite: string; type: string; loteBld: string
  address: string; status: ForecastStatus; obs: string
  previousBeamsDate: string; previousStartDate: string
  previousEndDate: string; hvac: boolean; buildertrend: boolean; storage: boolean; qbTime: boolean; hasOrders: boolean
}

const EMPTY_NEW_FORM: NewFormState = {
  cliente: "", jobSite: "", type: "", loteBld: "", address: "", status: "planned",
  obs: "", previousBeamsDate: "", previousStartDate: "",
  previousEndDate: "", hvac: false, buildertrend: false, storage: false, qbTime: false, hasOrders: false,
}

// Fields that survive a partial reset (persist across consecutive creates)
const PERSISTENT_FIELDS = ["cliente", "jobSite", "type", "status"] as const

export function NewProjectCard({
  availableClients, availableJobSites, saving, onSave,
}: {
  availableClients:  string[]
  availableJobSites: string[]
  saving:            boolean
  onSave:            (data: NewFormState) => Promise<void>
}) {
  const [form, setForm] = useState<NewFormState>(EMPTY_NEW_FORM)
  const [tab,  setTab]  = useState<NewFormTab>("info")
  function set<K extends keyof NewFormState>(k: K, v: NewFormState[K]) { setForm(f => ({ ...f, [k]: v })) }

  async function handleCreate() {
    try {
      await onSave(form)
    } finally {
      setForm(f => ({
        ...EMPTY_NEW_FORM,
        ...Object.fromEntries(PERSISTENT_FIELDS.map(k => [k, f[k]])),
      }))
      setTab("info")
    }
  }

  const canCreate = !saving && !!form.cliente.trim() && !!form.jobSite.trim()

  return (
    <div className="relative mb-3 w-full">
      {/* Tab bar — right-aligned, same pattern as ProjectCard */}
      <div className="flex items-end justify-end">
        <div className="relative z-[2] mb-[-1px] flex items-center gap-5 rounded-t-xl border border-b-0 bg-card px-6 py-1.5 text-[11px]" style={{ borderColor: "#3b82f6" }}>
          {NEW_FORM_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`transition-colors ${tab === t.key ? "font-semibold text-primary" : "text-muted-foreground opacity-70 hover:opacity-100"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body — top-left rounded, top-right flat (connects to tab bar above) */}
      <div className="relative z-[1] flex h-[204px] overflow-hidden rounded-bl-lg rounded-br-lg rounded-tl-lg border bg-card"
        style={{ borderColor: "#3b82f6" }}>

        <LeftPanel
          cliente={form.cliente}   jobSite={form.jobSite}
          type={form.type}         loteBld={form.loteBld}
          status={form.status}     address={form.address}
          availableClients={availableClients}
          availableJobSites={availableJobSites}
          onClienteChange={v => set("cliente", v)}
          onJobSiteChange={v => set("jobSite", v)}
          onTypeChange={v => set("type", v)}
          onLoteBldChange={v => set("loteBld", v)}
          onStatusChange={v => set("status", v)}
          onAddressChange={v => set("address", v)}
        />

        {/* Right panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {tab === "info" && (
            <div className="flex h-full gap-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <FL>Observations</FL>
                <Textarea className="flex-1 resize-none text-xs" value={form.obs}
                  onChange={e => set("obs", e.target.value)} placeholder="Observations..." />
              </div>
              <div className="flex w-36 flex-col gap-2">
                <DatePickerField label="Beams Date"  value={form.previousBeamsDate} onBlur={v => set("previousBeamsDate", v)} />
                <DatePickerField label="Prev. Start" value={form.previousStartDate} onBlur={v => set("previousStartDate", v)} />
                <DatePickerField label="Prev. End"   value={form.previousEndDate}   onBlur={v => set("previousEndDate",   v)} />
              </div>
            </div>
          )}
          {tab === "optionals" && (
            <div className="grid h-full grid-cols-2 gap-2 content-center">
              {TOGGLES.map(({ key, label, desc, icon }) => (
                <div key={key} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
                  <Switch id={`new-${key}`} checked={!!form[key]} onCheckedChange={v => set(key, v as boolean)} />
                  <span className="flex shrink-0 items-center">{icon}</span>
                  <div className="flex min-w-0 flex-col">
                    <Label htmlFor={`new-${key}`} className="cursor-pointer text-xs font-medium leading-tight">{label}</Label>
                    <span className="truncate text-[10px] text-muted-foreground">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create button — outside the card body */}
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
          {saving
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Plus    className="mr-1.5 h-3.5 w-3.5" />}
          {saving ? "Creating…" : "Create Project"}
        </Button>
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

export function ProjectCard({
  project, forcedTab, availableClients, availableJobSites, onDelete,
}: {
  project:           ForecastProject
  forcedTab:         ViewTab
  availableClients:  string[]
  availableJobSites: string[]
  onDelete:          () => void
}) {
  const update  = useUpdateForecast()
  const [activeTab,    setActiveTab]    = useState<ViewTab>(forcedTab)
  const [savingField,  setSavingField]  = useState<string | null>(null)

  useEffect(() => setActiveTab(forcedTab), [forcedTab])

  const [cliente, setCliente] = useState(project.cliente || "")
  const [jobSite, setJobSite] = useState(project.jobSite || "")
  const [type,    setType]    = useState(project.type    || "")
  const [loteBld, setLoteBld] = useState(project.loteBld || "")
  const [address, setAddress] = useState(project.address || "")
  const [status,  setStatus]  = useState(project.status)

  useEffect(() => {
    setCliente(project.cliente || ""); setJobSite(project.jobSite || "")
    setType(project.type || "");       setLoteBld(project.loteBld || "")
    setAddress(project.address || ""); setStatus(project.status)
  }, [project.cliente, project.type, project.status, project.loteBld, project.jobSite, project.address])

  function save(data: Partial<ForecastProject>, field: string) {
    setSavingField(field)
    update.mutate({ id: project.id, data }, {
      onSettled: () => setSavingField(null),
    })
  }

  const displayStatus = getForecastDisplayStatus({ ...project, status })
  const borderColor   = STATUS_COLORS[displayStatus] ?? "#6b7280"

  return (
    <div className="relative mb-3 w-full">
      {/* Tab bar */}
      <div className="flex items-center justify-end">
        <div className="relative z-[2] mb-[-1px] flex items-center gap-5 rounded-t-xl border border-b-0 bg-card px-6 py-1.5 text-[11px]" style={{ borderColor }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 transition-colors ${activeTab === t.key ? "font-semibold text-primary" : "text-muted-foreground opacity-70 hover:opacity-100"}`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card body — fixed height so right panel flex chain resolves correctly */}
      <div className="relative z-[1] flex h-[204px] overflow-hidden rounded-bl-lg rounded-br-lg rounded-tl-lg border bg-card"
        style={{ borderColor }}>

        <LeftPanel
          cliente={cliente}   jobSite={jobSite}
          type={type}         loteBld={loteBld}
          status={status}     address={address}
          availableClients={availableClients}
          availableJobSites={availableJobSites}
          onClienteChange={v => { setCliente(v); save({ cliente: v }, "cliente") }}
          onJobSiteChange={v => { setJobSite(v); save({ jobSite: v }, "jobSite") }}
          onTypeChange={v   => { setType(v);    save({ type: v, loteBld }, "type") }}
          onLoteBldChange={v => setLoteBld(v)}
          onLoteBldBlur={v  => save({ loteBld: v, type }, "loteBld")}
          onStatusChange={v  => { setStatus(v); save({ status: v }, "status") }}
          onAddressChange={v => setAddress(v)}
          onAddressBlur={v  => save({ address: v }, "address")}
          onDelete={onDelete}
          savingField={savingField}
        />

        {/* Right panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {activeTab === "info"      && <InfoTab      p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>, f)} savingField={savingField} />}
          {activeTab === "fieldwire" && <FieldwireTab p={project} />}
          {activeTab === "machines"  && <MachinesTab  p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>, f)} />}
          {activeTab === "contract"  && <ContractTab  p={project} />}
          {activeTab === "optionals" && <OptionalsTab p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>, f)} savingField={savingField} />}
        </div>
      </div>
    </div>
  )
}
