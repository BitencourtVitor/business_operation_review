"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts"
import { cn } from "@/lib/utils"
import {
  CITY_JOBSITE_COLORS, STAGE_META, STATUS_COLOR, STATUS_LABEL,
  daysBetween, isDateInPeriod, todayISO, getStatus, getStageDate,
  type GroupBy, type ProjectStatus,
} from "../_lib/utils"
import type { ProjectMonitoringEntry } from "@/services/project-monitoring.service"

// ── Pie slice type ────────────────────────────────────────────────────────────

interface PieSlice {
  name:  string
  value: number
  color: string
}

// ── Build pie data ────────────────────────────────────────────────────────────

function buildPieData(
  filteredData: ProjectMonitoringEntry[],
  allData:      ProjectMonitoringEntry[],
  groupBy:      GroupBy,
  year:         string,
  month:        string,
  week:         string,
): PieSlice[] {
  if (groupBy === "status") {
    const counts: Record<string, number> = { completed: 0, in_progress: 0, no_started: 0 }
    for (const p of filteredData) counts[getStatus(p)]++
    return (["completed", "in_progress", "no_started"] as ProjectStatus[])
      .filter(s => counts[s] > 0)
      .map(s => ({ name: STATUS_LABEL[s], value: counts[s], color: STATUS_COLOR[s] }))
  }

  if (groupBy === "city_jobsite") {
    const groups = new Map<string, number>()
    for (const p of filteredData) {
      const key = [p.city, p.jobSite].filter(Boolean).join(" • ")
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value], i) => ({ name, value, color: CITY_JOBSITE_COLORS[i % CITY_JOBSITE_COLORS.length] }))
  }

  // stage: uses allData, counts stages with date in selected period
  return STAGE_META
    .map(s => ({
      name:  s.label,
      value: allData.filter(p => isDateInPeriod(p[s.dateField], year, month, week)).length,
      color: s.color,
    }))
    .filter(s => s.value > 0)
}

// ── Avg days per group ────────────────────────────────────────────────────────

