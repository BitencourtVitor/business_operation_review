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
  product_id: string;
  product_nome: string;
  usuario_responsavel: string;
  destinatario_id?: string;
  movement_date: string;
  quantidade_retirada: number;
  quantidade_limite: number;
  consumo_acumulado_momento: number;
  excedeu_neste_momento: boolean;
  valor_unitario?: number;
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
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Busca paralela de todas as views e a tabela de produtos para preços
      const [
        consumoRes,
        historicoRes,
        excessoRes,
        gastosRes,
        productsRes,
        movementItemsRes,
        movementsRes
      ] = await Promise.all([
        premiumStorageClient.from('vw_consumo_vs_limite').select('*'),
        premiumStorageClient.from('vw_historico_saldo_mensal').select('*'),
        premiumStorageClient.from('vw_detalhes_excesso_limite').select('*'),
        premiumStorageClient.from('vw_gasto_por_usuario').select('*'),
        // Fetch products for names (fallback lookup)
        premiumStorageClient.from('products').select('id, nome'),
        // Fetch latest prices from movement items
        premiumStorageClient.from('stock_movement_items').select('product_id, valor_unitario').order('id', { ascending: false }).limit(2000),
        // Fetch movements to get recipient information
        premiumStorageClient.from('stock_movements').select('movement_date, destinatario_id').order('movement_date', { ascending: false }).limit(2000)
      ]);

      if (consumoRes.error) throw consumoRes.error;
      if (historicoRes.error) throw historicoRes.error;
      if (excessoRes.error) throw excessoRes.error;
      if (gastosRes.error) throw gastosRes.error;
      
      const productNames: Record<string, string> = {};
      if (productsRes.data) {
        productsRes.data.forEach((p: any) => {
          productNames[p.id] = p.nome;
        });
      }

      // Create mapping of movement_date to destinatario_id
      const movementRecipients: Record<string, string> = {};
      if (movementsRes.data) {
        movementsRes.data.forEach((m: any) => {
          if (m.movement_date && m.destinatario_id) {
            movementRecipients[m.movement_date] = m.destinatario_id;
          }
        });
      }

      // Map product prices from stock_movement_items (latest first)
      const prices: Record<string, number> = {};
      if (movementItemsRes.data) {
        movementItemsRes.data.forEach((p: any) => {
          if (p.valor_unitario && !prices[p.product_id]) {
            prices[p.product_id] = p.valor_unitario;
            // Also map by name as fallback
            const name = productNames[p.product_id];
            if (name && !prices[name]) {
              prices[name] = p.valor_unitario;
            }
          }
        });
      }
      setProductPrices(prices);

      setData(consumoRes.data || []);
      setHistoricoSaldo(historicoRes.data || []);

      // Attach destinatario_id to excess details by matching movement_date
      const mappedExcesso = (excessoRes.data || []).map((d: any) => ({
        ...d,
        destinatario_id: movementRecipients[d.movement_date] || d.destinatario_id
      }));
      setDetalhesExcesso(mappedExcesso);

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
    productPrices,
    loading, 
    error, 
    refetch: fetchData 
  };
};
