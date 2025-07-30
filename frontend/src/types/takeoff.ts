export interface TakeoffRow {
  id: string;
  project: string;
  data_solicitacao: string;
  data_inicio: string;
  data_estimada_entrega: string;
  entrega_real: string;
  description: string;
  doc_links: string;
  modelo_da_casa: string;
  opcionais_da_casa: string;
  arquivo_dwg: string;
  plano_estrutural: string;
  adequacao_dwg: string;
  importacao_dwg_mitek: string;
  execucao_3d_mitek: string;
  lista_materiais_excel: string;
  dividir_3d_paineis: string;
  validacao_projeto_takeoff: string;
  created_at?: string;
} 