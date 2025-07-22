import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface ProjectCarouselData {
  estimate_id: string;
  project_name: string;
  customer_id: string;
  status: string;
  estimate_date: string;
  estimate_total: number;
  bill_count: number;
  bill_total: number;
  invoice_count: number;
  invoice_total: number;
  payments_made_count: number;
  payments_made_total: number;
  payments_received_count: number;
  payments_received_total: number;
}

export function useProjectCarouselData({ dateFrom, dateTo, onlyAccepted }: { dateFrom: string; dateTo: string; onlyAccepted: boolean }) {
  const [data, setData] = useState<ProjectCarouselData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: result, error: sqlError } = await supabase.rpc('get_project_carousel_data', {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_only_accepted: onlyAccepted
      });
      if (sqlError) throw sqlError;
      setData(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do carrossel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, onlyAccepted]);

  return { data, loading, error, refetch: fetchData };
} 