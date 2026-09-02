"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  wexCategorizationService,
  type WexIgnoredAddress,
} from "@/services/wex-categorization.service"
import { COMPANIES, COMPANY_LABEL } from "../_lib/wex-algorithm"
import type { Company, CompanyFilter } from "../_lib/wex-algorithm"
import { CompanyLogo } from "./company-logo"

export function IgnoredAddressesSheet({ open, onClose, initialCompany }: {
  open:           boolean
  onClose:        () => void
  initialCompany: CompanyFilter
}) {
  const [company, setCompany] = useState<Company>(initialCompany === "all" ? "framing" : initialCompany)
  const [entries, setEntries] = useState<WexIgnoredAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [newAddr, setNewAddr] = useState("")
  const [newNote, setNewNote] = useState("")

  useEffect(() => {
    if (open && initialCompany !== "all") setCompany(initialCompany)
  }, [open, initialCompany])

  useEffect(() => {
    if (!open) return
    setEntries([])
    setLoading(true)
    wexCategorizationService.listIgnoredAddresses(company)
      .then(data => setEntries(data ?? []))
      .catch(() => toast.error("Failed to load ignored addresses."))
      .finally(() => setLoading(false))
  }, [open, company])

  async function handleAdd() {
    if (!newAddr.trim()) { toast.error("Job code is required."); return }
    try {
      const entry = await wexCategorizationService.upsertIgnoredAddress({
        company, address: newAddr.trim(), note: newNote.trim(), isActive: true,
      })
      setEntries(prev => {
        const filtered = prev.filter(e => e.address !== newAddr.trim())
        return [...filtered, entry].sort((a, b) => a.address.localeCompare(b.address))
      })
      setNewAddr(""); setNewNote("")
      toast.success("Address added.")
    } catch { toast.error("Failed to add address.") }
  }

  async function handleDelete(id: number) {
    try {
      await wexCategorizationService.deleteIgnoredAddress(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      toast.success("Deleted.")
    } catch { toast.error("Failed to delete.") }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[85vh] flex-col gap-0 p-0" style={{ width: "fit-content", maxWidth: "92vw", minWidth: "34rem" }}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Ignored Addresses</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 no-scrollbar">
          {/* Company segmented control */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {COMPANIES.map(c => (
              <button key={c} onClick={() => setCompany(c)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  company === c
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                <CompanyLogo company={c} />
                {COMPANY_LABEL[c]}
              </button>
            ))}
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs text-muted-foreground">
              QB Time job codes listed here are excluded when splitting fuel costs.
              If a driver&apos;s only entries on a given day are ignored addresses, the
              transaction is marked as <span className="font-medium text-amber-600 dark:text-amber-400">Office</span>.
            </p>
          </div>

          {/* Add form */}
          <div className="rounded-xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Add Address</span>
              <span className="ml-2 text-xs text-muted-foreground">— exact QB Time job code to ignore</span>
            </div>
            <div className="flex items-end gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Job Code</span>
                <Input value={newAddr} onChange={e => setNewAddr(e.target.value)}
                  placeholder="e.g. Office Work"
                  className="h-8 w-52 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Note (optional)</span>
                <Input value={newNote} onChange={e => setNewNote(e.target.value)}
                  placeholder="e.g. Company HQ"
                  className="h-8 w-44 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <Button onClick={handleAdd} size="sm" className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" />Add
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card/60">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[11px] uppercase tracking-wide">Job Code</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Note</TableHead>
                  <TableHead className="w-14 text-right text-[11px] uppercase tracking-wide">Del</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && entries.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No ignored addresses for {COMPANY_LABEL[company]}.
                  </TableCell></TableRow>
                )}
                {entries.map(e => (
                  <TableRow key={e.id} className="border-border/50">
                    <TableCell className="text-sm font-medium">{e.address}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.note || <span className="italic opacity-40">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
