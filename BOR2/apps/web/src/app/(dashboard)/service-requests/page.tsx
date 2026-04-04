"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useServiceRequests } from "@/hooks/use-service-requests"
import type { ServiceRequest } from "@/services/service-request.service"
import {
  Wrench,
  Clock,
  CheckCircle,
  ShieldCheck,
  Search,
  ArrowUpDown,
} from "lucide-react"

type SortKey = "contractor" | "jobSite" | "dateReceived" | "dateCompleted"

export default function ServiceRequestsPage() {
  const { data: requests, isLoading } = useServiceRequests()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("dateReceived")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const filtered = useMemo(() => {
    if (!requests) return []
    const q = search.toLowerCase()
    return requests.filter(
      (r) =>
        r.contractor?.toLowerCase().includes(q) ||
        r.jobSite?.toLowerCase().includes(q)
    )
  }, [requests, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? ""
      const bv = b[sortKey] ?? ""
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const total = requests?.length ?? 0
  const open = requests?.filter((r) => !r.dateCompleted).length ?? 0
  const completed = requests?.filter((r) => !!r.dateCompleted).length ?? 0
  const warranty = requests?.filter(
    (r) => r.warranty === "true" || r.warranty === "yes"
  ).length ?? 0

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Service Requests</h1>
        <p className="text-sm text-muted-foreground">
          Service and warranty request tracking
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by contractor or job site..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Warranty</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{warranty}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Contractor"
                sortKey="contractor"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Job Site"
                sortKey="jobSite"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <TableHead>City</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Issue</TableHead>
              <SortableHead
                label="Date Received"
                sortKey="dateReceived"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Date Completed"
                sortKey="dateCompleted"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <TableHead>Warranty</TableHead>
              <TableHead>Tech</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  No service requests found
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.contractor}</TableCell>
                  <TableCell>{r.jobSite}</TableCell>
                  <TableCell>{r.city}</TableCell>
                  <TableCell>{r.lot || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.issue}</TableCell>
                  <TableCell>
                    {r.dateReceived
                      ? new Date(r.dateReceived).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.dateCompleted
                      ? new Date(r.dateCompleted).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <WarrantyBadge value={r.warranty} />
                  </TableCell>
                  <TableCell>{r.tech || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function WarrantyBadge({ value }: { value: string }) {
  const isYes =
    value?.toLowerCase() === "yes" || value === "true"
  return (
    <Badge variant={isYes ? "default" : "secondary"}>
      {isYes ? "Yes" : "No"}
    </Badge>
  )
}

function SortableHead({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: "asc" | "desc"
  onSort: (key: SortKey) => void
}) {
  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${
            currentKey === sortKey
              ? "text-foreground"
              : "text-muted-foreground/50"
          }`}
        />
      </span>
    </TableHead>
  )
}
