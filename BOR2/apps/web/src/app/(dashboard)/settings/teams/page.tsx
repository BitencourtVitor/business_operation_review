"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import {
  useQBTimeEmployeeTeams,
  useSetQBTimeEmployeeTeamOverride,
  useClearQBTimeEmployeeTeamOverride,
  useSyncQBTimeEmployeeTeams,
} from "@/hooks/use-qbtime-employee-teams"
import type { QBTimeEmployeeTeam } from "@bor2/shared"
import { ArrowLeft, Loader2, RefreshCw, RotateCcw, ShieldAlert, Users2 } from "lucide-react"
import { cn } from "@/lib/utils"

const COMPANIES = ["Framing", "PCG", "HVAC"] as const
type Company = (typeof COMPANIES)[number]

// ─── One employee row ───────────────────────────────────────────────────────

function EmployeeRow({
  employee,
  isLast,
  onSetOverride,
  onClearOverride,
  savingId,
}: {
  employee: QBTimeEmployeeTeam
  isLast: boolean
  onSetOverride: (id: string, teamName: string) => void
  onClearOverride: (id: string) => void
  savingId: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(employee.overrideTeamName ?? employee.qbTeamName ?? "")
  const isSaving = savingId === employee.id

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSetOverride(employee.id, trimmed)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3",
        !isLast && "border-b border-border/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{employee.employeeName}</p>
        <p className="text-xs text-muted-foreground">
          QB Time: {employee.qbTeamName ?? "Unassigned"}
        </p>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
            placeholder="Team name"
            className="w-40 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={handleSave}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {employee.isOverridden ? (
            <span
              title={`Overridden by ${employee.overriddenBy ?? "unknown"} — diverges from QB Time`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
            >
              <ShieldAlert className="h-3 w-3" />
              Override: {employee.overrideTeamName}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {employee.effectiveTeamName}
            </span>
          )}

          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button
                onClick={() => { setValue(employee.overrideTeamName ?? employee.qbTeamName ?? ""); setEditing(true) }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
              >
                Override
              </button>
              {employee.isOverridden && (
                <button
                  onClick={() => onClearOverride(employee.id)}
                  title="Revert to QB Time value"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamsSettingsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [company, setCompany] = useState<Company>("Framing")
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data: employees = [], isLoading } = useQBTimeEmployeeTeams(company.toLowerCase())
  const setOverride   = useSetQBTimeEmployeeTeamOverride(company.toLowerCase())
  const clearOverride = useClearQBTimeEmployeeTeamOverride(company.toLowerCase())
  const sync           = useSyncQBTimeEmployeeTeams(company.toLowerCase())

  if (authLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (user && !["dev", "owner", "manager"].includes(user.role)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">Only administrators can manage teams.</p>
        </div>
      </div>
    )
  }

  async function handleSetOverride(id: string, teamName: string) {
    setSavingId(id)
    await setOverride.mutateAsync({ id, teamName })
    setSavingId(null)
  }

  async function handleClearOverride(id: string) {
    setSavingId(id)
    await clearOverride.mutateAsync(id)
    setSavingId(null)
  }

  const overriddenCount = employees.filter(e => e.isOverridden).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Team Management</h1>
          <p className="text-sm text-muted-foreground">
            Teams sync daily from QB Time Groups. Override an employee&apos;s team to correct it manually —
            overrides are flagged as a divergence from QuickBooks and never get silently reverted by the sync.
          </p>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {sync.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />
          }
          Sync now
        </button>
      </div>

      {/* Company tabs */}
      <div className="flex gap-2">
        {COMPANIES.map(c => (
          <button
            key={c}
            onClick={() => setCompany(c)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              company === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {overriddenCount > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {overriddenCount} employee{overriddenCount === 1 ? "" : "s"} currently diverging from QB Time via manual override.
        </p>
      )}

      {/* Employee list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No employees synced yet for {company}. Click &quot;Sync now&quot; to pull from QB Time.
          </p>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
          {employees.map((e, i) => (
            <EmployeeRow
              key={e.id}
              employee={e}
              isLast={i === employees.length - 1}
              onSetOverride={handleSetOverride}
              onClearOverride={handleClearOverride}
              savingId={savingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
