import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { JobCostingTimesheetRow } from '../types/timesheet';

export function useJobCostingData() {
  const [data, setData] = useState<JobCostingTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar todos os dados da tabela timesheet_data_new
      const { data: dbData, error: err } = await supabase
        .from('timesheet_data_new')
        .select('*')
        .order('reference_month', { ascending: false });

      if (err) throw err;

      setData(dbData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de job costing');
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
    refetch: fetchData
  };
}
