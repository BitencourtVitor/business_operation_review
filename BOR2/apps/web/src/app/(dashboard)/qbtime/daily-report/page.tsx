"use client"

import { useRef, useState, useMemo } from "react"
import {
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  useQBTimeDailyReports,
  useSaveQBTimeDailyReport,
  useDeleteQBTimeDailyReport,
  useQBTimeDailyReport,
} from "@/hooks/use-qbtime-daily"
import type { QBTimeDailyReportEntry } from "@bor2/shared"

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ }
        else { inQ = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQ = true
    } else if (ch === ',') {
      fields.push(field.trim()); field = ""
    } else {
      field += ch
    }
  }
  fields.push(field.trim())
  return fields
}

function detectCompany(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes("hvac"))    return "HVAC"
  if (lower.includes("pcg"))     return "PCG"
  if (lower.includes("framing")) return "Framing"
  return ""
}

function detectDate(filename: string): string {
  const match = filename.match(/_(\d{4}-\d{2}-\d{2})_thru_/)
  return match?.[1] ?? ""
}

function formatEmployeeName(raw: string): string {
  const idx = raw.indexOf(",")
  if (idx === -1) return raw.trim()
  const last  = raw.slice(0, idx).trim()
  const first = raw.slice(idx + 1).trim()
  return first ? `${first} ${last}` : last
}

function fmtHours(h: number): string {
  return `${h.toFixed(2)}h`
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  employeeRaw:     string
  employeeDisplay: string
  jobCode:         string
  regularHours:    number
  overtimeHours:   number
  totalHours:      number
}

interface EmployeeSummary {
  key:                string
  displayName:        string
  totalRegularHours:  number
  totalOvertimeHours: number
  totalHours:         number
  rows:               ParsedRow[]
}

type Step = "upload" | "results"
type Source = "csv" | "saved"

