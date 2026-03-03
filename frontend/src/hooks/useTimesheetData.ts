import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { TimesheetRow } from '../types/timesheet';
import { normalizeUtf8String } from '../utils/dataUtils';

export function useTimesheetData() {
  const [data, setData] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Função auxiliar para buscar todos os dados com paginação
      const fetchAllData = async (tableName: string) => {
        let allData: unknown[] = [];
        let from = 0;
        const pageSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('date', { ascending: true })
            .range(from, from + pageSize - 1);
          
          if (error) throw error;
          if (!data || data.length === 0) break;
          
          allData = [...allData, ...data];
          from += pageSize;
          
          // Se não há mais dados (menos que pageSize registros retornados)
          if (data.length < pageSize) break;
        }
        
        return allData;
      };

      // Buscar dados de timesheet da tabela timesheet_analysis com paginação
      const timesheetData = await fetchAllData('timesheet_analysis');
      
      // Transformar os dados para o formato esperado
      const transformedData: TimesheetRow[] = (timesheetData || []).map((row: any) => ({
        id: row.id?.toString() || '',
        date: row.date?.toString() || '',
        nome: normalizeUtf8String(row.nome as string),
        error: normalizeUtf8String(row.error as string),
        team: normalizeUtf8String(row.team as string),
        corporation: normalizeUtf8String(row.corporation as string),
        payrate: row.payrate?.toString() || '',
        add_time_hour: row.add_time_hour?.toString() || '',
        remove_time_hour: row.remove_time_hour?.toString() || '',
        add_dollar: row.add_dollar?.toString() || '',
        remove_dollar: row.remove_dollar?.toString() || '',
        total: row.total?.toString() || '',
        jobsite: row.jobsite ? normalizeUtf8String(row.jobsite as string) : '',
        lot_building: row.lot_building ? normalizeUtf8String(row.lot_building as string) : '',
        worktype: row.worktype ? normalizeUtf8String(row.worktype as string) : '',
        regular_hours: row.regular_hours?.toString() || ''
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