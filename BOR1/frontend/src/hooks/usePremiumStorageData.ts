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
      
      const fetchActiveProducts = async () => {
        const attempts = [
          { select: 'id, nome, is_archived', getIsActive: (p: any) => p.is_archived !== true },
          { select: 'id, nome, archived', getIsActive: (p: any) => p.archived !== true },
          { select: 'id, nome, arquivado', getIsActive: (p: any) => p.arquivado !== true },
          { select: 'id, nome, archived_at', getIsActive: (p: any) => !p.archived_at },
          { select: 'id, nome, arquivado_em', getIsActive: (p: any) => !p.arquivado_em },
          { select: 'id, nome, is_active', getIsActive: (p: any) => p.is_active !== false },
          { select: 'id, nome, status', getIsActive: (p: any) => {
              const s = String(p.status || '').toLowerCase();
              return !(s === 'archived' || s === 'inactive' || s === 'deactivated' || s === 'disabled');
            } 
          },
          { select: 'id, nome, ativo', getIsActive: (p: any) => p.ativo !== false },
          { select: 'id, nome', getIsActive: (_p: any) => true },
        ];

        for (const attempt of attempts) {
          const res = await premiumStorageClient.from('products').select(attempt.select);
          if (res.error) continue;
          const rows = (res.data as any[]) || [];
          const productNames: Record<string, string> = {};
          const activeProductIds = new Set<string>();
          const activeProductNames = new Set<string>();
          rows.forEach((p: any) => {
            const id = String(p.id ?? '');
            if (!id) return;
            productNames[id] = p.nome;
            if (attempt.getIsActive(p)) {
              activeProductIds.add(id);
              if (p.nome) activeProductNames.add(String(p.nome));
            }
          });
          return { productNames, activeProductIds, activeProductNames };
        }

        return { productNames: {}, activeProductIds: new Set<string>(), activeProductNames: new Set<string>() };
      };

      // Busca paralela de todas as views e a tabela de produtos para preços
      const [
        consumoRes,
        historicoRes,
        excessoRes,
        gastosRes,
        movementItemsRes,
        movementsRes
      ] = await Promise.all([
        premiumStorageClient.from('vw_consumo_vs_limite').select('*'),
        premiumStorageClient.from('vw_historico_saldo_mensal').select('*'),
        premiumStorageClient.from('vw_detalhes_excesso_limite').select('*'),
        premiumStorageClient.from('vw_gasto_por_usuario').select('*'),
        // Fetch latest prices from movement items
        premiumStorageClient.from('stock_movement_items').select('product_id, valor_unitario').order('id', { ascending: false }).limit(2000),
        // Fetch movements to get recipient information
        premiumStorageClient.from('stock_movements').select('movement_date, destinatario_id').order('movement_date', { ascending: false }).limit(2000)
      ]);

      if (consumoRes.error) throw consumoRes.error;
      if (historicoRes.error) throw historicoRes.error;
      if (excessoRes.error) throw excessoRes.error;
      if (gastosRes.error) throw gastosRes.error;
      
      const { productNames, activeProductIds, activeProductNames } = await fetchActiveProducts();
      const isActiveProduct = (productId: unknown) => {
        const id = String(productId ?? '');
        if (!id) return false;
        if (activeProductIds.size === 0) return true;
        return activeProductIds.has(id);
      };
      const isActiveByName = (productName: unknown) => {
        if (activeProductNames.size === 0) return true;
        const name = String(productName ?? '');
        if (!name) return false;
        return activeProductNames.has(name);
      };

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
          const productId = String(p.product_id ?? '');
          if (p.valor_unitario && productId && !prices[productId]) {
            prices[productId] = p.valor_unitario;
            // Also map by name as fallback
            const name = productNames[productId];
            if (name && !prices[name]) {
              prices[name] = p.valor_unitario;
            }
          }
        });
      }
      setProductPrices(prices);

      setData(consumoRes.data || []);
      // Aplicar filtro de arquivados apenas nas contagens de produto (ex.: Stock Adherence)
      setHistoricoSaldo(((historicoRes.data as any[]) || []).filter((row) => {
        const r: any = row;
        return isActiveProduct(r.product_id) && isActiveByName(r.product_nome);
      }) as any);

      // Attach destinatario_id to excess details by matching movement_date
      const mappedExcesso = ((excessoRes.data as any[]) || []).map((d: any) => ({
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
