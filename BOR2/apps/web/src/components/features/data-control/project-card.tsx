"use client"

import { Button }   from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch }   from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateForecast } from "@/hooks/use-forecast"
import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import { getForecastDisplayStatus } from "@bor2/shared"
import { Check, CheckCircle2, ChevronsUpDown, Loader2, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
}

const PROJECT_TYPES = ["Building", "Lot", "House"]

const TABS: { key: ViewTab; label: string }[] = [
  { key: "info",      label: "Info & Dates" },
  { key: "fieldwire", label: "Fieldwire"    },
  { key: "machines",  label: "Machines"     },
  { key: "contract",  label: "Contract"     },
  { key: "optionals", label: "Optionals"    },
]

const TOGGLES: { key: "buildertrend" | "storage" | "qbTime" | "hvac"; label: string; desc: string }[] = [
  { key: "buildertrend", label: "Buildertrend", desc: "Project tracked in Buildertrend" },
  { key: "storage",      label: "Storage",      desc: "Storage unit required on site"   },
  { key: "qbTime",       label: "QB Time",      desc: "Time tracked in QuickBooks"      },
  { key: "hvac",         label: "HVAC",         desc: "HVAC work included"              },
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

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
  const canCreate = allowNew && query.trim() && !options.some(o => o.toLowerCase() === query.toLowerCase())

  return (
    <div>
      <FL>{label}</FL>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          role="combobox"
          aria-expanded={open}
          className={TRIGGER_CLS}
        >
          <span className="flex-1 truncate text-left">
            {value
              ? value
              : <span className="text-muted-foreground">{placeholder ?? "Select…"}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>
                {canCreate
                  ? <button className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-accent"
                      onClick={() => { onChange(query.trim()); setOpen(false); setQuery("") }}>
                      + Create "{query.trim()}"
                    </button>
                  : <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
                }
              </CommandEmpty>
              <CommandGroup>
                {filtered.map(o => (
                  <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); setQuery("") }}
                    className="text-xs">
                    <Check className={`mr-2 h-4 w-4 ${value === o ? "opacity-100" : "opacity-0"}`} />
                    {o}
                  </CommandItem>
                ))}
                {canCreate && filtered.length > 0 && (
                  <CommandItem value={`__create__${query}`}
                    onSelect={() => { onChange(query.trim()); setOpen(false); setQuery("") }}
                    className="text-xs text-primary">
                    + Create "{query.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Inline date (save-on-blur) ───────────────────────────────────────────────

function InlineDateInput({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div>
      <FL>{label}</FL>
      <Input type="date" className="h-8 text-xs" value={local}
        onChange={e => setLocal(e.target.value)} onBlur={() => onBlur(local)} />
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
        <InlineDateInput label="Beams Date"  value={dateVal(p.previousBeamsDate)} onBlur={v => onSave("previousBeamsDate", v || null)} />
        <InlineDateInput label="Prev. Start" value={dateVal(p.previousStartDate)} onBlur={v => onSave("previousStartDate", v || null)} />
        <InlineDateInput label="Prev. End"   value={dateVal(p.previousEndDate)}   onBlur={v => onSave("previousEndDate",   v || null)} />
      </div>
    </div>
  )
}

function FieldwireTab({ p }: { p: ForecastProject }) {
  const fw = p.fieldwire ?? []
  const done = fw.filter(f => f.status === "true" || f.status === "t" || f.status === "1").length
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fieldwire Docs</span>
        <span className={`ml-auto text-xs font-semibold ${done === fw.length && fw.length > 0 ? "text-green-600" : "text-muted-foreground"}`}>{done} / {fw.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {fw.length === 0 && <span className="py-4 text-center text-xs text-muted-foreground">No documents linked</span>}
        {fw.map((f, i) => {
          const ok = f.status === "true" || f.status === "t" || f.status === "1"
          return (
            <div key={f.id ?? i} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-green-500" : "bg-border"}`} />
              <span className="flex-1 truncate text-xs">Doc #{String(f.id ?? i + 1)}</span>
              <span className={`shrink-0 text-xs ${ok ? "text-green-600" : "text-muted-foreground"}`}>{ok ? "Done" : "Pending"}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MachinesTab({ p }: { p: ForecastProject }) {
  const mach   = p.machines ?? []
  const active = mach.filter(m => m.status && m.status !== "false" && m.status !== "0").length
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Machines</span>
        <span className="ml-auto text-xs font-semibold text-muted-foreground">{active} / {mach.length} active</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {mach.length === 0 && <span className="py-4 text-center text-xs text-muted-foreground">No machines linked</span>}
        {mach.map((m, i) => {
          const on = !!(m.status && m.status !== "false" && m.status !== "0")
          return (
            <div key={m.id ?? i} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-green-500" : "bg-border"}`} />
              <span className="flex-1 truncate text-xs">{m.title ?? `Machine #${m.id ?? i + 1}`}</span>
              {m.unit && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{m.unit}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContractTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  const steps = p.contractSteps ?? []
  const done  = steps.filter(s => s.status === "true" || s.status === "t" || s.status === "1").length
  const [team, setTeam] = useState(p.team || "")
  useEffect(() => setTeam(p.team || ""), [p.id])
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
        <Label className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</Label>
        <Input className="h-7 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          value={team} onChange={e => setTeam(e.target.value)} onBlur={() => onSave("team", team)} placeholder="Assign a team..." />
        <span className="ml-2 shrink-0 text-xs font-semibold text-muted-foreground">{done} / {steps.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {steps.length === 0 && <span className="py-4 text-center text-xs text-muted-foreground">No contract steps linked</span>}
        {steps.map((s, i) => {
          const ok = s.status === "true" || s.status === "t" || s.status === "1"
          return (
            <div key={s.id ?? i} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-green-500" : "bg-border"}`} />
              <span className="min-w-0 flex-1 truncate text-xs">{s.step ?? `Step #${s.id ?? i + 1}`}</span>
              {s.team && <span className="shrink-0 text-xs text-muted-foreground">{s.team}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OptionalsTab({ p, onSave }: { p: ForecastProject; onSave: (f: string, v: unknown) => void }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {TOGGLES.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          <Switch checked={!!p[key]} onCheckedChange={v => onSave(key, v)} id={`${p.id}-${key}`} />
          <div className="flex flex-col">
            <Label htmlFor={`${p.id}-${key}`} className="cursor-pointer text-xs font-medium">{label}</Label>
            <span className="text-xs text-muted-foreground">{desc}</span>
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
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1.5fr" }}>
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
          <div className="flex items-center overflow-hidden rounded-lg border border-input">
            <Select value={type || "__none"} onValueChange={v => onTypeChange(v === "__none" ? "" : v as string)}>
              <SelectTrigger size="sm" className="w-[70%] !rounded-none border-0 border-r border-input text-xs focus-visible:ring-0 focus-visible:ring-offset-0">
                <SelectValue>{type || <span className="text-muted-foreground">Type</span>}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="h-7 w-[30%] rounded-none border-0 text-xs shadow-none focus-visible:ring-0"
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
              <SelectTrigger size="sm" className="w-full text-xs">
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
                <div><FL>Beams Date</FL><Input type="date" className="h-8 text-xs" value={form.previousBeamsDate} onChange={e => set("previousBeamsDate", e.target.value)} /></div>
                <div><FL>Prev. Start</FL><Input type="date" className="h-8 text-xs" value={form.previousStartDate} onChange={e => set("previousStartDate", e.target.value)} /></div>
                <div><FL>Prev. End</FL><Input type="date" className="h-8 text-xs" value={form.previousEndDate} onChange={e => set("previousEndDate", e.target.value)} /></div>
              </div>
            </div>
          )}
          {tab === "optionals" && (
            <div className="flex h-full flex-col justify-center gap-2">
              {TOGGLES.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <Switch id={`new-${key}`} checked={!!form[key]} onCheckedChange={v => set(key, v as boolean)} />
                  <div className="flex flex-col">
                    <Label htmlFor={`new-${key}`} className="cursor-pointer text-xs font-medium">{label}</Label>
                    <span className="text-xs text-muted-foreground">{desc}</span>
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
      <div className="flex justify-end">
        <div className="relative z-[2] mb-[-1px] flex items-center gap-5 rounded-t-xl border border-b-0 bg-card px-6 py-1.5 text-[11px]" style={{ borderColor }}>
          <span className="mr-1 flex items-center gap-1">
            {saving            && <Loader2    className="h-3 w-3 animate-spin text-muted-foreground" />}
            {!saving && saved  && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </span>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`transition-colors ${activeTab === t.key ? "font-semibold text-primary" : "text-muted-foreground opacity-70 hover:opacity-100"}`}>
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
          {activeTab === "machines"  && <MachinesTab  p={project} />}
          {activeTab === "contract"  && <ContractTab  p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>)} />}
          {activeTab === "optionals" && <OptionalsTab p={project} onSave={(f, v) => save({ [f]: v } as Partial<ForecastProject>)} />}
        </div>
      </div>
    </div>
  )
}
