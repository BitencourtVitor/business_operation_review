import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export interface ProjectMonitoringHvacData {
  id: string;
  city: string | null;
  job_site: string | null;
  lot_number: string | null;
  team: string | null;
  start_date: string | null;
  finish_date: string | null;
  s1_rough: string | null;
  s1_date: string | null;
  s2_machines: string | null;
  s2_date: string | null;
  s3_condenser: string | null;
  s3_date: string | null;
  s4_finish: string | null;
  s4_date: string | null;
  percent_completed: number | null;
  last_update: string | null;
  notes: string | null;
  created_at: string | null;
}

export function useProjectMonitoringHvacData() {
  const [data, setData] = useState<ProjectMonitoringHvacData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: result, error: sqlError } = await supabase
        .from('project_monitoring_hvac')
        .select('*')
        .order('created_at', { ascending: false });

      if (sqlError) {
        console.error('❌ ProjectMonitoringHvac - Erro SQL:', sqlError);
        throw sqlError;
      }

      setData(result || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados de monitoramento HVAC';
      console.error('❌ ProjectMonitoringHvac - Erro:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refetch: fetchData };
}
