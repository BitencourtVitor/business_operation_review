"use client"

import { useEffect, useState } from "react"
import { Pencil, Plus, Trash2, X } from "lucide-react"
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
  type WexNormEntry,
} from "@/services/wex-categorization.service"
import { COMPANIES, COMPANY_LABEL } from "../_lib/wex-algorithm"
import type { Company, CompanyFilter } from "../_lib/wex-algorithm"
import { CompanyLogo } from "./company-logo"

export function SettingsSheet({ open, onClose, initialCompany }: {
  open:           boolean
  onClose:        () => void
  initialCompany: CompanyFilter
}) {
  const [company, setCompany] = useState<Company>(initialCompany === "all" ? "framing" : initialCompany)
  const [entries, setEntries] = useState<WexNormEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [newId,   setNewId]   = useState("")
  const [newWex,  setNewWex]  = useState("")
  const [newQb,   setNewQb]   = useState("")
  const [editId,  setEditId]  = useState<number | null>(null)
  const [editWex, setEditWex] = useState("")
  const [editQb,  setEditQb]  = useState("")

  useEffect(() => {
    if (open && initialCompany !== "all") setCompany(initialCompany)
  }, [open, initialCompany])

  useEffect(() => {
    if (!open) return
    setEntries([])
    setLoading(true)
    wexCategorizationService.listNorm(company)
      .then(data => setEntries(data ?? []))
      .catch(() => toast.error("Failed to load driver mappings."))
      .finally(() => setLoading(false))
  }, [open, company])

  async function handleAdd() {
    if (!newId.trim() || !newQb.trim()) { toast.error("Driver ID and QB Name are required."); return }
    const driverId = newId.trim().padStart(4, "0")
    try {
      const entry = await wexCategorizationService.upsertNorm({ company, driverId, wexName: newWex.trim(), qbName: newQb.trim(), isActive: true })
      setEntries(prev => {
        const filtered = prev.filter(e => e.driverId !== driverId)
        return [...filtered, entry].sort((a, b) => a.driverId.localeCompare(b.driverId))
      })
      setNewId(""); setNewWex(""); setNewQb("")
      toast.success("Entry saved.")
    } catch { toast.error("Failed to save entry.") }
  }

  async function handleDelete(id: number) {
    try {
      await wexCategorizationService.deleteNorm(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      toast.success("Deleted.")
    } catch { toast.error("Failed to delete entry.") }
  }

  function startEdit(e: WexNormEntry) {
    setEditId(e.id); setEditWex(e.wexName ?? ""); setEditQb(e.qbName)
  }

  async function handleSaveEdit() {
    if (editId === null) return
    const entry = entries.find(e => e.id === editId)
    if (!entry) return
    try {
      const updated = await wexCategorizationService.updateNorm(editId, {
        company: entry.company, driverId: entry.driverId,
        wexName: editWex.trim(), qbName: editQb.trim(), isActive: entry.isActive,
      })
      setEntries(prev => prev.map(e => e.id === editId ? updated : e))
      setEditId(null)
      toast.success("Saved.")
    } catch { toast.error("Failed to update entry.") }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[85vh] flex-col gap-0 p-0" style={{ width: "fit-content", maxWidth: "92vw", minWidth: "32rem" }}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Driver Mapping</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 no-scrollbar">
          {/* Company segmented control */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {COMPANIES.map(c => (
              <button key={c} onClick={() => { setCompany(c); setEditId(null) }}
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

          {/* Add form */}
          <div className="rounded-xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Add Entry</span>
              <span className="ml-2 text-xs text-muted-foreground">— map Driver ID → QB Time name</span>
            </div>
            <div className="flex items-end gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Driver ID</span>
                <Input value={newId} onChange={e => setNewId(e.target.value)} placeholder="e.g. 6712"
                  className="h-8 w-24 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">WEX Name</span>
                <Input value={newWex} onChange={e => setNewWex(e.target.value)} placeholder="e.g. Jose Honorio"
                  className="h-8 w-36 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">QB Time Name</span>
                <Input value={newQb} onChange={e => setNewQb(e.target.value)} placeholder="e.g. JOSE NETO"
                  className="h-8 w-36 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
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
                  <TableHead className="w-24 text-[11px] uppercase tracking-wide">Driver ID</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">WEX Name</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">QB Time Name</TableHead>
                  <TableHead className="w-20 text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && entries.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No entries yet for {COMPANY_LABEL[company]}.
                  </TableCell></TableRow>
                )}
                {entries.map(e => editId === e.id ? (
                  <TableRow key={e.id} className="bg-primary/5">
                    <TableCell><span className="font-mono font-bold text-primary">{e.driverId}</span></TableCell>
                    <TableCell><Input value={editWex} onChange={ev => setEditWex(ev.target.value)} className="h-7 text-xs" /></TableCell>
                    <TableCell><Input value={editQb}  onChange={ev => setEditQb(ev.target.value)}  className="h-7 text-xs" /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}>Save</Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={e.id} className="border-border/50">
                    <TableCell className="font-mono font-bold text-primary">{e.driverId}</TableCell>
                    <TableCell className="text-sm">{e.wexName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className={cn("text-sm", (e.qbName === "Sem QB Time" || e.qbName === "-") ? "text-destructive" : "font-medium")}>
                      {e.qbName}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
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
