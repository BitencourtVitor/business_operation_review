// Tipos comuns para todo o projeto

import type { PlanoAcao, Acao } from './planoAcao';

export type { PlanoAcao, Acao };

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