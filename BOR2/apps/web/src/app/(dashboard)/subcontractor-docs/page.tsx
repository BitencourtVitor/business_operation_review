"use client"

import { useEffect, useState } from "react"
import {
  Search, X, Plus, Pencil, Trash2, Mail, Phone, CalendarIcon,
  Clock, CircleCheck, HelpCircle, Loader2, FileText,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Textarea } from "@/components/ui/textarea"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageSkeleton } from "@/components/common/page-skeleton"
import {
  useSubDocTypes, useSubDocContractors, useCreateSubDocContractor,
  useUpdateSubDocContractor, useDeleteSubDocContractor, useSetSubDocRecord,
} from "@/hooks/use-subcontractor-docs"
import type { SubDocContractor, SubDocRecord, SubDocType, DocStatus, Urgency } from "@/services/subcontractor-docs.service"

// ── Constants ────────────────────────────────────────────────────────────────

const URGENCY_META: Record<Urgency, { label: string; text: string; border: string; bg: string; dot: string }> = {
  expired: { label: "Expired",   text: "text-red-500",     border: "border-red-500/40",     bg: "bg-red-500/[0.06]",     dot: "bg-red-500" },
  urgent:  { label: "Due soon",  text: "text-orange-500",  border: "border-orange-500/40",  bg: "bg-orange-500/[0.06]",  dot: "bg-orange-500" },
  soon:    { label: "Upcoming",  text: "text-amber-500",   border: "border-amber-500/40",   bg: "bg-amber-500/[0.05]",   dot: "bg-amber-500" },
  ok:      { label: "Current",   text: "text-emerald-500", border: "border-emerald-500/30", bg: "bg-emerald-500/[0.04]", dot: "bg-emerald-500" },
  none:    { label: "No date on file", text: "text-muted-foreground", border: "border-border/50", bg: "bg-card/40", dot: "bg-muted-foreground/40" },
}

const STATUS_META: Record<DocStatus, { label: string; icon: React.ElementType; color: string }> = {
  missing:        { label: "Missing",   icon: HelpCircle,  color: "text-muted-foreground/50" },
  requested:      { label: "Requested", icon: Clock,       color: "text-orange-500" },
  received:       { label: "Received",  icon: CircleCheck, color: "text-emerald-500" },
  not_applicable: { label: "N/A",       icon: X,           color: "text-muted-foreground/30" },
}

