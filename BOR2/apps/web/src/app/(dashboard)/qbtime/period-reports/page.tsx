"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import * as XLSX from "xlsx"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FileText, FileSpreadsheet, Clock, DollarSign, ListFilter, ArrowDownAZ, Users, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { usePayPeriods, usePeriodIntervals, usePeriodAccounting } from "@/hooks/use-qbtime-period-report"
import type { PeriodBlock, PeriodDay, PeriodEmployee, AccountingRow, AccountingTotals, IntervalsResponse } from "@/services/qbtime-period-report.service"

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
]

// ── Color helpers ─────────────────────────────────────────────────────────────

function blockColor(block: PeriodBlock): { bg: string; text: string } {
  if (!block.isPaid) return { bg: "bg-muted", text: "text-muted-foreground" }
  const root = (block.jobcodePath[0] ?? "").toLowerCase()
  if (root.includes("pulte"))       return { bg: "bg-blue-500/80",    text: "text-white" }
  if (root.includes("toll"))        return { bg: "bg-emerald-500/80", text: "text-white" }
  if (root.includes("address"))     return { bg: "bg-orange-400/80",  text: "text-white" }
  if (root.includes("admin"))       return { bg: "bg-violet-500/80",  text: "text-white" }
  if (root.includes("maintenance")) return { bg: "bg-yellow-500/80",  text: "text-white" }
  if (root.includes("pcg"))         return { bg: "bg-rose-500/80",    text: "text-white" }
  return { bg: "bg-slate-400/80", text: "text-white" }
}

function formatPath(path: string[]): string {
  return path.join(" › ")
}

function isoToMinutes(iso: string): number {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0
}

