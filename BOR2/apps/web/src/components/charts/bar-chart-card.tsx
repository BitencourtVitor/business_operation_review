"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { ChartTooltip } from "./chart-tooltip"
import { AXIS_STYLE, BAR_RADIUS, CHART_COLORS, CHART_MARGIN, GRID_STYLE, PRIMARY_BLUE, TOOLTIP_CURSOR } from "./chart-theme"

interface BarChartCardProps {
  title: string
  data: Array<{ name: string; value: number }>
  height?: number
  color?: string
  multiColor?: boolean
  showLabel?: boolean
  rotateLabels?: boolean
  header?: React.ReactNode
  valueFormatter?: (value: number) => string
  emptyText?: string
}

function BarLabel({ x, y, width, value }: any) {
  if (!value) return null
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#9ca3af"
      textAnchor="middle"
      fontSize={10}
      fontWeight={500}
    >
      {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value}
    </text>
  )
}

export function BarChartCard({
  title,
  data,
  height = 250,
  color = PRIMARY_BLUE,
  multiColor = false,
  showLabel = true,
  rotateLabels = false,
  header,
  valueFormatter,
  emptyText = "No data available",
}: BarChartCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {header}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex items-center justify-center py-12 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                </linearGradient>
                {CHART_COLORS.map((c, i) => (
                  <linearGradient key={i} id={`barGradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity={1} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                  </linearGradient>
                ))}
                <filter id="barShadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={color} floodOpacity="0.3" />
                </filter>
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="name"
                {...AXIS_STYLE}
                {...(rotateLabels ? { angle: -35, textAnchor: "end", height: 70 } : {})}
              />
              <YAxis {...AXIS_STYLE} width={45} />
              <Tooltip
                content={<ChartTooltip valueFormatter={valueFormatter} />}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar
                dataKey="value"
                fill={multiColor ? undefined : "url(#barGradient)"}
                radius={BAR_RADIUS}
                maxBarSize={50}
                label={showLabel ? BarLabel : undefined}
                style={{ filter: "url(#barShadow)" }}
              >
                {multiColor &&
                  data.map((_, i) => (
                    <Cell key={i} fill={`url(#barGradient-${i % CHART_COLORS.length})`} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
