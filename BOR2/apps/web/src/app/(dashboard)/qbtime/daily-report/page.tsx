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

interface ParsedRow  { employeeRaw: string; employeeDisplay: string; jobCode: string; totalHours: number }
interface EmpSummary { key: string; displayName: string; totalHours: number; rows: ParsedRow[] }
interface Team       { id: string; name: string; members: string[] }
interface Section    { team: Team | null; members: EmpSummary[] }

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
function detectCompany(n: string): CompanyId | "" {
  const l = n.toLowerCase()
  if (l.includes("hvac"))    return "HVAC"
  if (l.includes("pcg"))     return "PCG"
  if (l.includes("framing")) return "Framing"
  return ""
}
function detectDate(n: string): string { return n.match(/_(\d{4}-\d{2}-\d{2})_thru_/)?.[1] ?? "" }
function fmtName(raw: string): string {
  const i = raw.indexOf(","); if (i === -1) return raw.trim()
  const last = raw.slice(0, i).trim(), first = raw.slice(i+1).trim()
  return first ? `${first} ${last}` : last
}
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
function fmtDate(iso: string) {
  if (!iso) return ""
  const [y,m,d] = iso.split("-")
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+d}, ${y}`
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
    : section.members[0]?.displayName.toLowerCase().replace(/\s+/g, "-") ?? "export"
}

function buildSectionCanvas(section: Section, company: string, date: string, hasTeams: boolean): HTMLCanvasElement {
  // Always render in light mode regardless of user's system theme
  const dpr    = Math.min(window.devicePixelRatio||1, 2)
  const W      = 680, PX = 28, PY = 14
  const HDR_H  = 36   // header block — text vertically centered inside
  const NAME_H = 34   // employee name row
  const JOB_H  = 26   // each address row
  const TEAM_H = hasTeams ? 30 : 0

  let H = PY + HDR_H + TEAM_H
  for (const e of section.members) H += NAME_H + e.rows.length * JOB_H
  H += PY

  const canvas = document.createElement("canvas")
  canvas.width = W*dpr; canvas.height = H*dpr
  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)

  // Light palette — always
  const BG      = "#f1f4f9"
  const CARD    = "#ffffff"
  const T1      = "#1a202c"
  const T2      = "#64748b"
  const SEP_HD  = "#c8d3e0"  // header bottom & card border — most prominent
  const SEP_EMP = "#d4dce8"  // between employees
  const SEP_NM  = "#dde4ef"  // name → first address
  const SEP_JB  = "#eaeef5"  // between address rows — subtlest
  const PRI     = "#2e6be6"
  const SF      = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  const MN      = "SFMono,'Fira Code',Consolas,monospace"

  function hline(ly: number, lw: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(6, ly); ctx.lineTo(W-6, ly); ctx.stroke(); ctx.restore()
  }

  // Background + card
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = CARD
  roundRect(ctx, 6, 6, W-12, H-12, 10); ctx.fill()
  ctx.strokeStyle = SEP_HD; ctx.lineWidth = 1; ctx.stroke()

  let y = PY

  // ── Header — text vertically centered ──
  ctx.fillStyle = T2; ctx.font = `500 11px ${SF}`; ctx.textAlign = "left"
  ctx.fillText(`Premium Group  ·  ${company}  ·  ${fmtDate(date)}`, PX, y + HDR_H/2 + 4)
  y += HDR_H
  hline(y, 1.5, SEP_HD)

  // ── Team row (optional) ──
  if (hasTeams && section.team) {
    const tot = section.members.reduce((s,e) => s+e.totalHours, 0)
    ctx.fillStyle = T2; ctx.font = `700 10px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(section.team.name.toUpperCase(), PX, y + TEAM_H/2 + 4)
    ctx.fillStyle = T1; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(tot), W-PX, y + TEAM_H/2 + 4)
    ctx.textAlign = "left"; y += TEAM_H
    hline(y, 1.5, SEP_HD)
  }

  // ── Employees ──
  for (let ei = 0; ei < section.members.length; ei++) {
    const emp       = section.members[ei]
    const isLastEmp = ei === section.members.length - 1

    // Name row — vertically centered
    ctx.fillStyle = T1; ctx.font = `600 13px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(emp.displayName, PX, y + NAME_H/2 + 4)
    ctx.fillStyle = PRI; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(emp.totalHours), W-PX, y + NAME_H/2 + 4)
    ctx.textAlign = "left"; y += NAME_H

    // Separator: name → addresses
    hline(y, 1, SEP_NM)

    // Address rows
    for (let ji = 0; ji < emp.rows.length; ji++) {
      const row       = emp.rows[ji]
      const isLastJob = ji === emp.rows.length - 1

      let jc = row.jobCode.split(" >> ").join(" › ")
      ctx.font = `11px ${SF}`
      const maxW = W - PX - 10 - 14 - 62
      while (ctx.measureText(jc).width > maxW && jc.length > 10) jc = jc.slice(0,-4)+"…"
      ctx.fillStyle = T2; ctx.textAlign = "left"
      ctx.fillText(jc, PX+10, y + JOB_H/2 + 4)
      ctx.font = `11px ${MN}`; ctx.textAlign = "right"
      ctx.fillText(fmtH(row.totalHours), W-PX, y + JOB_H/2 + 4)
      ctx.textAlign = "left"; y += JOB_H

      // Line between addresses — but NOT after the last one
      if (!isLastJob) hline(y, 0.5, SEP_JB)
    }

    // Line between employees — but NOT after the last employee
    if (!isLastEmp) hline(y, 1, SEP_EMP)
  }

  return canvas
}

function downloadSectionPNG(section: Section, company: string, date: string, hasTeams: boolean) {
  const canvas = buildSectionCanvas(section, company, date, hasTeams)
  const link = document.createElement("a")
  link.download = `daily_${company.toLowerCase()}_${date}_${sectionSlug(section, hasTeams)}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

async function exportAllPNG(grouped: Section[], company: string, date: string, hasTeams: boolean) {
  const { default: JSZip } = await import("jszip")
  const folderName = `daily_${company.toLowerCase()}_${date}`
  const zip        = new JSZip()
  const folder     = zip.folder(folderName)!

  for (const section of grouped) {
    const canvas = buildSectionCanvas(section, company, date, hasTeams)
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

// ─── XLSX bulk export ─────────────────────────────────────────────────────────

function exportXLSX(grouped: Section[], company: string, date: string, hasTeams: boolean) {
  const rows: (string | number)[][] = []
  rows.push([`${company} · Daily Report · ${fmtDate(date)}`])
  rows.push([""])

  for (const section of grouped) {
    if (hasTeams && section.team) {
      const tot = section.members.reduce((s,e)=>s+e.totalHours,0)
      rows.push([section.team.name, "", "", +tot.toFixed(2)])
    }
    for (const emp of section.members) {
      rows.push([emp.displayName, "", "", +emp.totalHours.toFixed(2)])
      for (const r of emp.rows) {
        rows.push(["", r.jobCode.split(" >> ").join(" › "), "", +r.totalHours.toFixed(2)])
      }
    }
    rows.push([""])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 28 }, { wch: 58 }, { wch: 2 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Daily Report")
  XLSX.writeFile(wb, `daily_${company.toLowerCase()}_${date}.xlsx`)
}

// ─── PDF bulk export ──────────────────────────────────────────────────────────

function exportPDF(grouped: Section[], company: string, date: string, hasTeams: boolean) {
  const win = window.open("", "_blank"); if (!win) return
  let html = `<!DOCTYPE html><html><head><title>${company} · ${date}</title>
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
  .job-row{display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:1px 0 1px 14px}
  .hours{color:#2e6be6;font-family:SFMono,Consolas,monospace}
  .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center}
  @media print{body{padding:12px}}
</style></head><body>
<div class="hdr"><h1>${company} — Daily Report</h1><span class="sub">${fmtDate(date)}</span></div>`

  for (const section of grouped) {
    html += `<div class="section">`
    if (hasTeams && section.team) {
      const tot = section.members.reduce((s,e)=>s+e.totalHours,0)
      html += `<div class="team-hdr"><span>${section.team.name}</span><span class="hours">${fmtH(tot)}</span></div>`
    }
    for (const emp of section.members) {
      html += `<div class="emp"><div class="emp-row"><span>${emp.displayName}</span><span class="hours">${fmtH(emp.totalHours)}</span></div>`
      for (const r of emp.rows)
        html += `<div class="job-row"><span>${r.jobCode.split(" >> ").join(" › ")}</span><span class="hours">${fmtH(r.totalHours)}</span></div>`
      html += `</div>`
    }
    html += `</div>`
  }

  html += `<div class="footer">Premium Group · Business Operations Review</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),600)}<\/script></body></html>`
  win.document.write(html); win.document.close()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QBTimeDailyReportPage() {
  const [hourFormat,      setHourFormat]      = useState<HourFormat>(() => loadFmt(LS_FMT_DAILY))
  const [company,         setCompany]         = useState<CompanyId | "">("")
  const [step,            setStep]            = useState<"upload" | "results">("upload")
  const [parsedRows,      setParsedRows]      = useState<ParsedRow[]>([])
  const [fileName,        setFileName]        = useState("")
  const [date,            setDate]            = useState("")
  const [error,           setError]           = useState("")
  const [isDragging,      setIsDragging]      = useState(false)
  const [expandedTeamIdx, setExpandedTeamIdx] = useState<number | null>(null)
  const [addingTeam,      setAddingTeam]      = useState(false)
  const [newTeamName,     setNewTeamName]     = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: teamsData } = useQBTimeTeams(company || undefined)
  const createTeam  = useCreateQBTimeTeam(company)
  const updateTeam  = useUpdateQBTimeTeam(company)
  const deleteTeam  = useDeleteQBTimeTeam(company)

  // Group employees
  const employees = useMemo<EmpSummary[]>(() => {
    const map = new Map<string, EmpSummary>()
    for (const row of parsedRows) {
      if (!map.has(row.employeeRaw))
        map.set(row.employeeRaw, { key: row.employeeRaw, displayName: row.employeeDisplay, totalHours: 0, rows: [] })
      const e = map.get(row.employeeRaw)!
      e.totalHours += row.totalHours; e.rows.push(row)
    }
    return [...map.values()].sort((a,b) => b.totalHours - a.totalHours)
  }, [parsedRows])

  const companyTeams: Team[] = useMemo(() => (teamsData ?? []).map(t => ({ id: t.id, name: t.name, members: t.members })), [teamsData])
  const hasTeams = companyTeams.length > 0

  const grouped = useMemo<Section[]>(() => {
    if (!hasTeams) return employees.map(e => ({ team: null, members: [e] }))
    const assigned = new Set<string>()
    const sections = companyTeams.map(team => {
      const members = employees.filter(e => team.members.includes(e.displayName))
      members.forEach(m => assigned.add(m.key))
      return { team, members }
    }).filter(s => s.members.length > 0)
    const unassigned = employees.filter(e => !assigned.has(e.key))
    if (unassigned.length > 0)
      sections.push({ team: { id: "", name: "Unassigned", members: [] }, members: unassigned })
    return sections
  }, [employees, companyTeams, hasTeams])

  // CSV processing
  function processFile(file: File) {
    setError("")
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text  = e.target?.result as string
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        const hi    = lines.findIndex(l => /employee/i.test(l))
        if (hi === -1) { setError("Could not find a header row."); return }

        const headers = parseLine(lines[hi]).map(h => h.toLowerCase().replace(/\s+/g," ").trim())
        const idx     = (k: string) => headers.findIndex(h => h.includes(k))
        const colEmp  = idx("employee"), colReg = idx("regular hours"), colOT = idx("overtime x1.5 hours")
        if (colEmp === -1 || colReg === -1) { setError("Required columns not found."); return }

        const rows: ParsedRow[] = []
        for (let i = hi+1; i < lines.length; i++) {
          const cols = parseLine(lines[i])
          const emp  = cols[colEmp]?.trim() ?? ""
          if (!emp || emp === "0") continue
          const reg = parseFloat(cols[colReg] ?? "0") || 0
          const ot  = colOT !== -1 ? (parseFloat(cols[colOT] ?? "0") || 0) : 0
          rows.push({ employeeRaw: emp, employeeDisplay: fmtName(emp), jobCode: cols[0]?.trim() ?? "", totalHours: Math.round((reg+ot)*100)/100 })
        }
        if (rows.length === 0) { setError("No data rows found."); return }

        setParsedRows(rows); setFileName(file.name)
        const dd = detectDate(file.name), dc = detectCompany(file.name)
        if (dd) setDate(dd)
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
  function handleReset() { setStep("upload"); setParsedRows([]); setFileName(""); setDate(""); setError("") }

  function addTeamInline() {
    const name = newTeamName.trim()
    if (!name || companyTeams.some(t => t.name === name)) return
    createTeam.mutate({ name, members: [] })
    setNewTeamName(""); setAddingTeam(false)
  }
  function removeTeamInline(ti: number) {
    const team = companyTeams[ti]
    if (!team) return
    deleteTeam.mutate(team.id)
    if (expandedTeamIdx === ti) setExpandedTeamIdx(null)
  }
  function addMemberInline(ti: number, memberName: string) {
    const team = companyTeams[ti]
    if (!team) return
    updateTeam.mutate({ id: team.id, name: team.name, members: [...team.members, memberName] })
  }
  function removeMemberInline(ti: number, memberName: string) {
    const team = companyTeams[ti]
    if (!team) return
    updateTeam.mutate({ id: team.id, name: team.name, members: team.members.filter(m => m !== memberName) })
  }

  useEffect(() => {
    try { localStorage.setItem(LS_FMT_DAILY, hourFormat) } catch { /* */ }
  }, [hourFormat])

  const totalH = employees.reduce((s,e) => s+e.totalHours, 0)

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

          {date && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Date</p>
              <p className="text-xs font-medium">{fmtDate(date)}</p>
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

                {/* Header */}
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

                {/* Team list */}
                {companyTeams.map((team, ti) => {
                  const isOpen     = expandedTeamIdx === ti
                  const isDeleting = deleteTeam.isPending && deleteTeam.variables === team.id
                  const isUpdating = updateTeam.isPending && updateTeam.variables?.id === team.id
                  const isBusy     = isDeleting || isUpdating
                  const taken      = new Set(companyTeams.flatMap((t, i) => i !== ti ? t.members : []))
                  const avail      = employees.map(e => e.displayName).filter(n => !taken.has(n) && !team.members.includes(n))
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
                          {/* Current members */}
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

                          {/* Available to add */}
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
                              {employees.length === 0 ? "Faça upload de um CSV primeiro." : "Todos já estão em equipes."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* New team input */}
                {addingTeam && (
                  <div className="flex gap-1">
                    <input
                      autoFocus
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
                      {createTeam.isPending
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "Ok"
                      }
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
                <h1 className="text-xl font-semibold tracking-tight">Daily Report</h1>
                <p className="text-sm text-muted-foreground">Upload a QB Time Job Costing CSV.</p>
              </div>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="mt-0.5 shrink-0">⚠</span>{error}
                </div>
              )}
              <div className="rounded-xl border border-border bg-card/60">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="font-semibold">Upload Job Costing Report</h2>
                  <p className="text-sm text-muted-foreground">QB Time → Reports → Job Costing by Team Member → Export CSV</p>
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
            <div className="flex flex-col gap-4">

              {/* Header + metric mode + export buttons */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">{company} — {fmtDate(date)}</h1>
                  <p className="text-sm text-muted-foreground">
                    {employees.length} member{employees.length!==1?"s":""} · {fmtH(totalH, hourFormat)} total
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
                  {/* Export */}
                  <div className="flex shrink-0 flex-col items-start gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Export
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportXLSX(grouped, company, date, hasTeams)}>
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportPDF(grouped, company, date, hasTeams)}>
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                        onClick={() => exportAllPNG(grouped, company, date, hasTeams)}>
                        <ImageDown className="h-3.5 w-3.5" /> Export All as PNG
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div className="flex flex-col gap-3">
                {grouped.map((section, si) => (
                  <SectionCard
                    key={si}
                    section={section}
                    company={company}
                    date={date}
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

function SectionCard({ section, company, date, hasTeams, hourFormat }: {
  section: Section; company: string; date: string; hasTeams: boolean; hourFormat: HourFormat
}) {
  const sectionTotal = section.members.reduce((s,e)=>s+e.totalHours,0)
  function handlePNG() { downloadSectionPNG(section, company, date, hasTeams) }

  return (
    <div className="group rounded-xl border border-border bg-card/60 transition-colors hover:border-primary/50">

      {/* Team header — only in teams mode */}
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

      {/* Employees */}
      {section.members.map((emp, ei) => (
        <div
          key={emp.key}
          className={cn(ei < section.members.length-1 && "border-b border-border/50")}
        >
          {/* Employee name row */}
          <div className="flex items-center gap-2 px-4 pb-1 pt-2.5">
            <span className="flex-1 text-sm font-semibold">{emp.displayName}</span>
            <span className="text-sm font-bold tabular-nums text-primary">{fmtH(emp.totalHours, hourFormat)}</span>
            {/* Per-person download only when not using teams */}
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
          {/* Job rows */}
          <div className="pb-2.5">
            {emp.rows.map((row, ri) => (
              <div key={ri} className="flex items-baseline gap-4 px-4 py-[3px] pl-7">
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {row.jobCode.split(" >> ").join(" › ")}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-foreground/60">{fmtH(row.totalHours, hourFormat)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

