// Tipos comuns para todo o projeto

export interface PlanoAcao {
  id: string;
  usuario_id: string;
  tela_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string;
  acoes: Acao[];
  deletado?: boolean;
}

export interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  status: string;
  data_limite: string;
}

export interface Tela {
  id: string;
  descricao: string;
  tipo?: 'brazil' | 'eua';
}

export interface Permissao {
  [telaId: string]: boolean;
}

export interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
}

export interface Perfil {
  usuario_id: string;
  tipo: string;
  setor_id?: string;
}

export type Theme = 'light' | 'dark';

export interface PlanoAcaoPartitionProps {
  usuarioResponsavelId: string | string[];
  usuariosParaBuscar?: string[];
  telaId: string;
  isAdmin: boolean;
  onEdit?: (plano: PlanoAcao) => void;
  onView?: (plano: PlanoAcao) => void;
  onAdd?: () => void;
  refreshTrigger?: number;
} 