const EMPTY_RECORD = (docType: string): SubDocRecord => ({
  doc_type: docType, status: "missing", start_date: null, expiry_date: null, requested_date: null, notes: "",
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

function DocCell({ contractorId, typeInfo, record }: {
  contractorId: number; typeInfo: SubDocType; record: SubDocRecord
}) {
  const setRecord = useSetSubDocRecord()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DocStatus>(record.status)
  const [startDate, setStartDate] = useState(record.start_date ?? "")
  const [expiryDate, setExpiryDate] = useState(record.expiry_date ?? "")
  const [requestedDate, setRequestedDate] = useState(record.requested_date ?? "")
  const [notes, setNotes] = useState(record.notes ?? "")

  useEffect(() => {
    if (!open) return
    setStatus(record.status)
    setStartDate(record.start_date ?? "")
    setExpiryDate(record.expiry_date ?? "")
    setRequestedDate(record.requested_date ?? "")
    setNotes(record.notes ?? "")
  }, [open, record])

  const save = () => {
    setRecord.mutate({
      contractor_id: contractorId, doc_type: typeInfo.key, status,
      start_date: startDate, expiry_date: expiryDate, requested_date: requestedDate, notes,
    }, { onSuccess: () => setOpen(false) })
  }

  const meta = STATUS_META[record.status]
  const Icon = meta.icon
  const dateLabel = typeInfo.has_expiry
    ? (record.status === "received" ? fmtDate(record.expiry_date) : meta.label)
    : (record.status === "requested" && record.requested_date ? `req. ${fmtDate(record.requested_date)}` : meta.label)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={e => e.stopPropagation()}
        className="flex flex-col items-start gap-0.5 rounded-lg border border-border/50 bg-muted/10 px-2.5 py-1.5 text-left transition-colors hover:border-border hover:bg-muted/20"
      >
        <span className="truncate text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">{typeInfo.label}</span>
        <span className={cn("flex items-center gap-1 text-[11px] font-semibold", meta.color)}>
          <Icon className="h-3 w-3 shrink-0" />
          {dateLabel}
        </span>
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

function ContractorCard({ ctr, types, onEdit, onDelete }: {
  ctr: SubDocContractor; types: SubDocType[]
  onEdit: () => void; onDelete: () => void
}) {
  const meta = URGENCY_META[ctr.urgency]
  const recordsByType = Object.fromEntries(ctr.records.map(r => [r.doc_type, r]))

  return (
    <div className={cn("shrink-0 overflow-hidden rounded-xl border", meta.border, meta.bg)}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{ctr.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            {ctr.email && <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{ctr.email}</span>}
            {ctr.phone && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{ctr.phone}</span>}
          </div>
        </div>
        <span className={cn("shrink-0 text-[11px] font-semibold", meta.text)}>
          {meta.label}{ctr.next_expiry ? ` · ${fmtDate(ctr.next_expiry)}` : ""}
        </span>
        <button onClick={onEdit} title="Edit subcontractor"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={onDelete} title="Delete subcontractor"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border/20 p-3 sm:grid-cols-4 lg:grid-cols-7">
        {types.map(t => (
          <DocCell key={t.key} contractorId={ctr.id} typeInfo={t} record={recordsByType[t.key] ?? EMPTY_RECORD(t.key)} />
        ))}
      </div>
      {ctr.notes && (
        <p className="border-t border-border/20 px-4 py-2 text-[10px] italic text-muted-foreground/60">{ctr.notes}</p>
      )}
    </div>
  )
}

// ── Add / Edit contractor dialog ────────────────────────────────────────────────

function ContractorFormDialog({ open, onClose, initial }: {
  open: boolean; onClose: () => void
  initial: SubDocContractor | null
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const create = useCreateSubDocContractor()
  const update = useUpdateSubDocContractor()
  const isEdit = !!initial

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? "")
    setEmail(initial?.email ?? "")
    setPhone(initial?.phone ?? "")
    setNotes(initial?.notes ?? "")
  }, [open, initial])

  const pending = create.isPending || update.isPending
  const save = () => {
    if (!name.trim()) return
    if (isEdit && initial) {
      update.mutate({ id: initial.id, name, email, phone, notes }, { onSuccess: onClose })
    } else {
      create.mutate({ name, email, phone, notes }, { onSuccess: onClose })
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
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elite Stone Works"
              className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com"
                className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555"
                className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
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
            <button onClick={save} disabled={pending || !name.trim()}
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

// ── Page ──────────────────────────────────────────────────────────────────────

type SortField = "urgency" | "name"

const URGENCY_RANK: Record<Urgency, number> = { expired: 0, urgent: 1, soon: 2, ok: 3, none: 4 }

export default function SubcontractorDocsPage() {
  const { data: types, isLoading: typesLoading } = useSubDocTypes()
  const { data: contractors, isLoading } = useSubDocContractors()

  const [search, setSearch] = useState("")
  const [urgencyFilter, setUrgencyFilter] = useState<Set<Urgency>>(new Set())
  const [sortField, setSortField] = useState<SortField>("urgency")
  const [sortAsc, setSortAsc] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SubDocContractor | null>(null)
  const [deleting, setDeleting] = useState<SubDocContractor | null>(null)

  const toggleUrgency = (u: Urgency) => {
    setUrgencyFilter(prev => {
      const next = new Set(prev)
      next.has(u) ? next.delete(u) : next.add(u)
      return next
    })
  }

  const rows = (contractors ?? [])
    .filter(c => (!search || c.name.toLowerCase().includes(search.toLowerCase())) &&
      (urgencyFilter.size === 0 || urgencyFilter.has(c.urgency)))
    .slice()
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortField === "name") return dir * a.name.localeCompare(b.name)
      const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
      if (rankDiff !== 0) return dir * rankDiff
      if (a.next_expiry && b.next_expiry) return dir * a.next_expiry.localeCompare(b.next_expiry)
      return 0
    })

  if (isLoading || typesLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Subcontractor Docs</h1>
          <p className="text-sm text-muted-foreground">Subcontractor compliance document status</p>
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

          {(Object.keys(URGENCY_META) as Urgency[]).map(u => {
            const meta = URGENCY_META[u]
            const on = urgencyFilter.has(u)
            const count = (contractors ?? []).filter(c => c.urgency === u).length
            return (
              <button key={u} onClick={() => toggleUrgency(u)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  on ? cn(meta.border, meta.bg, meta.text) : "border-border/50 text-muted-foreground hover:text-foreground")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                {meta.label} <span className="opacity-60">{count}</span>
              </button>
            )
          })}

          <button onClick={() => setAddOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* ── Subcontractors container ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="text-sm font-semibold">Subcontractors</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
              <span className="flex h-full items-center border-r border-input bg-muted/40 px-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Order by
              </span>
              {([["urgency", "Urgency"], ["name", "Name"]] as const).map(([f, label]) => (
                <button key={f} onClick={() => setSortField(f)}
                  className={cn("flex h-full items-center px-2 text-[11px] font-medium transition-colors",
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
            <div className="flex flex-col gap-3">
              {rows.map(ctr => (
                <ContractorCard key={ctr.id} ctr={ctr} types={types ?? []}
                  onEdit={() => setEditing(ctr)} onDelete={() => setDeleting(ctr)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ContractorFormDialog open={addOpen} onClose={() => setAddOpen(false)} initial={null} />
      <ContractorFormDialog open={!!editing} onClose={() => setEditing(null)} initial={editing} />
      <DeleteContractorDialog contractor={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
