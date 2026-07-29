"use client"

import { useEffect, useMemo, useState } from "react"
import {
  useQBTimeEmployeeTeams,
  useSetQBTimeEmployeeTeamOverride,
  useClearQBTimeEmployeeTeamOverride,
  useSyncQBTimeEmployeeTeams,
} from "@/hooks/use-qbtime-employee-teams"
import type { QBTimeEmployeeTeam } from "@bor2/shared"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CompanyLogo } from "@/components/common/company-logo"
import { COMPANIES, COMPANY_LABEL, type Company } from "@/lib/company"
import { Loader2, Network, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── One employee row ───────────────────────────────────────────────────────

function EmployeeRow({
  employee,
  isLast,
  availableTeams,
  onSetOverride,
  onClearOverride,
  savingId,
}: {
  employee: QBTimeEmployeeTeam
  isLast: boolean
  availableTeams: string[]
  onSetOverride: (id: string, teamName: string) => void
  onClearOverride: (id: string) => void
  savingId: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(employee.overrideTeamName ?? employee.qbTeamName ?? availableTeams[0] ?? "")
  const isSaving = savingId === employee.id

  function handleSave() {
    if (!value) return
    onSetOverride(employee.id, value)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3",
        !isLast && "border-b border-border/30",
      )}
    >
      {/* Person */}
      <div className="w-40 shrink-0 truncate text-sm font-medium">{employee.employeeName}</div>

      {/* QB Time's own team — always shown, source of truth */}
      <div className="w-40 shrink-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">QuickBooks</p>
        <p className="truncate text-sm">{employee.qbTeamName ?? "Unassigned"}</p>
      </div>

      {/* Our system's value — only rendered distinctly when it diverges */}
      <div className="min-w-0 flex-1">
        {employee.isOverridden ? (
          <>
            <p className="text-[10px] uppercase tracking-wide text-amber-600/80 dark:text-amber-400/80">Our system (override)</p>
            <span
              title={`Overridden by ${employee.overriddenBy ?? "unknown"} — diverges from QuickBooks`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
            >
              <ShieldAlert className="h-3 w-3" />
              {employee.overrideTeamName}
            </span>
          </>
        ) : (
          <p className="text-xs text-muted-foreground/50">Matches QuickBooks — no override</p>
        )}
      </div>

      {editing ? (
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={value}
            onValueChange={next => setValue(next ?? "")}
          >
            <SelectTrigger
              autoFocus
              className="h-8 w-52 bg-muted/30 text-xs"
              onKeyDown={e => { if (e.key === "Escape") setEditing(false) }}
            >
              <SelectValue placeholder="No teams yet" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="min-w-52">
              {availableTeams.map(t => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={handleSave}
            disabled={!value}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      ) : isSaving ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { setValue(employee.overrideTeamName ?? employee.qbTeamName ?? availableTeams[0] ?? ""); setEditing(true) }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            Override
          </button>
          {employee.isOverridden && (
            <button
              type="button"
              onClick={() => onClearOverride(employee.id)}
              title="Revert to QuickBooks value"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function TeamsModal({
  open,
  onClose,
  defaultCompany = "framing",
}: {
  open: boolean
  onClose: () => void
  /** Company the modal opens scoped to — pass the caller's own selected company so
   *  "Manage Teams" shortcuts from other reports land on the right tab. */
  defaultCompany?: Company
}) {
  const [company, setCompany]   = useState<Company>(defaultCompany)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Re-sync to the caller's company every time the modal is (re)opened, so a
  // shortcut from e.g. the HVAC Who's Working report always lands on HVAC.
  useEffect(() => {
    if (open) setCompany(defaultCompany)
  }, [open, defaultCompany])

  const { data: employees = [], isLoading } = useQBTimeEmployeeTeams(company)
  const setOverride   = useSetQBTimeEmployeeTeamOverride(company)
  const clearOverride = useClearQBTimeEmployeeTeamOverride(company)
  const sync           = useSyncQBTimeEmployeeTeams(company)

  const availableTeams = useMemo(() => {
    const names = new Set<string>()
    for (const e of employees) {
      if (e.qbTeamName) names.add(e.qbTeamName)
      if (e.overrideTeamName) names.add(e.overrideTeamName)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [employees])

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
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-[1040px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-5 py-4">
          <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
          <DialogTitle className="flex-1 text-base">Team Management</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Company segmented control */}
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {COMPANIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCompany(c)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    company === c
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CompanyLogo company={c} />
                  {COMPANY_LABEL[c]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {sync.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />
              }
              Sync now
            </button>
          </div>

          {overriddenCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {overriddenCount} employee{overriddenCount === 1 ? "" : "s"} currently diverging from QuickBooks via manual override.
            </p>
          )}
        </div>

        {/* Employee list */}
        <div className="overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Network className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No employees synced yet for {COMPANY_LABEL[company]}. Click &quot;Sync now&quot; to pull from QuickBooks.
              </p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
              {employees.map((e, i) => (
                <EmployeeRow
                  key={e.id}
                  employee={e}
                  isLast={i === employees.length - 1}
                  availableTeams={availableTeams}
                  onSetOverride={handleSetOverride}
                  onClearOverride={handleClearOverride}
                  savingId={savingId}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
