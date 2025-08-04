export interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  responsaveis: string[];
  status: string;
  data_limite: string;
}

export interface PlanoAcao {
  id: string;
  usuario_id: string;
  tela_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string | null;
  acoes: Acao[];
  deletado?: boolean;
} 