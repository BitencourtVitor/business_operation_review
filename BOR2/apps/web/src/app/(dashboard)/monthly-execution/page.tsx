"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useForecast } from "@/hooks/use-forecast"
import { CalendarCheck, Play, CheckCircle } from "lucide-react"
import type { ForecastProject } from "@bor2/shared"

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear - i))

function getStatusBadge(status: ForecastProject["status"]) {
  switch (status) {
    case "planned":
      return <Badge variant="secondary">Planned</Badge>
    case "active":
      return <Badge variant="default">Active</Badge>
    case "completed":
      return <Badge className="bg-green-600 text-white">Completed</Badge>
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function MonthlyExecutionPage() {
  const [year, setYear] = useState(String(currentYear))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))

  const { data: projects, isLoading } = useForecast({ year: Number(year) })

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter((p) => {
      const start = new Date(p.startDate)
      const end = new Date(p.endDate)
      const m = Number(month)
      const y = Number(year)
      // Project is relevant for this month if its date range overlaps
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 0)
      return start <= monthEnd && end >= monthStart
    })
  }, [projects, month, year])

  const planned = filtered.filter((p) => p.status === "planned")
  const started = filtered.filter((p) => p.status === "active")
  const finished = filtered.filter((p) => p.status === "completed")

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Monthly Execution</h1>
          <p className="text-sm text-muted-foreground">Track project execution progress by month</p>
        </div>
        <div className="flex gap-2">
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={(v) => v && setMonth(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Planned Projects
            </CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{planned.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Started Projects
            </CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{started.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Finished Projects
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{finished.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban layout */}
      <div className="grid gap-4 md:grid-cols-3">
        <KanbanColumn title="Planned" items={planned} color="bg-slate-100 dark:bg-slate-900" />
        <KanbanColumn title="Started" items={started} color="bg-blue-50 dark:bg-blue-950" />
        <KanbanColumn title="Finished" items={finished} color="bg-green-50 dark:bg-green-950" />
      </div>
    </div>
  )
}

function KanbanColumn({
  title,
  items,
  color,
}: {
  title: string
  items: ForecastProject[]
  color: string
}) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="text-xs">
          {items.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No projects</p>
        ) : (
          items.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project }: { project: ForecastProject }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{project.name}</p>
          {getStatusBadge(project.status)}
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Company</span>
            <span className="font-medium text-foreground uppercase">{project.company}</span>
          </div>
          <div className="flex justify-between">
            <span>Team</span>
            <span className="font-medium text-foreground">{project.team || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Contract</span>
            <span className="font-medium text-foreground">
              {project.contractValue
                ? `$${project.contractValue.toLocaleString()}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Period</span>
            <span className="font-medium text-foreground">
              {new Date(project.startDate).toLocaleDateString()} — {new Date(project.endDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
