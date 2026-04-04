'use client';

import { useState, useMemo } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function InventoryPage() {
  const { data, isLoading, error } = useInventory();
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error Loading Inventory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const years = useMemo(() => {
    const yearSet = new Set<string>();
    data.historico_saldo.forEach((h) => {
      const year = h.mes.substring(0, 4);
      yearSet.add(year);
    });
    return Array.from(yearSet).sort().reverse();
  }, [data.historico_saldo]);

  const filteredHistorico = useMemo(() => {
    return data.historico_saldo.filter((h) => h.mes.startsWith(selectedYear));
  }, [data.historico_saldo, selectedYear]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Inventory Control</h1>
        <p className="text-sm text-muted-foreground mt-2">Stock levels and consumption tracking from Premium Storage</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.consumo_vs_limite.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Exceeded Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {data.consumo_vs_limite.filter((c) => c.limite_excedido).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Below Minimum</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {data.historico_saldo.filter((h) => h.abaixo_minimo).length}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Year</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-2 rounded-lg ${
                      selectedYear === year ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Monthly Data - {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{filteredHistorico.length} months of data</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consumption Records</span>
                <span className="font-medium">{data.consumo_vs_limite.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance History</span>
                <span className="font-medium">{data.historico_saldo.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Excess Details</span>
                <span className="font-medium">{data.detalhes_excesso.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">User Spending</span>
                <span className="font-medium">{data.gastos_usuario.length}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
