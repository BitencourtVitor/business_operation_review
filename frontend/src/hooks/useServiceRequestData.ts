import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { ServiceRequestRow } from '../types/service';
import { normalizeUtf8String } from '../utils/dataUtils';

export function useServiceRequestData() {
  const [data, setData] = useState<ServiceRequestRow[]>([]);
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
            .order('date_received', { ascending: false })
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

      // Buscar dados de service requests da tabela service_requests com paginação
      const serviceRequestData = await fetchAllData('service_requests');
      
      // Transformar os dados para o formato esperado
      const transformedData: ServiceRequestRow[] = (serviceRequestData || []).map((row: Record<string, unknown>) => ({
        id: row.id?.toString() || '',
        contractor: normalizeUtf8String(row.contractor),
        job_site: normalizeUtf8String(row.job_site),
        city: normalizeUtf8String(row.city),
        lot: normalizeUtf8String(row.lot),
        address: normalizeUtf8String(row.address),
        close_date: row.close_date?.toString() || '',
        date_received: row.date_received?.toString() || '',
        material_available_date: row.material_available_date?.toString() || '',
        resident_available_date: row.resident_available_date?.toString() || '',
        date_completed: row.date_completed?.toString() || '',
        additional_visits: Array.isArray(row.additional_visits) ? row.additional_visits.map((date: unknown) => date?.toString() || '') : [],
        issue: normalizeUtf8String(row.issue),
        warranty: Boolean(row.warranty),
        cost: Number(row.cost) || 0,
        tech: normalizeUtf8String(row.tech),
        created_at: row.created_at?.toString() || ''
      }));

      setData(transformedData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de service requests');
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