function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return ""
  const h = parseInt(m[1])
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`
}

// Minutes → "4h 47m" / "1h" / "45m"
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h)      return `${h}h`
  return `${m}m`
}

// "2026-05-18", "2026-05-31" → "May 18–31, 2026"
function formatPeriodLabel(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "—"
  const s = new Date(startDate + "T12:00:00")
  const e = new Date(endDate + "T12:00:00")
  const mon = (d: Date) => d.toLocaleString("en-US", { month: "short" })
  if (s.getFullYear() !== e.getFullYear()) {
    return `${mon(s)} ${s.getDate()}, ${s.getFullYear()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth()) {
    return `${mon(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
  }
  return `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`
}

// ── Timeline Block ────────────────────────────────────────────────────────────

function TimelineBlock({
  block, dayStart, dayEnd,
}: {
  block: PeriodBlock
  dayStart: number
  dayEnd: number
}) {
  const range = Math.max(dayEnd - dayStart, 1)
  const s     = Math.max(isoToMinutes(block.start), dayStart)
  const e     = Math.min(block.end ? isoToMinutes(block.end) : dayEnd, dayEnd)
  const left  = ((s - dayStart) / range) * 100
  const width = Math.max(((e - s) / range) * 100, 0.5)
  const { bg, text } = blockColor(block)
  const label = block.isPaid ? formatPath(block.jobcodePath) : "Break"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`absolute top-0 h-full ${bg} ${text} rounded-sm overflow-hidden flex items-center px-1.5 cursor-default select-none`}
            style={{ left: `${left}%`, width: `calc(${width}% - 3px)` }}
          />
        }
      >
        <span className="text-[10px] font-medium truncate leading-none">
          {width > 4 ? label : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex flex-col gap-1 max-w-[280px]">
        <div className="flex items-center justify-between gap-4 border-b border-background/15 pb-1">
          <span className="font-medium">{formatTime(block.start)} – {formatTime(block.end)}</span>
          <span className="tabular-nums opacity-70">{formatDuration(block.durationMinutes)}</span>
        </div>
        <span className="opacity-80">{formatPath(block.jobcodePath)}</span>
      </TooltipContent>
    </Tooltip>
  )
}

// ── Day Row ───────────────────────────────────────────────────────────────────

function DayRow({ day }: { day: PeriodDay }) {
  const starts   = day.blocks.map(b => isoToMinutes(b.start)).filter(Boolean)
  const ends     = day.blocks.map(b => b.end ? isoToMinutes(b.end) : 0).filter(Boolean)
  const dayStart = Math.max(0,    Math.min(...(starts.length ? starts : [420])))
  let   dayEnd   = Math.min(1440, Math.max(...(ends.length   ? ends   : [1080])))
  if (dayEnd <= dayStart) dayEnd = dayStart + 60
  const range    = dayEnd - dayStart

  const ticks: number[] = []
  for (let m = Math.ceil(dayStart / 120) * 120; m <= dayEnd; m += 120) ticks.push(m)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-transparent bg-muted/30 px-2 py-2 transition-colors hover:border-foreground/30">
      <div className="w-24 shrink-0">
        <p className="text-xs font-medium leading-tight">{day.dayName.slice(0, 3)} {day.date.slice(5)}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{day.totalHours.toFixed(2)}h paid</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative mb-1 h-3.5">
          {ticks.map(t => {
            const pct  = ((t - dayStart) / range) * 100
            const h    = Math.floor(t / 60)
            const h12  = h % 12 === 0 ? 12 : h % 12
            const ampm = h >= 12 ? "pm" : "am"
            const transform = pct <= 2 ? "translateX(0)" : pct >= 98 ? "translateX(-100%)" : "translateX(-50%)"
            return (
              <span key={t} className="absolute text-[9px] text-muted-foreground" style={{ left: `${pct}%`, transform }}>
                {h12}{ampm}
              </span>
            )
          })}
        </div>
        <div className="relative h-8 overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/40">
          {day.blocks.map((b, i) => (
            <TimelineBlock key={i} block={b} dayStart={dayStart} dayEnd={dayEnd} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Employee Card ─────────────────────────────────────────────────────────────

function EmployeeIntervalCard({
  employee, selectedDay, open, onToggle,
}: {
  employee: PeriodEmployee
  selectedDay: string | null
  open: boolean
  onToggle: () => void
}) {
  const days = selectedDay ? employee.days.filter(d => d.date === selectedDay) : employee.days
  if (!days.length) return null
  const totalHours = days.reduce((s, d) => s + d.totalHours, 0)

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        className="flex w-full items-center justify-between gap-3 rounded-t-lg px-4 py-3 transition-colors hover:bg-muted/30"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{employee.name}</span>
          {employee.team && (
            <span className="truncate text-xs text-muted-foreground">{employee.team}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {totalHours.toFixed(2)}h paid
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-4 pb-3 pt-1">
          {days.map(day => <DayRow key={day.date} day={day} />)}
        </div>
      )}
    </div>
  )
}

// ── Accounting Table ──────────────────────────────────────────────────────────

function AccountingTable({ rows, totals }: { rows: AccountingRow[]; totals: AccountingTotals }) {
  const grouped = useMemo(() => {
    const map = new Map<string, AccountingRow[]>()
    for (const row of rows) {
      if (!map.has(row.employee)) map.set(row.employee, [])
      map.get(row.employee)!.push(row)
    }
    return map
  }, [rows])

  const fmt  = (n: number) => n > 0 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"
  const fmtH = (n: number) => n > 0 ? n.toFixed(2) : "–"

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60 text-xs text-muted-foreground uppercase tracking-wide">
            <th className="text-left px-3 py-2.5 font-medium">Job Code</th>
            <th className="text-right px-3 py-2.5 font-medium">Reg Hrs</th>
            <th className="text-right px-3 py-2.5 font-medium">Reg Rate</th>
            <th className="text-right px-3 py-2.5 font-medium">Reg Cost</th>
            <th className="text-right px-3 py-2.5 font-medium">OT Hrs</th>
            <th className="text-right px-3 py-2.5 font-medium">OT Rate</th>
            <th className="text-right px-3 py-2.5 font-medium">OT Cost</th>
            <th className="text-right px-3 py-2.5 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(grouped.entries()).map(([employee, empRows]) => {
            const empTotal = empRows.reduce((s, r) => s + r.totalCost, 0)
            return [
              <tr key={`${employee}-hdr`} className="bg-muted/40 border-t border-border">
                <td colSpan={7} className="px-3 py-2 font-semibold text-sm">{employee}</td>
                <td className="px-3 py-2 text-right font-semibold">${empTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>,
              ...empRows.map((row, i) => (
                <tr key={`${employee}-${i}`} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 text-xs text-muted-foreground pl-5">{formatPath(row.jobcodePath)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtH(row.regularHours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.regularRate > 0 ? `$${row.regularRate.toFixed(2)}` : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.regularCost > 0 ? `$${fmt(row.regularCost)}` : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtH(row.otHours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.otRate > 0 ? `$${row.otRate.toFixed(2)}` : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.otCost > 0 ? `$${fmt(row.otCost)}` : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">${fmt(row.totalCost)}</td>
                </tr>
              )),
            ]
          })}
          <tr className="border-t-2 border-border bg-muted/60 font-semibold">
            <td className="px-3 py-2.5 text-sm">Grand Total</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.regularHours.toFixed(2)}</td>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-right tabular-nums">${totals.regularCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.otHours.toFixed(2)}</td>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-right tabular-nums">${totals.otCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">${totals.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Export: Accounting ──────────────────────────────────────────────────────────

function doExportExcel(rows: AccountingRow[], totals: AccountingTotals, company: string, label: string) {
  const headers = ["Employee", "Job Code", "Reg Hrs", "Reg Rate ($)", "Reg Cost ($)", "OT Hrs", "OT Rate ($)", "OT Cost ($)", "Total Hrs", "Total Cost ($)"]
  const data: (string | number)[][] = rows.map(r => [
    r.employee, formatPath(r.jobcodePath),
    r.regularHours, r.regularRate, r.regularCost,
    r.otHours, r.otRate, r.otCost,
    r.totalHours, r.totalCost,
  ])
  data.push(["GRAND TOTAL", "", totals.regularHours, "", totals.regularCost, totals.otHours, "", totals.otCost, totals.totalHours, totals.totalCost])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  ws["!cols"] = [28, 55, 10, 13, 14, 10, 12, 12, 10, 14].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Job Cost")
  XLSX.writeFile(wb, `Job_Cost_${company.toUpperCase()}_${label.replace(/[^a-z0-9]/gi, "_")}.xlsx`)
}

function doExportPDF(rows: AccountingRow[], company: string, label: string) {
  const win = window.open("", "_blank")
  if (!win) return
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const grouped = new Map<string, AccountingRow[]>()
  for (const r of rows) {
    if (!grouped.has(r.employee)) grouped.set(r.employee, [])
    grouped.get(r.employee)!.push(r)
  }

  let tbody = ""
  for (const [emp, empRows] of grouped.entries()) {
    const empTotal = empRows.reduce((s, r) => s + r.totalCost, 0)
    tbody += `<tr class="emp"><td colspan="7">${emp}</td><td class="r">$${fmt(empTotal)}</td></tr>`
    for (const r of empRows) {
      tbody += `<tr>
        <td class="indent">${formatPath(r.jobcodePath)}</td>
        <td class="r">${r.regularHours > 0 ? r.regularHours.toFixed(2) : "–"}</td>
        <td class="r">${r.regularRate > 0 ? "$" + r.regularRate.toFixed(2) : "–"}</td>
        <td class="r">${r.regularCost > 0 ? "$" + fmt(r.regularCost) : "–"}</td>
        <td class="r">${r.otHours > 0 ? r.otHours.toFixed(2) : "–"}</td>
        <td class="r">${r.otRate > 0 ? "$" + r.otRate.toFixed(2) : "–"}</td>
        <td class="r">${r.otCost > 0 ? "$" + fmt(r.otCost) : "–"}</td>
        <td class="r">$${fmt(r.totalCost)}</td>
      </tr>`
    }
  }

  win.document.write(`<!DOCTYPE html><html><head>
    <title>Job Cost – ${company.toUpperCase()} – ${label}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
      h2{font-size:14px;margin-bottom:2px}h3{font-size:11px;color:#666;font-weight:normal;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}
      th{background:#f0f0f0;padding:5px 7px;text-align:right;font-size:10px;text-transform:uppercase;border-bottom:2px solid #ccc}
      th:first-child{text-align:left}
      td{padding:4px 7px;border-bottom:1px solid #eee}
      td.r{text-align:right}td.indent{padding-left:18px}
      tr.emp td{background:#f5f5f5;font-weight:bold;border-top:2px solid #ddd;padding:6px 7px}
    </style></head><body>
    <h2>Job Cost Report — ${company.toUpperCase()}</h2><h3>${label}</h3>
    <table><thead><tr>
      <th style="text-align:left">Job Code</th>
      <th>Reg Hrs</th><th>Reg Rate</th><th>Reg Cost</th>
      <th>OT Hrs</th><th>OT Rate</th><th>OT Cost</th><th>Total</th>
    </tr></thead><tbody>${tbody}</tbody></table>
    </body></html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print(); win.close() }, 300)
}

// ── Export: Intervals ───────────────────────────────────────────────────────────

function doExportIntervalsExcel(intervals: IntervalsResponse, company: string, label: string) {
  const headers = ["Employee", "Date", "Day", "Start", "End", "Duration", "Job Code", "Type"]
  const data: (string | number)[][] = []
  for (const emp of intervals.employees) {
    for (const day of emp.days) {
      for (const b of day.blocks) {
        data.push([
          emp.name,
          day.date,
          day.dayName,
          formatTime(b.start),
          formatTime(b.end),
          formatDuration(b.durationMinutes),
          b.isPaid ? formatPath(b.jobcodePath) : "Break",
          b.isPaid ? "Paid" : "Break",
        ])
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  ws["!cols"] = [24, 12, 10, 10, 10, 10, 55, 8].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Intervals")
  XLSX.writeFile(wb, `Intervals_${company.toUpperCase()}_${label.replace(/[^a-z0-9]/gi, "_")}.xlsx`)
}

function doExportIntervalsPDF(intervals: IntervalsResponse, company: string, label: string) {
  const win = window.open("", "_blank")
  if (!win) return

  let body = ""
  for (const emp of intervals.employees) {
    const empHours = emp.days.reduce((s, d) => s + d.totalHours, 0)
    body += `<h4 class="emp">${emp.name} — ${empHours.toFixed(2)}h paid</h4>`
    body += `<table><thead><tr>
      <th style="text-align:left">Date</th><th style="text-align:left">Start</th>
      <th style="text-align:left">End</th><th class="r">Duration</th><th style="text-align:left">Job Code</th>
    </tr></thead><tbody>`
    for (const day of emp.days) {
      day.blocks.forEach((b, i) => {
        body += `<tr>
          <td>${i === 0 ? `${day.dayName.slice(0, 3)} ${day.date.slice(5)}` : ""}</td>
          <td>${formatTime(b.start)}</td>
          <td>${formatTime(b.end)}</td>
          <td class="r">${formatDuration(b.durationMinutes)}</td>
          <td>${b.isPaid ? formatPath(b.jobcodePath) : "Break"}</td>
        </tr>`
      })
    }
    body += `</tbody></table>`
  }

  win.document.write(`<!DOCTYPE html><html><head>
    <title>Timesheet Intervals – ${company.toUpperCase()} – ${label}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
      h2{font-size:14px;margin-bottom:2px}h3{font-size:11px;color:#666;font-weight:normal;margin-bottom:12px}
      h4.emp{font-size:12px;margin:16px 0 4px;padding-bottom:3px;border-bottom:2px solid #ddd}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}
      th{background:#f0f0f0;padding:4px 7px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #ccc}
      td{padding:3px 7px;border-bottom:1px solid #eee}
      td.r,th.r{text-align:right}
    </style></head><body>
    <h2>Timesheet Intervals — ${company.toUpperCase()}</h2><h3>${label}</h3>
    ${body}
    </body></html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print(); win.close() }, 300)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PeriodReportsPage() {
  const [company,      setCompany]      = useState("framing")
  const [periodIndex,  setPeriodIndex]  = useState(0)
  const [allDays,      setAllDays]      = useState(true)
  const [selectedDay,  setSelectedDay]  = useState<string | null>(null)
  const [activeTab,    setActiveTab]    = useState("intervals")
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())
  const [groupBy,      setGroupBy]      = useState<"name" | "team">("name")

  const { data: periodsData, isLoading: periodsLoading } = usePayPeriods(company)
  const periods = periodsData?.periods ?? []
  const period  = periods[periodIndex] ?? null
  const periodLabel = period ? formatPeriodLabel(period.startDate, period.endDate) : "—"

  const { data: intervals,  isLoading: intervalsLoading  } = usePeriodIntervals(
    company, period?.startDate ?? "", period?.endDate ?? "",
    activeTab === "intervals" && !!period,
  )
  const { data: accounting, isLoading: accountingLoading } = usePeriodAccounting(
    company, period?.startDate ?? "", period?.endDate ?? "",
    activeTab === "accounting" && !!period,
  )

  const availableDays = useMemo(() => {
    if (!intervals) return []
    const set = new Set<string>()
    for (const emp of intervals.employees) for (const d of emp.days) set.add(d.date)
    return Array.from(set).sort()
  }, [intervals])

  // Employees actually rendered under the current day filter — drives "expand/collapse all".
  const visibleEmployees = useMemo(() => {
    if (!intervals) return []
    return intervals.employees.filter(emp =>
      allDays ? emp.days.length > 0 : emp.days.some(d => d.date === selectedDay),
    )
  }, [intervals, allDays, selectedDay])

  const allCollapsed = visibleEmployees.length > 0 && visibleEmployees.every(e => collapsed.has(e.name))

  // Render groups: flat (alphabetical) or grouped by team. Built from visible
  // employees so empty team headers never show under the day filter.
  const employeeGroups = useMemo(() => {
    const emps = visibleEmployees
    if (groupBy === "name") return [{ team: null as string | null, employees: emps }]
    const map = new Map<string, PeriodEmployee[]>()
    for (const e of emps) {
      const t = e.team?.trim() || "Unassigned"
      if (!map.has(t)) map.set(t, [])
      map.get(t)!.push(e)
    }
    const names = [...map.keys()].sort((a, b) =>
      a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b),
    )
    return names.map(t => ({ team: t as string | null, employees: map.get(t)! }))
  }, [visibleEmployees, groupBy])

  const dayIndex = selectedDay ? availableDays.indexOf(selectedDay) : 0

  function handleCompanyChange(c: string) {
    setCompany(c); setPeriodIndex(0); setAllDays(true); setSelectedDay(null); setCollapsed(new Set())
  }

  function handleAllDaysToggle() {
    setAllDays(true); setSelectedDay(null)
  }

  function toggleEmployee(name: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleAll() {
    if (allCollapsed) setCollapsed(new Set())
    else setCollapsed(new Set(visibleEmployees.map(e => e.name)))
  }

  function handleExportExcel() {
    if (activeTab === "accounting" && accounting) doExportExcel(accounting.rows, accounting.totals, company, periodLabel)
    else if (activeTab === "intervals" && intervals) doExportIntervalsExcel(intervals, company, periodLabel)
  }

  function handleExportPDF() {
    if (activeTab === "accounting" && accounting) doExportPDF(accounting.rows, company, periodLabel)
    else if (activeTab === "intervals" && intervals) doExportIntervalsPDF(intervals, company, periodLabel)
  }

  const canExport =
    (activeTab === "accounting" && !!accounting?.rows.length) ||
    (activeTab === "intervals"  && !!intervals?.employees.length)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Period Reports</h1>
          <p className="text-sm text-muted-foreground">
            Timesheet intervals and job cost breakdown by pay period
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">

          {/* View mode */}
          <div className="flex flex-col items-start gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">View</p>
            <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {([
                { value: "intervals", label: "Intervals", Icon: Clock },
                { value: "accounting", label: "Job Cost", Icon: DollarSign },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setActiveTab(value)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                    activeTab === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </div>

          <div className="self-stretch w-px bg-border" />

          {/* Company */}
          <div className="flex flex-col items-start gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company</p>
            <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {COMPANIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleCompanyChange(c.value)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    company === c.value ? "bg-background shadow-sm" : "hover:bg-muted",
                  )}
                  title={c.label}
                >
                  <Image src={c.logo} alt={c.label} width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                </button>
              ))}
            </div>
          </div>

          <div className="self-stretch w-px bg-border" />

          {/* Period */}
          <div className="flex flex-col items-start gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Period</p>
            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-muted/40 px-1">
              <button
                onClick={() => setPeriodIndex(i => Math.min(i + 1, periods.length - 1))}
                disabled={periodsLoading || periodIndex >= periods.length - 1}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[150px] text-center text-xs font-medium tabular-nums">
                {periodsLoading ? <Skeleton className="h-3 w-32 inline-block" /> : periodLabel}
              </span>
              <button
                onClick={() => setPeriodIndex(i => Math.max(i - 1, 0))}
                disabled={periodsLoading || periodIndex === 0}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Day filter — intervals only */}
          {activeTab === "intervals" && (
            <>
              <div className="self-stretch w-px bg-border" />
              <div className="flex flex-col items-start gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Days</p>
                <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-muted/40 px-1">
                  <button
                    onClick={handleAllDaysToggle}
                    className={cn(
                      "flex h-6 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
                      allDays ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <button
                    onClick={() => {
                      const target = dayIndex > 0 ? availableDays[dayIndex - 1] : (availableDays[0] ?? null)
                      setAllDays(false)
                      setSelectedDay(target)
                    }}
                    disabled={!allDays && dayIndex <= 0}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[48px] text-center text-xs font-medium tabular-nums">
                    {allDays ? "—" : selectedDay
                      ? `${new Date(selectedDay + "T12:00:00").getMonth() + 1}/${new Date(selectedDay + "T12:00:00").getDate()}`
                      : "—"}
                  </span>
                  <button
                    onClick={() => {
                      const target = dayIndex < availableDays.length - 1 ? availableDays[dayIndex + 1] : (availableDays[availableDays.length - 1] ?? null)
                      setAllDays(false)
                      setSelectedDay(target)
                    }}
                    disabled={!allDays && dayIndex >= availableDays.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Export — both views */}
          {canExport && (
            <>
              <div className="self-stretch w-px bg-border" />
              <div className="pb-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-2" />}>
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={handleExportExcel}>
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF}>
                      <FileText className="h-4 w-4" />
                      PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === "intervals" && (
        !period ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20">
            <Clock className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Select a pay period to view intervals.</p>
          </div>
        ) : intervalsLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
          </div>
        ) : !intervals?.employees.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20">
            <Clock className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No timesheet data found for this period.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card/30">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {visibleEmployees.length} {visibleEmployees.length === 1 ? "employee" : "employees"}
              </span>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" />}>
                    <ListFilter className="h-3.5 w-3.5" />
                    {groupBy === "team" ? "By team" : "Alphabetical"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setGroupBy("name")}>
                      <ArrowDownAZ className="h-4 w-4" />
                      Alphabetical
                      {groupBy === "name" && <Check className="ml-auto h-4 w-4" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGroupBy("team")}>
                      <Users className="h-4 w-4" />
                      By team
                      {groupBy === "team" && <Check className="ml-auto h-4 w-4" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="mx-1 h-4 w-px bg-border" />
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={toggleAll}>
                  {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
                  {allCollapsed ? "Expand all" : "Collapse all"}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-3">
                {employeeGroups.map(group => (
                  <div key={group.team ?? "all"} className="flex flex-col gap-2">
                    {group.team && (
                      <div className="flex items-center gap-2 px-1 pt-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.team}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">{group.employees.length}</span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    )}
                    {group.employees.map(emp => (
                      <EmployeeIntervalCard
                        key={emp.name}
                        employee={emp}
                        selectedDay={allDays ? null : selectedDay}
                        open={!collapsed.has(emp.name)}
                        onToggle={() => toggleEmployee(emp.name)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === "accounting" && (
        !period ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20">
            <DollarSign className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Select a pay period to view job cost.</p>
          </div>
        ) : accountingLoading ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : !accounting?.rows.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20">
            <DollarSign className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No payroll data found for this period.</p>
          </div>
        ) : (
          <AccountingTable rows={accounting.rows} totals={accounting.totals} />
        )
      )}
    </div>
  )
}
