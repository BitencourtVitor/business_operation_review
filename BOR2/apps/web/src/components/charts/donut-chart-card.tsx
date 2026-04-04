"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { ChartTooltip } from "./chart-tooltip"
import { CHART_COLORS } from "./chart-theme"

interface DonutChartCardProps {
  title: string
  data: Array<{ name: string; value: number }>
  height?: number
  colors?: string[]
  valueFormatter?: (value: number) => string
  emptyText?: string
}

const RADIAN = Math.PI / 180

function RenderOuterLabel({ cx, cy, midAngle, outerRadius, percent, name }: any) {
  if (percent < 0.03) return null

  const sin = Math.sin(-RADIAN * midAngle)
  const cos = Math.cos(-RADIAN * midAngle)
  const startX = cx + (outerRadius + 6) * cos
  const startY = cy + (outerRadius + 6) * sin
  const midX = cx + (outerRadius + 20) * cos
  const midY = cy + (outerRadius + 20) * sin
  const endX = midX + (cos >= 0 ? 12 : -12)
  const textAnchor = cos >= 0 ? "start" : "end"

  return (
    <g>
      {/* Connector line */}
      <path
        d={`M ${startX},${startY} L ${midX},${midY} L ${endX},${midY}`}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1}
      />
      {/* Dot at connection */}
      <circle cx={startX} cy={startY} r={2} fill="#6b7280" />
      {/* Percentage */}
      <text
        x={endX + (cos >= 0 ? 4 : -4)}
        y={midY}
        textAnchor={textAnchor}
        fill="#d1d5db"
        fontSize={11}
        fontWeight={600}
        dominantBaseline="central"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    </g>
  )
}

export function DonutChartCard({
  title,
  data,
  height = 250,
  colors = [...CHART_COLORS],
  valueFormatter,
  emptyText = "No data available",
}: DonutChartCardProps) {
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
            <PieChart>
              <defs>
                {colors.map((c, i) => (
                  <linearGradient key={i} id={`pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity={1} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.7} />
                  </linearGradient>
                ))}
                <filter id="pieShadow">
                  <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
                </filter>
              </defs>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius="45%"
                outerRadius="70%"
                paddingAngle={3}
                strokeWidth={0}
                label={RenderOuterLabel}
                labelLine={false}
                style={{ filter: "url(#pieShadow)" }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={`url(#pie-${i % colors.length})`} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
