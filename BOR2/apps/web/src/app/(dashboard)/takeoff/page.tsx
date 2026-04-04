"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useTakeoffs } from "@/hooks/use-takeoff"
import type { TakeoffWork } from "@/services/takeoff.service"
import { CheckCircle2, Clock, Layers, Timer } from "lucide-react"
import { useMemo, useState } from "react"

const STAGES: { key: keyof TakeoffWork; label: string }[] = [
  { key: "stageDwg", label: "DWG" },
  { key: "stageMitek3d", label: "MiTek 3D" },
  { key: "stageMaterialsList", label: "Materials" },
  { key: "stagePanelDivision", label: "Panel Div." },
  { key: "stageValidation", label: "Validation" },
  { key: "stageCutList", label: "Cut List" },
  { key: "stageProduction", label: "Production" },
  { key: "stageDelivery", label: "Delivery" },
  { key: "stageAssembly", label: "Assembly" },
]

function getStatus(row: TakeoffWork): "completed" | "in-progress" | "not-started" {
  if (row.entregaReal) return "completed"
  if (row.dataInicio) return "in-progress"
  return "not-started"
}

function stageIsDone(value: string) {
  return value?.toLowerCase() === "ok" || value?.toLowerCase() === "done" || value?.toLowerCase() === "complete"
}

function stageBadge(value: string) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>
  if (stageIsDone(value))
    return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">✓</Badge>
  return <Badge variant="secondary" className="text-xs">{value}</Badge>
}

function statusBadge(status: ReturnType<typeof getStatus>) {
  if (status === "completed")
    return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">Completed</Badge>
  if (status === "in-progress")
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">In Progress</Badge>
  return <Badge variant="outline">Not Started</Badge>
}

function stagesProgress(row: TakeoffWork) {
  const done = STAGES.filter((s) => stageIsDone(row[s.key] as string)).length
  return { done, total: STAGES.length }
}

function formatDate(val: string | null) {
  if (!val) return "—"
  return new Date(val).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
}

function avgDeliveryDays(rows: TakeoffWork[]) {
  const completed = rows.filter((r) => r.entregaReal && r.dataInicio)
  if (!completed.length) return null
  const total = completed.reduce((acc, r) => {
    const start = new Date(r.dataInicio!).getTime()
    const end = new Date(r.entregaReal!).getTime()
    return acc + (end - start) / 86400000
  }, 0)
  return Math.round(total / completed.length)
}

export default function TakeoffPage() {
  const { data: takeoffs, isLoading } = useTakeoffs()

  const [search, setSearch] = useState("")
  const [yearFilter, setYearFilter] = useState<string>("all")
  const [monthFilter, setMonthFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const years = useMemo(() => {
    if (!takeoffs) return []
    const s = new Set(takeoffs.map((t) => t.dataSolicitacao?.slice(0, 4)).filter(Boolean) as string[])
    return Array.from(s).sort((a, b) => Number(b) - Number(a))
  }, [takeoffs])

  const filtered = useMemo(() => {
    if (!takeoffs) return []
    return takeoffs.filter((t) => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.project.toLowerCase().includes(q) && !t.modeloDaCasa.toLowerCase().includes(q)) return false
      }
      if (yearFilter !== "all" && t.dataSolicitacao?.slice(0, 4) !== yearFilter) return false
      if (monthFilter !== "all" && t.dataSolicitacao?.slice(5, 7) !== monthFilter) return false
      if (statusFilter !== "all" && getStatus(t) !== statusFilter) return false
      return true
    })
  }, [takeoffs, search, yearFilter, monthFilter, statusFilter])

  const total = filtered.length
  const completed = filtered.filter((t) => getStatus(t) === "completed").length
  const inProgress = filtered.filter((t) => getStatus(t) === "in-progress").length
  const notStarted = filtered.filter((t) => getStatus(t) === "not-started").length
  const avgDays = avgDeliveryDays(filtered)

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Takeoff Works</h1>
        <p className="text-sm text-muted-foreground">Framing engineering — DWG through assembly</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Delivery</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgDays != null ? `${avgDays}d` : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search project or model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={yearFilter} onValueChange={(v) => v && setYearFilter(v)}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={(v) => v && setMonthFilter(v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => (
              <SelectItem key={m} value={m}>
                {new Date(2000, i).toLocaleString("en-US", { month: "long" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="not-started">Not Started</SelectItem>
          </SelectContent>
        </Select>
        {(search || yearFilter !== "all" || monthFilter !== "all" || statusFilter !== "all") && (
          <button
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={() => { setSearch(""); setYearFilter("all"); setMonthFilter("all"); setStatusFilter("all") }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stages</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Est. Delivery</TableHead>
              <TableHead>Delivered</TableHead>
              {STAGES.map((s) => (
                <TableHead key={s.key} className="text-center text-xs px-2">{s.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8 + STAGES.length} className="text-center text-muted-foreground py-8">
                  No takeoff works found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => {
                const { done, total: stTotal } = stagesProgress(t)
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium max-w-[160px] truncate">{t.project}</TableCell>
                    <TableCell className="text-sm">{t.modeloDaCasa || "—"}</TableCell>
                    <TableCell>{statusBadge(getStatus(t))}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${(done / stTotal) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{done}/{stTotal}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(t.dataSolicitacao)}</TableCell>
                    <TableCell className="text-sm">{formatDate(t.dataInicio)}</TableCell>
                    <TableCell className="text-sm">{formatDate(t.dataEstimadaEntrega)}</TableCell>
                    <TableCell className="text-sm">{formatDate(t.entregaReal)}</TableCell>
                    {STAGES.map((s) => (
                      <TableCell key={s.key} className="text-center px-2">
                        {stageBadge(t[s.key] as string)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {notStarted > 0 && (
        <p className="text-xs text-muted-foreground">
          {notStarted} project{notStarted > 1 ? "s" : ""} not started yet
        </p>
      )}
    </div>
  )
}
