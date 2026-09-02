"use client"

import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, FileSpreadsheet, FileText, Trash2, Users, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import {
  wexCategorizationService,
  type WexReport,
} from "@/services/wex-categorization.service"
import { COMPANIES, COMPANY_LABEL } from "../_lib/wex-algorithm"
import type { AnyResultRow, Company } from "../_lib/wex-algorithm"
import { formatPeriod } from "../_lib/export-utils"
import { CompanyLogo } from "./company-logo"

export function ReportCard({ report, onDelete, onExportExcel, onExportPdf, onCompanyChange }: {
  report:          WexReport
  onDelete:        () => void
  onExportExcel:   () => void
  onExportPdf:     () => void
  onCompanyChange: (newCompany: Company) => void
}) {
  const { showFinancialData } = useFinancialStore()
  const blur   = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""
  const period = formatPeriod(report)
  const genAt  = new Date(report.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false)
  const [resultsCache,       setResultsCache]       = useState<AnyResultRow[] | null>(null)
  const [loadingResults,     setLoadingResults]     = useState(false)
  const [patchingCompany,    setPatchingCompany]    = useState(false)
  const [pendingCompany,     setPendingCompany]     = useState<Company>(report.company as Company)

  async function ensureResults() {
    if (resultsCache) return
    setLoadingResults(true)
    try {
      const full = await wexCategorizationService.getReport(report.id)
      setResultsCache((full.results ?? []) as AnyResultRow[])
    } catch { toast.error("Failed to load report data.") }
    finally { setLoadingResults(false) }
  }

  const uniqueDrivers = resultsCache
    ? [...new Map(resultsCache.map(r => [r.driverId, r])).values()]
        .sort((a, b) => a.driverWexName.localeCompare(b.driverWexName))
    : []

  const uniqueEmployees = resultsCache
    ? [...new Set(resultsCache.map(r => r.driverQbName).filter(Boolean))].sort()
    : []

  async function handleCompanySave() {
    if (pendingCompany === report.company) { setCompanyPopoverOpen(false); return }
    setPatchingCompany(true)
    try {
      await wexCategorizationService.patchReport(report.id, { company: pendingCompany })
      onCompanyChange(pendingCompany)
      setCompanyPopoverOpen(false)
      toast.success("Company updated.")
    } catch { toast.error("Failed to update company.") }
    finally { setPatchingCompany(false) }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">

      {/* Header — company selector via popover */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Popover
          open={companyPopoverOpen}
          onOpenChange={open => {
            if (!open) setPendingCompany(report.company as Company)
            setCompanyPopoverOpen(open)
          }}
        >
          <PopoverTrigger className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/60">
            <CompanyLogo company={report.company as Company} />
            <span className="font-semibold">{COMPANY_LABEL[report.company as Company] ?? report.company}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-52 gap-0 overflow-hidden p-0">
            <div className="flex flex-col gap-0.5 p-1">
              {COMPANIES.map(c => (
                <button key={c} type="button" onClick={() => setPendingCompany(c)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    pendingCompany === c ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  )}>
                  <CompanyLogo company={c} />
                  <span>{COMPANY_LABEL[c]}</span>
                  {pendingCompany === c && <Check className="ml-auto h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-border p-2">
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                onClick={() => setCompanyPopoverOpen(false)}>
                <X className="h-3 w-3" />Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCompanySave}
                disabled={patchingCompany || pendingCompany === report.company}>
                {patchingCompany ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <span className="h-4 w-px shrink-0 bg-border/60" />
        <span className="text-sm text-muted-foreground">{period}</span>
        <span className="ml-auto text-xs text-muted-foreground">{genAt}</span>
      </div>

      {/* Metadata two-col */}
      <div className="grid grid-cols-2 divide-x divide-border/50 border-b border-border">
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">WEX Report</span>
            <Popover>
              <PopoverTrigger
                onClick={() => ensureResults()}
                className="rounded-md p-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
              >
                <Users className="h-3.5 w-3.5" />
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-60 gap-0 overflow-hidden p-0">
                <div className="border-b border-border px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">WEX Drivers</span>
                </div>
                <div className="max-h-60 overflow-y-auto no-scrollbar">
                  {loadingResults ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                  ) : uniqueDrivers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No drivers.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border/50 px-2 py-1">
                      {uniqueDrivers.map(r => (
                        <div key={r.driverId} className="flex items-center gap-2.5 py-1.5">
                          <span className="w-10 shrink-0 rounded bg-muted px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-primary">{r.driverId}</span>
                          <span className="text-xs">{r.driverWexName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.wexTxCount}</span> <span className="text-xs text-muted-foreground">transactions</span></span>
            <span className="text-sm"><span className={`font-semibold tabular-nums ${blur}`}>${report.meta.wexTotal.toFixed(2)}</span> <span className="text-xs text-muted-foreground">total</span></span>
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.wexDrivers}</span> <span className="text-xs text-muted-foreground">drivers</span></span>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">QB Time</span>
            <Popover>
              <PopoverTrigger
                onClick={() => ensureResults()}
                className="rounded-md p-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
              >
                <Users className="h-3.5 w-3.5" />
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-56 gap-0 overflow-hidden p-0">
                <div className="border-b border-border px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">QB Time Employees</span>
                </div>
                <div className="max-h-60 overflow-y-auto no-scrollbar">
                  {loadingResults ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                  ) : uniqueEmployees.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No employees.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border/50 px-3 py-1">
                      {uniqueEmployees.map(name => (
                        <div key={name} className="py-1.5">
                          <span className="text-xs">{name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.qbEntries}</span> <span className="text-xs text-muted-foreground">entries</span></span>
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.qbEmployees}</span> <span className="text-xs text-muted-foreground">employees</span></span>
          </div>
        </div>
      </div>

      {/* Footer: stats + actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="text-sm">
          <span className="font-semibold tabular-nums text-emerald-500">{report.meta.matched}</span>
          <span className="ml-1 text-xs text-muted-foreground">matched</span>
        </span>
        {report.meta.officeCount > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="font-semibold tabular-nums text-amber-500">{report.meta.officeCount}</span>
            <span className="ml-0.5 text-xs text-muted-foreground">→ Office</span>
          </span>
        )}
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{report.meta.uniqueObras}</span>
          <span className="ml-1 text-xs text-muted-foreground">unique obras</span>
        </span>
        <span className="text-sm">
          <span className={`font-semibold tabular-nums ${blur}`}>${report.meta.totalCost?.toFixed(2) ?? "—"}</span>
          <span className="ml-1 text-xs text-muted-foreground">total cost</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onExportExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" />Export Excel
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onExportPdf}>
            <FileText className="h-3.5 w-3.5" />Export PDF
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
