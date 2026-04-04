"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { ChartTooltip } from "./chart-tooltip"
import { AXIS_STYLE, CHART_COLORS, CHART_MARGIN, GRID_STYLE, TOOLTIP_CURSOR } from "./chart-theme"

interface LineConfig {
  dataKey: string
  color?: string
  dashed?: boolean
}

interface LineChartCardProps {
  title: string
  data: any[]
  lines: LineConfig[]
  height?: number
  showLegend?: boolean
  valueFormatter?: (value: number) => string
  emptyText?: string
}

export function LineChartCard({
  title,
  data,
  lines,
  height = 250,
  showLegend = true,
  valueFormatter,
  emptyText = "No data available",
}: LineChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex items-center justify-center py-12 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={CHART_MARGIN}>
              <defs>
                {lines.map((line, i) => {
                  const c = line.color ?? CHART_COLORS[i % CHART_COLORS.length]
                  return (
                    <linearGradient key={line.dataKey} id={`area-${line.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  )
                })}
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="month" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} width={45} />
              <Tooltip
                content={<ChartTooltip valueFormatter={valueFormatter} />}
                cursor={TOOLTIP_CURSOR}
              />
              {lines.map((line, i) => {
                const c = line.color ?? CHART_COLORS[i % CHART_COLORS.length]
                return (
                  <Area
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    stroke={c}
                    strokeWidth={2}
                    strokeDasharray={line.dashed ? "6 3" : undefined}
                    fill={line.dashed ? "none" : `url(#area-${line.dataKey})`}
                    dot={{ r: 3, strokeWidth: 2, fill: "#1f2937", stroke: c }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: c }}
                  />
                )
              })}
              {showLegend && (
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
