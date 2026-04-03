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

        // Função auxiliar para buscar todos os dados com paginação
        const fetchAllData = async (tableName: string) => {
          let allData: unknown[] = [];
          let from = 0;
          const pageSize = 1000;
          
          while (true) {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .order('emissao', { ascending: false })
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

        const permitData = await fetchAllData('permit_control');

        setData(permitData as PermitRow[] || []);
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
