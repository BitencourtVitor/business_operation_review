"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useProjectMonitoring } from "@/hooks/use-project-monitoring"
import { Activity, CheckCircle, AlertTriangle } from "lucide-react"

export default function ProjectMonitoringPage() {
  const { data: projects, isLoading } = useProjectMonitoring()

  const total = projects?.length ?? 0
  const onTrack = projects?.filter((p) => p.completion >= 50).length ?? 0
  const delayed = projects?.filter((p) => p.completion < 50).length ?? 0

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Project Monitoring HVAC</h1>
        <p className="text-sm text-muted-foreground">Stage tracking and completion overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Track</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{onTrack}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Delayed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{delayed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jobsite</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>S1</TableHead>
              <TableHead>S2</TableHead>
              <TableHead>S3</TableHead>
              <TableHead>S4</TableHead>
              <TableHead className="text-right">Completion %</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No projects found
                </TableCell>
              </TableRow>
            ) : (
              projects?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.jobsite}</TableCell>
                  <TableCell>{p.team}</TableCell>
                  <TableCell>
                    <Badge variant={p.s1 === "done" ? "default" : "secondary"}>{p.s1}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.s2 === "done" ? "default" : "secondary"}>{p.s2}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.s3 === "done" ? "default" : "secondary"}>{p.s3}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.s4 === "done" ? "default" : "secondary"}>{p.s4}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.completion >= 75 ? "default" : p.completion >= 50 ? "secondary" : "destructive"}>
                      {p.completion}%
                    </Badge>
                  </TableCell>
                  <TableCell>{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{p.endDate ? new Date(p.endDate).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
