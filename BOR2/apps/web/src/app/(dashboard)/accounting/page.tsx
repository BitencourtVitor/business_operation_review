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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useReceivables, usePayables } from "@/hooks/use-receivables"
import { DollarSign, FileText, AlertTriangle } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function AccountingPage() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || undefined
  const [tab, setTab] = useState<"receivables" | "payables">("receivables")

  const { data: receivables, isLoading: loadingReceivables } = useReceivables(company)
  const { data: payables, isLoading: loadingPayables } = usePayables(company)

  const isLoading = loadingReceivables && loadingPayables

  const totalReceivables = receivables?.reduce((sum, r) => sum + r.openBalance, 0) ?? 0
  const totalPayables = payables?.reduce((sum, p) => sum + p.openBalance, 0) ?? 0

  const currentData = tab === "receivables" ? receivables : payables
  const currentLoading = tab === "receivables" ? loadingReceivables : loadingPayables

  const totalOpenBalance = currentData?.reduce((sum, r) => sum + r.openBalance, 0) ?? 0
  const count = currentData?.length ?? 0
  const overdue = currentData?.filter((r) => r.aging > 90).length ?? 0

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground">
          Receivables and payables overview{company ? ` for ${company}` : ""}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Open Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalOpenBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Count</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue (&gt;90 days)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "receivables" | "payables")}>
        <TabsList>
          <TabsTrigger value="receivables">Receivables ({receivables?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="payables">Payables ({payables?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="receivables" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Open Balance</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Aging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReceivables ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                  </TableRow>
                ) : receivables?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No receivables found</TableCell>
                  </TableRow>
                ) : (
                  receivables?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.transactionType}</TableCell>
                      <TableCell>{r.customer}</TableCell>
                      <TableCell>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.openBalance)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.aging > 90 ? "destructive" : r.aging > 30 ? "secondary" : "outline"}>
                          {r.aging} days
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payables" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Type</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Open Balance</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Aging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPayables ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                  </TableRow>
                ) : payables?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payables found</TableCell>
                  </TableRow>
                ) : (
                  payables?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.transactionType}</TableCell>
                      <TableCell>{p.vendor}</TableCell>
                      <TableCell>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(p.openBalance)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.aging > 90 ? "destructive" : p.aging > 30 ? "secondary" : "outline"}>
                          {p.aging} days
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
