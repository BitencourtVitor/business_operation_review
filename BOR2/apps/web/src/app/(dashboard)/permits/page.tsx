"use client"

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
import { usePermits } from "@/hooks/use-permits"
import { ClipboardList, CheckCircle, Clock } from "lucide-react"
import { useMemo, useState } from "react"

export default function PermitsPage() {
  const [search, setSearch] = useState("")
  const { data: permits, isLoading } = usePermits()

  const filtered = useMemo(() => {
    if (!permits) return []
    if (!search) return permits
    const q = search.toLowerCase()
    return permits.filter((p) => p.jobsite?.toLowerCase().includes(q))
  }, [permits, search])

  const totalPermits = permits?.length ?? 0
  const pending = permits?.filter((p) => p.situacao?.toLowerCase() === "pending" || p.situacao?.toLowerCase() === "pendente").length ?? 0
  const approved = permits?.filter((p) => p.situacao?.toLowerCase() === "approved" || p.situacao?.toLowerCase() === "aprovado").length ?? 0

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Permit Control</h1>
        <p className="text-sm text-muted-foreground">Track permit applications and approvals</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Permits</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalPermits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{approved}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by jobsite..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Jobsite</TableHead>
              <TableHead>Lot Address</TableHead>
              <TableHead>Situacao</TableHead>
              <TableHead>Solicitacao</TableHead>
              <TableHead>Aplicacao</TableHead>
              <TableHead>Emissao</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No permits found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.model}</TableCell>
                  <TableCell>{p.jobsite}</TableCell>
                  <TableCell>{p.lotAddress}</TableCell>
                  <TableCell>
                    <Badge variant={
                      p.situacao?.toLowerCase() === "approved" || p.situacao?.toLowerCase() === "aprovado"
                        ? "default"
                        : p.situacao?.toLowerCase() === "pending" || p.situacao?.toLowerCase() === "pendente"
                          ? "secondary"
                          : "outline"
                    }>
                      {p.situacao}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.solicitacao ? new Date(p.solicitacao).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{p.aplicacao ? new Date(p.aplicacao).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{p.emissao ? new Date(p.emissao).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
