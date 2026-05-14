"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  useCreateQBTimeTeam,
  useDeleteQBTimeTeam,
  useQBTimeTeams,
  useUpdateQBTimeTeam,
} from "@/hooks/use-qbtime-teams"
import { useQBTimeWeeklyReport } from "@/hooks/use-qbtime-weekly-report"
import type { WeeklyEmployee, WeeklyReport } from "@/services/qbtime-weekly-report.service"
import {
  CalendarIcon,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  ImageDown,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = [
  { id: "Framing", logo: "/images/sublogo_framing.png" },
  { id: "HVAC",    logo: "/images/sublogo_hvac.png"    },
  { id: "PCG",     logo: "/images/sublogo_pcg.png"     },
] as const
type CompanyId = (typeof COMPANIES)[number]["id"]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team    { id: string; name: string; members: string[] }
interface Section { team: Team | null; members: WeeklyEmployee[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HourFormat = "number" | "time"
const LS_FMT_DAILY = "qbtime_daily_hour_format"

function loadFmt(key: string): HourFormat {
  try { return (localStorage.getItem(key) as HourFormat) || "number" } catch { return "number" }
}

function fmtH(h: number, fmt: HourFormat = "number"): string {
  if (fmt === "time") {
    const m = Math.round(Math.abs(h) * 60)
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
  }
  return `${h.toFixed(1)}h`
}

function fmtISODate(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+d}, ${y}`
}

function fmtShortDate(iso: string): string {
  if (!iso) return ""
  const [, m, d] = iso.split("-")
  return `${m}/${d}`
}

function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function isoFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// ─── Canvas / PNG export ──────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

function sectionSlug(section: Section, hasTeams: boolean): string {
  return hasTeams && section.team
    ? section.team.name.toLowerCase().replace(/\s+/g, "-")
    : section.members[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "export"
}

function buildSectionCanvas(
  section: Section,
  company: string,
  report: WeeklyReport,
  hasTeams: boolean,
  hourFormat: HourFormat = "number",
): HTMLCanvasElement {
  const dpr    = Math.min(window.devicePixelRatio || 1, 2)
  const W      = 880, PX = 28, PY = 14
  const HDR_H  = 36
  const NAME_H = 34
  const ADDR_H = 26
  const TEAM_H = hasTeams ? 30 : 0
  // Right panel width for weekly accumulation
  const RIGHT_W = 200

  let H = PY + HDR_H + TEAM_H
  for (const e of section.members) {
    const addrCount = e.days.find(d => d.date === report.reportDate)?.addresses.length ?? 0
    H += NAME_H + Math.max(addrCount, e.days.length) * ADDR_H
  }
  H += PY

  const canvas = document.createElement("canvas")
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)

  const BG      = "#f1f4f9"
  const CARD    = "#ffffff"
  const T1      = "#1a202c"
  const T2      = "#64748b"
  const SEP_HD  = "#c8d3e0"
  const SEP_EMP = "#d4dce8"
  const SEP_NM  = "#dde4ef"
  const SEP_JB  = "#eaeef5"
  const PRI     = "#2e6be6"
  const AMB     = "#d97706"
  const SF      = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  const MN      = "SFMono,'Fira Code',Consolas,monospace"

  function hline(ly: number, lw: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(6, ly); ctx.lineTo(W-6, ly); ctx.stroke(); ctx.restore()
  }

  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = CARD
  roundRect(ctx, 6, 6, W-12, H-12, 10); ctx.fill()
  ctx.strokeStyle = SEP_HD; ctx.lineWidth = 1; ctx.stroke()

  let y = PY

  // Header
  ctx.fillStyle = T2; ctx.font = `500 11px ${SF}`; ctx.textAlign = "left"
  ctx.fillText(`Premium Group  ·  ${company}  ·  Week ${fmtShortDate(report.weekStart)}–${fmtShortDate(report.weekEnd)}  ·  Report ${fmtISODate(report.reportDate)}`, PX, y + HDR_H / 2 + 4)
  y += HDR_H
  hline(y, 1.5, SEP_HD)

  // Divider line between left and right panels
  const divX = W - RIGHT_W - 6
  ctx.save(); ctx.strokeStyle = SEP_HD; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(divX, y); ctx.lineTo(divX, H - 6); ctx.stroke(); ctx.restore()

  // Column labels
  if (hasTeams && section.team) {
    const tot = section.members.reduce((s, e) => s + e.weekTotal, 0)
    ctx.fillStyle = T2; ctx.font = `700 10px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(section.team.name.toUpperCase(), PX, y + TEAM_H / 2 + 4)
    ctx.fillStyle = T1; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(tot, hourFormat), W - PX, y + TEAM_H / 2 + 4)
    ctx.textAlign = "left"; y += TEAM_H
    hline(y, 1.5, SEP_HD)
  }

  for (let ei = 0; ei < section.members.length; ei++) {
    const emp       = section.members[ei]
    const isLastEmp = ei === section.members.length - 1
    const reportDay = emp.days.find(d => d.date === report.reportDate)

    // Name row
    ctx.fillStyle = T1; ctx.font = `600 13px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(emp.name, PX, y + NAME_H / 2 + 4)
    // Week total on right side
    ctx.fillStyle = PRI; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(emp.weekTotal, hourFormat), W - PX, y + NAME_H / 2 + 4)
    if (emp.suggestionHours > 0) {
      ctx.fillStyle = AMB; ctx.font = `600 10px ${SF}`
      ctx.fillText(`↓ ${fmtH(emp.suggestionHours, hourFormat)}/day`, W - PX - 70, y + NAME_H / 2 + 4)
    }
    ctx.textAlign = "left"; y += NAME_H
    hline(y, 1, SEP_NM)

    const leftAddresses  = reportDay?.addresses ?? []
    const rightDays      = emp.days
    const rows           = Math.max(leftAddresses.length, rightDays.length)

    for (let ri = 0; ri < rows; ri++) {
      const addr = leftAddresses[ri]
      const dayEntry = rightDays[ri]

      if (addr) {
        let label = addr.address
        ctx.font = `11px ${SF}`
        const maxW = divX - PX - 10 - 14 - 62
        while (ctx.measureText(label).width > maxW && label.length > 10) label = `${label.slice(0,-4)}…`
        ctx.fillStyle = T2; ctx.textAlign = "left"
        ctx.fillText(label, PX + 10, y + ADDR_H / 2 + 4)
        ctx.font = `11px ${MN}`; ctx.textAlign = "right"
        ctx.fillText(fmtH(addr.hours, hourFormat), divX - 10, y + ADDR_H / 2 + 4)
      }

      if (dayEntry) {
        ctx.fillStyle = T2; ctx.font = `11px ${SF}`; ctx.textAlign = "left"
        ctx.fillText(`${dayEntry.day.slice(0,3)} ${fmtShortDate(dayEntry.date)}`, divX + 10, y + ADDR_H / 2 + 4)
        ctx.font = `11px ${MN}`; ctx.textAlign = "right"
        ctx.fillText(fmtH(dayEntry.totalHours, hourFormat), W - PX, y + ADDR_H / 2 + 4)
      }

      ctx.textAlign = "left"
      y += ADDR_H
      if (ri < rows - 1) hline(y, 0.5, SEP_JB)
    }

    if (!isLastEmp) hline(y, 1, SEP_EMP)
  }

  return canvas
}

function downloadSectionPNG(section: Section, company: string, report: WeeklyReport, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const canvas = buildSectionCanvas(section, company, report, hasTeams, hourFormat)
  const link = document.createElement("a")
  link.download = `weekly_${company.toLowerCase()}_${report.reportDate}_${sectionSlug(section, hasTeams)}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

async function exportAllPNG(grouped: Section[], company: string, report: WeeklyReport, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const { default: JSZip } = await import("jszip")
  const folderName = `weekly_${company.toLowerCase()}_${report.reportDate}`
  const zip        = new JSZip()
  const folder     = zip.folder(folderName)!

  for (const section of grouped) {
    const canvas = buildSectionCanvas(section, company, report, hasTeams, hourFormat)
    const slug   = sectionSlug(section, hasTeams)
    const base64 = canvas.toDataURL("image/png").replace("data:image/png;base64,", "")
    folder.file(`${slug}.png`, base64, { base64: true })
  }

  const blob = await zip.generateAsync({ type: "blob" })
  const link = document.createElement("a")
  link.download = `${folderName}.zip`
  link.href = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)
}

// ─── XLSX export ──────────────────────────────────────────────────────────────

function exportXLSX(grouped: Section[], company: string, report: WeeklyReport, hasTeams: boolean, hourFormat: HourFormat = "number") {
  // Gather all day dates across all employees for column headers
  const allDates = Array.from(
    new Set(grouped.flatMap(s => s.members.flatMap(e => e.days.map(d => d.date))))
  ).sort()

  const rows: (string | number)[][] = []
  rows.push([`${company} · Weekly Report · ${fmtISODate(report.reportDate)}`])
  rows.push([`Week: ${fmtISODate(report.weekStart)} – ${fmtISODate(report.weekEnd)}`])
  rows.push([""])

  const header = ["Employee", "Report Day Addresses", "Hours"]
  for (const d of allDates) header.push(d)
  header.push("Week Total", "Excess", "Suggestion")
  rows.push(header)

  for (const section of grouped) {
    if (hasTeams && section.team) {
      rows.push([section.team.name])
    }
    for (const emp of section.members) {
      const reportDay = emp.days.find(d => d.date === report.reportDate)
      const dayHours: (string | number)[] = allDates.map(d => {
        const day = emp.days.find(x => x.date === d)
        return day ? fmtH(day.totalHours, hourFormat) : ""
      })
      const firstAddr = reportDay?.addresses[0]
      rows.push([
        emp.name,
        firstAddr?.address ?? "",
        firstAddr ? fmtH(firstAddr.hours, hourFormat) : "",
        ...dayHours,
        fmtH(emp.weekTotal, hourFormat),
        fmtH(emp.weekExcess, hourFormat),
        emp.suggestionHours > 0 ? fmtH(emp.suggestionHours, hourFormat) : "",
      ])
      for (let i = 1; i < (reportDay?.addresses.length ?? 0); i++) {
        const addr = reportDay!.addresses[i]
        rows.push(["", addr.address, fmtH(addr.hours, hourFormat), ...allDates.map(() => "")])
      }
    }
    rows.push([""])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 28 }, { wch: 48 }, { wch: 10 }, ...allDates.map(() => ({ wch: 12 })), { wch: 12 }, { wch: 10 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Weekly Report")
  XLSX.writeFile(wb, `weekly_${company.toLowerCase()}_${report.reportDate}.xlsx`)
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportPDF(grouped: Section[], company: string, report: WeeklyReport, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const win = window.open("", "_blank"); if (!win) return
  let html = `<!DOCTYPE html><html><head><title>${company} · Weekly Report · ${report.reportDate}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  body{background:#fff;padding:28px;color:#1a202c}
  .hdr{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #e2e8f0;padding-bottom:10px;margin-bottom:20px}
  h1{font-size:16px;font-weight:700}
  .sub{font-size:11px;color:#64748b}
  .section{margin-bottom:20px;break-inside:avoid}
  .team-hdr{display:flex;justify-content:space-between;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-bottom:2px}
  .emp{border-bottom:1px solid #f0f4f8;padding:4px 0 2px}
  .emp-row{display:flex;justify-content:space-between;font-size:13px;font-weight:600;padding:2px 0}
  .panels{display:flex;gap:16px}
  .panel{flex:1}
  .panel-hdr{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:3px}
  .addr-row{display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:1px 0 1px 10px}
  .day-row{display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:1px 0}
  .hours{color:#2e6be6;font-family:SFMono,Consolas,monospace}
  .excess{color:#d97706;font-size:10px}
  .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center}
  @media print{body{padding:12px}}
</style></head><body>
<div class="hdr">
  <h1>${company} — Weekly Report</h1>
  <span class="sub">Week ${fmtISODate(report.weekStart)} – ${fmtISODate(report.weekEnd)} · Report ${fmtISODate(report.reportDate)}</span>
</div>`

  for (const section of grouped) {
    html += `<div class="section">`
    if (hasTeams && section.team) {
      const tot = section.members.reduce((s,e) => s + e.weekTotal, 0)
      html += `<div class="team-hdr"><span>${section.team.name}</span><span class="hours">${fmtH(tot, hourFormat)}</span></div>`
    }
    for (const emp of section.members) {
      const reportDay = emp.days.find(d => d.date === report.reportDate)
      html += `<div class="emp">`
      html += `<div class="emp-row"><span>${emp.name}</span><span class="hours">${fmtH(emp.weekTotal, hourFormat)}`
      if (emp.suggestionHours > 0) html += ` <span class="excess">(↓ ${fmtH(emp.suggestionHours, hourFormat)}/day)</span>`
      html += `</span></div>`
      html += `<div class="panels">`

      // Left: report day
      html += `<div class="panel"><div class="panel-hdr">Report Day</div>`
      for (const addr of (reportDay?.addresses ?? []))
        html += `<div class="addr-row"><span>${addr.address}</span><span class="hours">${fmtH(addr.hours, hourFormat)}</span></div>`
      if (!reportDay || reportDay.addresses.length === 0)
        html += `<div class="addr-row" style="color:#94a3b8">No data</div>`
      html += `</div>`

      // Right: week accumulation
      html += `<div class="panel"><div class="panel-hdr">This Week</div>`
      for (const day of emp.days)
        html += `<div class="day-row"><span>${day.day.slice(0,3)} ${fmtShortDate(day.date)}</span><span class="hours">${fmtH(day.totalHours, hourFormat)}</span></div>`
      if (emp.weekExcess > 0)
        html += `<div class="day-row excess"><span>Excess</span><span>${fmtH(emp.weekExcess, hourFormat)}</span></div>`
      html += `</div>`

      html += `</div></div>`
    }
    html += `</div>`
  }

  html += `<div class="footer">Premium Group · Business Operations Review</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),600)}</script></body></html>`
  win.document.write(html); win.document.close()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QBTimeDailyReportPage() {
  const [hourFormat,      setHourFormat]      = useState<HourFormat>(() => loadFmt(LS_FMT_DAILY))
  const [company,         setCompany]         = useState<CompanyId | "">("")
  const [selectedDate,    setSelectedDate]    = useState<Date>(dateFromISO(todayISO()))
  const [calOpen,         setCalOpen]         = useState(false)
  const [generated,       setGenerated]       = useState(false)
  const [expandedTeamIdx, setExpandedTeamIdx] = useState<number | null>(null)
  const [addingTeam,      setAddingTeam]      = useState(false)
  const [newTeamName,     setNewTeamName]     = useState("")

  const dateISO = isoFromDate(selectedDate)

  const { data: teamsData } = useQBTimeTeams(company || undefined)
  const createTeam  = useCreateQBTimeTeam(company)
  const updateTeam  = useUpdateQBTimeTeam(company)
  const deleteTeam  = useDeleteQBTimeTeam(company)

  const {
    data:    report,
    isFetching,
    isError,
    error,
  } = useQBTimeWeeklyReport(company, dateISO, generated)

  const companyTeams: Team[] = useMemo(
    () => (teamsData ?? []).map(t => ({ id: t.id, name: t.name, members: t.members })),
    [teamsData],
  )
  const hasTeams = companyTeams.length > 0

  const employees = report?.employees ?? []

  const grouped = useMemo<Section[]>(() => {
    if (!hasTeams) return employees.map(e => ({ team: null, members: [e] }))
    const assigned = new Set<string>()
    const sections = companyTeams.map(team => {
      const members = employees.filter(e => team.members.includes(e.name))
      members.forEach(m => assigned.add(m.name))
      return { team, members }
    }).filter(s => s.members.length > 0)
    const unassigned = employees.filter(e => !assigned.has(e.name))
    if (unassigned.length > 0)
      sections.push({ team: { id: "", name: "Unassigned", members: [] }, members: unassigned })
    return sections
  }, [employees, companyTeams, hasTeams])

  function handleGenerate() {
    if (!company) return
    setGenerated(true)
  }

  function handleReset() {
    setGenerated(false)
  }

  function addTeamInline() {
    const name = newTeamName.trim()
    if (!name || companyTeams.some(t => t.name === name)) return
    createTeam.mutate({ name, members: [] })
    setNewTeamName(""); setAddingTeam(false)
  }
  function removeTeamInline(ti: number) {
    const team = companyTeams[ti]; if (!team) return
    deleteTeam.mutate(team.id)
    if (expandedTeamIdx === ti) setExpandedTeamIdx(null)
  }
  function addMemberInline(ti: number, memberName: string) {
    const team = companyTeams[ti]; if (!team) return
    updateTeam.mutate({ id: team.id, name: team.name, members: [...team.members, memberName] })
  }
  function removeMemberInline(ti: number, memberName: string) {
    const team = companyTeams[ti]; if (!team) return
    updateTeam.mutate({ id: team.id, name: team.name, members: team.members.filter(m => m !== memberName) })
  }

  useEffect(() => {
    try { localStorage.setItem(LS_FMT_DAILY, hourFormat) } catch { /* */ }
  }, [hourFormat])

  // When company or date changes after a report was generated, re-trigger
  const prevCompanyRef = useRef(company)
  const prevDateRef    = useRef(dateISO)
  useEffect(() => {
    if (generated && (company !== prevCompanyRef.current || dateISO !== prevDateRef.current)) {
      setGenerated(false)
    }
    prevCompanyRef.current = company
    prevDateRef.current    = dateISO
  }, [company, dateISO, generated])

  const totalH = employees.reduce((s, e) => s + e.weekTotal, 0)
  const hasData = !!report && employees.length > 0

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">Daily Report</p>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Company logos */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Company</p>
            <div className="flex flex-col gap-1">
              {COMPANIES.map(c => (
                <button key={c.id} onClick={() => setCompany(c.id)}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg border px-3 text-left transition-colors",
                    company === c.id
                      ? "border-primary/40 bg-primary/8 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logo} alt={c.id} className="h-4 w-auto object-contain" />
                  <span className="text-xs font-medium">{c.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Report Date</p>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-transparent px-3 text-left text-xs transition-colors hover:bg-accent",
                  calOpen && "border-primary/50 ring-1 ring-primary/20",
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{fmtISODate(dateISO)}</span>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={8} className="p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={d => { if (d) { setSelectedDate(d); setCalOpen(false) } }}
                  disabled={{ after: new Date() }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Generate button */}
          <Button
            size="sm"
            className="w-full"
            disabled={!company || isFetching}
            onClick={handleGenerate}
          >
            {isFetching ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Fetching…</> : "Generate Report"}
          </Button>

          {company && (
            <>
              <div className="-mx-4 h-px bg-sidebar-border" />
              <div className="flex flex-col gap-1.5">

                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Teams</p>
                  <button
                    onClick={() => setAddingTeam(v => !v)}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {companyTeams.length === 0 && !addingTeam && (
                  <p className="text-[11px] text-muted-foreground">No teams yet.</p>
                )}

                {companyTeams.map((team, ti) => {
                  const isOpen     = expandedTeamIdx === ti
                  const isDeleting = deleteTeam.isPending && deleteTeam.variables === team.id
                  const isUpdating = updateTeam.isPending && updateTeam.variables?.id === team.id
                  const isBusy     = isDeleting || isUpdating
                  const taken      = new Set(companyTeams.flatMap((t, i) => i !== ti ? t.members : []))
                  const avail      = employees.map(e => e.name).filter(n => !taken.has(n) && !team.members.includes(n))
                  return (
                    <div key={ti} className={cn("overflow-hidden rounded-lg border border-sidebar-border transition-opacity", isDeleting && "opacity-50")}>
                      <div className="flex items-center gap-1 px-2 py-1.5">
                        <button
                          onClick={() => !isBusy && setExpandedTeamIdx(isOpen ? null : ti)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        >
                          <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-90")} />
                          <span className="flex-1 truncate text-xs font-medium">{team.name}</span>
                          {isUpdating
                            ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                            : <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{team.members.length}</span>
                          }
                        </button>
                        <button
                          onClick={() => removeTeamInline(ti)}
                          disabled={isBusy}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isDeleting
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />
                          }
                        </button>
                      </div>

                      {isOpen && (
                        <div className="flex flex-col gap-1 border-t border-sidebar-border px-2 pb-2 pt-1.5">
                          {team.members.map(m => (
                            <div key={m} className="flex items-center justify-between gap-1">
                              <span className="truncate text-[11px]">{m}</span>
                              <button
                                onClick={() => removeMemberInline(ti, m)}
                                disabled={isUpdating}
                                className="shrink-0 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                          {avail.length > 0 && (
                            <div className="mt-0.5 flex flex-col gap-0.5">
                              {team.members.length > 0 && <div className="h-px bg-sidebar-border" />}
                              {avail.map(name => (
                                <button
                                  key={name}
                                  onClick={() => addMemberInline(ti, name)}
                                  disabled={isUpdating}
                                  className="flex items-center gap-1 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Plus className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {team.members.length === 0 && avail.length === 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {employees.length === 0 ? "Generate a report first." : "All employees assigned."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {addingTeam && (
                  <div className="flex gap-1">
                    <input
                      disabled={createTeam.isPending}
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  addTeamInline()
                        if (e.key === "Escape") { setAddingTeam(false); setNewTeamName("") }
                      }}
                      placeholder="Team name…"
                      className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50 disabled:opacity-50"
                    />
                    <button
                      onClick={addTeamInline}
                      disabled={createTeam.isPending}
                      className="flex shrink-0 items-center justify-center rounded border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {createTeam.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ok"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">

          {/* Idle state */}
          {!generated && !isFetching && (
            <div className="mx-auto max-w-lg">
              <div className="mb-4">
                <h1 className="text-xl font-semibold tracking-tight">Daily Report</h1>
                <p className="text-sm text-muted-foreground">Select a company and date, then click Generate Report.</p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {!company
                    ? "Select a company in the sidebar to get started."
                    : `Ready to generate report for ${company} on ${fmtISODate(dateISO)}.`}
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {isFetching && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Fetching QB Time data…</p>
            </div>
          )}

          {/* Error */}
          {isError && !isFetching && (
            <div className="mx-auto max-w-lg">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <span className="mt-0.5 shrink-0">⚠</span>
                {(error as Error)?.message ?? "Failed to load report."}
              </div>
              <Button variant="ghost" size="sm" className="mt-3" onClick={handleReset}>Try again</Button>
            </div>
          )}

          {/* Results */}
          {!isFetching && hasData && report && (
            <div className="flex flex-col gap-4">

              {/* Header + controls */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {company} — {fmtISODate(report.reportDate)}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Week {fmtISODate(report.weekStart)} – {fmtISODate(report.weekEnd)} ·{" "}
                    {employees.length} employee{employees.length !== 1 ? "s" : ""} · {fmtH(totalH, hourFormat)} total
                  </p>
                </div>
                <div className="flex items-end gap-4">
                  {/* Metric Mode toggle */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Metric Mode</span>
                    <div className="flex h-8 w-36 items-center rounded-lg border border-border bg-muted/40 p-0.5">
                      {(["number", "time"] as HourFormat[]).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setHourFormat(fmt)}
                          className={cn(
                            "flex h-7 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors",
                            hourFormat === fmt
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {fmt === "number" ? "Number" : "Hour"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-px self-stretch bg-border" />
                  {/* Export */}
                  <div className="flex shrink-0 flex-col items-start gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Export</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportXLSX(grouped, company, report, hasTeams, hourFormat)}>
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportPDF(grouped, company, report, hasTeams, hourFormat)}>
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportAllPNG(grouped, company, report, hasTeams, hourFormat)}>
                        <ImageDown className="h-3.5 w-3.5" /> Export All as PNG
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section cards */}
              <div className="flex flex-col gap-3">
                {grouped.map((section, si) => (
                  <SectionCard
                    key={si}
                    section={section}
                    company={company}
                    report={report}
                    hasTeams={hasTeams}
                    hourFormat={hourFormat}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No data */}
          {!isFetching && generated && report && employees.length === 0 && (
            <div className="mx-auto max-w-lg text-center py-20">
              <p className="text-sm text-muted-foreground">No regular hours found for {company} in this period.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ section, company, report, hasTeams, hourFormat }: {
  section: Section
  company: string
  report: WeeklyReport
  hasTeams: boolean
  hourFormat: HourFormat
}) {
  const sectionTotal = section.members.reduce((s, e) => s + e.weekTotal, 0)
  function handlePNG() { downloadSectionPNG(section, company, report, hasTeams, hourFormat) }

  return (
    <div className="group rounded-xl border border-border bg-card/60 transition-colors hover:border-primary/50">

      {hasTeams && section.team && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {section.team.name}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{section.members.length}</span>
            <span className="text-xs font-bold tabular-nums">{fmtH(sectionTotal, hourFormat)}</span>
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger
                  onClick={handlePNG}
                  className="translate-x-2 rounded p-0.5 text-muted-foreground opacity-0 transition-all duration-200 hover:text-primary group-hover:translate-x-0 group-hover:opacity-100"
                >
                  <ImageDown className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top">Export as PNG</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {section.members.map((emp, ei) => (
        <EmployeeRow
          key={emp.name}
          emp={emp}
          report={report}
          hourFormat={hourFormat}
          isLast={ei === section.members.length - 1}
          hasTeams={hasTeams}
          onPNG={handlePNG}
        />
      ))}
    </div>
  )
}

// ─── EmployeeRow ──────────────────────────────────────────────────────────────

function EmployeeRow({ emp, report, hourFormat, isLast, hasTeams, onPNG }: {
  emp: WeeklyEmployee
  report: WeeklyReport
  hourFormat: HourFormat
  isLast: boolean
  hasTeams: boolean
  onPNG: () => void
}) {
  const reportDay = emp.days.find(d => d.date === report.reportDate)
  const dayLabel  = reportDay ? `${reportDay.day}, ${fmtShortDate(reportDay.date)}` : fmtISODate(report.reportDate)

  return (
    <div className={cn(!isLast && "border-b border-border/50")}>
      {/* Name row */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-2.5">
        <span className="flex-1 text-sm font-semibold">{emp.name}</span>
        {emp.suggestionHours > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            ↓ {fmtH(emp.suggestionHours, hourFormat)}/day
          </span>
        )}
        <span className="text-sm font-bold tabular-nums text-primary">{fmtH(emp.weekTotal, hourFormat)}</span>
        {!hasTeams && (
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger
                onClick={onPNG}
                className="translate-x-2 rounded p-0.5 text-muted-foreground opacity-0 transition-all duration-200 hover:text-primary group-hover:translate-x-0 group-hover:opacity-100"
              >
                <ImageDown className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top">Export as PNG</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-2 divide-x divide-border/50 pb-2.5">

        {/* Left: Report Day */}
        <div className="px-4">
          <p className="pb-0.5 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Report Day ({dayLabel})
          </p>
          {(reportDay?.addresses ?? []).length === 0 && (
            <p className="py-1 text-xs text-muted-foreground/50">No data</p>
          )}
          {(reportDay?.addresses ?? []).map((addr, i) => (
            <div key={i} className="flex items-baseline gap-4 py-[3px] pl-3">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">{addr.address}</span>
              <span className="shrink-0 text-xs tabular-nums text-foreground/60">{fmtH(addr.hours, hourFormat)}</span>
            </div>
          ))}
          {reportDay && (
            <div className="flex items-baseline gap-4 border-t border-border/30 py-[3px] pl-3">
              <span className="flex-1 text-[10px] font-semibold text-muted-foreground">Day total</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtH(reportDay.totalHours, hourFormat)}</span>
            </div>
          )}
        </div>

        {/* Right: This Week */}
        <div className="px-4">
          <p className="pb-0.5 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
            This Week ({fmtISODate(report.weekStart)} – {fmtISODate(report.weekEnd)})
          </p>
          {emp.days.map((day, i) => (
            <div key={i} className="flex items-baseline gap-4 py-[3px] pl-3">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {day.day.slice(0, 3)} {fmtShortDate(day.date)}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-foreground/60">{fmtH(day.totalHours, hourFormat)}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-4 border-t border-border/30 py-[3px] pl-3">
            <span className="flex-1 text-[10px] font-semibold text-muted-foreground">Total</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtH(emp.weekTotal, hourFormat)}</span>
          </div>
          {emp.weekExcess > 0 && (
            <div className="flex items-baseline gap-4 py-[3px] pl-3">
              <span className="flex-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Excess</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">{fmtH(emp.weekExcess, hourFormat)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
