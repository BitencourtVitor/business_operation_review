import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export interface OFIData {
  id: string;
  obra_id: string;
  project_name?: string; // Nome legível da obra
  reference_month: number;
  reference_year: number;
  capture_date: string;
  fieldwire_score: number;
  machines_score: number;
  contract_score: number;
  systems_score: number;
  total_score: number;
  created_at: string;
}

export function useOFIData() {
  const [data, setData] = useState<OFIData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar dados do OFI
      console.log('🚀 useOFIData - Iniciando busca de dados...');
      const { data: ofiResult, error: sqlError } = await supabase
        .from('operational_forecast_index')
        .select('*')
        .order('reference_year', { ascending: false })
        .order('reference_month', { ascending: false });

      if (sqlError) {
        console.error('❌ OFIData - Erro SQL:', sqlError);
        throw sqlError;
      }

      console.log(`✅ useOFIData - ${ofiResult?.length || 0} registros encontrados no OFI`);

      // Buscar mapeamento de obras para pegar os nomes legíveis da tabela forecast_data
      const { data: forecastResult, error: forecastError } = await supabase
        .from('forecast_data')
        .select('id, job_site, type, lote_bld');

      if (forecastError) {
        console.warn('⚠️ useOFIData - Não foi possível carregar nomes dos projetos de forecast_data:', forecastError);
      }

      console.log(`✅ useOFIData - ${forecastResult?.length || 0} registros encontrados em forecast_data`);

      // Mapear os dados para incluir o nome do projeto concatenado (Job Site - Type - Lote)
      const mappedData = (ofiResult || []).map(item => {
        const projectMatch = (forecastResult || []).find(p => p.id === item.obra_id);
        
        let projectName = item.obra_id;
        if (projectMatch) {
          const { job_site, type, lote_bld } = projectMatch;
          const typeAndLote = [type, lote_bld].filter(Boolean).join(' ');
          const parts = [job_site, typeAndLote].filter(Boolean);
          projectName = parts.join(' - ');
        }

        return {
          ...item,
          project_name: projectName
        };
      });

      setData(mappedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados do OFI';
      console.error('❌ OFIData - Erro:', errorMessage);
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
