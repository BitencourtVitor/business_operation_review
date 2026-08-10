"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import {
  Search, X, Plus, Pencil, Trash2, Mail, Phone, CalendarIcon,
  Clock, CircleCheck, HelpCircle, Loader2, FileText, FileSpreadsheet,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, Filter, Check, ChevronDown,
  Download, Building2, Archive, ArchiveRestore, ExternalLink, Settings2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { CompanyLogo } from "@/components/common/company-logo"
import { COMPANIES, COMPANY_LABEL } from "@/lib/company"
import type { Company } from "@/lib/company"
import {
  useSubDocTypes, useSubDocContractors, useCreateSubDocContractor,
  useUpdateSubDocContractor, useDeleteSubDocContractor, useSetSubDocRecord,
  useArchiveSubDocContractor, useSubDocDivisions, useSubDocEmailRecipients,
  useUpdateSubDocEmailRecipients,
} from "@/hooks/use-subcontractor-docs"
import type { SubDocContractor, SubDocRecord, SubDocType, SubDocDivision, DocStatus, Urgency, Lifecycle, SubDocEmailAlertType } from "@/services/subcontractor-docs.service"
import { useAuthStore } from "@/store/auth.store"

// ── Constants ────────────────────────────────────────────────────────────────

const URGENCY_META: Record<Urgency, { label: string; text: string; border: string; bg: string; dot: string }> = {
  expired: { label: "Expired",   text: "text-red-500",     border: "border-red-500/40",     bg: "bg-red-500/[0.06]",     dot: "bg-red-500" },
  urgent:  { label: "Due soon",  text: "text-orange-500",  border: "border-orange-500/40",  bg: "bg-orange-500/[0.06]",  dot: "bg-orange-500" },
  soon:    { label: "Upcoming",  text: "text-amber-500",   border: "border-amber-500/40",   bg: "bg-amber-500/[0.05]",   dot: "bg-amber-500" },
  ok:      { label: "Current",   text: "text-emerald-500", border: "border-emerald-500/30", bg: "bg-emerald-500/[0.04]", dot: "bg-emerald-500" },
  none:    { label: "No date on file", text: "text-muted-foreground", border: "border-border/50", bg: "bg-card/40", dot: "bg-muted-foreground/40" },
}

// Lifecycle groups — the split Amanda asked for: a sub that just let a doc
// lapse (Pending, derived automatically) is not the same as one that no longer
// works with the company (Off-boarded, the manual archive flag).
const LIFECYCLE_META: Record<Lifecycle, { label: string; hint: string; text: string; border: string; bg: string; dot: string }> = {
  pending:  { label: "Pending",      hint: "Docs missing or expired — needs to regularize",  text: "text-amber-500",           border: "border-amber-500/40",  bg: "bg-amber-500/[0.06]",  dot: "bg-amber-500" },
  active:   { label: "Active",       hint: "All required docs on file and current",           text: "text-emerald-500",         border: "border-emerald-500/40", bg: "bg-emerald-500/[0.05]", dot: "bg-emerald-500" },
  inactive: { label: "Off-boarded",  hint: "No longer works with the company",                text: "text-muted-foreground",    border: "border-border/60",     bg: "bg-muted/30",          dot: "bg-muted-foreground/50" },
}

// Order the groups render in: problems first, then healthy, then archived.
const LIFECYCLE_ORDER: Lifecycle[] = ["pending", "active", "inactive"]

const STATUS_META: Record<DocStatus, { label: string; icon: React.ElementType; color: string }> = {
  missing:        { label: "Missing",   icon: HelpCircle,  color: "text-muted-foreground/50" },
  requested:      { label: "Requested", icon: Clock,       color: "text-orange-500" },
  received:       { label: "Received",  icon: CircleCheck, color: "text-emerald-500" },
  not_applicable: { label: "N/A",       icon: X,           color: "text-muted-foreground/30" },
}

