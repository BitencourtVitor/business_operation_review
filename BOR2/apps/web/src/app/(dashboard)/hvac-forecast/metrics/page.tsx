"use client"

import { ComingSoonGate } from "@/components/common/coming-soon"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

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

export default function HvacForecastMetricsPage() {
  return (
    <ComingSoonGate
      title="HVAC Forecast Metrics"
      description="Readiness scores and monthly trend"
      icon={hvacIcon}
    >
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
            {hvacIcon}
            {/* Os scores de preparação medem Fieldwire, Machines, Contract, QB
                Time e Storage. A HVAC não usa nenhum deles ainda, então não há
                o que pontuar — a tela espera a integração existir. */}
            <p className="mt-3 text-sm font-medium text-muted-foreground">Nothing to score yet</p>
            <p className="mt-1 text-xs text-muted-foreground/50">
              HVAC has no readiness integrations in place — QB Time is the only one live.
            </p>
          </div>
        </div>
      </div>
    </ComingSoonGate>
  )
}
