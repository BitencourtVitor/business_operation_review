import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Destaque, Oportunidade } from '../types/accounting';
import type { PlanoAcao } from '../types/common';

export function usePartitionData(telaId: string, usuarioResponsavelId: string, usuariosParaBuscar?: string[]) {
  const [destaques, setDestaques] = useState<Destaque[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [planosAcao, setPlanosAcao] = useState<PlanoAcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartitionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar destaques
      let destaquesQuery = supabase
        .from('destaques')
        .select('*')
        .eq('tela_id', telaId)
        .order('criado_em', { ascending: false });

      // Se temos usuários específicos para buscar, filtrar por eles
      if (usuariosParaBuscar && usuariosParaBuscar.length > 0) {
        destaquesQuery = destaquesQuery.in('usuario_id', usuariosParaBuscar);
      } else {
        destaquesQuery = destaquesQuery.eq('usuario_id', usuarioResponsavelId);
      }

      const { data: destaquesData, error: destaquesError } = await destaquesQuery;
      if (destaquesError) throw destaquesError;
      setDestaques(destaquesData || []);

      // Buscar oportunidades
      let oportunidadesQuery = supabase
        .from('oportunidades')
        .select('*')
        .eq('tela_id', telaId)
        .order('criado_em', { ascending: false });

      // Se temos usuários específicos para buscar, filtrar por eles
      if (usuariosParaBuscar && usuariosParaBuscar.length > 0) {
        oportunidadesQuery = oportunidadesQuery.in('usuario_id', usuariosParaBuscar);
      } else {
        oportunidadesQuery = oportunidadesQuery.eq('usuario_id', usuarioResponsavelId);
      }

      const { data: oportunidadesData, error: oportunidadesError } = await oportunidadesQuery;
      if (oportunidadesError) throw oportunidadesError;
      setOportunidades(oportunidadesData || []);

      // Buscar planos de ação dos usuários relevantes (apenas não deletados)
      let planosQuery = supabase
        .from('planos_de_acao')
        .select('*')
        .eq('deletado', false)
        .eq('tela_id', telaId);

      // Se temos usuários específicos para buscar, filtrar por eles
      if (usuariosParaBuscar && usuariosParaBuscar.length > 0) {
        planosQuery = planosQuery.in('usuario_id', usuariosParaBuscar);
      } else {
        planosQuery = planosQuery.eq('usuario_id', usuarioResponsavelId);
      }

      const { data: planosData, error: planosError } = await planosQuery;
      if (planosError) throw planosError;
      setPlanosAcao(planosData || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados das partições');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (telaId && usuarioResponsavelId) {
      fetchPartitionData();
    }
  }, [telaId, usuarioResponsavelId, usuariosParaBuscar]);



  return {
    destaques,
    oportunidades,
    planosAcao,
    loading,
    error,
    refetch: fetchPartitionData
  };
} 