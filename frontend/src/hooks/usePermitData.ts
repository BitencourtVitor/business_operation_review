import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { PermitRow } from '../types/permit';

export function usePermitData() {
  const [data, setData] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: permitData, error: fetchError } = await supabase
          .from('permit_control')
          .select('*')
          .order('emissao', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        setData(permitData || []);
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
