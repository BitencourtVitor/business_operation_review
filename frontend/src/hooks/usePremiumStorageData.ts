import { useState, useEffect } from 'react';
import { premiumStorageClient } from '../premiumStorageClient';

export interface ConsumoVsLimite {
  project_id: string;
  project_nome: string;
  house_model_id: string;
  house_model_nome: string;
  product_id: string;
  product_nome: string;
  unidade_medida: string;
  quantidade_limite: number;
  quantidade_consumida: number;
  percentual_consumido: number | null;
  limite_excedido: boolean;
}

export interface HistoricoSaldo {
  mes: string;
  product_id: string;
  product_nome: string;
  saldo_minimo: number;
  saldo_acumulado: number;
  abaixo_minimo: boolean;
}

export interface DetalheExcesso {
  project_id: string;
  project_nome: string;
  house_model_nome: string;
  product_nome: string;
  usuario_responsavel: string;
  movement_date: string;
  quantidade_retirada: number;
  quantidade_limite: number;
  consumo_acumulado_momento: number;
  excedeu_neste_momento: boolean;
}

export interface GastoUsuario {
  usuario_id: string;
  usuario_nome: string;
  role: string;
  mes: string;
  total_retiradas: number;
  valor_total_retirado: number;
}

export const usePremiumStorageData = () => {
  const [data, setData] = useState<ConsumoVsLimite[]>([]);
  const [historicoSaldo, setHistoricoSaldo] = useState<HistoricoSaldo[]>([]);
  const [detalhesExcesso, setDetalhesExcesso] = useState<DetalheExcesso[]>([]);
  const [gastosUsuario, setGastosUsuario] = useState<GastoUsuario[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Busca paralela de todas as views
      const [
        consumoRes,
        historicoRes,
        excessoRes,
        gastosRes
      ] = await Promise.all([
        premiumStorageClient.from('vw_consumo_vs_limite').select('*'),
        premiumStorageClient.from('vw_historico_saldo_mensal').select('*'),
        premiumStorageClient.from('vw_detalhes_excesso_limite').select('*'),
        premiumStorageClient.from('vw_gasto_por_usuario').select('*')
      ]);

      if (consumoRes.error) throw consumoRes.error;
      if (historicoRes.error) throw historicoRes.error;
      if (excessoRes.error) throw excessoRes.error;
      if (gastosRes.error) throw gastosRes.error;

      setData(consumoRes.data || []);
      setHistoricoSaldo(historicoRes.data || []);
      setDetalhesExcesso(excessoRes.data || []);
      setGastosUsuario(gastosRes.data || []);

    } catch (err: any) {
      console.error('Error fetching Premium Storage data:', err);
      setError(err.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  };

  return { 
    data, 
    historicoSaldo,
    detalhesExcesso,
    gastosUsuario,
    loading, 
    error, 
    refetch: fetchData 
  };
};
