import { useAuthStore } from '@/store/auth.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

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
  source: 'backup' | 'live';
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
  source: 'backup' | 'live';
}

export interface GastoUsuario {
  usuario_id: string;
  usuario_nome: string;
  role: string;
  mes: string;
  total_retiradas: number;
  valor_total_retirado: number;
}

export interface InventoryData {
  consumo_vs_limite: ConsumoVsLimite[];
  historico_saldo: HistoricoSaldo[];
  detalhes_excesso: DetalheExcesso[];
  gastos_usuario: GastoUsuario[];
  product_prices: Record<string, number>;
  reset_date: string;
  backup_through: string;
}

export const inventoryService = {
  async getInventory(): Promise<InventoryData> {
    // O token vem do store da sessão, como no resto do sistema. Aqui ele era
    // lido de `localStorage.auth_token`, chave que não existe: o valor saía
    // nulo, o cabeçalho ia como "Bearer null" e a API respondia 401 sempre. A
    // tela então mostrava "Failed to load inventory data" como se o dado
    // tivesse quebrado, quando ninguém nunca chegou a pedi-lo autenticado.
    const res = await fetch(`${API_URL}/api/v1/inventory`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.statusText}`);
    return res.json();
  },
};
