"use client"

import { ForecastBoard } from "@/components/features/forecast/forecast-board"

export default function HvacForecastPage() {
  return (
    <ForecastBoard company="hvac" title="HVAC Forecast" metricsHref="/hvac-forecast/metrics" />
  )
}
