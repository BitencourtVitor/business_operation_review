"use client"

import { ComingSoonGate } from "@/components/common/coming-soon"
import { ForecastBoard } from "@/components/features/forecast/forecast-board"

const hvacIcon = (
  <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/icon_forecast_hvac.png" alt="HVAC"
         className="mx-auto h-10 w-10 object-contain opacity-20 dark:hidden" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/icon_forecast_hvac_dark.png" alt="HVAC"
         className="mx-auto hidden h-10 w-10 object-contain opacity-20 dark:block" />
  </>
)

export default function HvacForecastPage() {
  return (
    <ComingSoonGate
      title="HVAC Forecast"
      description="Project pipeline and execution schedule"
      icon={hvacIcon}
    >
      <ForecastBoard company="hvac" title="HVAC Forecast" metricsHref="/hvac-forecast/metrics" />
    </ComingSoonGate>
  )
}
