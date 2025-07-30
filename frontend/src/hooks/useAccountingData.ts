import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { AccountingRow } from '../types/accounting';

// Função utilitária para buscar todos os registros de uma tabela via paginação
async function fetchAllRows(table: string) {
  const pageSize = 1000;
  let allRows: unknown[] = [];
  let from = 0;
  let to = pageSize - 1;
  let finished = false;

  while (!finished) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);
    if (error) throw error;
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < pageSize) {
        finished = true;
      } else {
        from += pageSize;
        to += pageSize;
      }
    } else {
      finished = true;
    }
  }
  return allRows;
}

export function useAccountingData() {
  const [data, setData] = useState<AccountingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [agingIntervals, setAgingIntervals] = useState<string[]>([]);
  const [receivablesCategories, setReceivablesCategories] = useState<string[]>([]);
  const [payablesCategories, setPayablesCategories] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar todos os dados de receivables_accounting e payables_accounting sem limitação
      let receivablesData: unknown[] = [];
      let payablesData: unknown[] = [];
      
      try {
        receivablesData = await fetchAllRows('receivables_accounting');
      } catch {
        receivablesData = [];
      }
      
      try {
        payablesData = await fetchAllRows('payables_accounting');
      } catch {
        payablesData = [];
      }

      // Transformar dados de receivables para o formato unificado
      const receivables = (receivablesData || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ''),
          date: String(r.date_field ?? ''), // Voltar para date_field como estava
          date_field: String(r.date_field ?? ''),
          inv_date: String(r.inv_date ?? ''),
          transaction_type: String(r.transaction_type ?? ''),
          inv_num: String(r.inv_num ?? ''),
          customer_full_name: String(r.customer_full_name ?? ''),
          due_date: String(r.due_date ?? ''),
          open_balance: Number(r.open_balance ?? 0),
          category: String(r.category ?? ''),
          aging_intervals: String(r.aging_intervals ?? ''),
          type: 'receivables' as const,
        };
      });

      // Transformar dados de payables para o formato unificado
      const payables = (payablesData || []).map((row) => {
        const p = row as Record<string, unknown>;
        return {
          id: String(p.id ?? ''),
          date: String(p.date_field ?? ''), // Voltar para date_field como estava
          date_field: String(p.date_field ?? ''),
          expense_date: String(p.expense_date ?? ''),
          transaction_type: String(p.transaction_type ?? ''),
          bill_num: String(p.bill_num ?? ''),
          vendor_display_name: String(p.vendor_display_name ?? ''),
          due_date: String(p.due_date ?? ''),
          open_balance: Number(p.open_balance ?? 0),
          category: String(p.category ?? ''),
          aging_intervals: String(p.aging_intervals ?? ''),
          type: 'payables' as const,
        };
      });

      // Combinar os dados
      const combinedData = [...receivables, ...payables];
      setData(combinedData);

      // Extrair filtros únicos
      const uniqueAging = [...new Set(combinedData.map(d => d.aging_intervals).filter(Boolean))];
      const uniqueYears = [...new Set(combinedData.map(d => d.date?.split('-')[0]).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

      // Separar categorias por tipo
      const receivablesCats = [...new Set(receivables.map(d => d.category).filter(Boolean))];
      const payablesCats = [...new Set(payables.map(d => d.category).filter(Boolean))];

      setAgingIntervals(uniqueAging);
      setReceivablesCategories(receivablesCats);
      setPayablesCategories(payablesCats);
      setYears(uniqueYears);

      // Verificar se há apenas um mês e setar o filtro de mês
      const uniqueMonths = [...new Set(combinedData.map(d => {
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
    receivablesCategories,
    payablesCategories
  };
} 