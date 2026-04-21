"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useQBChart, useQBProjects } from "@/hooks/use-qb-accounting"
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { Calendar, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ProjectCard } from "@/services/qb-accounting.service"

// ── constants ────────────────────────────────────────────────────────────────

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

const MONTHS = [
  { value: 1,  label: "January"   }, { value: 2,  label: "February"  },
  { value: 3,  label: "March"     }, { value: 4,  label: "April"     },
  { value: 5,  label: "May"       }, { value: 6,  label: "June"      },
  { value: 7,  label: "July"      }, { value: 8,  label: "August"    },
  { value: 9,  label: "September" }, { value: 10, label: "October"   },
  { value: 11, label: "November"  }, { value: 12, label: "December"  },
]

const CARDS_PER_PAGE = 4

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

// ── project card ─────────────────────────────────────────────────────────────

function ProjectCardItem({ project }: { project: ProjectCard }) {
  const maxVal = Math.max(project.estimate, project.invoiced, project.expenses, 1)
  const positive = project.profit >= 0

  return (
    <Card className="min-w-[260px] max-w-[260px] flex-shrink-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
          {project.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {[
            { label: "Estimate", value: project.estimate, color: "bg-muted-foreground/40" },
            { label: "Invoiced", value: project.invoiced, color: "bg-green-500" },
            { label: "Expenses", value: project.expenses, color: "bg-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span className="font-medium text-foreground">{fmtShort(value)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", color)}
                  style={{ width: `${Math.min((value / maxVal) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className={cn(
          "flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold",
          positive
            ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
            : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
        )}>
          <div className="flex items-center gap-1">
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span>Profit</span>
          </div>
          <span>{fmtShort(project.profit)} ({project.profit_pct.toFixed(1)}%)</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || "hvac"

  const [year, setYear]         = useState<number>(new Date().getFullYear())
  const [month, setMonth]       = useState<number | "all">("all")
  const [carouselIdx, setCarouselIdx] = useState(0)

  const { data: chartData, isLoading: chartLoading } = useQBChart({
    company,
    year,
    month: month !== "all" ? month : undefined,
  })

  const { data: projects, isLoading: projectsLoading } = useQBProjects({ company, year })

  const totalReceived = chartData?.reduce((s, p) => s + p.received, 0) ?? 0
  const totalPaid     = chartData?.reduce((s, p) => s + p.paid, 0) ?? 0
  const netFlow       = totalReceived - totalPaid

  const totalPages     = Math.ceil((projects?.length ?? 0) / CARDS_PER_PAGE)
  const visibleProjects = projects?.slice(carouselIdx * CARDS_PER_PAGE, (carouselIdx + 1) * CARDS_PER_PAGE) ?? []

  if (chartLoading && projectsLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight capitalize">{company} Accounting</h1>
          <p className="text-sm text-muted-foreground">Cash flow and project breakdown</p>
        </div>

        <div className="flex items-end gap-2">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Select
                value={String(year)}
                onValueChange={(v) => { setYear(Number(v)); setMonth("all"); setCarouselIdx(0) }}
              >
                <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{year}</span>
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border" />
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
              >
                <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {month === "all" ? "All" : MONTHS.find(m => m.value === month)?.label ?? "All"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary metrics ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Received</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fmt(totalReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Cash Flow</CardTitle>
            {netFlow >= 0
              ? <TrendingUp className="h-4 w-4 text-green-500" />
              : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", netFlow >= 0 ? "text-green-600" : "text-red-600")}>
              {fmt(netFlow)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Cash Flow — {month === "all" ? "Monthly" : "Daily"} · {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => month !== "all" ? v.slice(8) : v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} width={64} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                <Legend />
                <Line type="monotone" dataKey="received" name="Received" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="paid"     name="Paid"     stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Project carousel ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            Projects <span className="text-muted-foreground font-normal">({projects?.length ?? 0})</span>
          </h2>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7"
                disabled={carouselIdx === 0}
                onClick={() => setCarouselIdx(i => i - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7"
                disabled={carouselIdx >= totalPages - 1}
                onClick={() => setCarouselIdx(i => i + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {projectsLoading ? (
          <div className="text-sm text-muted-foreground">Loading projects…</div>
        ) : projects?.length === 0 ? (
          <div className="text-sm text-muted-foreground">No projects found.</div>
        ) : (
          <div className="flex gap-4">
            {visibleProjects.map((p) => (
              <ProjectCardItem key={p.name} project={p} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-1 mt-3">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button key={i} onClick={() => setCarouselIdx(i)}
                className={cn("h-1.5 rounded-full transition-all",
                  i === carouselIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                )} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
