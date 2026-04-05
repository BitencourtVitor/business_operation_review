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
import { CalendarIcon, CheckCircle2, ChevronsUpDown, FileText, Info, Loader2, Package, Plus, SlidersHorizontal, Trash2, Truck, Wind, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useToggleFieldwire, useToggleMachine, useToggleContractStep, useCreateContractStep, useDeleteContractTeam, useAddContractTeam } from "@/hooks/use-forecast"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViewTab = "info" | "fieldwire" | "machines" | "contract" | "optionals"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    "#22c55e",
  planned:   "#3b82f6",
  overdue:   "#ef4444",
  completed: "#6b7280",
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

const TOGGLES: { key: "buildertrend" | "storage" | "qbTime" | "hvac"; label: string; desc: string; icon: React.ReactNode }[] = [
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
  label, value, options, onChange, placeholder, allowNew,
}: {
  label:       string
  value:       string
  options:     string[]
  onChange:    (v: string) => void
  placeholder?: string
  allowNew?:   boolean
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
          autoFocus
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
    <div>
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
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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

function DatePickerField({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
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
      <div className="flex h-8 items-center overflow-hidden rounded-lg border border-input bg-background">
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground"
          placeholder="mm/dd/yyyy"
          value={inputText}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:bg-muted/50">
            <CalendarIcon className="h-3.5 w-3.5" />
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

function InfoTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  const [obs, setObs] = useState(p.obs || "")
  useEffect(() => setObs(p.obs || ""), [p.id])
  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <FL>Observations</FL>
        <Textarea className="flex-1 resize-none text-xs" value={obs}
          onChange={e => setObs(e.target.value)} onBlur={() => onSave("obs", obs)}
          placeholder="Observations..." />
      </div>
      <div className="flex w-36 flex-col gap-2">
        <DatePickerField label="Beams Date"  value={dateVal(p.previousBeamsDate)} onBlur={v => onSave("previousBeamsDate", v || null)} />
        <DatePickerField label="Prev. Start" value={dateVal(p.previousStartDate)} onBlur={v => onSave("previousStartDate", v || null)} />
        <DatePickerField label="Prev. End"   value={dateVal(p.previousEndDate)}   onBlur={v => onSave("previousEndDate",   v || null)} />
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
    ;(acc[cat] ??= []).push(f)
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
            <div className="flex flex-col gap-0.5">
              {items.map((f, i) => {
                const checked = isOk(f)
                return (
                  <label
                    key={f.id ?? i}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                      checked={checked}
                      onChange={e => {
                        if (f.id != null) toggle.mutate({ fwId: f.id, status: e.target.checked })
                      }}
                    />
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

function MachinesTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  const mach     = p.machines ?? []
  const toggle   = useToggleMachine()
  const { data: providerRows = [] } = useCatalogTable("providers")
  const providers = (providerRows as { name?: string }[]).map(r => r.name ?? "").filter(Boolean)
  const isOn     = (m: typeof mach[0]) => !!(m.status && m.status !== "false" && m.status !== "0")
  const active   = mach.filter(isOn).length

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
        <Label className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider</Label>
        <div className="flex-1">
          <ComboboxField
            label=""
            value={p.machineProvider || ""}
            options={providers}
            onChange={v => onSave("machineProvider", v)}
            placeholder="Select provider…"
          />
        </div>
        <span className={`ml-2 shrink-0 text-xs font-semibold ${active === mach.length && mach.length > 0 ? "text-green-600" : "text-muted-foreground"}`}>
          {active} / {mach.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {mach.length === 0 && <span className="py-4 text-center text-xs text-muted-foreground">No machines linked</span>}
        {mach.map((m, i) => {
          const on = isOn(m)
          return (
            <label key={m.id ?? i} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/40">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-primary"
                checked={on}
                onChange={e => {
                  if (m.id != null) toggle.mutate({ machId: m.id, status: e.target.checked })
                }}
              />
              <span className={`flex-1 truncate text-xs ${on ? "text-muted-foreground line-through" : ""}`}>
                {m.title?.trim() || `Machine #${m.id ?? i + 1}`}
              </span>
              {m.unit && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.unit}</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ContractTab({ p }: { p: ForecastProject }) {
  const steps       = p.contractSteps ?? []
  const toggleStep  = useToggleContractStep()
  const addTeam     = useAddContractTeam()
  const deleteTeam  = useDeleteContractTeam()
  const { data: workforceRows = [] } = useCatalogTable("workforce")
  const catalogTeams = (workforceRows as { name?: string }[]).map(r => r.name ?? "").filter(Boolean)

  const isOk = (s: typeof steps[0]) =>
    s.status === "true" || s.status === true as unknown as string || s.status === "t" || s.status === "1"

  const dbTeams = useMemo(() => [...new Set(steps.map(s => s.team).filter(Boolean))] as string[], [steps])

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [addingTeam,   setAddingTeam]   = useState(false)
  const addTriggerRef                   = useRef<HTMLButtonElement>(null)
  const [dropRect,     setDropRect]     = useState<DOMRect | null>(null)

  useEffect(() => {
    setSelectedTeam(prev => {
      if (prev && dbTeams.includes(prev)) return prev
      return dbTeams[0] ?? null
    })
  }, [p.id])

  // Close dropdown on outside click
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
  const doneCt    = teamSteps.filter(isOk).length

  const canDelete = (team: string) =>
    steps.filter(s => s.team === team).every(s => !isOk(s))

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
      {/* Left: Teams list */}
      <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex flex-1 flex-col overflow-y-auto">
          {dbTeams.length === 0 && (
            <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">No teams</p>
          )}
          {dbTeams.map(team => (
            <div
              key={team}
              onClick={() => setSelectedTeam(team)}
              className={`group flex cursor-pointer items-center gap-1 px-2 py-1.5 hover:bg-muted/50 ${selectedTeam === team ? "bg-muted" : ""}`}
            >
              <span className="flex-1 truncate text-xs font-medium">{team}</span>
              <button
                onClick={e => {
                  e.stopPropagation()
                  deleteTeam.mutate(
                    { projectId: p.id, team },
                    { onSuccess: () => { if (selectedTeam === team) setSelectedTeam(dbTeams.find(t => t !== team) ?? null) } },
                  )
                }}
                disabled={!canDelete(team)}
                className="hidden shrink-0 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 group-hover:block"
                title="Delete team"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-1">
          <button
            ref={addTriggerRef}
            onClick={openAddTeam}
            className="flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {teamDropdown}
      </div>

      {/* Right: Steps for selected team */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedTeam ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Select a team</p>
        ) : (
          <>
            <div className="mb-1 flex items-center">
              <span className="truncate text-xs font-semibold text-muted-foreground">{selectedTeam}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{doneCt} / {teamSteps.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {teamSteps.length === 0 && (
                <p className="py-2 text-center text-[10px] text-muted-foreground">No steps</p>
              )}
              {teamSteps.map((s, i) => {
                const ok = isOk(s)
                return (
                  <label key={s.id ?? i} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                      checked={ok}
                      onChange={e => {
                        if (s.id != null) toggleStep.mutate({ stepId: s.id, status: e.target.checked })
                      }}
                    />
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

function OptionalsTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 content-center">
      {TOGGLES.map(({ key, label, desc, icon }) => (
        <div key={key} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
          <Switch checked={!!p[key]} onCheckedChange={v => onSave(key, v)} id={`${p.id}-${key}`} />
          <span className="flex shrink-0 items-center">{icon}</span>
          <div className="flex min-w-0 flex-col">
            <Label htmlFor={`${p.id}-${key}`} className="cursor-pointer text-xs font-medium leading-tight">{label}</Label>
            <span className="truncate text-[10px] text-muted-foreground">{desc}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Left panel — shared between New and Edit ─────────────────────────────────

function LeftPanel({
  cliente, jobSite, type, loteBld, status, address,
  availableClients, availableJobSites,
  onClienteChange, onJobSiteChange, onTypeChange, onLoteBldChange, onLoteBldBlur, onStatusChange, onAddressChange, onAddressBlur,
  statusFixed, onDelete,
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
        />
        <ComboboxField
          label="Job Site"
          value={jobSite}
          options={availableJobSites}
          onChange={onJobSiteChange}
          placeholder="Select job site"
          allowNew
        />
      </div>

      {/* Type+Number joined + Status */}
      <div className="grid grid-cols-2 gap-2">
        {/* Type + Number: joined input group */}
        <div>
          <FL>Type / Number</FL>
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
          <FL>Status</FL>
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

      {/* Address + optional Delete button on same row */}
      <div>
        <FL>Address</FL>
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
  address: string; status: ForecastStatus; obs: string; team: string
  machineProvider: string; previousBeamsDate: string; previousStartDate: string
  previousEndDate: string; hvac: boolean; buildertrend: boolean; storage: boolean; qbTime: boolean
}

const EMPTY_NEW_FORM: NewFormState = {
  cliente: "", jobSite: "", type: "", loteBld: "", address: "", status: "planned",
  obs: "", team: "", machineProvider: "", previousBeamsDate: "", previousStartDate: "",
  previousEndDate: "", hvac: false, buildertrend: false, storage: false, qbTime: false,
}

export function NewProjectCard({
  availableClients, availableJobSites, saving, onSave, onCancel,
}: {
  availableClients:  string[]
  availableJobSites: string[]
  saving:            boolean
  onSave:            (data: NewFormState) => void
  onCancel:          () => void
}) {
  const [form, setForm] = useState<NewFormState>(EMPTY_NEW_FORM)
  const [tab,  setTab]  = useState<NewFormTab>("info")
  function set<K extends keyof NewFormState>(k: K, v: NewFormState[K]) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <div className="relative mb-3 w-full">
      {/* Header row */}
      <div className="flex items-end justify-between">
        <div className="relative z-[2] mb-[-1px] ml-[1px] rounded-t-xl border border-b-0 bg-card px-4 py-1.5" style={{ borderColor: "#3b82f6" }}>
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary">New Project</span>
        </div>
        <div className="relative z-[2] mb-[-1px] flex items-center gap-5 rounded-t-xl border border-b-0 bg-card px-6 py-1.5 text-[11px]" style={{ borderColor: "#3b82f6" }}>
          {NEW_FORM_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`transition-colors ${tab === t.key ? "font-semibold text-primary" : "text-muted-foreground opacity-70 hover:opacity-100"}`}>
              {t.label}
            </button>
          ))}
          <span className="h-3 w-px bg-border" />
          <button onClick={onCancel} className="text-muted-foreground transition-colors hover:text-foreground" title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-[1] flex overflow-hidden rounded-bl-lg rounded-br-lg rounded-tr-lg border bg-card"
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
          statusFixed
        />

        {/* Right panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {tab === "info" && (
            <div className="flex h-full gap-4">
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <FL>Observations</FL>
                  <Textarea className="flex-1 resize-none text-xs" value={form.obs}
                    onChange={e => set("obs", e.target.value)} placeholder="Observations..." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><FL>Team</FL><Input className="h-8 text-xs" value={form.team} onChange={e => set("team", e.target.value)} placeholder="Team" /></div>
                  <div><FL>Machine Provider</FL><Input className="h-8 text-xs" value={form.machineProvider} onChange={e => set("machineProvider", e.target.value)} placeholder="Provider" /></div>
                </div>
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
          <div className="mt-auto flex justify-end pt-3">
            <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.cliente.trim() || !form.jobSite.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {saving ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </div>
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
  const [activeTab, setActiveTab] = useState<ViewTab>(forcedTab)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [project.id])

  function save(data: Partial<ForecastProject>) {
    setSaving(true); setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    update.mutate({ id: project.id, data }, {
      onSettled: () => {
        setSaving(false); setSaved(true)
        saveTimer.current = setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  const displayStatus = getForecastDisplayStatus({ ...project, status })
  const borderColor   = STATUS_COLORS[displayStatus] ?? "#6b7280"

  return (
    <div className="relative mb-3 w-full">
      {/* Tab bar */}
      <div className="flex items-center justify-end">
        <span className="mr-2 flex items-center gap-1">
          {saving           && <Loader2     className="h-3 w-3 animate-spin text-muted-foreground" />}
          {!saving && saved && <CheckCircle2 className="h-3 w-3 text-green-500" />}
        </span>
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

      {/* Card body — 1px colored border all around */}
      <div className="relative z-[1] flex overflow-hidden rounded-bl-lg rounded-br-lg rounded-tl-lg border bg-card"
        style={{ borderColor }}>

        <LeftPanel
          cliente={cliente}   jobSite={jobSite}
          type={type}         loteBld={loteBld}
          status={status}     address={address}
          availableClients={availableClients}
          availableJobSites={availableJobSites}
          onClienteChange={v => { setCliente(v); save({ cliente: v }) }}
          onJobSiteChange={v => { setJobSite(v); save({ jobSite: v }) }}
          onTypeChange={v   => { setType(v);    save({ type: v, loteBld }) }}
          onLoteBldChange={v => setLoteBld(v)}
          onLoteBldBlur={v  => save({ loteBld: v, type })}
          onStatusChange={v  => { setStatus(v); save({ status: v }) }}
          onAddressChange={v => setAddress(v)}
          onAddressBlur={v  => save({ address: v })}
          onDelete={onDelete}
        />

        {/* Right panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {activeTab === "info"      && <InfoTab      p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>)} />}
          {activeTab === "fieldwire" && <FieldwireTab p={project} />}
          {activeTab === "machines"  && <MachinesTab  p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>)} />}
          {activeTab === "contract"  && <ContractTab  p={project} />}
          {activeTab === "optionals" && <OptionalsTab p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>)} />}
        </div>
      </div>
    </div>
  )
}