const DIVISION_IMAGES: Record<string, string> = {
  framing: "/images/sublogo_framing.png",
  hvac: "/images/sublogo_hvac.png",
  // Keep this consistent with the PCG Bids and Contracts item in the sidebar.
  pcg: "/images/icon_pcg.png",
  // These divisions do not have dedicated logos yet.
  "fisher-lane": "/favicon.png",
  "pleasant-park": "/favicon.png",
}

function DivisionLogo({ division, label, className }: { division: string; label: string; className?: string }) {
  const src = DIVISION_IMAGES[division] ?? "/favicon.png"
  return <img src={src} alt={label} className={cn("h-4 w-auto object-contain", className)} />
}

const EMPTY_RECORD = (docType: string, division: string): SubDocRecord => ({
  doc_type: docType, division, status: "missing", start_date: null, expiry_date: null, requested_date: null,
  notes: "", url: "",
})

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtDate = (s: string | null) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Per-document urgency (mirrors the backend's contractor-level bands) — lets a
// single doc cell flag itself as the one driving the card's "Expired"/"Due
// soon" badge, instead of leaving the user to guess which of the 7 it is.
function docUrgency(record: SubDocRecord, hasExpiry: boolean): Urgency {
  if (!hasExpiry || record.status !== "received" || !record.expiry_date) return "none"
  const [y, m, d] = record.expiry_date.split("-").map(Number)
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return "expired"
  if (days <= 30) return "urgent"
  if (days <= 90) return "soon"
  return "ok"
}

// US phone mask, applied as the user types: (555) 555-5555
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function docSummary(record: SubDocRecord | undefined, hasExpiry: boolean): string {
  if (!record || record.status === "missing") return "Missing"
  if (record.status === "not_applicable") return "N/A"
  if (record.status === "received") return hasExpiry ? `Received (exp ${fmtDate(record.expiry_date)})` : "Received"
  return record.requested_date ? `Requested (${fmtDate(record.requested_date)})` : "Requested"
}

// ── Mini date picker (Calendar + Popover) ──────────────────────────────────────

function MiniDatePicker({ label, value, onSelect }: { label: string; value: string; onSelect: (iso: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-7 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
          <CalendarIcon className="h-3 w-3 shrink-0" />
          {value ? fmtDate(value) : "Set date"}
        </PopoverTrigger>
        <PopoverContent align="start" side="bottom" sideOffset={4} className="w-auto p-0">
          <Calendar mode="single" selected={value ? toDate(value) : undefined}
            onSelect={d => { if (d) { onSelect(toISO(d)); setOpen(false) } }}
            defaultMonth={value ? toDate(value) : undefined} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Document cell (status + dates + notes editor) ──────────────────────────────

function DocCell({ contractorId, division, typeInfo, record }: {
  contractorId: number; division: string; typeInfo: SubDocType; record: SubDocRecord
}) {
  const setRecord = useSetSubDocRecord()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DocStatus>(record.status)
  const [startDate, setStartDate] = useState(record.start_date ?? "")
  const [expiryDate, setExpiryDate] = useState(record.expiry_date ?? "")
  const [requestedDate, setRequestedDate] = useState(record.requested_date ?? "")
  const [notes, setNotes] = useState(record.notes ?? "")
  const [url, setUrl] = useState(record.url ?? "")

  useEffect(() => {
    if (!open) return
    setStatus(record.status)
    setStartDate(record.start_date ?? "")
    setExpiryDate(record.expiry_date ?? "")
    setRequestedDate(record.requested_date ?? "")
    setNotes(record.notes ?? "")
    setUrl(record.url ?? "")
  }, [open, record])

  const save = () => {
    setRecord.mutate({
      contractor_id: contractorId, doc_type: typeInfo.key, division, status,
      start_date: startDate, expiry_date: expiryDate, requested_date: requestedDate, notes, url,
    }, { onSuccess: () => setOpen(false) })
  }

  const meta = STATUS_META[record.status]
  const Icon = meta.icon
  const dateLabel = typeInfo.has_expiry
    ? (record.status === "received" ? fmtDate(record.expiry_date) : meta.label)
    : (record.status === "requested" && record.requested_date ? fmtDate(record.requested_date) : meta.label)
  const urgency = docUrgency(record, typeInfo.has_expiry)
  const flagged = urgency === "expired" || urgency === "urgent"
  const urgMeta = URGENCY_META[urgency]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={e => e.stopPropagation()}
        title={flagged ? `${urgMeta.label} — this document needs attention` : undefined}
        className="flex min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-ring hover:bg-muted/40 dark:bg-input/30"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1 truncate text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
            <span className="truncate">{typeInfo.label}</span>
          </span>
          <span className={cn("flex items-center gap-1 text-[11px] font-semibold", flagged ? urgMeta.text : meta.color)}>
            <Icon className="h-3 w-3 shrink-0" />
            {dateLabel}
          </span>
        </div>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={6} className="w-72 p-3" onClick={e => e.stopPropagation()}>
        <p className="mb-2 text-xs font-semibold">{typeInfo.label}</p>

        <div className="mb-2 flex flex-col gap-1">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Status</span>
          <Select value={status} onValueChange={v => v && setStatus(v as DocStatus)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <span className={cn("flex items-center gap-1.5", STATUS_META[status].color)}>
                {(() => { const I = STATUS_META[status].icon; return <I className="h-3 w-3" /> })()}
                {STATUS_META[status].label}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(Object.keys(STATUS_META) as DocStatus[]).map(s => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-1.5">
                    {(() => { const I = STATUS_META[s].icon; return <I className={cn("h-3 w-3", STATUS_META[s].color)} /> })()}
                    {STATUS_META[s].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {typeInfo.has_expiry && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <MiniDatePicker label="Start" value={startDate} onSelect={setStartDate} />
            <MiniDatePicker label="Expiry" value={expiryDate} onSelect={setExpiryDate} />
          </div>
        )}
        {!typeInfo.has_expiry && status === "requested" && (
          <div className="mb-2">
            <MiniDatePicker label="Requested on" value={requestedDate} onSelect={setRequestedDate} />
          </div>
        )}

        <div className="mb-3 flex flex-col gap-1">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Notes</span>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" className="min-h-16 text-xs" />
        </div>

        {/* The record already said the document exists and when it expires. This
            is where it is — so nobody has to go hunting for the file. */}
        <div className="mb-3 flex flex-col gap-1">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
            SharePoint link
          </span>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
            className="h-7 text-xs"
          />
          {url.trim() && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Open document
            </a>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button onClick={save} disabled={setRecord.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
            {setRecord.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Contractor card ─────────────────────────────────────────────────────────────

function ContractorCard({ ctr, types, divisions, onEdit, onDelete }: {
  ctr: SubDocContractor; types: SubDocType[]; divisions: SubDocDivision[]
  onEdit: () => void; onDelete: () => void
}) {
  const meta = URGENCY_META[ctr.urgency]
  const life = LIFECYCLE_META[ctr.status]
  const divisionByKey = Object.fromEntries(divisions.map(d => [d.key, d]))
  const servedDivisions = ctr.divisions.length > 0 ? ctr.divisions : (ctr.company ? [ctr.company] : [])
  const isMultiDivision = servedDivisions.length > 1
  const recordsByDivisionAndType = Object.fromEntries(ctr.records.map(r => [`${r.division}\u0000${r.doc_type}`, r]))
  const archive = useArchiveSubDocContractor()

  return (
    <div className={cn("shrink-0 overflow-hidden rounded-xl border border-border/50 bg-card/40", ctr.archived && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span title={life.hint}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", life.border, life.bg, life.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", life.dot)} />
          {life.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold leading-tight">
            {ctr.name}
            {!isMultiDivision && servedDivisions[0] && (
              <DivisionLogo division={servedDivisions[0]} label={divisionByKey[servedDivisions[0]]?.label ?? servedDivisions[0]} className="h-3.5 w-auto shrink-0" />
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{ctr.email || "—"}</span>
            <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{ctr.phone || "—"}</span>
          </div>
        </div>
        <span className={cn("shrink-0 text-[11px] font-semibold", meta.text)}>
          {meta.label}{ctr.next_expiry ? ` · ${fmtDate(ctr.next_expiry)}` : ""}
        </span>
        <button onClick={onEdit} title="Edit subcontractor"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={() => archive.mutate({ id: ctr.id, archived: !ctr.archived })} disabled={archive.isPending}
          title={ctr.archived ? "Restore — mark active again" : "Off-board — no longer works with us"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          {ctr.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
        </button>
        <button onClick={onDelete} title="Delete subcontractor"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="border-t border-border/20 p-3">
        {servedDivisions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No division assigned.</p>
        ) : servedDivisions.map(division => {
          const divisionInfo = divisionByKey[division]
          const divisionTypes = types.filter(type => type.divisions.includes(division))
          return (
            <div key={division} className={cn("flex gap-3", isMultiDivision && "border-b border-border/20 py-3 first:pt-0 last:border-b-0 last:pb-0")}>
              {isMultiDivision && (
                <div className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 text-center">
                  <DivisionLogo division={division} label={divisionInfo?.label ?? division} className="max-h-7 max-w-10" />
                  <span className="max-w-full text-[9px] font-medium leading-tight text-muted-foreground">
                    {divisionInfo?.label ?? division}
                  </span>
                </div>
              )}
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {divisionTypes.map(type => (
                  <DocCell key={`${division}-${type.key}`} contractorId={ctr.id} division={division} typeInfo={type}
                    record={recordsByDivisionAndType[`${division}\u0000${type.key}`] ?? EMPTY_RECORD(type.key, division)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add / Edit contractor dialog ────────────────────────────────────────────────

function ContractorFormDialog({ open, onClose, initial, divisions }: {
  open: boolean; onClose: () => void
  initial: SubDocContractor | null
  divisions: SubDocDivision[]
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const company = selectedDivisions[0] as Company | ""
  const create = useCreateSubDocContractor()
  const update = useUpdateSubDocContractor()
  const isEdit = !!initial

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? "")
    setEmail(initial?.email ?? "")
    setPhone(initial?.phone ?? "")
    setNotes(initial?.notes ?? "")
    setSelectedDivisions(initial?.divisions ?? (initial?.company ? [initial.company] : []))
  }, [open, initial])

  const pending = create.isPending || update.isPending
  const save = () => {
    if (!name.trim() || selectedDivisions.length === 0) return
    if (isEdit && initial) {
      update.mutate({ id: initial.id, name, email, phone, notes, divisions: selectedDivisions }, { onSuccess: onClose })
    } else {
      create.mutate({ name, email, phone, notes, divisions: selectedDivisions }, { onSuccess: onClose })
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isEdit ? "Edit Subcontractor" : "Add Subcontractor"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Company name</label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elite Stone Works"
                className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Division</label>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-input p-1.5">
              {divisions.map(division => {
                const checked = selectedDivisions.includes(division.key)
                return (
                  <button key={division.key} type="button"
                    onClick={() => setSelectedDivisions(current => checked ? current.filter(key => key !== division.key) : [...current, division.key])}
                    className={cn("flex h-8 items-center gap-2 rounded px-2 text-left text-xs transition-colors", checked ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <DivisionLogo division={division.key} label={division.label} className="h-3.5 max-w-5" />
                    <span className="truncate">{division.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="hidden">
            <Select value={selectedDivisions[0] ?? ""} onValueChange={v => setSelectedDivisions(v ? [v] : [])}>
              <SelectTrigger className="h-8 w-full text-sm">
                {company
                  ? <span className="flex items-center gap-1.5"><CompanyLogo company={company} className="h-3.5 w-auto" />{COMPANY_LABEL[company]}</span>
                  : <span className="text-muted-foreground/50">Select division…</span>}
              </SelectTrigger>
              <SelectContent>
                {COMPANIES.map(co => (
                  <SelectItem key={co} value={co}>
                    <span className="flex items-center gap-1.5"><CompanyLogo company={co} className="h-3.5 w-auto" />{COMPANY_LABEL[co]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com"
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Phone</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(555) 555-5555"
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context…" className="min-h-16 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Cancel
            </button>
            <button onClick={save} disabled={pending || !name.trim() || selectedDivisions.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteContractorDialog({ contractor, onClose }: {
  contractor: SubDocContractor | null; onClose: () => void
}) {
  const del = useDeleteSubDocContractor()
  return (
    <Dialog open={!!contractor} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Delete Subcontractor
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove <span className="font-semibold text-foreground">{contractor?.name}</span> and all of its document records? This can't be undone.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={() => contractor && del.mutate(contractor.id, { onSuccess: onClose })}
            disabled={del.isPending}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50">
            {del.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Urgency multiselect dropdown ────────────────────────────────────────────────

function UrgencyFilter({ contractors, selected, setSelected }: {
  contractors: SubDocContractor[]; selected: Set<Urgency>; setSelected: (s: Set<Urgency>) => void
}) {
  const toggle = (u: Urgency) => {
    const next = new Set(selected)
    next.has(u) ? next.delete(u) : next.add(u)
    setSelected(next)
  }
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Filter className="h-3.5 w-3.5" />
        {selected.size === 0 ? "All statuses" : `${selected.size} status${selected.size > 1 ? "es" : ""}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear selection
          </button>
        )}
        <div className="flex flex-col">
          {(Object.keys(URGENCY_META) as Urgency[]).map(u => {
            const meta = URGENCY_META[u]
            const on = selected.has(u)
            const count = contractors.filter(c => c.urgency === u).length
            return (
              <button key={u} onClick={() => toggle(u)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                <span className="shrink-0 text-muted-foreground/60">{count}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Company multiselect dropdown ────────────────────────────────────────────────

type CompanySelection = string | "none"

function CompanyFilterDropdown({ contractors, divisions, selected, setSelected }: {
  contractors: SubDocContractor[]; divisions: SubDocDivision[]; selected: Set<CompanySelection>; setSelected: (s: Set<CompanySelection>) => void
}) {
  const toggle = (co: CompanySelection) => {
    const next = new Set(selected)
    next.has(co) ? next.delete(co) : next.add(co)
    setSelected(next)
  }
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Building2 className="h-3.5 w-3.5" />
        {selected.size === 0 ? "All divisions" : `${selected.size} division${selected.size > 1 ? "s" : ""}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear selection
          </button>
        )}
        <div className="flex flex-col">
          {divisions.map(division => {
            const co = division.key
            const on = selected.has(co)
            const count = contractors.filter(c => c.divisions.includes(co)).length
            return (
              <button key={co} onClick={() => toggle(co)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <DivisionLogo division={co} label={division.label} className="h-3.5 max-w-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{division.label}</span>
                <span className="shrink-0 text-muted-foreground/60">{count}</span>
              </button>
            )
          })}
          {(() => {
            const on = selected.has("none")
            const count = contractors.filter(c => !c.company).length
            return (
              <button onClick={() => toggle("none")}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">No division</span>
                <span className="shrink-0 text-muted-foreground/60">{count}</span>
              </button>
            )
          })()}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Export menu (XLSX / PDF) ────────────────────────────────────────────────────

function ExportMenu({ rows, types }: { rows: SubDocContractor[]; types: SubDocType[] }) {
  const [open, setOpen] = useState(false)

  const exportExcel = () => {
    const header = ["Name", "Email", "Phone", "Status", "Compliance", ...types.map(t => t.label)]
    const data = [header, ...rows.map(c => {
      const byType = Object.fromEntries(c.records.map(r => [r.doc_type, r]))
      return [c.name, c.email, c.phone, LIFECYCLE_META[c.status].label, URGENCY_META[c.urgency].label,
        ...types.map(t => docSummary(byType[t.key], t.has_expiry))]
    })]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Subcontractor Docs")
    XLSX.writeFile(wb, `subcontractor_docs_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setOpen(false)
  }

  const exportPdf = () => {
    const rowsHtml = rows.map(c => {
      const byType = Object.fromEntries(c.records.map(r => [r.doc_type, r]))
      return `<tr>
        <td>${c.name}</td><td>${c.email || "—"}</td><td>${c.phone || "—"}</td>
        <td>${LIFECYCLE_META[c.status].label}</td>
        <td>${URGENCY_META[c.urgency].label}</td>
        ${types.map(t => `<td>${docSummary(byType[t.key], t.has_expiry)}</td>`).join("")}
      </tr>`
    }).join("")
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Subcontractor Docs</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;font-size:10px;color:#111;padding:24px}
h1{font-size:18px;font-weight:700;margin-bottom:4px}
.sub{color:#666;font-size:11px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:9px}
thead tr{background:#f3f4f6}
th{padding:6px 8px;text-align:left;font-weight:700;border:1px solid #e5e7eb;text-transform:uppercase;font-size:8px;color:#555}
td{padding:5px 8px;border:1px solid #e5e7eb}
@media print{body{padding:0}@page{margin:1cm;size:landscape}}
</style></head><body>
<h1>Subcontractor Docs</h1>
<div class="sub">Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${rows.length} subcontractors</div>
<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Compliance</th>${types.map(t => `<th>${t.label}</th>`).join("")}</tr></thead>
<tbody>${rowsHtml}</tbody></table>
</body></html>`
    const win = window.open("", "_blank", "width=1100,height=800")
    if (!win) { toast.error("Popup blocked — allow popups to export PDF."); return }
    win.document.write(html)
    win.document.close()
    win.onload = () => win.print()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Download className="h-3.5 w-3.5" /> Export
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <button onClick={exportExcel} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Export as XLSX
        </button>
        <button onClick={exportPdf} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
          <FileText className="h-3.5 w-3.5 text-red-500" /> Export as PDF
        </button>
      </PopoverContent>
    </Popover>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type RecipientDraft = Record<SubDocEmailAlertType, { to: string[]; cc: string[] }>

function EmailRecipientsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentUser = useAuthStore(s => s.user)
  const { data, isLoading, refetch } = useSubDocEmailRecipients()
  const updateRecipients = useUpdateSubDocEmailRecipients()
  const [draft, setDraft] = useState<RecipientDraft>({
    workers_comp_review: { to: [], cc: [] },
    workers_comp_irregularity: { to: [], cc: [] },
  })

  useEffect(() => { if (open) void refetch() }, [open, refetch])
  useEffect(() => {
    if (!data) return
    const read = (alertType: SubDocEmailAlertType) => {
      const saved = data.settings.find(setting => setting.alert_type === alertType)
      return { to: saved?.to_user_ids ?? (currentUser ? [currentUser.id] : []), cc: saved?.cc_user_ids ?? [] }
    }
    setDraft({ workers_comp_review: read("workers_comp_review"), workers_comp_irregularity: read("workers_comp_irregularity") })
  }, [data, currentUser])

  const toggle = (alertType: SubDocEmailAlertType, field: "to" | "cc", userID: string) => {
    setDraft(current => {
      const next = current[alertType][field].includes(userID)
        ? current[alertType][field].filter(id => id !== userID)
        : [...current[alertType][field], userID]
      const other = field === "to" ? "cc" : "to"
      return { ...current, [alertType]: { ...current[alertType], [field]: next, [other]: current[alertType][other].filter(id => id !== userID) } }
    })
  }

  const useOnlyMe = () => {
    if (!currentUser) return
    setDraft({ workers_comp_review: { to: [currentUser.id], cc: [] }, workers_comp_irregularity: { to: [currentUser.id], cc: [] } })
  }

  const save = async () => {
    if (!draft.workers_comp_review.to.length || !draft.workers_comp_irregularity.to.length) {
      toast.error("Each alert needs at least one primary recipient.")
      return
    }
    try {
      await updateRecipients.mutateAsync({ alertType: "workers_comp_review", toUserIDs: draft.workers_comp_review.to, ccUserIDs: draft.workers_comp_review.cc })
      await updateRecipients.mutateAsync({ alertType: "workers_comp_irregularity", toUserIDs: draft.workers_comp_irregularity.to, ccUserIDs: draft.workers_comp_irregularity.cc })
      toast.success("Email recipients updated.")
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save email recipients.")
    }
  }

  const alerts: { type: SubDocEmailAlertType; title: string; description: string }[] = [
    { type: "workers_comp_review", title: "Review request", description: "Thursday list of Workers' Compensation records to verify." },
    { type: "workers_comp_irregularity", title: "Irregularity notice", description: "Friday notice after a review identifies an irregular record." },
  ]

  return <Dialog open={open} onOpenChange={value => !value && onClose()}>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Email recipients</DialogTitle><p className="text-sm text-muted-foreground">Recipients are system users. Use “Only me” while validating the new alerts.</p></DialogHeader>
      <div className="flex justify-end"><button type="button" onClick={useOnlyMe} disabled={!currentUser} className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Only me</button></div>
      {isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Loading users…</div> : <div className="space-y-5">
        {alerts.map(alert => <section key={alert.type} className="rounded-lg border border-border/70 p-4">
          <h3 className="text-sm font-semibold">{alert.title}</h3><p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
          <div className="mt-3 overflow-hidden rounded-md border border-border/60">
            <div className="grid grid-cols-[minmax(0,1fr)_54px_54px] border-b border-border/60 bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>User</span><span className="text-center">To</span><span className="text-center">CC</span></div>
            {(data?.users ?? []).map(user => <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_54px_54px] items-center border-b border-border/50 px-3 py-2.5 last:border-b-0">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
              <label className="flex justify-center"><input aria-label={`${user.name} primary recipient`} type="checkbox" checked={draft[alert.type].to.includes(user.id)} onChange={() => toggle(alert.type, "to", user.id)} className="h-4 w-4 accent-primary" /></label>
              <label className="flex justify-center"><input aria-label={`${user.name} copied recipient`} type="checkbox" checked={draft[alert.type].cc.includes(user.id)} onChange={() => toggle(alert.type, "cc", user.id)} className="h-4 w-4 accent-primary" /></label>
            </div>)}
          </div>
        </section>)}
      </div>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted">Cancel</button><button type="button" onClick={() => void save()} disabled={isLoading || updateRecipients.isPending} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Save recipients</button></div>
    </DialogContent>
  </Dialog>
}

type SortField = "urgency" | "name"

const URGENCY_RANK: Record<Urgency, number> = { expired: 0, urgent: 1, soon: 2, ok: 3, none: 4 }

export default function SubcontractorDocsPage() {
  const { data: types, isLoading: typesLoading } = useSubDocTypes()
  const { data: divisions, isLoading: divisionsLoading } = useSubDocDivisions()
  const [showArchived, setShowArchived] = useState(false)
  const { data: contractors, isLoading } = useSubDocContractors(showArchived)

  const [search, setSearch] = useState("")
  const [urgencyFilter, setUrgencyFilter] = useState<Set<Urgency>>(new Set())
  const [companyFilter, setCompanyFilter] = useState<Set<CompanySelection>>(new Set())
  const [sortField, setSortField] = useState<SortField>("urgency")
  const [sortAsc, setSortAsc] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SubDocContractor | null>(null)
  const [deleting, setDeleting] = useState<SubDocContractor | null>(null)
  const [emailRecipientsOpen, setEmailRecipientsOpen] = useState(false)

  const rows = (contractors ?? [])
    .filter(c => (!search || c.name.toLowerCase().includes(search.toLowerCase())) &&
      (urgencyFilter.size === 0 || urgencyFilter.has(c.urgency)) &&
      (companyFilter.size === 0 || [...companyFilter].some(division => division === "none" ? c.divisions.length === 0 : c.divisions.includes(division))))
    .slice()
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortField === "name") return dir * a.name.localeCompare(b.name)
      const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
      if (rankDiff !== 0) return dir * rankDiff
      if (a.next_expiry && b.next_expiry) return dir * a.next_expiry.localeCompare(b.next_expiry)
      return 0
    })

  if (isLoading || typesLoading || divisionsLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Subcontractor Docs</h1>
          <p className="text-sm text-muted-foreground">Compliance document status</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subcontractor…"
              className="h-8 w-52 rounded-lg border border-input bg-transparent pl-7 pr-6 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <UrgencyFilter contractors={contractors ?? []} selected={urgencyFilter} setSelected={setUrgencyFilter} />
          <CompanyFilterDropdown contractors={contractors ?? []} divisions={divisions ?? []} selected={companyFilter} setSelected={setCompanyFilter} />
          <ExportMenu rows={rows} types={types ?? []} />

          <button onClick={() => setEmailRecipientsOpen(true)} title="Manage email recipients"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
            <Settings2 className="h-3.5 w-3.5" /> Email alerts
          </button>

          <button onClick={() => setAddOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* ── List container ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="flex items-center text-sm font-semibold leading-none">List</span>
          <span className="flex items-center text-xs leading-none text-muted-foreground">{rows.length}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowArchived(v => !v)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-medium transition-colors dark:bg-input/30",
                showArchived ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground hover:text-foreground")}>
              <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border", showArchived ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {showArchived && <Check className="h-2.5 w-2.5" />}
              </span>
              Show off-boarded
            </button>
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
              <span className="flex h-full items-center border-r border-input bg-muted/40 px-2 text-[9px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
                Order by
              </span>
              {([["urgency", "Urgency"], ["name", "Name"]] as const).map(([f, label]) => (
                <button key={f} onClick={() => setSortField(f)}
                  className={cn("flex h-full items-center px-2 text-[11px] font-medium leading-none transition-colors",
                    sortField === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
              <button onClick={() => setSortAsc(v => !v)}
                className="flex h-full items-center border-l border-input px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {sortField === "name"
                  ? (sortAsc ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpZA className="h-3.5 w-3.5" />)
                  : (sortAsc ? <ArrowDown01 className="h-3.5 w-3.5" /> : <ArrowUp01 className="h-3.5 w-3.5" />)}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-4">
          {rows.length === 0 ? (
            <Empty className="border-0">
              <EmptyMedia><FileText className="h-8 w-8 text-muted-foreground/50" /></EmptyMedia>
              <EmptyTitle>No subcontractors found.</EmptyTitle>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {LIFECYCLE_ORDER.map(status => {
                const group = rows.filter(c => c.status === status)
                if (group.length === 0) return null
                const gMeta = LIFECYCLE_META[status]
                return (
                  <div key={status} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", gMeta.dot)} />
                      <span className={cn("text-xs font-semibold uppercase tracking-wider", gMeta.text)}>{gMeta.label}</span>
                      <span className="text-xs text-muted-foreground">{group.length}</span>
                      <span className="text-[11px] text-muted-foreground/60">· {gMeta.hint}</span>
                    </div>
                    {group.map(ctr => (
                      <ContractorCard key={ctr.id} ctr={ctr} types={types ?? []} divisions={divisions ?? []}
                        onEdit={() => setEditing(ctr)} onDelete={() => setDeleting(ctr)} />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ContractorFormDialog open={addOpen} onClose={() => setAddOpen(false)} initial={null} divisions={divisions ?? []} />
      <ContractorFormDialog open={!!editing} onClose={() => setEditing(null)} initial={editing} divisions={divisions ?? []} />
      <DeleteContractorDialog contractor={deleting} onClose={() => setDeleting(null)} />
      <EmailRecipientsDialog open={emailRecipientsOpen} onClose={() => setEmailRecipientsOpen(false)} />
    </div>
  )
}
