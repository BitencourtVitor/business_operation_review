"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownAZ, ArrowLeft, ArrowUpAZ, Check, ChevronDown, Loader2, MapPin, Search, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useBudgetCustomers } from "@/hooks/use-budget"
import { useClients, useJobSites } from "@/hooks/use-clients"
import { useProjectMappings, useSetProjectMapping } from "@/hooks/use-budget-mapping"
import type { ClientItem, JobSiteItem } from "@/services/clients.service"
import type { ProjectMapping } from "@/services/budget-mapping.service"
import type { BudgetCustomer } from "@/services/budget.service"
import { Segmented } from "../../components/Segmented"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac", label: "HVAC", logo: "/images/sublogo_hvac.png" },
  { value: "pcg", label: "PCG", logo: "/images/sublogo_pcg.png" },
]

// ── Token-based auto-detection (same algorithm as main budget page) ────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

type SiteMatch = { clientId: number; clientName: string; jobSiteId: number; siteName: string } | null

function bestJobSiteMatch(projectName: string, jobSites: JobSiteItem[], clients: ClientItem[]): SiteMatch {
  const pn = normalize(projectName)
  let best: { site: JobSiteItem; score: number } | null = null
  for (const site of jobSites) {
    const mainName = site.name.split(/ at /i)[0].trim()
    const tokens = normalize(mainName).split(" ").filter(t => t.length >= 3)
    if (!tokens.length) continue
    const hits = tokens.filter(t => pn.includes(t)).length
    const score = hits / tokens.length
    if (!best || score > best.score) best = { site, score }
  }
  if (!best || best.score < 0.6) return null
  const client = clients.find(c => c.id === best!.site.client_id)
  if (!client) return null
  return { clientId: client.id, clientName: client.name, jobSiteId: best.site.id, siteName: best.site.name }
}

// ── Client picker popover ─────────────────────────────────────────────────────

