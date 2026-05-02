"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { AlertTriangle, FolderOpen, Play } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import {
  wexCategorizationService,
  type WexNormEntry,
  type WexReport,
  type WexReportMeta,
} from "@/services/wex-categorization.service"
import { parseCsv, ci } from "../_lib/csv-parser"
import {
  COMPANY_LABEL,
  parseQbTime,
  runAllocation,
} from "../_lib/wex-algorithm"
import type { Company, QbRow, ResultRow } from "../_lib/wex-algorithm"
import { CompanyLogo } from "./company-logo"
import { FileDropZone } from "./file-drop-zone"

export function NewReportSheet({ open, onClose, company, onSave }: {
  open:    boolean
  onClose: () => void
  company: Company
  onSave:  (r: WexReport) => void
}) {
  const [normMap,      setNormMap]      = useState<Map<string, WexNormEntry>>(new Map())
  const [ignoredObras, setIgnoredObras] = useState<Set<string>>(new Set())
  const [wexText,      setWexText]      = useState("")
  const [wexFileName,  setWexFileName]  = useState("")
  const [wexStatus,    setWexStatus]    = useState<"idle" | "ok" | "warn">("idle")
  const [wexPreview,   setWexPreview]   = useState<{ txCount: number; drivers: number; total: number } | null>(null)
  const [qbRows,       setQbRows]       = useState<QbRow[]>([])
  const [qbFileName,   setQbFileName]   = useState("")
  const [qbStatus,     setQbStatus]     = useState<"idle" | "ok" | "warn">("idle")
  const [qbWarnMsg,    setQbWarnMsg]    = useState("")
  const [qbPreview,    setQbPreview]    = useState<{ entries: number; employees: number } | null>(null)
  const [filterFrom,   setFilterFrom]   = useState("")
  const [filterTo,     setFilterTo]     = useState("")
  const [results,      setResults]      = useState<ResultRow[]>([])
  const [isRunning,    setIsRunning]    = useState(false)
  const [isSaving,     setIsSaving]     = useState(false)
  const [overrides,    setOverrides]    = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      setWexText(""); setWexFileName(""); setWexStatus("idle"); setWexPreview(null)
      setQbRows([]); setQbFileName(""); setQbStatus("idle"); setQbWarnMsg(""); setQbPreview(null)
      setFilterFrom(""); setFilterTo("")
      setResults([]); setIsRunning(false); setOverrides({})
      setNormMap(new Map()); setIgnoredObras(new Set())
      return
    }
    Promise.all([
      wexCategorizationService.listNorm(company),
      wexCategorizationService.listIgnoredAddresses(company),
    ]).then(([normEntries, ignoredEntries]) => {
      const map = new Map<string, WexNormEntry>()
      for (const e of normEntries ?? []) map.set(e.driverId, e)
      setNormMap(map)
      setIgnoredObras(new Set((ignoredEntries ?? []).map(a => a.address)))
    }).catch(() => { /* proceed without mappings */ })
  }, [open, company])

  async function handleWexFile(file: File) {
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const missing = ["Transaction Date", "Driver Prompt ID", "Total Fuel Cost"].filter(c => ci(headers, c) < 0)
      if (missing.length) {
        setWexFileName(file.name)
        setWexStatus("warn")
        setWexText("")
        setWexPreview(null)
        toast.error(`Wrong file — missing WEX columns: ${missing.join(", ")}`)
        return
      }
      setWexText(text); setWexFileName(file.name); setWexStatus("ok")
      let total = 0; const drivers = new Set<string>()
      for (const row of rows) {
        const emboss = (row[ci(headers, "Emboss Line 2")] ?? "").trim()
        const fn = (row[ci(headers, "Driver First Name")] ?? "").trim()
        const ln = (row[ci(headers, "Driver Last Name")] ?? "").trim()
        drivers.add(emboss || `${fn} ${ln}`.trim())
        total += parseFloat((row[ci(headers, "Total Fuel Cost")] ?? "").replace(/[^0-9.-]/g, "")) || 0
      }
      setWexPreview({ txCount: rows.length, drivers: drivers.size, total })
    } catch { toast.error("Failed to parse WEX file.") }
  }

  function handleWexRemove() {
    setWexText(""); setWexFileName(""); setWexStatus("idle"); setWexPreview(null)
  }

  async function handleQbFile(file: File) {
    try {
      let text: string
      const isExcel = /\.(xlsx|xls)$/i.test(file.name)
      if (isExcel) {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf, { type: "array" })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        text = XLSX.utils.sheet_to_csv(ws)
      } else {
        text = await file.text()
      }

      setQbFileName(file.name)
      const { headers } = parseCsv(text)
      const missing = ["fname", "lname", "local_date", "jobcode_1"].filter(c => ci(headers, c) < 0)
      if (missing.length) {
        setQbStatus("warn")
        setQbWarnMsg("Wrong report type — select Itemized Total Time in QB Time")
        setQbRows([]); setQbPreview(null)
        toast.error(`Wrong QB Time report — missing columns: ${missing.join(", ")}. Export "Itemized Total Time", not "Job Costing by Team Member".`)
        return
      }
      const parsed = parseQbTime(text)
      setQbRows(parsed)
      setQbPreview({ entries: parsed.length, employees: new Set(parsed.map(r => r.fullNameNorm)).size })
      if (parsed.length === 0) {
        setQbStatus("warn")
        setQbWarnMsg("No valid rows found — check date range and job code setup")
        toast.warning("QB Time file loaded but no valid rows found. All entries may be filtered (Admin/Office/no job codes). Check the export date range and job code setup.")
      } else {
        setQbStatus("ok")
        setQbWarnMsg("")
      }
    } catch { toast.error("Failed to parse QB Time file.") }
  }

  function handleQbRemove() {
    setQbRows([]); setQbFileName(""); setQbStatus("idle"); setQbWarnMsg(""); setQbPreview(null)
  }

  function handleRun(overridesArg?: Record<string, string>) {
    if (!wexText)       { toast.error("Upload the WEX file first."); return }
    if (!qbRows.length) { toast.error("Upload the QB Time file first."); return }
    setIsRunning(true)
    setTimeout(() => {
      try {
        const ov   = overridesArg ?? overrides
        const rows = runAllocation(wexText, qbRows, normMap, filterFrom, filterTo, ov, ignoredObras)
        setResults(rows)
        const n = rows.filter(r => r.isOffice).length
        if (n > 0) toast.warning(`${rows.length} transactions — ${n} unmatched (→ Office)`)
        else       toast.success(`${rows.length} transactions processed.`)
      } catch (e) { toast.error(`Error: ${String(e)}`) }
      setIsRunning(false)
    }, 0)
  }

  function handleOverride(driverId: string, qbName: string) {
    const newOv = { ...overrides, [driverId]: qbName }
    setOverrides(newOv); handleRun(newOv)
  }

  async function handleSave() {
    if (!results.length) { toast.error("No results to save. Run the allocation first."); return }
    const obraMap = new Map<string, number>()
    for (const r of results)
      for (const o of r.obrasTrabalhadas.split(" | "))
        if (o.trim() && o.trim() !== "Office") obraMap.set(o.trim(), (obraMap.get(o.trim()) ?? 0) + r.costPerJobcode)

    const totalCostVal = results.reduce((s, r) => s + r.totalFuelCost, 0)
    const meta: WexReportMeta = {
      wexTxCount:  wexPreview?.txCount  ?? results.length,
      wexTotal:    wexPreview?.total    ?? totalCostVal,
      wexDrivers:  wexPreview?.drivers  ?? 0,
      qbEntries:   qbPreview?.entries   ?? 0,
      qbEmployees: qbPreview?.employees ?? 0,
      matched:     results.filter(r => !r.isOffice).length,
      officeCount: results.filter(r => r.isOffice).length,
      uniqueObras: obraMap.size,
      totalCost:   totalCostVal,
    }

    setIsSaving(true)
    try {
      const saved = await wexCategorizationService.createReport({
        company, filterFrom, filterTo, meta, results,
      })

      const overrideEntries = Object.entries(overrides)
      if (overrideEntries.length > 0) {
        const wexNameMap = new Map<string, string>()
        for (const r of results) {
          if (!wexNameMap.has(r.driverId)) wexNameMap.set(r.driverId, r.driverWexName)
        }
        await Promise.allSettled(
          overrideEntries.map(([driverId, qbName]) =>
            wexCategorizationService.upsertNorm({
              company,
              driverId,
              wexName:  wexNameMap.get(driverId) ?? "",
              qbName:   qbName === "__office__" ? "Sem QB Time" : qbName,
              isActive: true,
            })
          )
        )
        const n = overrideEntries.length
        toast.success(`Report saved · ${n} driver mapping${n > 1 ? "s" : ""} saved for future reports`)
      } else {
        toast.success("Report saved.")
      }

      onSave(saved)
      onClose()
    } catch { toast.error("Failed to save report.") }
    finally { setIsSaving(false) }
  }

  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const qbEmpOptions = [...new Map(qbRows.map(r => [r.fullNameNorm, r.displayName])).values()].sort()
  const unresolved = (() => {
    const seen = new Map<string, { driverId: string; wexName: string }>()
    for (const r of results)
      if (r.isOffice && overrides[r.driverId] !== "__office__" && !seen.has(r.driverId))
        seen.set(r.driverId, { driverId: r.driverId, wexName: r.driverWexName })
    return [...seen.values()]
  })()
  const totalCost   = results.reduce((s, r) => s + r.totalFuelCost, 0)
  const officeCount = results.filter(r => r.isOffice).length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[90vh] flex-col gap-0 p-0" style={{ width: "min(92vw, 72rem)", maxWidth: "none" }}>
        <DialogHeader className="flex-row items-center gap-3 border-b px-6 py-4">
          <CompanyLogo company={company} />
          <DialogTitle>New Report — {COMPANY_LABEL[company]}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 no-scrollbar">

          {/* Upload panel */}
          <div className="rounded-xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Upload Files</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 p-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">WEX Report</span>
                <FileDropZone label="Drop WEX CSV here" accept=".csv,text/csv" fileName={wexFileName} status={wexStatus} warnMessage="Wrong file — missing required WEX columns" onFile={handleWexFile} onRemove={handleWexRemove} />
                {wexPreview && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{wexPreview.txCount}</span> transactions</span>
                    <span><span className="font-semibold text-foreground">{wexPreview.drivers}</span> drivers</span>
                    <span><span className={`font-semibold text-foreground ${blur}`}>${wexPreview.total.toFixed(2)}</span></span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">QuickBooks Time</span>
                <FileDropZone label="Drop QB Time CSV or Excel here" accept=".csv,text/csv,.xlsx,.xls" fileName={qbFileName} status={qbStatus} warnMessage={qbWarnMsg || undefined} onFile={handleQbFile} onRemove={handleQbRemove} />
                {qbPreview && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{qbPreview.entries}</span> entries</span>
                    <span><span className="font-semibold text-foreground">{qbPreview.employees}</span> employees</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date Filter</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 w-36 text-xs" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   className="h-8 w-36 text-xs" />
                  </div>
                </div>
                <Button onClick={() => handleRun()} disabled={isRunning || wexStatus !== "ok" || qbStatus !== "ok"}
                  className="gap-2 self-end">
                  <Play className="h-3.5 w-3.5" />
                  {isRunning ? "Processing…" : "Process"}
                </Button>
              </div>
            </div>
          </div>

          {/* Unresolved drivers */}
          {unresolved.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {unresolved.length} driver{unresolved.length > 1 ? "s" : ""} not found in QB Time — assign manually
                </span>
              </div>
              <div className="grid gap-2 p-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {unresolved.map(d => (
                  <div key={d.driverId} className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5">
                    <span className="max-w-[110px] truncate text-xs font-semibold" title={d.wexName}>{d.wexName}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Select value={overrides[d.driverId] ?? ""} onValueChange={v => { if (v) handleOverride(d.driverId, v) }}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <span className="flex-1 truncate text-left">{overrides[d.driverId] ? (overrides[d.driverId] === "__office__" ? "Office" : overrides[d.driverId]) : "— select —"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__office__">Office (no QB Time)</SelectItem>
                        {qbEmpOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results table */}
          {results.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card/60">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium">
                  {results.length} transactions
                  <span className="mx-1.5 text-border">·</span>
                  <span className={`font-semibold ${blur}`}>${totalCost.toFixed(2)}</span>
                  {officeCount > 0 && <span className="ml-1.5 text-amber-500">· {officeCount} → Office</span>}
                </span>
                <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Report"}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                    {["Date","Day","Driver (WEX)","QB Time Name","Total Cost","Obras Trabalhadas","Qty","Cost/Obra","City"].map(h => (
                      <TableHead key={h} className="whitespace-nowrap text-[11px] uppercase tracking-wide">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i} className={cn("border-border/50", r.isOffice && "bg-amber-500/5")}>
                      <TableCell className="whitespace-nowrap text-xs">{r.txDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.weekday.slice(0, 3)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.driverWexName}</TableCell>
                      <TableCell className={cn("text-xs", !r.driverQbName && "italic text-destructive")}>{r.driverQbName || "no mapping"}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right text-xs font-semibold tabular-nums ${blur}`}>${r.totalFuelCost.toFixed(2)}</TableCell>
                      <TableCell className={cn("max-w-72 truncate text-xs", r.isOffice && "italic text-amber-500")} title={r.obrasTrabalhadas}>{r.obrasTrabalhadas}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{r.qtyObras || "—"}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right text-xs font-bold tabular-nums text-primary ${blur}`}>{r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.merchantCity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <div>
                <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">Upload both files and click Process</p>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}
