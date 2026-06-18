"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft, Check, X, Loader2, Search, ChevronRight, Lock, Building2, Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import {
  qbtimeMappingService,
  type JobsiteGroup,
  type MappingSuggestion,
} from "@/services/qbtime-mapping.service"

const COMPANIES = [
  { value: "framing", label: "Framing" },
  { value: "hvac",    label: "HVAC" },
  { value: "pcg",     label: "PCG" },
] as const

const STOP = new Set(["at", "the", "of", "and", "new", "inc", "llc", "ms"])

function lastSegment(s: string): string {
  const parts = s.split(":")
  return (parts[parts.length - 1] ?? s).trim()
}

function wordTokens(s: string): Set<string> {
  const out = new Set<string>()
  for (const m of s.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    if (m[0].length >= 2 && !STOP.has(m[0])) out.add(m[0])
  }
  return out
}

function Highlight({ text, tokens }: { text: string; tokens: Set<string> }) {
  return (
    <>
      {text.split(/([a-zA-Z0-9]+)/).map((p, i) =>
        tokens.has(p.toLowerCase())
          ? <span key={i} className="text-emerald-500">{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </>
  )
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
      on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
      {on && <Check className="h-3 w-3" />}
    </span>
  )
}

function scoreBadge(score: number) {
  if (score <= 0) return null
  return (
    <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums",
      score >= 0.7 ? "bg-emerald-500/10 text-emerald-500"
      : score >= 0.4 ? "bg-amber-500/10 text-amber-500"
      : "bg-muted text-muted-foreground")}>
      {Math.round(score * 100)}%
    </span>
  )
}

