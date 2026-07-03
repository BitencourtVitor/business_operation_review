"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Bookmark, Plus, Trash2, Search, X } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { usePresetAccounts, useSetPresetAccount } from "@/hooks/use-budget-taxonomy"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Segmented } from "../../components/Segmented"

const COMPANIES: { value: string; label: string; logo: string }[] = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac", label: "HVAC", logo: "/images/sublogo_hvac.png" },
  { value: "pcg", label: "PCG", logo: "/images/sublogo_pcg.png" },
]

function AddPresetButton({ company, existingIDs }: { company: string; existingIDs: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const { data: options } = usePresetAccounts(company)
  const setPreset = useSetPresetAccount()

  const available = (options ?? [])
    .filter(o => !existingIDs.has(o.account_ref_id))
    .filter(o => !search || o.account_name.toLowerCase().includes(search.toLowerCase()))

  function add(accountRefID: string) {
    setPreset.mutate({ company, account_ref_id: accountRefID, active: true }, {
      onSuccess: () => { setOpen(false); setSearch("") },
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
        <Plus className="h-3.5 w-3.5" /> Add
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-72 p-0">
        <div className="border-b border-border/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…" autoFocus
              className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 dark:bg-input/30" />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {available.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No matching accounts</p>
          ) : available.map(o => (
            <button key={o.account_ref_id} onClick={() => add(o.account_ref_id)} disabled={setPreset.isPending}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50">
              {o.account_name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function PresetAccountsPage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role)) || myPerms?.permissions?.budget_control === "write"

  const [company, setCompany] = useState<string>("framing")
  const [search, setSearch] = useState("")

  const { data: options, isLoading } = usePresetAccounts(company)
  const setPreset = useSetPresetAccount()

  if (!canManage) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">You don&apos;t have permission to manage budget settings.</div>
  }

  const cataloged = (options ?? [])
    .filter(o => o.cataloged)
    .filter(o => !search || o.account_name.toLowerCase().includes(search.toLowerCase()))

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
            <h1 className="text-xl font-semibold tracking-tight">Preset Accounts</h1>
            <p className="text-sm text-muted-foreground">Accounts with precedent elsewhere — pickable to pre-budget a project before anything posts to QuickBooks</p>
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
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold leading-none">Accounts</span>
          <span className="text-xs leading-none text-muted-foreground">{cataloged.length}</span>
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
          <AddPresetButton company={company} existingIDs={new Set((options ?? []).filter(o => o.cataloged).map(o => o.account_ref_id))} />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : cataloged.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No preset accounts yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {cataloged.map(o => (
                <div key={o.account_ref_id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm" title={o.account_name}>{o.account_name}</span>
                  <button onClick={() => setPreset.mutate({ company, account_ref_id: o.account_ref_id, active: false })}
                    disabled={setPreset.isPending}
                    title="Remove from preset accounts"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
