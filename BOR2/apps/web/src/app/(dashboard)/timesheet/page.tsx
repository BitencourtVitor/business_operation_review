"use client"

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
import { useTimesheets } from "@/hooks/use-timesheets"
import { Clock, Users, DollarSign } from "lucide-react"

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function TimesheetPage() {
  const { data: entries, isLoading } = useTimesheets()

  const totalHours = entries?.reduce((sum, e) => sum + e.hours, 0) ?? 0
  const totalCost = entries?.reduce((sum, e) => sum + e.total, 0) ?? 0
  const uniqueEmployees = new Set(entries?.map((e) => e.name)).size

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Timesheet Analysis</h1>
        <p className="text-sm text-muted-foreground">Timesheet discrepancy analysis</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{uniqueEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Corporation</TableHead>
              <TableHead>Jobsite</TableHead>
              <TableHead>Worktype</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No timesheet entries found
                </TableCell>
              </TableRow>
            ) : (
              entries?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.date ? new Date(e.date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.team}</TableCell>
                  <TableCell>{e.corporation}</TableCell>
                  <TableCell>{e.jobsite}</TableCell>
                  <TableCell>{e.worktype}</TableCell>
                  <TableCell className="text-right">{e.hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{fmt(e.rate)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(e.total)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