export default function LaborMappingPage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage =
    (!!user && ["dev", "owner", "admin"].includes(user.role)) ||
    myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [groups, setGroups] = useState<JobsiteGroup[]>([])
  const [targets, setTargets] = useState<Record<string, MappingSuggestion | undefined>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [editSearch, setEditSearch] = useState("")
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["qbtime-mapping-jobsites", company],
    queryFn: () => qbtimeMappingService.jobsites(company),
  })

  useEffect(() => {
    if (!data) return
    setGroups(data)
    const t: Record<string, MappingSuggestion | undefined> = {}
    const c = new Set<string>()
    for (const g of data) for (const lot of g.lots) {
      t[lot.address_key] = lot.suggestion ?? undefined
      if (lot.suggestion) c.add(lot.address_key)
    }
    setTargets(t)
    setChecked(c)
    setEditing(null)
  }, [data])

  const { data: editResults } = useQuery({
    queryKey: ["qbtime-mapping-customers", company, editSearch],
    queryFn: () => qbtimeMappingService.customers(company, editSearch),
    enabled: !!editing && editSearch.trim().length >= 2,
  })

  const byClient = useMemo(() => {
    const m = new Map<string, JobsiteGroup[]>()
    for (const g of groups) {
      if (!m.has(g.client)) m.set(g.client, [])
      m.get(g.client)!.push(g)
    }
    return [...m.entries()]
  }, [groups])

  const totalLots = useMemo(() => groups.reduce((n, g) => n + g.lots.length, 0), [groups])
  const selectableCount = useMemo(() => [...checked].filter(k => targets[k]).length, [checked, targets])

  function toggle(key: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function setGroupChecked(g: JobsiteGroup, on: boolean) {
    setChecked(prev => {
      const next = new Set(prev)
      for (const lot of g.lots) {
        if (on && targets[lot.address_key]) next.add(lot.address_key)
        else next.delete(lot.address_key)
      }
      return next
    })
  }
  function pick(key: string, s: MappingSuggestion) {
    setTargets(prev => ({ ...prev, [key]: s }))
    setChecked(prev => new Set(prev).add(key))
    setEditing(null)
  }
  function removeKeys(keys: Set<string>) {
    setGroups(prev => prev
      .map(g => ({ ...g, lots: g.lots.filter(l => !keys.has(l.address_key)) }))
      .filter(g => g.lots.length > 0))
  }

  async function acceptKeys(keys: string[]) {
    if (busy) return
    const valid = keys.filter(k => targets[k])
    if (valid.length === 0) return
    setBusy(true)
    try {
      await Promise.all(valid.map(k =>
        qbtimeMappingService.accept({ company, address_key: k, customer_id: targets[k]!.customer_id })))
      removeKeys(new Set(valid))
      setChecked(prev => { const n = new Set(prev); valid.forEach(k => n.delete(k)); return n })
    } finally { setBusy(false) }
  }

  async function skipRow(key: string) {
    if (busy) return
    setBusy(true)
    try {
      await qbtimeMappingService.skip({ company, address_key: key })
      removeKeys(new Set([key]))
    } finally { setBusy(false) }
  }

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You don&apos;t have permission to manage budget settings.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
        <Link href="/budget-control/manage"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-8 w-px bg-border" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Labor Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Confirm a whole job site at once — lots auto-match the QBO development by number
          </p>
        </div>
        <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
          {COMPANIES.map(c => (
            <button key={c.value} onClick={() => setCompany(c.value)}
              className={cn("flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
                company === c.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{totalLots}</span> addresses left ·
        <span className="font-semibold text-primary">{selectableCount}</span> selected
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : totalLots === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/60">
          <Check className="h-8 w-8 text-emerald-500" />
          <p className="text-sm">All addresses for {company} are decided.</p>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {byClient.map(([client, clientGroups]) => (
              <div key={client} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{client}</span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {clientGroups.reduce((n, g) => n + g.lots.length, 0)} addresses
                  </span>
                </div>

                {clientGroups.map(g => {
                  const liveMatched = g.lots.filter(l => targets[l.address_key]).length
                  const allOn = liveMatched > 0 && g.lots.every(l => checked.has(l.address_key) || !targets[l.address_key])
                  return (
                    <div key={g.jobsite} className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
                      {/* Job-site header — confirms the whole development */}
                      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2">
                        <button onClick={() => setGroupChecked(g, !allOn)} disabled={liveMatched === 0} className="disabled:opacity-30">
                          <Box on={allOn} />
                        </button>
                        <span className="text-[11px] font-semibold">{g.jobsite}</span>
                        {g.suggested_qbo && (
                          <>
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                            <span className="truncate text-[11px] text-emerald-500/90">{g.suggested_qbo}</span>
                          </>
                        )}
                        <span className={cn("ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums",
                          liveMatched === g.lots.length ? "bg-emerald-500/10 text-emerald-500"
                          : liveMatched > 0 ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground")}>
                          {liveMatched}/{g.lots.length} matched
                        </span>
                        <button onClick={() => acceptKeys(g.lots.map(l => l.address_key).filter(k => checked.has(k)))}
                          disabled={busy || !g.lots.some(l => checked.has(l.address_key) && targets[l.address_key])}
                          className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30">
                          Accept group
                        </button>
                      </div>

                      {/* Lot rows */}
                      {g.lots.map(lot => {
                        const t = targets[lot.address_key]
                        const on = checked.has(lot.address_key)
                        const tokens = wordTokens(lot.address_key)
                        const isEditing = editing === lot.address_key
                        const list = (editSearch.trim().length >= 2 ? (editResults ?? []) : (lot.suggestion ? [lot.suggestion] : []))
                        return (
                          <div key={lot.address_key} className="border-b border-border/20 last:border-b-0">
                            <div className="flex items-center gap-2 px-3 py-1.5">
                              <button onClick={() => toggle(lot.address_key)} disabled={!t} className="disabled:opacity-30">
                                <Box on={on} />
                              </button>
                              <span className="w-24 shrink-0 truncate text-[12px] font-medium" title={lot.address_key}>{lot.lot}</span>
                              {lot.is_private && <Lock className="h-3 w-3 shrink-0 text-amber-500/70" />}
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                              {t ? (
                                <span className="min-w-0 flex-1 truncate text-[12px]" title={t.name}>
                                  <Highlight text={lastSegment(t.name)} tokens={tokens} />
                                </span>
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-[12px] italic text-muted-foreground/50">pick a project…</span>
                              )}
                              {t && scoreBadge(t.score)}
                              <button onClick={() => { setEditing(isEditing ? null : lot.address_key); setEditSearch("") }}
                                className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => skipRow(lot.address_key)} disabled={busy}
                                className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-40">
                                <X className="h-3 w-3" />
                              </button>
                            </div>

                            {isEditing && (
                              <div className="flex flex-col gap-1.5 border-t border-border/20 bg-background/40 p-2 pl-8">
                                <div className="relative">
                                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                  <input autoFocus value={editSearch} onChange={e => setEditSearch(e.target.value)}
                                    placeholder="Search another QBO project…"
                                    className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-[11px] outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
                                </div>
                                {list.map(s => (
                                  <button key={s.customer_id} onClick={() => pick(lot.address_key, s)}
                                    className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                                      t?.customer_id === s.customer_id ? "border-primary/50 bg-primary/5" : "border-border/40 hover:bg-muted/30")}>
                                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                    <span className="min-w-0 flex-1 truncate text-[11px]" title={s.name}>
                                      <Highlight text={lastSegment(s.name)} tokens={tokens} />
                                    </span>
                                    {scoreBadge(s.score)}
                                  </button>
                                ))}
                                {editSearch.trim().length >= 2 && (editResults ?? []).length === 0 && (
                                  <p className="px-1 py-1 text-[11px] italic text-muted-foreground/50">No matches.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Batch action bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">{selectableCount}</span> mappings ready to accept
            </span>
            <button onClick={() => acceptKeys([...checked])} disabled={busy || selectableCount === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept {selectableCount} selected
            </button>
          </div>
        </>
      )}
    </div>
  )
}
