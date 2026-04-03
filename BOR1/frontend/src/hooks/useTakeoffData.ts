import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { TakeoffRow } from '../types/takeoff';

export function useTakeoffData() {
  const [data, setData] = useState<TakeoffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchAllData = async (tableName: string) => {
          let allData: unknown[] = [];
          let from = 0;
          const pageSize = 1000;
          while (true) {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData = [...allData, ...data];
            from += pageSize;
            if (data.length < pageSize) break;
          }
          return allData;
        };
        const tableName = 'takeoff_works';
        let takeoffData: unknown[] = [];
        try {
          takeoffData = await fetchAllData(tableName);
        } catch {
          takeoffData = [];
        }
        setData(takeoffData as TakeoffRow[] || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return { data, loading, error };
}
