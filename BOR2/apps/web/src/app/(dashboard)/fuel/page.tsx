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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSamsaraEvents, useWexTransactions } from "@/hooks/use-fuel"
import { useState } from "react"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)

export default function FuelPage() {
  const [driver, setDriver] = useState("")

  const { data: samsara, isLoading: loadingSamsara } = useSamsaraEvents({
    driverName: driver || undefined,
  })

  const { data: wex, isLoading: loadingWex } = useWexTransactions({
    driverName: driver || undefined,
  })

  const totalFuelCost = wex?.reduce((sum, t) => sum + t.totalFuelCost, 0) ?? 0
  const totalDistance = samsara
    ?.filter((e) => e.type === "trip")
    .reduce((sum, e) => sum + e.distance, 0) ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Fuel Control</h1>
        <p className="text-sm text-muted-foreground">Samsara fleet tracking and WEX fuel transactions</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fuel Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalFuelCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Distance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDistance.toFixed(1)} mi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Idle Events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {samsara?.filter((e) => e.type === "idle").length ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Filter by driver name..."
        value={driver}
        onChange={(e) => setDriver(e.target.value)}
        className="max-w-xs"
      />

      {/* Tabs */}
      <Tabs defaultValue="samsara">
        <TabsList>
          <TabsTrigger value="samsara">Samsara Events</TabsTrigger>
          <TabsTrigger value="wex">WEX Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="samsara" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSamsara ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : samsara?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{new Date(e.eventDate).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{e.driverName}</TableCell>
                    <TableCell>
                      <Badge variant={e.type === "trip" ? "default" : "secondary"}>{e.type}</Badge>
                    </TableCell>
                    <TableCell>{e.location}</TableCell>
                    <TableCell className="text-right">{e.distance.toFixed(1)} {e.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="wex" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Gallons</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingWex ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : wex?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{t.driverName}</TableCell>
                    <TableCell>{t.merchantCity}</TableCell>
                    <TableCell className="text-right">{t.units.toFixed(3)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(t.totalFuelCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
