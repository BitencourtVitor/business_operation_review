"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = [
  { id: "HVAC",    logo: "/images/sublogo_hvac.png"    },
  { id: "PCG",     logo: "/images/sublogo_pcg.png"     },
  { id: "Framing", logo: "/images/sublogo_framing.png" },
] as const
type CompanyId = (typeof COMPANIES)[number]["id"]
const LS_TEAMS_KEY = "qbtime_teams_v1"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow   { employeeRaw: string; employeeDisplay: string; jobCode: string; totalHours: number }
interface EmpSummary  { key: string; displayName: string; totalHours: number; rows: ParsedRow[] }
interface Team        { name: string; members: string[] }
interface Section     { team: Team | null; members: EmpSummary[] }
type TeamsConfig = Record<string, Team[]>

// ─── LocalStorage ─────────────────────────────────────────────────────────────

function loadTeams(): TeamsConfig { try { const r = localStorage.getItem(LS_TEAMS_KEY); return r ? JSON.parse(r) : {} } catch { return {} } }
function saveTeams(c: TeamsConfig) { try { localStorage.setItem(LS_TEAMS_KEY, JSON.stringify(c)) } catch { /**/ } }

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
function fmtH(h: number) { return `${h.toFixed(2)}h` }
function fmtDate(iso: string) {
  if (!iso) return ""
  const [y,m,d] = iso.split("-")
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+d}, ${y}`
}
function isDarkMode() { return typeof document !== "undefined" && document.documentElement.classList.contains("dark") }

// ─── Canvas / PNG export ──────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

function downloadSectionPNG(
  section: Section,
  company: string,
  date: string,
  hasTeams: boolean,
) {
  const dark   = isDarkMode()
  const dpr    = Math.min(window.devicePixelRatio||1, 2)
  const W      = 680, PX = 28, PY = 20
  const EMP_H  = 26, JOB_H = 20, GAP_H = 8
  const HDR_H  = 36, TEAM_H = hasTeams ? 30 : 0

  let H = PY + HDR_H + TEAM_H
  for (const e of section.members) H += EMP_H + e.rows.length * JOB_H + GAP_H
  H += PY + 24 // footer

  const canvas = document.createElement("canvas")
  canvas.width = W*dpr; canvas.height = H*dpr
  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)

  const BG   = dark ? "#0b0b17" : "#f1f4f9"
  const CARD = dark ? "#16162a" : "#ffffff"
  const T1   = dark ? "#e2e8f0" : "#1a202c"
  const T2   = dark ? "#94a3b8" : "#64748b"
  const BD   = dark ? "#2d3748" : "#e2e8f0"
  const PRI  = "#2e6be6"
  const SF   = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  const MN   = "SFMono,'Fira Code',Consolas,monospace"

  // background
  ctx.fillStyle = BG; ctx.fillRect(0,0,W,H)

  // card
  ctx.fillStyle = CARD
  roundRect(ctx, PX-8, PY-8, W-2*(PX-8), H-2*(PY-8)+16, 12); ctx.fill()
  ctx.strokeStyle = BD; ctx.lineWidth = 1; ctx.stroke()

  let y = PY

  // header row
  ctx.fillStyle = T2; ctx.font = `11px ${SF}`; ctx.textAlign = "left"
  ctx.fillText(`Premium Group · ${company} · ${fmtDate(date)}`, PX, y+16)
  ctx.fillStyle = PRI; ctx.font = `600 11px ${SF}`; ctx.textAlign = "right"
  ctx.fillText("QBTime Daily Report", W-PX, y+16)
  y += HDR_H

  // divider
  ctx.strokeStyle = BD; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(PX, y); ctx.lineTo(W-PX, y); ctx.stroke()

  // team header
  if (hasTeams && section.team) {
    const tot = section.members.reduce((s,e)=>s+e.totalHours,0)
    ctx.fillStyle = T2; ctx.font = `700 10px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(section.team.name.toUpperCase(), PX, y+TEAM_H/2+4)
    ctx.fillStyle = T1; ctx.font = `700 12px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(tot), W-PX, y+TEAM_H/2+4)
    ctx.textAlign = "left"; y += TEAM_H
    ctx.strokeStyle = BD; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(PX,y); ctx.lineTo(W-PX,y); ctx.stroke()
  }

  for (let ei = 0; ei < section.members.length; ei++) {
    const emp = section.members[ei]
    // Employee row
    ctx.fillStyle = T1; ctx.font = `600 13px ${SF}`; ctx.textAlign = "left"
    ctx.fillText(emp.displayName, PX, y+EMP_H/2+4)
    ctx.fillStyle = PRI; ctx.font = `700 13px ${MN}`; ctx.textAlign = "right"
    ctx.fillText(fmtH(emp.totalHours), W-PX, y+EMP_H/2+4)
    ctx.textAlign = "left"; y += EMP_H
    // Job rows
    for (const row of emp.rows) {
      let jc = row.jobCode.split(" >> ").join(" › ")
      ctx.font = `11px ${SF}`
      const maxW = W - PX*2 - 24 - 60
      while (ctx.measureText(jc).width > maxW && jc.length > 10) jc = jc.slice(0,-4)+"…"
      ctx.fillStyle = T2; ctx.textAlign = "left"
      ctx.fillText(jc, PX+14, y+JOB_H/2+3)
      ctx.font = `11px ${MN}`; ctx.textAlign = "right"
      ctx.fillText(fmtH(row.totalHours), W-PX, y+JOB_H/2+3)
      ctx.textAlign = "left"; y += JOB_H
    }
    y += GAP_H
    // divider between employees (not after last)
    if (ei < section.members.length-1) {
      ctx.strokeStyle = dark ? "#1e2035" : "#f0f4f8"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PX, y-GAP_H/2); ctx.lineTo(W-PX, y-GAP_H/2); ctx.stroke()
    }
  }

  // footer
  ctx.fillStyle = T2; ctx.font = `10px ${SF}`; ctx.textAlign = "center"
  ctx.fillText("Premium Group · Business Operations Review", W/2, H-PY/2+6)

  const link = document.createElement("a")
  const slug = hasTeams && section.team
    ? section.team.name.toLowerCase().replace(/\s+/g,"-")
    : section.members[0]?.displayName.toLowerCase().replace(/\s+/g,"-") ?? "export"
  link.download = `daily_${company.toLowerCase()}_${date}_${slug}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
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
  const [company,    setCompany]    = useState<CompanyId | "">("")
  const [step,       setStep]       = useState<"upload" | "results">("upload")
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName,   setFileName]   = useState("")
  const [date,       setDate]       = useState("")
  const [error,      setError]      = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [teamsOpen,  setTeamsOpen]  = useState(false)
  const [teams,      setTeams]      = useState<TeamsConfig>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTeams(loadTeams()) }, [])

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

  const companyTeams: Team[] = useMemo(() => company ? (teams[company]??[]) : [], [teams, company])
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
      sections.push({ team: { name: "Unassigned", members: [] }, members: unassigned })
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

  function updateTeams(next: TeamsConfig) { setTeams(next); saveTeams(next) }

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
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Teams</p>
                  <button onClick={() => setTeamsOpen(true)} className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {companyTeams.length === 0
                  ? <p className="text-[11px] text-muted-foreground">No teams configured.</p>
                  : <div className="flex flex-col gap-0.5">
                      {companyTeams.map(t => (
                        <div key={t.name} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate">{t.name}</span>
                          <span className="shrink-0 text-[10px] tabular-nums">{t.members.length}</span>
                        </div>
                      ))}
                    </div>
                }
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

              {/* Header + export buttons */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">{company} — {fmtDate(date)}</h1>
                  <p className="text-sm text-muted-foreground">
                    {employees.length} member{employees.length!==1?"s":""} · {fmtH(totalH)} total
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                    onClick={() => exportXLSX(grouped, company, date, hasTeams)}>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                    onClick={() => exportPDF(grouped, company, date, hasTeams)}>
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </Button>
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
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Teams modal */}
      {teamsOpen && company && (
        <TeamsModal
          company={company}
          teams={teams}
          knownEmployees={employees.map(e => e.displayName)}
          onSave={next => { updateTeams(next); setTeamsOpen(false) }}
          onClose={() => setTeamsOpen(false)}
        />
      )}
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ section, company, date, hasTeams }: {
  section: Section; company: string; date: string; hasTeams: boolean
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
            <span className="text-xs font-bold tabular-nums">{fmtH(sectionTotal)}</span>
            <button onClick={handlePNG}
              className="invisible rounded p-0.5 text-muted-foreground transition-colors hover:text-primary group-hover:visible">
              <Download className="h-3.5 w-3.5" />
            </button>
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
            <span className="text-sm font-bold tabular-nums text-primary">{fmtH(emp.totalHours)}</span>
            {/* Per-person download only when not using teams */}
            {!hasTeams && (
              <button onClick={handlePNG}
                className="invisible rounded p-0.5 text-muted-foreground transition-colors hover:text-primary group-hover:visible">
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Job rows */}
          <div className="pb-2.5">
            {emp.rows.map((row, ri) => (
              <div key={ri} className="flex items-baseline gap-4 px-4 py-[3px] pl-7">
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {row.jobCode.split(" >> ").join(" › ")}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-foreground/60">{fmtH(row.totalHours)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TeamsModal ───────────────────────────────────────────────────────────────

function TeamsModal({ company, teams, knownEmployees, onSave, onClose }: {
  company: string; teams: TeamsConfig; knownEmployees: string[]
  onSave: (next: TeamsConfig) => void; onClose: () => void
}) {
  const [localTeams,   setLocalTeams]   = useState<Team[]>(() => (teams[company]??[]).map(t => ({ ...t, members: [...t.members] })))
  const [newTeamName,  setNewTeamName]  = useState("")

  function addTeam() {
    const name = newTeamName.trim()
    if (!name || localTeams.some(t => t.name===name)) return
    setLocalTeams(p => [...p, { name, members: [] }]); setNewTeamName("")
  }
  function removeTeam(i: number) { setLocalTeams(p => p.filter((_,j) => j!==i)) }
  function rename(i: number, name: string) { setLocalTeams(p => p.map((t,j) => j===i ? { ...t, name } : t)) }
  function toggle(ti: number, name: string) {
    setLocalTeams(p => p.map((t,i) => {
      if (i!==ti) return t
      return { ...t, members: t.members.includes(name) ? t.members.filter(m=>m!==name) : [...t.members, name] }
    }))
  }
  function removeMember(ti: number, name: string) { setLocalTeams(p => p.map((t,i) => i!==ti ? t : { ...t, members: t.members.filter(m=>m!==name) })) }
  function availableFor(ti: number) {
    const taken = new Set(localTeams.flatMap((t,i) => i!==ti ? t.members : []))
    return knownEmployees.filter(e => !taken.has(e))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Manage Teams — {company}</h2>
            <p className="text-sm text-muted-foreground">Assign employees to teams. Saved in your browser.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {localTeams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet. Add one below.</p>}

          {localTeams.map((team, ti) => {
            const avail = availableFor(ti).filter(n => !team.members.includes(n))
            return (
              <div key={ti} className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <input value={team.name} onChange={e => rename(ti, e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
                    placeholder="Team name…" />
                  <button onClick={() => removeTeam(ti)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="p-4">
                  {team.members.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {team.members.map(m => (
                        <span key={m} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {m}
                          <button onClick={() => removeMember(ti, m)} className="ml-0.5 hover:opacity-60"><X className="h-2.5 w-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {avail.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add members</p>
                      <div className="flex flex-wrap gap-1.5">
                        {avail.map(name => (
                          <button key={name} onClick={() => toggle(ti, name)}
                            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                            + {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {avail.length===0 && team.members.length===0 && (
                    <p className="text-xs text-muted-foreground">
                      {knownEmployees.length===0 ? "Upload a CSV first to see employees." : "All employees are assigned to other teams."}
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          <div className="flex gap-2">
            <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") addTeam() }}
              placeholder="New team name…"
              className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50" />
            <Button variant="outline" size="sm" onClick={addTeam} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...teams, [company]: localTeams })}>Save Teams</Button>
        </div>
      </div>
    </div>
  )
}
