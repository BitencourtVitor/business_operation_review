"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAccountingSummary } from "@/hooks/use-accounting"
import { useForecast } from "@/hooks/use-forecast"
import { useSubcontractors } from "@/hooks/use-subcontractors"
import { BarChart3, Building2, TrendingUp, Wallet } from "lucide-react"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" }).format(n)

export default function DashboardPage() {
  const year = new Date().getFullYear()
  const { data: projects } = useForecast({ year })
  const { data: summary } = useAccountingSummary(undefined, year)
  const { data: subs } = useSubcontractors()

  const activeProjects = projects?.filter((p) => p.status === "active").length ?? 0
  const activeSubs = subs?.filter((s) => s.status === "active").length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Business operations overview — {year}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeProjects}</p>
            <p className="text-xs text-muted-foreground mt-1">{projects?.length ?? 0} total this year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receivables</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fmt(summary?.totalReceivables ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">YTD {year}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payables</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{fmt(summary?.totalPayables ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">YTD {year}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subcontractors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeSubs}</p>
            <p className="text-xs text-muted-foreground mt-1">{subs?.length ?? 0} total registered</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
