"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Search, Ban, Loader2, CircleDollarSign } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { usePeriodAddresses } from "@/hooks/use-qbtime-period-report"
import { periodReportService, type PeriodAddress } from "@/services/qbtime-period-report.service"

export function UnpaidAddressesModal({
  company, open, onOpenChange,
}: {
  company: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: addresses, isLoading } = usePeriodAddresses(company, open)
  const [search, setSearch] = useState("")
  const [pending, setPending] = useState<string | null>(null)

  const addressesKey = ["qbtime-period-report", "addresses", company]

  async function toggle(address: string, unpaid: boolean) {
    setPending(address)
    // optimistic
    qc.setQueryData<PeriodAddress[]>(addressesKey, prev =>
      prev?.map(a => (a.address === address ? { ...a, unpaid } : a)),
    )
    try {
      await periodReportService.setUnpaidAddress(company, address, unpaid)
    } catch {
      qc.setQueryData<PeriodAddress[]>(addressesKey, prev =>
        prev?.map(a => (a.address === address ? { ...a, unpaid: !unpaid } : a)),
      )
    } finally {
      setPending(null)
      // refresh the report so the new paid/unpaid state is reflected
      qc.invalidateQueries({ queryKey: ["qbtime-period-report", "intervals", company] })
    }
  }

  const { unpaid, paid } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (addresses ?? []).filter(a => !q || a.address.toLowerCase().includes(q))
    return {
      unpaid: list.filter(a => a.unpaid),
      paid:   list.filter(a => !a.unpaid),
    }
  }, [addresses, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-3xl flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle>Paid / Unpaid addresses</DialogTitle>
          <DialogDescription>
            Move an address to <span className="font-medium text-foreground">Unpaid</span> to exclude its hours
            from paid totals in the Intervals view — overriding what QuickBooks Time reports.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search addresses…"
            className="pl-8"
          />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {/* Unpaid group */}
            <Section
              title="Unpaid"
              count={unpaid.length}
              icon={<Ban className="h-3.5 w-3.5 text-amber-500" />}
              emptyHint="No addresses marked unpaid yet."
            >
              {unpaid.map(a => (
                <AddressRow
                  key={a.address}
                  address={a.address}
                  tone="unpaid"
                  busy={pending === a.address}
                  actionLabel="Mark paid"
                  actionIcon={<CircleDollarSign className="h-3.5 w-3.5" />}
                  onAction={() => toggle(a.address, false)}
                />
              ))}
            </Section>

            {/* Paid group */}
            <Section
              title="Paid"
              count={paid.length}
              icon={<CircleDollarSign className="h-3.5 w-3.5 text-emerald-500" />}
              emptyHint={search ? "No matches." : "No addresses found for this company."}
            >
              {paid.map(a => (
                <AddressRow
                  key={a.address}
                  address={a.address}
                  tone="paid"
                  busy={pending === a.address}
                  actionLabel="Mark unpaid"
                  actionIcon={<Ban className="h-3.5 w-3.5" />}
                  onAction={() => toggle(a.address, true)}
                />
              ))}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title, count, icon, emptyHint, children,
}: {
  title: string
  count: number
  icon: React.ReactNode
  emptyHint: string
  children: React.ReactNode[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-0.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground/60">{count}</span>
      </div>
      {children.length === 0 ? (
        <p className="px-0.5 py-1 text-xs text-muted-foreground/70">{emptyHint}</p>
      ) : (
        <div className="flex flex-col gap-1">{children}</div>
      )}
    </div>
  )
}

function AddressRow({
  address, tone, busy, actionLabel, actionIcon, onAction,
}: {
  address: string
  tone: "paid" | "unpaid"
  busy: boolean
  actionLabel: string
  actionIcon: React.ReactNode
  onAction: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
        tone === "unpaid" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/30",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs" title={address}>{address}</span>
      <button
        onClick={onAction}
        disabled={busy}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
          tone === "unpaid"
            ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionIcon}
        {actionLabel}
      </button>
    </div>
  )
}
