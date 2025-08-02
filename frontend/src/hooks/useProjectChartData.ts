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
  selectedGroup,
  company = 'HVAC'
}: { 
  selectedYear: string; 
  selectedMonth: string; 
  selectedGroup: 'all' | 'receivable' | 'payable'; 
  company?: string;
}) {
  const [data, setData] = useState<ProjectChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Determinar qual função SQL usar baseado na empresa
      const functionName = company === 'HVAC' ? 'get_project_chart_data' : 'get_framing_project_chart_data';
      
      const { data: result, error: sqlError } = await supabase.rpc(functionName, {
        p_selected_year: selectedYear || null,
        p_selected_month: selectedMonth || null
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
  }, [selectedYear, selectedMonth, selectedGroup, company]);

  return { data, loading, error, refetch: fetchData };
} 