function ClientPicker({ value, clients, onChange }: {
  value: number | null
  clients: ClientItem[]
  onChange: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const selected = clients.find(c => c.id === value)
  const filtered = q ? clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase())) : clients

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQ("") }}>
      <PopoverTrigger className={cn(
        "flex h-7 min-w-0 max-w-[160px] items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs transition-colors hover:bg-muted/50 dark:bg-input/30",
        selected ? "text-foreground" : "text-muted-foreground"
      )}>
        <span className="flex-1 truncate text-left">{selected?.name ?? "Client…"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        <div className="flex items-center gap-1 border-b border-border/60 px-2 pb-1.5 pt-1">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
        </div>
        <div className="flex max-h-48 flex-col overflow-y-auto no-scrollbar py-1">
          {value !== null && (
            <button onClick={() => { onChange(null); setOpen(false) }}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          {filtered.map(c => (
            <button key={c.id} onClick={() => { onChange(c.id); setOpen(false) }}
              className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent", c.id === value && "font-medium text-primary")}>
              {c.id === value && <Check className="h-3 w-3 shrink-0" />}
              <span className={cn("truncate", c.id !== value && "ml-5")}>{c.name}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No results</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Job site picker popover ───────────────────────────────────────────────────

function JobSitePicker({ value, clientId, jobSites, onChange }: {
  value: number | null
  clientId: number | null
  jobSites: JobSiteItem[]
  onChange: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const options = clientId != null ? jobSites.filter(s => s.client_id === clientId) : jobSites
  const filtered = q ? options.filter(s => s.name.toLowerCase().includes(q.toLowerCase())) : options
  const selected = jobSites.find(s => s.id === value)

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQ("") }}>
      <PopoverTrigger disabled={clientId == null} className={cn(
        "flex h-7 min-w-0 max-w-[200px] items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs transition-colors hover:bg-muted/50 dark:bg-input/30 disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "text-foreground" : "text-muted-foreground"
      )}>
        <span className="flex-1 truncate text-left">{selected ? selected.name.split(/ at /i)[0] : "Job site…"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <div className="flex items-center gap-1 border-b border-border/60 px-2 pb-1.5 pt-1">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
        </div>
        <div className="flex max-h-48 flex-col overflow-y-auto no-scrollbar py-1">
          {value !== null && (
            <button onClick={() => { onChange(null); setOpen(false) }}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          {filtered.map(s => (
            <button key={s.id} onClick={() => { onChange(s.id); setOpen(false) }}
              className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent", s.id === value && "font-medium text-primary")}>
              {s.id === value && <Check className="h-3 w-3 shrink-0" />}
              <span className={cn("truncate", s.id !== value && "ml-5")}>{s.name.split(/ at /i)[0]}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">{options.length === 0 ? "No job sites for this client" : "No results"}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Project row ───────────────────────────────────────────────────────────────

function ProjectRow({ company, project, mapping, autoMatch, clients, jobSites, onSave, isSaving }: {
  company: string
  project: BudgetCustomer
  mapping: ProjectMapping | null
  autoMatch: SiteMatch
  clients: ClientItem[]
  jobSites: JobSiteItem[]
  onSave: (clientId: number | null, jobSiteId: number | null) => void
  isSaving: boolean
}) {
  const isManual = mapping != null && (mapping.client_id != null || mapping.job_site_id != null)

  const effectiveClientId = mapping?.client_id ?? autoMatch?.clientId ?? null
  const effectiveJobSiteId = mapping?.job_site_id ?? autoMatch?.jobSiteId ?? null

  const [clientId, setClientId] = useState<number | null>(effectiveClientId)
  const [jobSiteId, setJobSiteId] = useState<number | null>(effectiveJobSiteId)

  function handleClientChange(id: number | null) {
    setClientId(id)
    setJobSiteId(null)
    onSave(id, null)
  }

  function handleJobSiteChange(id: number | null) {
    setJobSiteId(id)
    onSave(clientId, id)
  }

  const source = isManual ? "manual" : autoMatch ? "auto" : null
  const clientHasSites = clientId != null && jobSites.some(s => s.client_id === clientId)

  return (
    <div className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/20">
      <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {source === "manual" && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Manual</span>
        )}
        {source === "auto" && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Auto</span>
        )}
        <ClientPicker value={clientId} clients={clients} onChange={handleClientChange} />
        {clientHasSites && (
          <JobSitePicker value={jobSiteId} clientId={clientId} jobSites={jobSites} onChange={handleJobSiteChange} />
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage =
    (!!user && ["dev", "owner", "admin"].includes(user.role)) ||
    myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState("framing")
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)

  const { data: projects = [], isLoading: projLoading } = useBudgetCustomers({ company })
  const { data: mappings = [], isLoading: mapLoading } = useProjectMappings(company)
  const { data: clients = [] } = useClients()
  const { data: jobSites = [] } = useJobSites()
  const setMapping = useSetProjectMapping()

  const mappingByCustomer = useMemo(() => {
    const m = new Map<string, ProjectMapping>()
    for (const mp of mappings) m.set(mp.customer_id, mp)
    return m
  }, [mappings])

  const autoMatchMap = useMemo(() => {
    const m = new Map<string, SiteMatch>()
    for (const p of projects) {
      m.set(p.customer_id, bestJobSiteMatch(p.name, jobSites, clients))
    }
    return m
  }, [projects, jobSites, clients])

  const filtered = useMemo(() => {
    let list = projects
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    if (onlyUnassigned) {
      list = list.filter(p => {
        const mp = mappingByCustomer.get(p.customer_id)
        const hasManual = mp != null && (mp.client_id != null || mp.job_site_id != null)
        const hasAuto = autoMatchMap.get(p.customer_id) != null
        return !hasManual && !hasAuto
      })
    }
    return [...list].sort((a, b) =>
      sortDir === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    )
  }, [projects, search, sortDir, onlyUnassigned, mappingByCustomer, autoMatchMap])

  const isLoading = projLoading || mapLoading

  const assigned = useMemo(() => projects.filter(p => {
    const mp = mappingByCustomer.get(p.customer_id)
    const hasManual = mp != null && (mp.client_id != null || mp.job_site_id != null)
    const hasAuto = autoMatchMap.get(p.customer_id) != null
    return hasManual || hasAuto
  }).length, [projects, mappingByCustomer, autoMatchMap])

  if (!canManage) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">You don&apos;t have permission to manage budget settings.</div>
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/budget-control/manage"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Project Assignment</h1>
            <p className="text-sm text-muted-foreground">Map each QuickBooks project to a client and job site</p>
          </div>
        </div>
        <Segmented
          label="Company"
          value={company}
          onChange={setCompany}
          options={COMPANIES.map(c => ({
            value: c.value,
            label: c.label,
            // eslint-disable-next-line @next/next/no-img-element
            icon: <img src={c.logo} alt="" className="h-3.5 w-3.5 object-contain" />,
          }))}
        />
      </div>

      {/* List container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        {/* List header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-xs font-medium text-muted-foreground">
            {isLoading ? "Loading…" : `${projects.length} projects · ${assigned} assigned`}
          </span>
          {/* Unassigned filter */}
          <button
            onClick={() => setOnlyUnassigned(v => !v)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
              onlyUnassigned
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Show unassigned only
          </button>
          {/* Search toggle */}
          {searchOpen ? (
            <div className="flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 dark:bg-input/30">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter projects…"
                className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                onKeyDown={e => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false) } }}
              />
              <button onClick={() => { setSearch(""); setSearchOpen(false) }} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Sort toggle */}
          <button
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {sortDir === "asc"
              ? <ArrowUpAZ className="h-3.5 w-3.5" />
              : <ArrowDownAZ className="h-3.5 w-3.5" />
            }
          </button>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {search ? "No projects match your search" : "No projects found"}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-border/30 overflow-y-auto no-scrollbar">
            {filtered.map(p => (
              <ProjectRow
                key={p.customer_id}
                company={company}
                project={p}
                mapping={mappingByCustomer.get(p.customer_id) ?? null}
                autoMatch={autoMatchMap.get(p.customer_id) ?? null}
                clients={clients}
                jobSites={jobSites}
                onSave={(clientId, jobSiteId) =>
                  setMapping.mutate({ company, customer_id: p.customer_id, client_id: clientId, job_site_id: jobSiteId })
                }
                isSaving={setMapping.isPending && setMapping.variables?.customer_id === p.customer_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
