"use client"

import { ForecastBoard } from "@/components/features/forecast/forecast-board"

export default function ForecastPage() {
  return (
    <ForecastBoard company="framing" title="Framing Forecast" metricsHref="/bor/forecast/metrics" />
  )
}