const COMPANIES = ["HVAC", "PCG", "Framing"] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QBTimeDailyReportPage() {
  const [company, setCompany] = useState("")
  const [step,    setStep]    = useState<Step>("upload")
  const [source,  setSource]  = useState<Source>("csv")

  // CSV parsed state
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName,   setFileName]   = useState("")
  const [date,       setDate]       = useState("")
  const [error,      setError]      = useState("")
  const [isDragging, setIsDragging] = useState(false)

  // Saved report being viewed
  const [viewingId, setViewingId] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  // API
  const { data: savedReports = [], isLoading: loadingList } = useQBTimeDailyReports(company || undefined)
  const { data: viewingReport, isLoading: loadingReport }   = useQBTimeDailyReport(viewingId)
  const saveReport   = useSaveQBTimeDailyReport()
  const deleteReport = useDeleteQBTimeDailyReport(company)

  // Group parsed rows by employee
  const employees = useMemo<EmployeeSummary[]>(() => {
    const map = new Map<string, EmployeeSummary>()
    for (const row of parsedRows) {
      if (!map.has(row.employeeRaw)) {
        map.set(row.employeeRaw, {
          key:                row.employeeRaw,
          displayName:        row.employeeDisplay,
          totalRegularHours:  0,
          totalOvertimeHours: 0,
          totalHours:         0,
          rows:               [],
        })
      }
      const emp = map.get(row.employeeRaw)!
      emp.totalRegularHours  += row.regularHours
      emp.totalOvertimeHours += row.overtimeHours
      emp.totalHours         += row.totalHours
      emp.rows.push(row)
    }
    return [...map.values()].sort((a, b) => b.totalHours - a.totalHours)
  }, [parsedRows])

  // Group saved-report entries by employee (for viewing)
  const viewingEmployees = useMemo<EmployeeSummary[]>(() => {
    const entries = viewingReport?.entries ?? []
    const map = new Map<string, EmployeeSummary>()
    for (const e of entries) {
      if (!map.has(e.employeeRaw)) {
        map.set(e.employeeRaw, {
          key:                e.employeeRaw,
          displayName:        e.employeeDisplay,
          totalRegularHours:  0,
          totalOvertimeHours: 0,
          totalHours:         0,
          rows:               [],
        })
      }
      const emp = map.get(e.employeeRaw)!
      emp.totalRegularHours  += e.regularHours
      emp.totalOvertimeHours += e.overtimeHours
      emp.totalHours         += e.totalHours
      emp.rows.push({
        employeeRaw:     e.employeeRaw,
        employeeDisplay: e.employeeDisplay,
        jobCode:         e.jobCode,
        regularHours:    e.regularHours,
        overtimeHours:   e.overtimeHours,
        totalHours:      e.totalHours,
      })
    }
    return [...map.values()].sort((a, b) => b.totalHours - a.totalHours)
  }, [viewingReport])

  // ── CSV processing ─────────────────────────────────────────────────────────

  function processFile(file: File) {
    setError("")
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const lines = text.split(/\r?\n/).filter(l => l.trim())

        // Find header row
        const headerIdx = lines.findIndex(l => l.toLowerCase().includes("employee"))
        if (headerIdx === -1) {
          setError("Could not find a header row. Make sure this is a QB Time Job Costing CSV.")
          return
        }
        const headers = parseCsvLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/\s+/g, " ").trim())
        const idxOf   = (key: string) => headers.findIndex(h => h.includes(key))

        const colEmployee      = idxOf("employee")
        const colJobCode       = 0
        const colRegularHours  = idxOf("regular hours")
        const colOvertimeHours = idxOf("overtime x1.5 hours")

        if (colEmployee === -1 || colRegularHours === -1) {
          setError("Required columns not found. Make sure this is a QB Time Job Costing CSV export.")
          return
        }

        const rows: ParsedRow[] = []
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i])
          const emp  = cols[colEmployee]?.trim() ?? ""
          if (!emp || emp === "0") continue          // blank / trailing zero
          const jc   = cols[colJobCode]?.trim() ?? ""
          const reg  = parseFloat(cols[colRegularHours]  ?? "0") || 0
          const ot   = colOvertimeHours !== -1 ? (parseFloat(cols[colOvertimeHours] ?? "0") || 0) : 0
          rows.push({
            employeeRaw:     emp,
            employeeDisplay: formatEmployeeName(emp),
            jobCode:         jc,
            regularHours:    reg,
            overtimeHours:   ot,
            totalHours:      Math.round((reg + ot) * 100) / 100,
          })
        }

        if (rows.length === 0) {
          setError("No data rows found after parsing.")
          return
        }

        const detectedDate    = detectDate(file.name)
        const detectedCompany = detectCompany(file.name)

        setParsedRows(rows)
        setFileName(file.name)
        if (detectedDate)    setDate(detectedDate)
        if (detectedCompany) setCompany(detectedCompany)
        setSource("csv")
        setStep("results")
      } catch {
        setError("Failed to parse the file.")
      }
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleReset() {
    setStep("upload"); setParsedRows([]); setFileName(""); setDate("")
    setError(""); setViewingId(""); setSource("csv")
  }

  // ── Load saved report ──────────────────────────────────────────────────────

  function loadSaved(id: string) {
    setViewingId(id); setSource("saved"); setStep("results")
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!company || !date || parsedRows.length === 0) return
    const entries: QBTimeDailyReportEntry[] = parsedRows.map(r => ({
      id:              "",
      reportId:        "",
      employeeRaw:     r.employeeRaw,
      employeeDisplay: r.employeeDisplay,
      jobCode:         r.jobCode,
      regularHours:    r.regularHours,
      overtimeHours:   r.overtimeHours,
      totalHours:      r.totalHours,
    }))
    try {
      await saveReport.mutateAsync({ company, date, fileName, entries })
    } catch {
      setError("Failed to save. Please try again.")
    }
  }

  const isSaved       = saveReport.isSuccess
  const displayEmps   = source === "saved" ? viewingEmployees : employees
  const displayDate   = source === "saved" ? (viewingReport?.date ?? date) : date
  const displayFile   = source === "saved" ? (viewingReport?.fileName ?? "") : fileName
  const totalH        = displayEmps.reduce((s, e) => s + e.totalHours, 0)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">

        {/* Header */}
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
            Daily Report
          </p>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Company */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Company
            </p>
            <Select
              value={company || ""}
              onValueChange={v => { if (v) { setCompany(v); handleReset() } }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <span className="truncate">{company || "Select company…"}</span>
              </SelectTrigger>
              <SelectContent>
                {COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Date (shown after upload) */}
          {date && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Date
              </p>
              <p className="text-xs font-medium text-foreground">{formatDate(date)}</p>
            </div>
          )}

          {/* File name */}
          {fileName && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                File
              </p>
              <p className="break-all text-[10px] text-muted-foreground">{fileName}</p>
            </div>
          )}

          <div className="-mx-4 h-px bg-sidebar-border" />

          {/* Past reports */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Past Reports
            </p>
            {!company && (
              <p className="text-[11px] text-muted-foreground">Select a company first.</p>
            )}
            {company && loadingList && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {company && !loadingList && savedReports.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No saved reports yet.</p>
            )}
            <div className="flex flex-col gap-0.5">
              {savedReports.map(r => (
                <div
                  key={r.id}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors",
                    viewingId === r.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  onClick={() => loadSaved(r.id)}
                >
                  <span>{formatDate(r.date)}</span>
                  <button
                    onClick={ev => {
                      ev.stopPropagation()
                      deleteReport.mutate(r.id)
                      if (viewingId === r.id) handleReset()
                    }}
                    className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
          {step === "results" && source === "csv" && (
            <Button
              className="w-full gap-2 text-sm"
              disabled={!company || !date || isSaved || saveReport.isPending}
              onClick={handleSave}
            >
              {saveReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaved ? "Saved ✓" : "Save to DB"}
            </Button>
          )}
          {step === "results" && (
            <Button variant="ghost" className="w-full gap-2 text-sm text-muted-foreground" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              {source === "csv" ? "New file" : "Close"}
            </Button>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Upload ── */}
          {step === "upload" && (
            <div className="mx-auto max-w-lg">
              <div className="mb-4">
                <h1 className="text-xl font-semibold tracking-tight">Daily Report</h1>
                <p className="text-sm text-muted-foreground">
                  Upload a QB Time Job Costing CSV to view hours by team member.
                </p>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  {error}
                </div>
              )}

              <div className="rounded-xl border border-border bg-card/60">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="font-semibold">Upload Job Costing Report</h2>
                  <p className="text-sm text-muted-foreground">
                    Export from QB Time: Reports → Job Costing by Team Member → CSV
                  </p>
                </div>
                <div className="p-5">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex cursor-pointer select-none flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
                      isDragging
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <FileUp className={cn("h-5 w-5", isDragging ? "text-primary" : "text-muted-foreground/40")} />
                    <p className="text-xs font-medium text-muted-foreground">Drop the CSV here</p>
                    <p className="text-[11px] text-muted-foreground/60">Drag & drop or click to select</p>
                    <input
                      ref={fileInputRef} type="file" accept=".csv,text/csv"
                      className="hidden" onChange={handleFileInput}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {step === "results" && (
            <div className="flex flex-col gap-4">

              {/* Loading saved report */}
              {source === "saved" && loadingReport && (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  {error}
                </div>
              )}

              {/* Save success banner */}
              {isSaved && source === "csv" && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                  <span>✓</span>
                  Report for {company} — {formatDate(date)} saved successfully.
                </div>
              )}

              {(!loadingReport || source === "csv") && displayEmps.length > 0 && (
                <>
                  {/* Summary header */}
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-semibold tracking-tight">
                        {company} — {displayDate ? formatDate(displayDate) : "—"}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {displayEmps.length} team member{displayEmps.length !== 1 ? "s" : ""} · {fmtHours(totalH)} total
                        {displayFile && <> · <span className="opacity-60">{displayFile}</span></>}
                      </p>
                    </div>
                  </div>

                  {/* Employee cards */}
                  <div className="flex flex-col gap-3">
                    {displayEmps.map(emp => (
                      <EmployeeCard key={emp.key} emp={emp} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── EmployeeCard ─────────────────────────────────────────────────────────────

function EmployeeCard({ emp }: { emp: EmployeeSummary }) {
  const [open, setOpen] = useState(false)

  const regPct = emp.totalHours > 0
    ? Math.round((emp.totalRegularHours / emp.totalHours) * 100)
    : 100

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">

      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {/* Avatar initial */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {emp.displayName.charAt(0)}
        </div>

        {/* Name + job count */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{emp.displayName}</p>
          <p className="text-[11px] text-muted-foreground">
            {emp.rows.length} job entr{emp.rows.length !== 1 ? "ies" : "y"}
          </p>
        </div>

        {/* Hours breakdown */}
        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums">{fmtHours(emp.totalHours)}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {fmtHours(emp.totalRegularHours)} reg
            {emp.totalOvertimeHours > 0 && <> · {fmtHours(emp.totalOvertimeHours)} OT</>}
          </p>
        </div>

        {/* Hours bar */}
        <div className="hidden w-16 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="flex h-full">
              <div className="bg-primary/70 transition-all" style={{ width: `${regPct}%` }} />
              {emp.totalOvertimeHours > 0 && (
                <div className="bg-amber-500/70 transition-all" style={{ width: `${100 - regPct}%` }} />
              )}
            </div>
          </div>
        </div>

        {/* Chevron */}
        {open
          ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
      </button>

      {/* Job entries */}
      {open && (
        <div className="border-t border-border/50">
          {emp.rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 px-4 py-2.5",
                i < emp.rows.length - 1 && "border-b border-border/30",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs text-foreground/80">
                  {row.jobCode.split(" >> ").join(" › ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">{fmtHours(row.totalHours)}</p>
                {(row.regularHours > 0 || row.overtimeHours > 0) && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {row.regularHours > 0 && <span className="text-primary/70">{fmtHours(row.regularHours)} reg</span>}
                    {row.regularHours > 0 && row.overtimeHours > 0 && " · "}
                    {row.overtimeHours > 0 && <span className="text-amber-500">{fmtHours(row.overtimeHours)} OT</span>}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
