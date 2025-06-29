import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { AccountingRow } from '../types/accounting';

export function useAccountingData() {
  const [data, setData] = useState<AccountingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [agingIntervals, setAgingIntervals] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar dados de receivables_accounting usando a coluna date_field
      const { data: receivablesData, error } = await supabase
        .from('receivables_accounting')
        .select('*');
      
      if (error) {
        throw error;
      }

      // Transformar dados para o formato esperado
      const transformedData: AccountingRow[] = (receivablesData || []).map((row: Record<string, unknown>) => ({
        id: String(row.id || ''),
        date: String(row.date_field || row.date || ''), // Usar date_field se disponível, senão date
        date_field: String(row.date_field || ''),
        inv_num: String(row.inv_num || ''),
        customer_full_name: String(row.customer_full_name || ''),
        open_balance: parseFloat(String(row.open_balance)) || 0,
        aging_intervals: String(row.aging_intervals || ''),
        category: String(row.category || ''),
        type: 'receivables' as const
      }));

      setData(transformedData);

      // Extrair filtros únicos (igual ao backup)
      const uniqueAging = [...new Set(transformedData.map(d => d.aging_intervals).filter(Boolean))];
      const uniqueCategories = [...new Set(transformedData.map(d => d.category).filter(Boolean))];
      const uniqueYears = [...new Set(transformedData.map(d => d.date?.split('-')[0]).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

      setAgingIntervals(uniqueAging);
      setCategories(uniqueCategories);
      setYears(uniqueYears);

      // Verificar se há apenas um mês (junho) e setar o filtro de mês
      const uniqueMonths = [...new Set(transformedData.map(d => {
        if (!d.date) return null;
        return String(Number(d.date.split('-')[1])).padStart(2, '0');
      }).filter(Boolean))];
      if (uniqueMonths.length === 1 && uniqueMonths[0]) {
        setMonths([uniqueMonths[0] as string]);
      } else {
        setMonths([]);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    // Opções de filtro
    years,
    months,
    agingIntervals,
    categories
  };
} 