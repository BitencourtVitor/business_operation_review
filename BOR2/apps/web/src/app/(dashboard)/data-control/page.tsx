"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import {
  useCreateForecast,
  useDeleteForecast,
  useForecast,
  useUpdateForecast,
} from "@/hooks/use-forecast"
import type { Company, ForecastProject, ForecastStatus } from "@bor2/shared"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES: Company[] = ["hvac", "framing", "pcg"]
const STATUSES: ForecastStatus[] = ["planned", "active", "completed", "cancelled"]

const STATUS_BADGE: Record<ForecastStatus, string> = {
  planned: "secondary",
  active: "default",
  completed: "outline",
  cancelled: "destructive",
}

function fmtDate(val: string) {
  if (!val) return "—"
  return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtCurrency(val: number) {
  if (!val) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val)
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = Omit<ForecastProject, "id" | "createdAt" | "updatedAt">

const EMPTY_FORM: FormState = {
  company: "framing",
  name: "",
  status: "planned",
  startDate: "",
  endDate: "",
  contractValue: 0,
  team: "",
  qbTime: false,
}

// ─── Project form dialog ──────────────────────────────────────────────────────

function ProjectDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  initial: FormState
  onSave: (data: FormState) => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Sync when initial changes (edit mode)
  useMemo(() => setForm(initial), [initial])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.name ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={form.company} onValueChange={(v) => set("company", v as Company)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPANIES.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as ForecastStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Orchard Hills Phase 2" />
          </div>

          <div className="space-y-1.5">
            <Label>Team</Label>
            <Input value={form.team} onChange={(e) => set("team", e.target.value)} placeholder="e.g. Team Alpha" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate?.slice(0, 10) ?? ""} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={form.endDate?.slice(0, 10) ?? ""} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contract Value (USD)</Label>
            <Input
              type="number"
              min={0}
              value={form.contractValue || ""}
              onChange={(e) => set("contractValue", +e.target.value || 0)}
              placeholder="0"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="qbtime"
              checked={form.qbTime}
              onCheckedChange={(v) => set("qbTime", v)}
            />
            <Label htmlFor="qbtime" className="cursor-pointer">QB Time tracking</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Confirm delete dialog ────────────────────────────────────────────────────

function DeleteDialog({
  project,
  onClose,
  onConfirm,
  deleting,
}: {
  project: ForecastProject | null
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete <span className="font-medium text-foreground">{project?.name}</span>. This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataControlPage() {
  const { data: projects, isLoading } = useForecast()
  const createMutation = useCreateForecast()
  const updateMutation = useUpdateForecast()
  const deleteMutation = useDeleteForecast()

  const [search, setSearch] = useState("")
  const [companyFilter, setCompanyFilter] = useState<Company | "all">("all")
  const [statusFilter, setStatusFilter] = useState<ForecastStatus | "all">("all")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ForecastProject | null>(null)
  const [deletingProject, setDeletingProject] = useState<ForecastProject | null>(null)

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter((p) => {
      if (companyFilter !== "all" && p.company !== companyFilter) return false
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [projects, companyFilter, statusFilter, search])

  const formInitial: FormState = editingProject
    ? { company: editingProject.company, name: editingProject.name, status: editingProject.status, startDate: editingProject.startDate, endDate: editingProject.endDate, contractValue: editingProject.contractValue, team: editingProject.team, qbTime: editingProject.qbTime }
    : EMPTY_FORM

  async function handleSave(data: FormState) {
    if (editingProject) {
      await updateMutation.mutateAsync({ id: editingProject.id, data })
    } else {
      await createMutation.mutateAsync(data)
    }
    setDialogOpen(false)
    setEditingProject(null)
  }

  async function handleDelete() {
    if (!deletingProject) return
    await deleteMutation.mutateAsync(deletingProject.id)
    setDeletingProject(null)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDeleting = deleteMutation.isPending

  // Summary counts
  const active = projects?.filter((p) => p.status === "active").length ?? 0
  const planned = projects?.filter((p) => p.status === "planned").length ?? 0
  const completed = projects?.filter((p) => p.status === "completed").length ?? 0
  const totalValue = projects?.reduce((acc, p) => acc + (p.contractValue ?? 0), 0) ?? 0

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data Control</h1>
          <p className="text-sm text-muted-foreground">Manage forecast projects — create, edit, and delete</p>
        </div>
        <Button onClick={() => { setEditingProject(null); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />New Project
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{active}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Planned</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-600">{planned}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{completed}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Contract Value</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtCurrency(totalValue)}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 max-w-xs"
          />
        </div>
        <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v as Company | "all")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {COMPANIES.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ForecastStatus | "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || companyFilter !== "all" || statusFilter !== "all") && (
          <button
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={() => { setSearch(""); setCompanyFilter("all"); setStatusFilter("all") }}
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Contract Value</TableHead>
              <TableHead>QB Time</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No projects found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-xs">{p.company}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[p.status] as "default" | "secondary" | "outline" | "destructive"} className="capitalize">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.team || "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(p.startDate)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(p.endDate)}</TableCell>
                  <TableCell className="text-sm">{fmtCurrency(p.contractValue)}</TableCell>
                  <TableCell>
                    {p.qbTime
                      ? <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">Yes</Badge>
                      : <span className="text-muted-foreground text-sm">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => { setEditingProject(p); setDialogOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingProject(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ProjectDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingProject(null) }}
        initial={formInitial}
        onSave={handleSave}
        saving={isSaving}
      />

      <DeleteDialog
        project={deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={handleDelete}
        deleting={isDeleting}
      />
    </div>
  )
}
