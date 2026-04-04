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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useOfi } from "@/hooks/use-ofi"
import { BarChart3, ArrowUpDown } from "lucide-react"

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

type SortKey = "project" | "totalScore" | "fieldwireScore" | "machinesScore" | "contractScore" | "systemsScore"

function getScoreColor(score: number, max: number): string {
  const pct = score / max
  if (pct >= 0.85) return "text-green-600"
  if (pct >= 0.65) return "text-amber-500"
  return "text-red-500"
}

function getProgressColor(score: number, max: number): string {
  const pct = score / max
  if (pct >= 0.85) return "bg-green-500"
  if (pct >= 0.65) return "bg-amber-500"
  return "bg-red-500"
}

function getBadgeVariant(score: number, max: number): "default" | "secondary" | "destructive" {
  const pct = score / max
  if (pct >= 0.85) return "default"
  if (pct >= 0.65) return "secondary"
  return "destructive"
}

export default function OFIPage() {
  const [year, setYear] = useState(String(currentYear))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [sortKey, setSortKey] = useState<SortKey>("totalScore")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const { data: projects, isLoading } = useOfi({
    year: Number(year),
    month: Number(month),
  })

  const sorted = useMemo(() => {
    if (!projects) return []
    return [...projects].sort((a, b) => {
      const av = typeof a[sortKey] === "string" ? (a[sortKey] as string) : Number(a[sortKey])
      const bv = typeof b[sortKey] === "string" ? (b[sortKey] as string) : Number(b[sortKey])
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [projects, sortKey, sortDir])

  const avgTotal = projects?.length
    ? Number((projects.reduce((s, p) => s + p.totalScore, 0) / projects.length).toFixed(2))
    : 0
  const avgFieldwire = projects?.length
    ? Number((projects.reduce((s, p) => s + p.fieldwireScore, 0) / projects.length).toFixed(2))
    : 0
  const avgMachines = projects?.length
    ? Number((projects.reduce((s, p) => s + p.machinesScore, 0) / projects.length).toFixed(2))
    : 0
  const avgContract = projects?.length
    ? Number((projects.reduce((s, p) => s + p.contractScore, 0) / projects.length).toFixed(2))
    : 0
  const avgSystems = projects?.length
    ? Number((projects.reduce((s, p) => s + p.systemsScore, 0) / projects.length).toFixed(2))
    : 0

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operational Forecast Index</h1>
          <p className="text-sm text-muted-foreground">Performance metrics across all forecast projects</p>
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

      {/* OFI Total highlight */}
      <Card className="border-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">OFI Total</CardTitle>
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${getScoreColor(avgTotal, 7)}`}>
              {avgTotal}
            </span>
            <span className="text-muted-foreground">/ 7.0</span>
          </div>
          <Progress value={(avgTotal / 7) * 100} className="mt-3">
            <ProgressTrack className="h-3">
              <ProgressIndicator className={getProgressColor(avgTotal, 7)} />
            </ProgressTrack>
          </Progress>
          <p className="mt-1 text-xs text-muted-foreground">
            Average across {projects?.length ?? 0} projects
          </p>
        </CardContent>
      </Card>

      {/* Category cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <ScoreCard label="Fieldwire" score={avgFieldwire} max={2.0} />
        <ScoreCard label="Machines" score={avgMachines} max={2.0} />
        <ScoreCard label="Contract" score={avgContract} max={2.0} />
        <ScoreCard label="Systems" score={avgSystems} max={1.0} />
      </div>

      {/* Project Detailing Table */}
      <Card>
        <CardHeader>
          <CardTitle>Project Detailing</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="PROJECT" sortKey="project" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="TOTAL" sortKey="totalScore" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="FIELDWIRE" sortKey="fieldwireScore" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="MACHINES" sortKey="machinesScore" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="CONTRACT" sortKey="contractScore" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="SYSTEMS" sortKey="systemsScore" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No OFI data found
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.project}</TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(p.totalScore, 7)}>
                        {p.totalScore}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={getScoreColor(p.fieldwireScore, 2)}>
                        {p.fieldwireScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getScoreColor(p.machinesScore, 2)}>
                        {p.machinesScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getScoreColor(p.contractScore, 2)}>
                        {p.contractScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getScoreColor(p.systemsScore, 1)}>
                        {p.systemsScore}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ScoreCard({ label, score, max }: { label: string; score: number; max: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${getScoreColor(score, max)}`}>
            {score}
          </span>
          <span className="text-sm text-muted-foreground">/ {max}</span>
        </div>
        <Progress value={(score / max) * 100} className="mt-2">
          <ProgressTrack className="h-2">
            <ProgressIndicator className={getProgressColor(score, max)} />
          </ProgressTrack>
        </Progress>
      </CardContent>
    </Card>
  )
}

function SortableHead({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: "asc" | "desc"
  onSort: (key: SortKey) => void
}) {
  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${currentKey === sortKey ? "text-foreground" : "text-muted-foreground/50"}`} />
      </span>
    </TableHead>
  )
}
