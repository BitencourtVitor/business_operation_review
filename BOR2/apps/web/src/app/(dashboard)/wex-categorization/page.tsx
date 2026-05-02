"use client"

import { useCallback, useEffect, useState } from "react"
import { Ban, ArrowLeftRight, FolderOpen, Plus, Settings } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  wexCategorizationService,
  type WexReport,
} from "@/services/wex-categorization.service"
import { COMPANIES, COMPANY_LABEL } from "./_lib/wex-algorithm"
import type { Company, CompanyFilter, ResultRow } from "./_lib/wex-algorithm"
import { exportToExcel, exportToPdf } from "./_lib/export-utils"
import { CompanyLogo } from "./_components/company-logo"
import { ReportCard } from "./_components/report-card"
import { SettingsSheet } from "./_components/settings-sheet"
import { IgnoredAddressesSheet } from "./_components/ignored-addresses-sheet"
import { NewReportSheet } from "./_components/new-report-sheet"

export default function WexCategorizationPage() {
  const [company,          setCompany]          = useState<CompanyFilter>("framing")
  const [reports,          setReports]          = useState<WexReport[]>([])
  const [loading,          setLoading]          = useState(false)
  const [settingsOpen,     setSettingsOpen]     = useState(false)
  const [ignoredOpen,      setIgnoredOpen]      = useState(false)
  const [newReportOpen,    setNewReportOpen]    = useState(false)
  const [newReportCompany, setNewReportCompany] = useState<Company>("framing")

  const fetchReports = useCallback((c: CompanyFilter) => {
    setLoading(true)
    const fetch = c === "all"
      ? Promise.all(COMPANIES.map(co => wexCategorizationService.listReports(co)))
          .then(results => results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      : wexCategorizationService.listReports(c)
    fetch
      .then(data => setReports(data ?? []))
      .catch(() => toast.error("Failed to load reports."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchReports(company) }, [company, fetchReports])

  function handleSaveReport(r: WexReport) {
    setReports(prev => [r, ...prev])
  }

  async function handleDeleteReport(id: string) {
    try {
      await wexCategorizationService.deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
      toast.success("Report deleted.")
    } catch { toast.error("Failed to delete report.") }
  }

  function handleCompanyChange(reportId: string, newCompany: Company) {
    if (company === "all") {
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, company: newCompany } : r))
    } else {
      setReports(prev => prev.filter(r => r.id !== reportId))
    }
  }

  function openNewReport(c: Company) {
    setNewReportCompany(c)
    setNewReportOpen(true)
  }

  async function handleExportExcel(report: WexReport) {
    try {
      const full = await wexCategorizationService.getReport(report.id)
      exportToExcel((full.results ?? []) as ResultRow[], report.company as Company)
    } catch { toast.error("Failed to load report data.") }
  }

  async function handleExportPdf(report: WexReport) {
    try {
      const full = await wexCategorizationService.getReport(report.id)
      exportToPdf(full, (full.results ?? []) as ResultRow[])
    } catch { toast.error("Failed to load report data.") }
  }

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WEX Categorization</h1>
          <p className="text-sm text-muted-foreground">Fuel cost allocation by obra</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={company} onValueChange={v => setCompany(v as CompanyFilter)}>
            <SelectTrigger className="h-8 gap-2 pl-2.5 pr-3">
              {company === "all"
                ? <span className="text-sm font-medium">All companies</span>
                : <><CompanyLogo company={company} /><span className="text-sm font-medium">{COMPANY_LABEL[company]}</span></>
              }
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {COMPANIES.map(c => (
                <SelectItem key={c} value={c}>
                  <CompanyLogo company={c} />
                  <span className="ml-auto">{COMPANY_LABEL[c]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon" variant="outline" className="h-8 w-8" />}>
              <Settings className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" />
                Driver Mapping
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIgnoredOpen(true)}>
                <Ban className="h-4 w-4" />
                Ignored Addresses
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {company !== "all" ? (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => openNewReport(company)}>
              <Plus className="h-3.5 w-3.5" />New Report
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" className="h-8 gap-1.5" />}>
                <Plus className="h-3.5 w-3.5" />New Report
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                {COMPANIES.map(c => (
                  <DropdownMenuItem key={c} onClick={() => openNewReport(c)}>
                    <CompanyLogo company={c} />
                    {COMPANY_LABEL[c]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Reports list ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading reports…</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border">
            <FolderOpen className="h-10 w-10 text-muted-foreground/20" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">No reports yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Click "New Report" to process a WEX file</p>
            <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setNewReportOpen(true)}>
              <Plus className="h-3.5 w-3.5" />New Report
            </Button>
          </div>
        ) : (
          reports.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              onDelete={() => handleDeleteReport(r.id)}
              onExportExcel={() => handleExportExcel(r)}
              onExportPdf={() => handleExportPdf(r)}
              onCompanyChange={(newCompany) => handleCompanyChange(r.id, newCompany)}
            />
          ))
        )}
      </div>

      {/* ── Dialogs ── */}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialCompany={company}
      />
      <IgnoredAddressesSheet
        open={ignoredOpen}
        onClose={() => setIgnoredOpen(false)}
        initialCompany={company}
      />
      <NewReportSheet
        open={newReportOpen}
        onClose={() => setNewReportOpen(false)}
        company={newReportCompany}
        onSave={handleSaveReport}
      />
    </div>
  )
}
