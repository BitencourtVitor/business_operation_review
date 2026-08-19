"use client"

import { TrendingUp } from "lucide-react"
import Link from "next/link"

export default function HvacForecastPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HVAC Forecast</h1>
          <p className="text-sm text-muted-foreground">Project pipeline and execution schedule</p>
        </div>
        <Link
          href="/hvac-forecast/metrics"
          className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Metrics
        </Link>
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
