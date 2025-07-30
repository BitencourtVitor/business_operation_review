import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface ProjectChartData {
  period_label: string;
  receivable_amount: number;
  payable_amount: number;
  pending_receivable_amount: number;
  pending_payable_amount: number;
}

export function useProjectChartData({ 
  selectedYear, 
  selectedMonth, 
  selectedGroup 
}: { 
  selectedYear: string; 
  selectedMonth: string; 
  selectedGroup: 'all' | 'receivable' | 'payable'; 
}) {
  const [data, setData] = useState<ProjectChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: result, error: sqlError } = await supabase.rpc('get_project_chart_data', {
        p_selected_year: selectedYear || null,
        p_selected_month: selectedMonth || null,
        p_selected_group: selectedGroup
      });
      
      if (sqlError) {
        console.error('❌ ProjectChart - Erro SQL:', sqlError);
        throw sqlError;
      }
      
      setData(result || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados do gráfico';
      console.error('❌ ProjectChart - Erro:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedYear, selectedMonth, selectedGroup]);

  return { data, loading, error, refetch: fetchData };
} 