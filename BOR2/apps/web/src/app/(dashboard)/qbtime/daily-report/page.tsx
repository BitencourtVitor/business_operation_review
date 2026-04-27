"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { FileUp, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react"
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

interface ParsedRow {
  employeeRaw:     string
  employeeDisplay: string
  jobCode:         string
  totalHours:      number
}

interface EmployeeSummary {
  key:         string
  displayName: string
  totalHours:  number
  rows:        ParsedRow[]
}

interface Team {
  name:    string
  members: string[] // exact employeeDisplay values
}

type TeamsConfig = Record<string, Team[]> // company → teams

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadTeams(): TeamsConfig {
  try {
    const raw = localStorage.getItem(LS_TEAMS_KEY)
    return raw ? (JSON.parse(raw) as TeamsConfig) : {}
  } catch { return {} }
}

function saveTeams(cfg: TeamsConfig) {
  try { localStorage.setItem(LS_TEAMS_KEY, JSON.stringify(cfg)) } catch { /* */ }
}

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++ } else { inQ = false } }
      else { field += ch }
    } else if (ch === '"') { inQ = true }
    else if (ch === ',') { fields.push(field.trim()); field = "" }
    else { field += ch }
  }
  fields.push(field.trim())
  return fields
}

function detectCompany(filename: string): CompanyId | "" {
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

function fmtH(h: number): string {
  return `${h.toFixed(2)}h`
}

function formatDate(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`
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

  // ── Group by employee ──────────────────────────────────────────────────────

  const employees = useMemo<EmployeeSummary[]>(() => {
    const map = new Map<string, EmployeeSummary>()
    for (const row of parsedRows) {
      if (!map.has(row.employeeRaw)) {
        map.set(row.employeeRaw, { key: row.employeeRaw, displayName: row.employeeDisplay, totalHours: 0, rows: [] })
      }
      const emp = map.get(row.employeeRaw)!
      emp.totalHours += row.totalHours
      emp.rows.push(row)
    }
    return [...map.values()].sort((a, b) => b.totalHours - a.totalHours)
  }, [parsedRows])

  // ── Team grouping ──────────────────────────────────────────────────────────

  const companyTeams: Team[] = useMemo(() =>
    company ? (teams[company] ?? []) : [],
  [teams, company])

  const grouped = useMemo(() => {
    if (companyTeams.length === 0) {
      return [{ team: null as Team | null, members: employees }]
    }
    const assigned = new Set<string>()
    const sections = companyTeams.map(team => {
      const members = employees.filter(e => team.members.includes(e.displayName))
      members.forEach(m => assigned.add(m.key))
      return { team, members }
    }).filter(s => s.members.length > 0)

    const unassigned = employees.filter(e => !assigned.has(e.key))
    if (unassigned.length > 0) {
      sections.push({ team: { name: "Unassigned", members: [] }, members: unassigned })
    }
    return sections
  }, [employees, companyTeams])

  // ── CSV processing ─────────────────────────────────────────────────────────

  function processFile(file: File) {
    setError("")
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text  = e.target?.result as string
        const lines = text.split(/\r?\n/).filter(l => l.trim())

        const headerIdx = lines.findIndex(l => /employee/i.test(l))
        if (headerIdx === -1) {
          setError("Could not find a header row. Make sure this is a QB Time Job Costing CSV.")
          return
        }

        const headers   = parseCsvLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/\s+/g, " ").trim())
        const idxOf     = (key: string) => headers.findIndex(h => h.includes(key))
        const colEmp    = idxOf("employee")
        const colRegH   = idxOf("regular hours")
        const colOtH    = idxOf("overtime x1.5 hours")

        if (colEmp === -1 || colRegH === -1) {
          setError("Required columns not found. Make sure this is a QB Time Job Costing CSV.")
          return
        }

        const rows: ParsedRow[] = []
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i])
          const emp  = cols[colEmp]?.trim() ?? ""
          if (!emp || emp === "0") continue
          const reg = parseFloat(cols[colRegH]  ?? "0") || 0
          const ot  = colOtH !== -1 ? (parseFloat(cols[colOtH] ?? "0") || 0) : 0
          const jc  = cols[0]?.trim() ?? ""
          rows.push({
            employeeRaw:     emp,
            employeeDisplay: formatEmployeeName(emp),
            jobCode:         jc,
            totalHours:      Math.round((reg + ot) * 100) / 100,
          })
        }

        if (rows.length === 0) { setError("No data rows found after parsing."); return }

        const det = detectDate(file.name)
        const dc  = detectCompany(file.name)
        setParsedRows(rows)
        setFileName(file.name)
        if (det) setDate(det)
        if (dc && !company) setCompany(dc)
        setStep("results")
      } catch {
        setError("Failed to parse the file.")
      }
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) processFile(file); e.target.value = ""
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]; if (file) processFile(file)
  }
  function handleReset() {
    setStep("upload"); setParsedRows([]); setFileName(""); setDate(""); setError("")
  }

  // ── Team persistence ───────────────────────────────────────────────────────

  function updateTeams(next: TeamsConfig) {
    setTeams(next); saveTeams(next)
  }

  const totalH = employees.reduce((s, e) => s + e.totalHours, 0)

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

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Company selector with logos */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Company
            </p>
            <div className="flex flex-col gap-1">
              {COMPANIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCompany(c.id); handleReset() }}
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

          {/* Date & file (after upload) */}
          {date && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Date</p>
              <p className="text-xs font-medium">{formatDate(date)}</p>
            </div>
          )}
          {fileName && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">File</p>
              <p className="break-all text-[10px] text-muted-foreground">{fileName}</p>
            </div>
          )}

          {/* Teams shortcut */}
          {company && (
            <>
              <div className="-mx-4 h-px bg-sidebar-border" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Teams</p>
                  <button
                    onClick={() => setTeamsOpen(true)}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {companyTeams.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No teams configured.</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {companyTeams.map(t => (
                      <div key={t.name} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{t.name}</span>
                        <span className="shrink-0 tabular-nums text-[10px]">{t.members.length}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === "results" && (
          <div className="border-t border-sidebar-border p-2">
            <Button variant="ghost" className="w-full gap-2 text-sm text-muted-foreground" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              New file
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
                <p className="text-sm text-muted-foreground">
                  Upload a QB Time Job Costing CSV to view hours by team member.
                </p>
              </div>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="mt-0.5 shrink-0">⚠</span>{error}
                </div>
              )}
              <div className="rounded-xl border border-border bg-card/60">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="font-semibold">Upload Job Costing Report</h2>
                  <p className="text-sm text-muted-foreground">
                    QB Time → Reports → Job Costing by Team Member → Export CSV
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
                      isDragging ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <FileUp className={cn("h-5 w-5", isDragging ? "text-primary" : "text-muted-foreground/40")} />
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

              {/* Page header */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {company} — {formatDate(date)}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {employees.length} member{employees.length !== 1 ? "s" : ""} · {fmtH(totalH)} total
                  </p>
                </div>
              </div>

              {/* Single container */}
              <div className="overflow-hidden rounded-xl border border-border bg-card/60">
                {grouped.map((section, si) => (
                  <div key={si}>
                    {/* Team header (only when teams configured) */}
                    {companyTeams.length > 0 && (
                      <div className={cn(
                        "flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2",
                        si > 0 && "border-t border-border",
                      )}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {section.team?.name}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {section.members.length} · {fmtH(section.members.reduce((s, e) => s + e.totalHours, 0))}
                        </span>
                      </div>
                    )}

                    {/* Employees in this section */}
                    {section.members.map((emp, ei) => (
                      <EmployeeRows
                        key={emp.key}
                        emp={emp}
                        isLast={si === grouped.length - 1 && ei === section.members.length - 1}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Teams Modal ── */}
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

// ─── EmployeeRows ─────────────────────────────────────────────────────────────

function EmployeeRows({ emp, isLast }: { emp: EmployeeSummary; isLast: boolean }) {
  return (
    <div className={cn(!isLast && "border-b border-border/40")}>
      {/* Employee header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm font-semibold">{emp.displayName}</span>
        <span className="text-sm font-bold tabular-nums text-primary">{fmtH(emp.totalHours)}</span>
      </div>
      {/* Job rows */}
      {emp.rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start justify-between gap-4 px-4 py-1.5 pl-7",
            i < emp.rows.length - 1 && "border-b border-border/20",
          )}
        >
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {row.jobCode.split(" >> ").join(" › ")}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-foreground/70">{fmtH(row.totalHours)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── TeamsModal ───────────────────────────────────────────────────────────────

function TeamsModal({ company, teams, knownEmployees, onSave, onClose }: {
  company: string
  teams: TeamsConfig
  knownEmployees: string[]
  onSave: (next: TeamsConfig) => void
  onClose: () => void
}) {
  const [localTeams, setLocalTeams] = useState<Team[]>(() =>
    (teams[company] ?? []).map(t => ({ ...t, members: [...t.members] }))
  )
  const [newTeamName, setNewTeamName] = useState("")

  function addTeam() {
    const name = newTeamName.trim()
    if (!name || localTeams.some(t => t.name === name)) return
    setLocalTeams(prev => [...prev, { name, members: [] }])
    setNewTeamName("")
  }

  function removeTeam(idx: number) {
    setLocalTeams(prev => prev.filter((_, i) => i !== idx))
  }

  function renameTeam(idx: number, name: string) {
    setLocalTeams(prev => prev.map((t, i) => i === idx ? { ...t, name } : t))
  }

  function toggleMember(teamIdx: number, name: string) {
    setLocalTeams(prev => prev.map((t, i) => {
      if (i !== teamIdx) return t
      const has = t.members.includes(name)
      return { ...t, members: has ? t.members.filter(m => m !== name) : [...t.members, name] }
    }))
  }

  function removeMember(teamIdx: number, name: string) {
    setLocalTeams(prev => prev.map((t, i) =>
      i === teamIdx ? { ...t, members: t.members.filter(m => m !== name) } : t
    ))
  }

  function handleSave() {
    onSave({ ...teams, [company]: localTeams })
  }

  // Available employees per team = knownEmployees not in OTHER teams
  function availableFor(teamIdx: number): string[] {
    const takenElsewhere = new Set(
      localTeams.flatMap((t, i) => i !== teamIdx ? t.members : [])
    )
    return knownEmployees.filter(e => !takenElsewhere.has(e))
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Manage Teams — {company}</h2>
            <p className="text-sm text-muted-foreground">
              Assign exact employee names to teams. Saved in your browser.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-6">

          {localTeams.length === 0 && (
            <p className="text-sm text-muted-foreground">No teams yet. Add one below.</p>
          )}

          {localTeams.map((team, ti) => {
            const available = availableFor(ti)
            return (
              <div key={ti} className="rounded-xl border border-border bg-muted/20 overflow-hidden">

                {/* Team header */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <input
                    value={team.name}
                    onChange={e => renameTeam(ti, e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
                    placeholder="Team name…"
                  />
                  <button onClick={() => removeTeam(ti)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="p-4">
                  {/* Current members */}
                  {team.members.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {team.members.map(m => (
                        <span key={m} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {m}
                          <button onClick={() => removeMember(ti, m)} className="ml-0.5 rounded-full hover:text-primary/60">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add from available */}
                  {available.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add members</p>
                      <div className="flex flex-wrap gap-1.5">
                        {available.filter(n => !team.members.includes(n)).map(name => (
                          <button
                            key={name}
                            onClick={() => toggleMember(ti, name)}
                            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            + {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {available.filter(n => !team.members.includes(n)).length === 0 && team.members.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {knownEmployees.length === 0
                        ? "Upload a CSV first to see employees."
                        : "All employees are already assigned to other teams."}
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add team */}
          <div className="flex gap-2">
            <input
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTeam() }}
              placeholder="New team name…"
              className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
            <Button variant="outline" size="sm" onClick={addTeam} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Teams</Button>
        </div>
      </div>
    </div>
  )
}