function calcAvgDays(
  data:      ProjectMonitoringEntry[],
  groupBy:   GroupBy,
  groupName: string,
): number | null {
  if (groupBy === "status") {
    const status = Object.entries(STATUS_LABEL).find(([, v]) => v === groupName)?.[0]
    if (!status) return null
    const daysArr = data
      .filter(p => getStatus(p) === status)
      .map(p => {
        if (status === "completed") return daysBetween(p.startDate, p.finishDate)
        return daysBetween(p.startDate, todayISO())
      })
      .filter((d): d is number => d !== null && d > 0)
    if (!daysArr.length) return null
    return Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
  }
  if (groupBy === "stage") {
    const idx = STAGE_META.findIndex(s => s.label === groupName)
    if (idx === -1) return null
    const daysArr = data
      .map(p => {
        const cur  = getStageDate(p, idx)
        const prev = idx === 0 ? p.startDate : getStageDate(p, idx - 1)
        return daysBetween(prev, cur)
      })
      .filter((d): d is number => d !== null && d > 0)
    if (!daysArr.length) return null
    return Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
  }
  return null
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function buildTooltip(pieData: PieSlice[]) {
  const total = pieData.reduce((s, d) => s + d.value, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function PieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const slice: PieSlice = payload[0].payload
    const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : "0.0"
    return (
      <div className="rounded-xl border border-border bg-background/95 shadow-xl px-3 py-2.5 text-sm backdrop-blur-sm">
        <p className="mb-1 font-semibold" style={{ color: slice.color }}>{slice.name}</p>
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Count: <span className="font-medium text-foreground">{slice.value}</span></span>
          <span className="text-muted-foreground">Share: <span className="font-medium text-foreground">{pct}%</span></span>
          <span className="text-muted-foreground">Total: <span className="font-medium text-foreground">{total}</span></span>
        </div>
      </div>
    )
  }
}

// ── Works list ────────────────────────────────────────────────────────────────

function WorksList({
  filteredData, allData, groupBy, pieData, year, month, week,
}: {
  filteredData: ProjectMonitoringEntry[]
  allData:      ProjectMonitoringEntry[]
  groupBy:      GroupBy
  pieData:      PieSlice[]
  year:         string
  month:        string
  week:         string
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else               next.add(key)
      return next
    })
  }

  interface WorkGroup {
    key:      string
    label:    string
    color:    string
    projects: ProjectMonitoringEntry[]
  }

  function buildGroups(): WorkGroup[] {
    if (groupBy === "status") {
      return (["completed", "in_progress", "no_started"] as ProjectStatus[])
        .map(s => ({
          key:      s,
          label:    STATUS_LABEL[s],
          color:    STATUS_COLOR[s],
          projects: filteredData.filter(p => getStatus(p) === s),
        }))
        .filter(g => g.projects.length > 0)
    }
    if (groupBy === "city_jobsite") {
      return pieData.map(slice => ({
        key:      slice.name,
        label:    slice.name,
        color:    slice.color,
        projects: filteredData.filter(p =>
          [p.city, p.jobSite].filter(Boolean).join(" • ") === slice.name
        ),
      })).filter(g => g.projects.length > 0)
    }
    // stage: group by which stage was completed in period
    return STAGE_META.map(s => ({
      key:      s.label,
      label:    s.label,
      color:    s.color,
      projects: allData.filter(p => isDateInPeriod(p[s.dateField], year, month, week)),
    })).filter(g => g.projects.length > 0)
  }

  const groups = buildGroups()

  function getTitle(p: ProjectMonitoringEntry): string {
    return [p.lotNumber ? `Lot ${p.lotNumber}` : null, p.jobSite, p.city]
      .filter(Boolean).join(" – ")
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Works</span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {groups.map(g => {
          const open = !collapsed.has(g.key)
          return (
            <div key={g.key} className="border-b border-border/50 last:border-b-0">
              <button
                onClick={() => toggle(g.key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide">{g.label}</span>
                <span className="text-[11px] text-muted-foreground">({g.projects.length})</span>
              </button>
              {open && (
                <div className="pb-1">
                  {g.projects.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60" style={{ background: g.color }} />
                      <span className="text-[11px] text-muted-foreground leading-tight">{getTitle(p)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {groups.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">
            No projects
          </div>
        )}
      </div>
    </div>
  )
}

// ── Distribution table ────────────────────────────────────────────────────────

function DistributionTable({
  pieData,
  filteredData,
  groupBy,
}: {
  pieData:      PieSlice[]
  filteredData: ProjectMonitoringEntry[]
  groupBy:      GroupBy
}) {
  const sorted = [...pieData].sort((a, b) => b.value - a.value)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="border-b border-border px-3 py-2.5">
        <div className="grid grid-cols-[10px_1fr_32px_48px] items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div />
          <div>Label</div>
          <div className="text-right">N</div>
          <div className="text-right">Avg</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/50">
        {sorted.map(slice => {
          const avg = calcAvgDays(filteredData, groupBy, slice.name)
          return (
            <div
              key={slice.name}
              className="grid grid-cols-[10px_1fr_32px_48px] items-center gap-2 px-3 py-2"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: slice.color }} />
              <span className="text-xs truncate">{slice.name}</span>
              <span className="text-xs font-semibold text-right tabular-nums">{slice.value}</span>
              <span className="text-xs text-right tabular-nums text-muted-foreground">
                {avg ? `${avg}d` : "—"}
              </span>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No data</div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DistributionChart({
  filteredData,
  allData,
  groupBy,
  onGroupByChange,
  year,
  month,
  week,
}: {
  filteredData:    ProjectMonitoringEntry[]
  allData:         ProjectMonitoringEntry[]
  groupBy:         GroupBy
  onGroupByChange: (g: GroupBy) => void
  year:            string
  month:           string
  week:            string
}) {
  const pieData = buildPieData(filteredData, allData, groupBy, year, month, week)
  const Tooltip = buildTooltip(pieData)

  return (
    <div className="flex h-[340px] gap-3">

      {/* Works list */}
      <div className="w-[240px] shrink-0">
        <WorksList
          filteredData={filteredData}
          allData={allData}
          groupBy={groupBy}
          pieData={pieData}
          year={year}
          month={month}
          week={week}
        />
      </div>

      {/* Pie chart + group-by toggle */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status Distribution
          </span>
          {/* Group by toggle */}
          <div className="flex h-6 items-center rounded border border-input bg-background p-0.5">
            {([
              { key: "status",       label: "Status" },
              { key: "city_jobsite", label: "City" },
              { key: "stage",        label: "Stage" },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => onGroupByChange(opt.key)}
                className={cn(
                  "h-5 rounded px-2 text-[10px] font-medium transition-colors",
                  groupBy === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <ResponsiveContainer width="80%" height="90%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  dataKey="value"
                  strokeWidth={2}
                >
                  {pieData.map((slice, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={slice.color}
                      stroke={`${slice.color}80`}
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<Tooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Distribution table */}
      <div className="w-[200px] shrink-0">
        <DistributionTable
          pieData={pieData}
          filteredData={filteredData}
          groupBy={groupBy}
        />
      </div>

    </div>
  )
}
