"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useSubcontractorPerf } from "@/hooks/use-subcontractor-perf"
import type { SubcontractorPerfData, ForecastProjectData } from "@/services/subcontractor-perf.service"
import { Award, BarChart3, TrendingDown, Users } from "lucide-react"
import { useMemo, useState } from "react"

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
] as const

// --- Scoring Types ---

interface SubcontractorScore {
  name: string
  totalScore: number
  worksScore: number
  executionScore: number
  contractScore: number
  backchargesScore: string // "N/A" for now
  excessScore: string // "N/A" for now
  completedWorks: number
  activeWorks: number
}

// --- Score color badge ---

function ScoreBadge({ score }: { score: number | string }) {
  if (typeof score === "string") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {score}
      </Badge>
    )
  }

  const rounded = Math.round(score)
  let variant: "default" | "secondary" | "destructive"
  let className = ""

  if (rounded >= 80) {
    variant = "default"
    className = "bg-green-600 hover:bg-green-700 text-white"
  } else if (rounded >= 60) {
    variant = "secondary"
    className = "bg-amber-500 hover:bg-amber-600 text-white"
  } else {
    variant = "destructive"
    className = ""
  }

  return (
    <Badge variant={variant} className={className}>
      {rounded}
    </Badge>
  )
}

// --- Metric Card ---

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  subtitle?: string
}

function MetricCard({ title, value, icon, subtitle }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

// --- Scoring Logic ---

/**
 * Simplified scoring engine using existing subcontractor data.
 * Full scoring will be implemented in the Go backend later.
 *
 * Works Score (0-100): Based on completed projects ratio
 * Execution Score (0-100): Based on performance score from DB
 * Contract Score (0-100): Derived from active + completed projects
 * Backcharges: N/A (requires Premium Storage data)
 * Excess: N/A (requires Premium Storage data)
 * Total Score: Average of available scores
 */
function calculateScores(
  subs: SubcontractorPerfData[],
  _projects: ForecastProjectData[],
  filterYear: string,
  filterMonth: string
): SubcontractorScore[] {
  // Filter subcontractors by activity period if year/month set
  const filtered = subs.filter((sub) => {
    if (filterYear === "all") return true
    if (!sub.lastEventAt) return true
    const eventDate = new Date(sub.lastEventAt)
    if (eventDate.getFullYear() !== parseInt(filterYear)) return false
    if (filterMonth !== "all") {
      const monthIdx = MONTHS.indexOf(filterMonth as (typeof MONTHS)[number])
      if (monthIdx >= 0 && eventDate.getMonth() !== monthIdx) return false
    }
    return true
  })

  // Find max completed for normalization
  const maxCompleted = Math.max(
    ...filtered.map((s) => s.completedProjects),
    1
  )
  const maxActive = Math.max(...filtered.map((s) => s.activeProjects), 1)

  return filtered
    .map((sub) => {
      // Works score: ratio of completed work (normalized 0-100)
      const worksScore =
        maxCompleted > 0
          ? Math.min(100, (sub.completedProjects / maxCompleted) * 100)
          : 0

      // Execution score: directly from the DB performance score (already 0-100 scale)
      const executionScore = Math.min(100, Math.max(0, sub.performanceScore))

      // Contract score: based on having active + completed work
      const totalWork = sub.activeProjects + sub.completedProjects
      const contractScore =
        totalWork > 0
          ? Math.min(100, ((totalWork / (maxActive + maxCompleted)) * 100))
          : 0

      // Final score = average of available scores
      const totalScore = (worksScore + executionScore + contractScore) / 3

      return {
        name: sub.subcontractorName,
        totalScore,
        worksScore,
        executionScore,
        contractScore,
        backchargesScore: "N/A",
        excessScore: "N/A",
        completedWorks: sub.completedProjects,
        activeWorks: sub.activeProjects,
      }
    })
    .sort((a, b) => b.totalScore - a.totalScore)
}

// --- Page ---

export default function SubcontractorPerformancePage() {
  const [year, setYear] = useState<string>(String(CURRENT_YEAR))
  const [month, setMonth] = useState<string>("all")

  const { subcontractors, forecast, isLoading } = useSubcontractorPerf()

  const scores = useMemo(() => {
    if (!subcontractors.data || !forecast.data) return []
    return calculateScores(subcontractors.data, forecast.data, year, month)
  }, [subcontractors.data, forecast.data, year, month])

  // Summary metrics
  const totalSubs = scores.length
  const avgScore =
    totalSubs > 0
      ? scores.reduce((sum, s) => sum + s.totalScore, 0) / totalSubs
      : 0
  const topPerformer = scores.length > 0 ? scores[0] : null
  const worstPerformer = scores.length > 0 ? scores[scores.length - 1] : null

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Subcontractor Performance
        </h1>
        <p className="text-sm text-muted-foreground">
          Performance scorecard and ranking
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Total Subcontractors"
          value={String(totalSubs)}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          title="Avg Score"
          value={Math.round(avgScore).toString()}
          icon={<BarChart3 className="h-4 w-4" />}
          subtitle={
            avgScore >= 80
              ? "Good overall"
              : avgScore >= 60
                ? "Needs attention"
                : "Critical"
          }
        />
        <MetricCard
          title="Top Performer"
          value={topPerformer?.name ?? "—"}
          icon={<Award className="h-4 w-4" />}
          subtitle={
            topPerformer
              ? `Score: ${Math.round(topPerformer.totalScore)}`
              : undefined
          }
        />
        <MetricCard
          title="Worst Performer"
          value={worstPerformer?.name ?? "—"}
          icon={<TrendingDown className="h-4 w-4" />}
          subtitle={
            worstPerformer
              ? `Score: ${Math.round(worstPerformer.totalScore)}`
              : undefined
          }
        />
      </div>

      {/* Ranking Table */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Rank</TableHead>
                <TableHead>Subcontractor</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Works</TableHead>
                <TableHead className="text-center">Execution</TableHead>
                <TableHead className="text-center">Contract</TableHead>
                <TableHead className="text-center">Backcharges</TableHead>
                <TableHead className="text-center">Excess</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    No subcontractor data found for the selected period
                  </TableCell>
                </TableRow>
              ) : (
                scores.map((sub, idx) => (
                  <TableRow key={sub.name}>
                    <TableCell className="font-bold text-muted-foreground">
                      #{idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">{sub.name}</TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.totalScore} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.worksScore} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.executionScore} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.contractScore} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.backchargesScore} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={sub.excessScore} />
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
