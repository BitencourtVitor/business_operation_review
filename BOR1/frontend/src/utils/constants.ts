// Constantes do projeto

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

export const ROLES = {
  DEV: 'dev',
  MANAGER: 'manager',
  GESTOR: 'gestor',
  ADMIN_SETOR: 'admin_setor'
} as const;

export const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'completed', label: 'Concluído' }
];

export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' }
];

export const IMPACT_OPTIONS = [
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Médio' },
  { value: 'low', label: 'Baixo' }
];

export const TIPO_DESTAQUE_OPTIONS = [
  { value: 'positive', label: 'Positivo' },
  { value: 'negative', label: 'Negativo' },
  { value: 'neutral', label: 'Neutro' }
]; 