"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft, Check, X, Loader2, Search, ChevronRight, Lock, Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import {
  qbtimeMappingService,
  type MappingQueueItem,
  type MappingSuggestion,
} from "@/services/qbtime-mapping.service"

const COMPANIES = [
  { value: "framing", label: "Framing" },
  { value: "hvac",    label: "HVAC" },
  { value: "pcg",     label: "PCG" },
] as const

export default function LaborMappingPage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage =
    (!!user && ["dev", "owner", "admin"].includes(user.role)) ||
    myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [items, setItems] = useState<MappingQueueItem[]>([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<MappingSuggestion | null>(null)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["qbtime-mapping-queue", company],
    queryFn: () => qbtimeMappingService.queue(company),
  })

  // Drive the one-at-a-time flow off a local copy so accept/skip can splice.
  useEffect(() => { if (data) setItems(data) }, [data])

  const current = items[0] ?? null

  // Default the target to the strongest suggestion of the current address.
  useEffect(() => {
    setSelected(current?.suggestions?.[0] ?? null)
    setSearch("")
  }, [current?.address_key])

  const { data: searchResults } = useQuery({
    queryKey: ["qbtime-mapping-customers", company, search],
    queryFn: () => qbtimeMappingService.customers(company, search),
    enabled: search.trim().length >= 2,
  })

  const advance = () => setItems(prev => prev.slice(1))

  async function accept() {
    if (!current || !selected || busy) return
    setBusy(true)
    try {
      await qbtimeMappingService.accept({
        company, address_key: current.address_key, customer_id: selected.customer_id,
      })
      advance()
    } finally { setBusy(false) }
  }

  async function skip() {
    if (!current || busy) return
    setBusy(true)
    try {
      await qbtimeMappingService.skip({ company, address_key: current.address_key })
      advance()
    } finally { setBusy(false) }
  }

  const crumbs = useMemo(
    () => (current?.address_key ?? "").split(" › ").filter(Boolean),
    [current?.address_key],
  )

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
            Bridge each QB Time address to its QuickBooks Online project — one at a time
          </p>
        </div>
        {/* Company selector */}
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

      {/* Progress */}
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{items.length}</span> addresses left to decide
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/60">
          <Check className="h-8 w-8 text-emerald-500" />
          <p className="text-sm">All addresses for {company} are decided.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">

          {/* ── QB Time side ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-4 md:w-[40%]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">QuickBooks Time</span>
              {current.is_private && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-500">
                  <Lock className="h-2.5 w-2.5" /> private
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground/60">{current.blocks} blocks</span>
            </div>
            <div className="flex flex-col gap-1">
              {crumbs.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5" style={{ paddingLeft: `${i * 14}px` }}>
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />}
                  <span className={cn("text-sm", i === crumbs.length - 1 ? "font-semibold" : "text-muted-foreground")}>{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── QBO side: suggestion + alternates + manual search ─────────── */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">QuickBooks Online — suggested project</span>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {(search.trim().length >= 2 ? (searchResults ?? []) : current.suggestions).map(s => {
                const active = selected?.customer_id === s.customer_id
                return (
                  <button key={s.customer_id} onClick={() => setSelected(s)}
                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      active ? "border-primary/50 bg-primary/5" : "border-border/40 hover:bg-muted/30")}>
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{s.name}</span>
                    {s.score > 0 && (
                      <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums",
                        s.score >= 0.7 ? "bg-emerald-500/10 text-emerald-500"
                        : s.score >= 0.4 ? "bg-amber-500/10 text-amber-500"
                        : "bg-muted text-muted-foreground")}>
                        {Math.round(s.score * 100)}%
                      </span>
                    )}
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })}
              {search.trim().length >= 2 && (searchResults ?? []).length === 0 && (
                <p className="px-1 py-2 text-[11px] italic text-muted-foreground/50">No matches.</p>
              )}
            </div>

            {/* Manual search */}
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search another QBO project…"
                className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30" />
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={skip} disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                <X className="h-4 w-4" /> Skip
              </button>
              <button onClick={accept} disabled={busy || !selected}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
