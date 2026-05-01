"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  useCreateQBTimeTeam,
  useDeleteQBTimeTeam,
  useQBTimeTeams,
  useUpdateQBTimeTeam,
} from "@/hooks/use-qbtime-teams"
import {
  ChevronRight,
  FileSpreadsheet,
  FileText,
  ImageDown,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
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

interface ParsedRow {
  employeeKey:  string   // username (stable ID)
  employeeName: string   // "First Last"
  jobPath:      string   // "Client › Site › Lot › Type"
  hours:        number
  date:         string   // "YYYY-MM-DD"
}
interface JobLine    { path: string; hours: number }
interface EmpSummary { key: string; displayName: string; totalHours: number; jobs: JobLine[] }
interface Team       { id: string; name: string; members: string[] }
interface Section    { team: Team | null; members: EmpSummary[] }
interface PayPeriod  { startDate: string; endDate: string; sections: Section[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const f: string[] = []; let field = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i+1]==='"') { field+='"'; i++ } else { inQ=false } } else { field+=ch } }
    else if (ch === '"') { inQ=true } else if (ch === ',') { f.push(field.trim()); field="" } else { field+=ch }
  }
  f.push(field.trim()); return f
}

function detectDates(name: string): { startDate: string; endDate: string } {
  const m = name.match(/(\d{4}-\d{2}-\d{2})_thru_(\d{4}-\d{2}-\d{2})/)
  return m ? { startDate: m[1], endDate: m[2] } : { startDate: "", endDate: "" }
}

function detectCompany(name: string): CompanyId | "" {
  const l = name.toLowerCase()
  if (l.includes("framing")) return "Framing"
  if (l.includes("hvac"))    return "HVAC"
  if (l.includes("pcg"))     return "PCG"
  return ""
}

function fmtDate(iso: string) {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+d}, ${y}`
}

function fmtDateShort(iso: string) {
  if (!iso) return ""
  const [, m, d] = iso.split("-")
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+d}`
}

