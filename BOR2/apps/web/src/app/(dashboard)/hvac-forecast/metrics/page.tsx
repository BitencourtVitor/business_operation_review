"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function HvacForecastMetricsPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-3">
        <Link
          href="/hvac-forecast"
          className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HVAC Forecast Metrics</h1>
          <p className="text-sm text-muted-foreground">Readiness scores and monthly trend</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/icon_forecast_hvac.png"
            alt="HVAC"
            className="mx-auto h-10 w-10 object-contain opacity-20 dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/icon_forecast_hvac_dark.png"
            alt="HVAC"
            className="mx-auto hidden h-10 w-10 object-contain opacity-20 dark:block"
          />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Under construction</p>
          <p className="mt-1 text-xs text-muted-foreground/50">This page is being built.</p>
        </div>
      </div>
    </div>
  )
}
