// Tipos específicos para Accounting Indicators

export interface AccountingRow {
  id: string;
  date: string;
  date_field?: string;
  
  // Campos específicos de receivables
  inv_date?: string;
  inv_num?: string;
  customer_full_name?: string;
  inv_amount?: number;
  epo_number?: string;
  aging_days?: number;
  
  // Campos específicos de payables
  expense_date?: string;
  bill_num?: string;
  vendor_display_name?: string;
  total_amount?: number;
  past_due?: number;
  
  // Campos comuns
  transaction_type?: string;
  due_date?: string;
  open_balance: number;
  aging_intervals: string;
  category: string;
  type: 'receivables' | 'payables';
}

export interface Destaque {
  id: string;
  tela_id: string;
  titulo: string;
  descricao: string;
  tipo: 'positive' | 'negative' | 'neutral';
  criado_em: string;
  mes: string;
  ano: string;
  valor?: number;
  percentual?: number;
  categoria?: string;
}

export interface Oportunidade {
  id: string;
  tela_id: string;
  titulo: string;
  descricao: string;
  impacto: 'high' | 'medium' | 'low';
  prioridade: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'completed';
  criado_em: string;
  mes: string;
  ano: string;
  valor_estimado?: number;
  prazo?: string;
  responsavel?: string;
}

export interface AccountingData {
  date: string;
  receivables: number;
  payables: number;
  cash_flow: number;
  type: 'receivables' | 'payables';
  open_balance: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
  }[];
}

export interface TooltipExternalProps {
  tooltip: Record<string, unknown>;
  chartLabels: string[];
  chartDatasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
  }[];
} 