function fmtPeriod(start: string, end: string) {
  if (!start || !end) return ""
  const [sy, sm] = start.split("-")
  const [ey, em] = end.split("-")
  if (sy === ey && sm === em) return `${fmtDateShort(start)} – ${fmtDate(end)}`
  if (sy === ey)              return `${fmtDateShort(start)} – ${fmtDate(end)}`
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

type HourFormat = "number" | "time"
const LS_FMT_JOBCOST = "qbtime_jobcost_hour_format"
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

/** Split job path from consecutive jobcode columns, skipping blanks */
function buildJobPath(cols: string[], baseIdx: number): string {
  return [
    cols[baseIdx]?.trim(),
    cols[baseIdx + 1]?.trim(),
    cols[baseIdx + 2]?.trim(),
    cols[baseIdx + 3]?.trim(),
  ].filter(Boolean).join(" › ")
}



function buildEmployees(rows: ParsedRow[]): EmpSummary[] {
  const empMap = new Map<string, EmpSummary>()
  for (const row of rows) {
    if (!empMap.has(row.employeeKey)) {
      empMap.set(row.employeeKey, {
        key: row.employeeKey, displayName: row.employeeName, totalHours: 0, jobs: [],
      })
    }
    const emp = empMap.get(row.employeeKey)!
    emp.totalHours = Math.round((emp.totalHours + row.hours) * 100) / 100

    const existing = emp.jobs.find(j => j.path === row.jobPath)
    if (existing) existing.hours = Math.round((existing.hours + row.hours) * 100) / 100
    else          emp.jobs.push({ path: row.jobPath, hours: row.hours })
  }
  for (const emp of empMap.values())
    emp.jobs.sort((a, b) => b.hours - a.hours)
  return [...empMap.values()].sort((a, b) => b.totalHours - a.totalHours)
}

function buildSections(rows: ParsedRow[], teams: Team[]): Section[] {
  const employees = buildEmployees(rows)
  if (teams.length === 0) return employees.map(e => ({ team: null, members: [e] }))
  const assigned = new Set<string>()
  const sections = teams.map(team => {
    const members = employees.filter(e => team.members.includes(e.displayName))
    members.forEach(m => assigned.add(m.key))
    return { team, members }
  }).filter(s => s.members.length > 0)
  const unassigned = employees.filter(e => !assigned.has(e.key))
  if (unassigned.length > 0)
    sections.push({ team: { id: "", name: "Unassigned", members: [] }, members: unassigned })
  return sections
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

function sectionSlug(section: Section, period: PayPeriod): string {
  const base = section.team
    ? section.team.name.toLowerCase().replace(/\s+/g, "-")
    : section.members[0]?.displayName.toLowerCase().replace(/\s+/g, "-") ?? "export"
  return `${period.startDate}_${base}`
}

function buildSectionCanvas(
  section: Section, company: string, period: PayPeriod, hasTeams: boolean, hourFormat: HourFormat = "number"
): HTMLCanvasElement {
  const dpr    = Math.min(window.devicePixelRatio || 1, 2)
  const W      = 680, PX = 28, PY = 14
  const HDR_H  = 36
  const NAME_H = 34
  const JOB_H  = 26
  const TEAM_H = hasTeams ? 30 : 0

  let H = PY + HDR_H + TEAM_H
  for (const e of section.members) H += NAME_H + e.jobs.length * JOB_H
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
  const SF      = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  const MN      = "SFMono,'Fira Code',Consolas,monospace"

  function hline(ly: number, lw: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(6, ly); ctx.lineTo(W - 6, ly); ctx.stroke(); ctx.restore()
  }

  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = CARD
  roundRect(ctx, 6, 6, W - 12, H - 12, 10); ctx.fill()
  ctx.strokeStyle = SEP_HD; ctx.lineWidth = 1; ctx.stroke()

  let y = PY

  // Header
  ctx.fillStyle = T2; ctx.font = `500 11px ${SF}`; ctx.textAlign = "left"
  const companyPart = company ? `  ·  ${company}` : ""
  ctx.fillText(`Premium Group${companyPart}  ·  Pay Period Hours  ·  ${fmtPeriod(period.startDate, period.endDate)}`, PX, y + HDR_H / 2 + 4)
  y += HDR_H
  hline(y, 1.5, SEP_HD)

  // Team row
  if (hasTeams && section.team) {
    const tot = section.members.reduce((s, e) => s + e.totalHours, 0)
    ctx.fillStyle = T2; ctx.font = `700 10px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(section.team.name.toUpperCase(), PX, y + TEAM_H / 2 + 4)
    ctx.fillStyle = T1; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(tot, hourFormat), W - PX, y + TEAM_H / 2 + 4)
    ctx.textAlign = "left"; y += TEAM_H
    hline(y, 1.5, SEP_HD)
  }

  // Employees
  for (let ei = 0; ei < section.members.length; ei++) {
    const emp       = section.members[ei]
    const isLastEmp = ei === section.members.length - 1

    ctx.fillStyle = T1; ctx.font = `600 13px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(emp.displayName, PX, y + NAME_H / 2 + 4)
    ctx.fillStyle = PRI; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(emp.totalHours, hourFormat), W - PX, y + NAME_H / 2 + 4)
    ctx.textAlign = "left"; y += NAME_H

    hline(y, 1, SEP_NM)

    for (let ji = 0; ji < emp.jobs.length; ji++) {
      const job       = emp.jobs[ji]
      const isLastJob = ji === emp.jobs.length - 1

      let label = job.path
      ctx.font = `11px ${SF}`
      const maxW = W - PX - 10 - 14 - 62
      while (ctx.measureText(label).width > maxW && label.length > 10) label = `${label.slice(0, -4)}…`
      ctx.fillStyle = T2; ctx.textAlign = "left"
      ctx.fillText(label, PX + 10, y + JOB_H / 2 + 4)
      ctx.font = `11px ${MN}`; ctx.textAlign = "right"
      ctx.fillText(fmtH(job.hours, hourFormat), W - PX, y + JOB_H / 2 + 4)
      ctx.textAlign = "left"; y += JOB_H

      if (!isLastJob) hline(y, 0.5, SEP_JB)
    }

    if (!isLastEmp) hline(y, 1, SEP_EMP)
  }

  return canvas
}

function downloadSectionPNG(section: Section, company: string, period: PayPeriod, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const canvas = buildSectionCanvas(section, company, period, hasTeams, hourFormat)
  const link = document.createElement("a")
  link.download = `jobcost_${company.toLowerCase()}_${sectionSlug(section, period)}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

async function exportAllPNG(periods: PayPeriod[], company: string, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  for (const period of periods) {
    const folderName = `jobcost_${company.toLowerCase()}_${period.startDate}`
    const folder = zip.folder(folderName)!
    for (const section of period.sections) {
      const canvas = buildSectionCanvas(section, company, period, hasTeams, hourFormat)
      const slug   = sectionSlug(section, period)
      const base64 = canvas.toDataURL("image/png").replace("data:image/png;base64,", "")
      folder.file(`${slug}.png`, base64, { base64: true })
    }
  }

  const fileName = `jobcost_${company.toLowerCase()}_${periods[0]?.startDate ?? "export"}.zip`
  const blob = await zip.generateAsync({ type: "blob" })
  const link = document.createElement("a")
  link.download = fileName; link.href = URL.createObjectURL(blob); link.click()
  URL.revokeObjectURL(link.href)
}

// ─── XLSX export ──────────────────────────────────────────────────────────────

function exportXLSX(periods: PayPeriod[], company: string, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const rows: (string | number)[][] = []

  for (const period of periods) {
    rows.push([`${company}  ·  Pay Period Report  ·  ${fmtPeriod(period.startDate, period.endDate)}`])
    rows.push([""])
    for (const section of period.sections) {
      if (hasTeams && section.team) {
        const tot = section.members.reduce((s, e) => s + e.totalHours, 0)
        rows.push([section.team.name, "", fmtH(tot, hourFormat)])
      }
      for (const emp of section.members) {
        rows.push([emp.displayName, "", fmtH(emp.totalHours, hourFormat)])
        for (const j of emp.jobs)
          rows.push(["", j.path, fmtH(j.hours, hourFormat)])
      }
      rows.push([""])
    }
    rows.push([""])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 28 }, { wch: 72 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Pay Period")
  XLSX.writeFile(wb, `jobcost_${company.toLowerCase()}_${periods[0]?.startDate ?? "export"}.xlsx`)
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportPDF(periods: PayPeriod[], company: string, hasTeams: boolean, hourFormat: HourFormat = "number") {
  const win = window.open("", "_blank"); if (!win) return
  let html = `<!DOCTYPE html><html><head><title>${company} · Pay Period Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  body{background:#fff;padding:28px;color:#1a202c}
  .period-hdr{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #e2e8f0;padding-bottom:10px;margin:20px 0 14px}
  h1{font-size:15px;font-weight:700}
  .sub{font-size:11px;color:#64748b}
  .section{margin-bottom:18px;break-inside:avoid}
  .team-hdr{display:flex;justify-content:space-between;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:2px}
  .emp{border-bottom:1px solid #f0f4f8;padding:4px 0 2px}
  .emp-row{display:flex;justify-content:space-between;font-size:13px;font-weight:600;padding:2px 0}
  .job-row{display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:1px 0 1px 14px}
  .hours{color:#2e6be6;font-family:SFMono,Consolas,monospace}
  @media print{body{padding:12px}}
</style></head><body>`

  for (const period of periods) {
    html += `<div class="period-hdr"><h1>${company} — Pay Period Report</h1><span class="sub">${fmtPeriod(period.startDate, period.endDate)}</span></div>`
    for (const section of period.sections) {
      html += `<div class="section">`
      if (hasTeams && section.team) {
        const tot = section.members.reduce((s, e) => s + e.totalHours, 0)
        html += `<div class="team-hdr"><span>${section.team.name}</span><span class="hours">${fmtH(tot, hourFormat)}</span></div>`
      }
      for (const emp of section.members) {
        html += `<div class="emp"><div class="emp-row"><span>${emp.displayName}</span><span class="hours">${fmtH(emp.totalHours, hourFormat)}</span></div>`
        for (const j of emp.jobs)
          html += `<div class="job-row"><span>${j.path}</span><span class="hours">${fmtH(j.hours, hourFormat)}</span></div>`
        html += `</div>`
      }
      html += `</div>`
    }
  }

  html += `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),600)}</script></body></html>`
  win.document.write(html); win.document.close()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QBTimeJobCostingPage() {
  const [hourFormat,      setHourFormat]      = useState<HourFormat>(() => loadFmt(LS_FMT_JOBCOST))
  const [company,         setCompany]         = useState<CompanyId | "">("")
  const [step,            setStep]            = useState<"upload" | "results">("upload")
  const [allRows,         setAllRows]         = useState<ParsedRow[]>([])
  const [fileName,        setFileName]        = useState("")
  const [fileStart,       setFileStart]       = useState("")
  const [fileEnd,         setFileEnd]         = useState("")
  const [error,           setError]           = useState("")
  const [isDragging,      setIsDragging]      = useState(false)
  const [expandedTeamIdx, setExpandedTeamIdx] = useState<number | null>(null)
  const [addingTeam,      setAddingTeam]      = useState(false)
  const [newTeamName,     setNewTeamName]     = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: teamsData } = useQBTimeTeams(company || undefined)
  const createTeam = useCreateQBTimeTeam(company)
  const updateTeam = useUpdateQBTimeTeam(company)
  const deleteTeam = useDeleteQBTimeTeam(company)

  const companyTeams: Team[] = useMemo(
    () => (teamsData ?? []).map(t => ({ id: t.id, name: t.name, members: t.members })),
    [teamsData]
  )
  const hasTeams = companyTeams.length > 0

  // One file = one pay period
  const periods = useMemo<PayPeriod[]>(() => {
    if (allRows.length === 0) return []
    return [{
      startDate: fileStart,
      endDate:   fileEnd,
      sections:  buildSections(allRows, companyTeams),
    }]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, fileStart, fileEnd, companyTeams])

  // All employees across all periods (for the sidebar "available to add" list)
  const allEmployees = useMemo(() => buildEmployees(allRows), [allRows])

  // CSV processing
  function processFile(file: File) {
    setError("")
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string

        // Character-level splitter: handles newlines inside quoted fields
        const lines: string[] = []
        let current = "", inQuote = false
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]
          if (ch === '"') {
            if (text[i + 1] === '"') { current += '""'; i++; continue } // escaped ""
            inQuote = !inQuote; current += ch
          } else if ((ch === '\r' || ch === '\n') && !inQuote) {
            if (ch === '\r' && text[i + 1] === '\n') i++ // CRLF
            if (current.trim()) lines.push(current)
            current = ""
          } else {
            current += ch
          }
        }
        if (current.trim()) lines.push(current)

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim())

        const iUsername = headers.indexOf("username")
        const iFname    = headers.indexOf("fname")
        const iLname    = headers.indexOf("lname")
        const iDate     = headers.indexOf("local_date")
        const iHours    = headers.indexOf("hours")
        const iJC1      = headers.indexOf("jobcode_1")

        if (iUsername === -1 || iHours === -1 || iJC1 === -1) {
          setError("This doesn't look like a QBTime timesheet export."); return
        }

        const rows: ParsedRow[] = []
        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i])
          const jc1  = cols[iJC1]?.trim() ?? ""
          if (!jc1 || jc1.toLowerCase() === "lunch break") continue
          const hours = parseFloat(cols[iHours] ?? "0") || 0
          if (hours <= 0) continue

          const username = cols[iUsername]?.trim() ?? ""
          const fname    = cols[iFname]?.trim() ?? ""
          const lname    = cols[iLname]?.trim() ?? ""
          const name     = `${fname} ${lname}`.trim()
          const date     = cols[iDate]?.trim() ?? ""
          const jobPath  = buildJobPath(cols, iJC1)

          rows.push({ employeeKey: username, employeeName: name, jobPath, hours, date })
        }

        if (rows.length === 0) { setError("No data rows found."); return }

        const { startDate: sd, endDate: ed } = detectDates(file.name)
        const dc = detectCompany(file.name)

        setAllRows(rows)
        setFileName(file.name)
        setFileStart(sd || rows.reduce((mn, r) => r.date < mn ? r.date : mn, rows[0].date))
        setFileEnd(ed   || rows.reduce((mx, r) => r.date > mx ? r.date : mx, rows[0].date))
        if (dc && !company) setCompany(dc)
        setStep("results")
      } catch { setError("Failed to parse the file.") }
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files?.[0]; if (f) processFile(f)
  }
  function handleReset() {
    setStep("upload"); setAllRows([]); setFileName(""); setFileStart(""); setFileEnd(""); setError("")
  }

  // Team actions
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
    try { localStorage.setItem(LS_FMT_JOBCOST, hourFormat) } catch { /* */ }
  }, [hourFormat])

  const totalH    = allEmployees.reduce((s, e) => s + e.totalHours, 0)
  const _allPeriodSections = periods.flatMap(p => p.sections)

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">Pay Period</p>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Company */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Company</p>
            <div className="flex flex-col gap-1">
              {COMPANIES.map(c => (
                <button key={c.id} onClick={() => { setCompany(c.id); handleReset() }}
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

          {fileStart && fileEnd && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Period</p>
              <p className="text-xs font-medium">{fmtPeriod(fileStart, fileEnd)}</p>
            </div>
          )}
          {fileName && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">File</p>
              <p className="break-all text-[10px] text-muted-foreground">{fileName}</p>
            </div>
          )}

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
                  <p className="text-[11px] text-muted-foreground">Nenhuma equipe.</p>
                )}

                {companyTeams.map((team, ti) => {
                  const isOpen     = expandedTeamIdx === ti
                  const isDeleting = deleteTeam.isPending && deleteTeam.variables === team.id
                  const isUpdating = updateTeam.isPending && updateTeam.variables?.id === team.id
                  const isBusy     = isDeleting || isUpdating
                  const taken      = new Set(companyTeams.flatMap((t, i) => i !== ti ? t.members : []))
                  const avail      = allEmployees.map(e => e.displayName).filter(n => !taken.has(n) && !team.members.includes(n))
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
                              {allEmployees.length === 0 ? "Faça upload de um CSV primeiro." : "Todos já estão em equipes."}
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
                      placeholder="Nome da equipe…"
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

        {step === "results" && (
          <div className="border-t border-sidebar-border p-2">
            <Button variant="ghost" className="w-full gap-2 text-sm text-muted-foreground" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> New file
            </Button>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">

          {/* Upload */}
          {step === "upload" && (
            <div className="mx-auto max-w-lg">
              <div className="mb-4">
                <h1 className="text-xl font-semibold tracking-tight">Pay Period Report</h1>
                <p className="text-sm text-muted-foreground">Upload a QB Time Timesheet CSV export.</p>
              </div>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="mt-0.5 shrink-0">⚠</span>{error}
                </div>
              )}
              <div className="rounded-xl border border-border bg-card/60">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="font-semibold">Upload Timesheet Report</h2>
                  <p className="text-sm text-muted-foreground">QB Time → Reports → Timesheets → Export CSV</p>
                </div>
                <div className="p-5">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex cursor-pointer select-none flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
                      isDragging ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <FileText className={cn("h-5 w-5", isDragging ? "text-primary" : "text-muted-foreground/40")} />
                    <p className="text-xs font-medium text-muted-foreground">Drop the CSV here</p>
                    <p className="text-[11px] text-muted-foreground/60">Drag & drop or click to select</p>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileInput} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {step === "results" && (
            <div className="flex flex-col gap-5">

              {/* Top header */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Pay Period Report</h1>
                  <p className="text-sm text-muted-foreground">
                    {allEmployees.length} member{allEmployees.length !== 1 ? "s" : ""} · {fmtH(totalH, hourFormat)} total
                  </p>
                </div>
                <div className="flex items-end gap-4">
                  {/* Metric Mode toggle */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Metric Mode
                    </span>
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
                  {/* Divider */}
                  <div className="w-px self-stretch bg-border" />
                  {/* Export */}
                  <div className="flex shrink-0 flex-col items-start gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Export</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportXLSX(periods, company, hasTeams, hourFormat)}>
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportPDF(periods, company, hasTeams, hourFormat)}>
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportAllPNG(periods, company, hasTeams, hourFormat)}>
                        <ImageDown className="h-3.5 w-3.5" /> Export All as PNG
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pay period banner */}
              {periods[0] && (
                <div className="flex items-center gap-0 overflow-hidden rounded-xl border border-border bg-card/60">
                  <div className="flex flex-1 flex-col gap-0.5 border-r border-border px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pay Period</p>
                    <p className="text-base font-bold">{fmtPeriod(periods[0].startDate, periods[0].endDate)}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 border-r border-border px-5 py-4">
                    <p className="text-[10px] text-muted-foreground">Members</p>
                    <p className="text-base font-bold tabular-nums">{allEmployees.length}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 px-5 py-4">
                    <p className="text-[10px] text-muted-foreground">Total Hours</p>
                    <p className="text-base font-bold tabular-nums text-primary">{fmtH(totalH, hourFormat)}</p>
                  </div>
                </div>
              )}

              {/* Section cards */}
              <div className="flex flex-col gap-3">
                {periods[0]?.sections.map((section, si) => (
                  <SectionCard
                    key={si}
                    section={section}
                    company={company}
                    period={periods[0]}
                    hasTeams={hasTeams}
                    hourFormat={hourFormat}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ section, company, period, hasTeams, hourFormat }: {
  section: Section; company: string; period: PayPeriod; hasTeams: boolean; hourFormat: HourFormat
}) {
  const sectionTotal = section.members.reduce((s, e) => s + e.totalHours, 0)
  function handlePNG() { downloadSectionPNG(section, company, period, hasTeams, hourFormat) }

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
        <div
          key={emp.key}
          className={cn(ei < section.members.length - 1 && "border-b border-border/50")}
        >
          <div className="flex items-center gap-2 px-4 pb-1 pt-2.5">
            <span className="flex-1 text-sm font-semibold">{emp.displayName}</span>
            <span className="text-sm font-bold tabular-nums text-primary">{fmtH(emp.totalHours, hourFormat)}</span>
            {!hasTeams && (
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
            )}
          </div>
          <div className="pb-2.5">
            {emp.jobs.map((job, ji) => (
              <div key={ji} className="flex items-baseline gap-4 px-4 py-[3px] pl-7">
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">{job.path}</span>
                <span className="shrink-0 text-xs tabular-nums text-foreground/60">{fmtH(job.hours, hourFormat)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
