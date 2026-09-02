"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronRight, Tag, Clock, Gauge, Bookmark } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useBudgetSettings, useSetBudgetSettings } from "@/hooks/use-budget-taxonomy"

const COMPANY_LOGO: Record<string, string> = {
  framing: "/images/sublogo_framing.png",
  pcg: "/images/sublogo_pcg.png",
  hvac: "/images/sublogo_hvac.png",
}

function ToleranceRow({ company, label }: { company: string; label: string }) {
  const { data: settings } = useBudgetSettings(company)
  const setSettings = useSetBudgetSettings()
  const [draft, setDraft] = useState("")
  useEffect(() => { if (settings) setDraft(String(settings.variability_pct)) }, [settings])
  return (
    <div className="flex items-center gap-3 border-b border-border/30 px-4 py-2.5 last:border-b-0">
      {COMPANY_LOGO[company] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={COMPANY_LOGO[company]} alt={label} className="h-4 w-4 shrink-0 object-contain" />
      )}
      <span className="flex-1 text-sm">{label}</span>
      <div className="relative w-24">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">±</span>
        <input
          value={draft}
          inputMode="decimal"
          onChange={e => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={() => {
            const v = draft === "" ? 0 : Number(draft)
            if (settings && v !== settings.variability_pct) setSettings.mutate({ company, variability_pct: v })
          }}
          className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-7 text-right text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring dark:bg-input/30"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">%</span>
      </div>
    </div>
  )
}

export default function BudgetManagePage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage =
    (!!user && ["dev", "owner", "admin"].includes(user.role)) ||
    myPerms?.permissions?.budget_control === "write"

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You don&apos;t have permission to manage budget settings.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/bor/budget-control"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-8 w-px bg-border" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Budget Control</h1>
          <p className="text-sm text-muted-foreground">Management settings</p>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
        <Link
          href="/bor/budget-control/manage/categories"
          className="group flex items-center gap-4 border-b border-border/30 px-4 py-3 transition-colors hover:bg-muted/70"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
            <Tag className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Category Assignment</p>
            <p className="text-xs text-muted-foreground">
              Define categories per project type and assign subcontractors (POs)
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>

        <Link
          href="/bor/budget-control/manage/labor-mapping"
          className="group flex items-center gap-4 border-b border-border/30 px-4 py-3 transition-colors hover:bg-muted/70"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Labor Mapping</p>
            <p className="text-xs text-muted-foreground">
              Bridge QB Time addresses to QuickBooks projects (initial setup)
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>

        <Link
          href="/bor/budget-control/manage/preset-accounts"
          className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
            <Bookmark className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Preset Accounts</p>
            <p className="text-xs text-muted-foreground">
              Accounts with precedent elsewhere, pickable to pre-budget a project before anything posts to QuickBooks
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
        <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 text-muted-foreground">
            <Gauge className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Spend vs receive tolerance</p>
            <p className="text-xs text-muted-foreground">
              Allowed gap between cost progress and income progress before a project is flagged over/under spending
            </p>
          </div>
        </div>
        <ToleranceRow company="framing" label="Framing" />
        <ToleranceRow company="pcg" label="PCG" />
        <ToleranceRow company="hvac" label="HVAC" />
      </div>
    </div>
  )
}
