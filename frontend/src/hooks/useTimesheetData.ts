import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { TimesheetRow } from '../types/timesheet';

export function useTimesheetData() {
  const [data, setData] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar dados de timesheet da tabela timesheet_analysis
      const { data: timesheetData, error: timesheetError } = await supabase
        .from('timesheet_analysis')
        .select('*')
        .order('date', { ascending: true });

      if (timesheetError) throw timesheetError;
      
      // Transformar os dados para o formato esperado
      const transformedData: TimesheetRow[] = (timesheetData || []).map(row => ({
        id: row.id.toString(),
        date: row.date,
        nome: row.nome || '',
        error: row.error || '',
        team: row.team || '',
        corporation: row.corporation || '',
        payrate: row.payrate?.toString() || '',
        add_time_hour: row.add_time_hour?.toString() || '',
        remove_time_hour: row.remove_time_hour?.toString() || '',
        add_dollar: row.add_dollar?.toString() || '',
        remove_dollar: row.remove_dollar?.toString() || '',
        total: row.total?.toString() || ''
      }));

      setData(transformedData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de timesheet');
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