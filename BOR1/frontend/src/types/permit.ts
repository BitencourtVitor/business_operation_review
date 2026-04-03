export interface PermitRow {
  id: string;
  emissao: string;
  jobsite: string;
  lot_address: string;
  situacao: string;
  solicitacao: string;
  aplicacao: string;
  observacao: string;
  arquivo: string;
  model: string;
  descricao?: string;
  vencimento?: string;
  status?: string;
}

export interface PermitFilters {
  selectedYear: string;
  selectedMonth: string;
  selectedModel: string[];
  selectedSituation: string[];
  selectedJobsite: string[];
}

export interface PermitMetrics {
  totalPermits: number;
  pendingPermits: number;
  approvedPermits: number;
  rejectedPermits: number;
} 