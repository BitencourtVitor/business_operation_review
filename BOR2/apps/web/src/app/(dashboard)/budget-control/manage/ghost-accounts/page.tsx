"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Building2, Home, LandPlot, Check, Search, X, Ghost } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useGhostAccounts, useSetGhostAccount } from "@/hooks/use-budget-taxonomy"
import type { ProjectType } from "@/services/budget-taxonomy.service"
import { Segmented } from "../../components/Segmented"

const COMPANIES: { value: string; label: string; logo: string }[] = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac", label: "HVAC", logo: "/images/sublogo_hvac.png" },
  { value: "pcg", label: "PCG", logo: "/images/sublogo_pcg.png" },
]

export default function GhostAccountsPage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role)) || myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [projectType, setProjectType] = useState<ProjectType>("building")
  const [search, setSearch] = useState("")

  const { data: accounts, isLoading } = useGhostAccounts(company, projectType)
  const setGhost = useSetGhostAccount()

  if (!canManage) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">You don&apos;t have permission to manage budget settings.</div>
  }

  const rows = (accounts ?? []).filter(a => !search || a.account_name.toLowerCase().includes(search.toLowerCase()))
  const activeCount = (accounts ?? []).filter(a => a.active).length

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/budget-control/manage"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ghost Accounts</h1>
            <p className="text-sm text-muted-foreground">Accounts that always show up (budget-editable) on a project of this type, even before anything posts to QuickBooks</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
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
          <Segmented
            label="Project Type"
            value={projectType}
            onChange={setProjectType}
            options={[
              { value: "building", label: "Building", icon: <Building2 className="h-3.5 w-3.5" /> },
              { value: "lot", label: "Lot", icon: <LandPlot className="h-3.5 w-3.5" /> },
              { value: "private", label: "Private", icon: <Home className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <Ghost className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold leading-none">Accounts</span>
          <span className="text-xs leading-none text-muted-foreground">{activeCount} ghosted · {accounts?.length ?? 0} total</span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter accounts…"
              className="h-8 w-52 rounded-lg border border-input bg-transparent pl-7 pr-6 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No accounts found.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {rows.map(a => (
                <button
                  key={a.account_ref_id}
                  onClick={() => setGhost.mutate({ company, project_type: projectType, account_ref_id: a.account_ref_id, active: !a.active })}
                  disabled={setGhost.isPending}
                  className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                >
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    a.active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {a.active && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="text-sm">{a.account_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
