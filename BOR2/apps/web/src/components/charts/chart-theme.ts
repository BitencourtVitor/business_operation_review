// Shared chart theming constants

export const CHART_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#d946ef", // fuchsia-500
] as const

export const PRIMARY_BLUE = "#3b82f6"

// SVG doesn't resolve CSS custom properties — use neutral colors that work in both themes
export const AXIS_STYLE = {
  tick: { fontSize: 11, fill: "#9ca3af" },
  axisLine: { stroke: "#4b5563", strokeWidth: 0.5 },
  tickLine: false as const,
}

export const GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "#4b5563",
  strokeOpacity: 0.3,
  horizontal: true,
  vertical: false,
}

export const TOOLTIP_CURSOR = {
  fill: "#6b7280",
  fillOpacity: 0.15,
  radius: 4,
}

export const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0]

export const CHART_MARGIN = { top: 20, right: 16, bottom: 5, left: 0 }
