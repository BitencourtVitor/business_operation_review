import type { WorkforceProject, ForecastMachine, ForecastProjectStatus } from './types';

// Helper para verificar se tem Fieldwire ativo
export const hasActiveFieldwire = (project: WorkforceProject): boolean => {
  return project.fieldwire?.some(fw => isTruthyFlag(fw.status)) || false;
};

// Helper para verificar se Fieldwire está completo (todos os documentos com status true)
export const isFieldwireComplete = (project: WorkforceProject): boolean => {
  if (!project.fieldwire || project.fieldwire.length === 0) return false;
  return project.fieldwire.every(fw => isTruthyFlag(fw.status));
};

// Helper para verificar se Machines and Attachments está completo
export const isMachinesComplete = (project: WorkforceProject): boolean => {
  if (!project.machines || project.machines.length === 0) return false;
  return project.machines.every(m => {
    if (!m.status) return false;
    const s = m.status.toString().toLowerCase().trim();
    return s === 'scheduled' || s === 'dispensed' || s === 'true' || s === 'yes' || s === '1';
  });
};

// Helper para verificar se tem contrato completo
export const hasCompleteContract = (project: WorkforceProject): boolean => {
  if (!project.contract_steps || project.contract_steps.length === 0) return false;
  return project.contract_steps.every(cs => isTruthyFlag(cs.status));
};

// Helper para calcular porcentagem de contratos completos
export const getContractProgress = (project: WorkforceProject): number => {
  if (!project.contract_steps || project.contract_steps.length === 0) return 0;
  const completed = project.contract_steps.filter(cs => isTruthyFlag(cs.status)).length;
  return (completed / project.contract_steps.length) * 100;
};

// Helper para calcular porcentagem de Fieldwire completo
export const getFieldwireProgress = (project: WorkforceProject): number => {
  if (!project.fieldwire || project.fieldwire.length === 0) return 0;
  const completed = project.fieldwire.filter(fw => isTruthyFlag(fw.status)).length;
  return (completed / project.fieldwire.length) * 100;
};

// Helper para calcular porcentagem de máquinas ativas
export const getMachinesProgress = (project: WorkforceProject): number => {
  if (!project.machines || project.machines.length === 0) return 0;
  const active = project.machines.filter(m => {
    if (!m.status) return false;
    const s = m.status.toString().toLowerCase().trim();
    return s === 'scheduled' || s === 'dispensed' || s === 'true' || s === 'yes' || s === '1';
  }).length;
  return (active / project.machines.length) * 100;
};

// Helper para encontrar máquinas específicas (busca flexível)
export const getMachineByTitle = (project: WorkforceProject, searchTerm: string): ForecastMachine | null => {
  if (!project.machines) return null;
  const normalizedSearch = searchTerm.toLowerCase().trim().replace(/\s+/g, '');
  return project.machines.find(m => {
    const machineTitle = m.title?.toLowerCase().trim().replace(/\s+/g, '') || '';
    return machineTitle.includes(normalizedSearch) || normalizedSearch.includes(machineTitle);
  }) || null;
};

// Helper centralizado para determinar o status único de um projeto do Forecast
export const getForecastProjectStatus = (project: WorkforceProject): ForecastProjectStatus => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  
  // 1. Prioridade Máxima: CLOSED
  if (normalizedStatus === 'closed') {
    return 'closed';
  }
  
  // 2. Prioridade: OPEN (Equivalente ao antigo Started no Forecast)
  if (normalizedStatus === 'open' || normalizedStatus === 'started') {
    return 'open';
  }

  // 3. Prioridade: OVERDUE (Apenas se não for closed/open e a data de início passou)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
  
  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
    if (today > startDate) return 'overdue';
  }
  
  // 4. Fallback: NOT STARTED
  return 'not started';
};

// Helper para verificar se a obra já iniciou baseado no STATUS (não na data)
export const isProjectStartedByStatus = (project: WorkforceProject): boolean => {
  const status = getForecastProjectStatus(project);
  return status === 'open';
};

// Helper para verificar se a obra já iniciou (baseado na data de início)
// Mantido para compatibilidade, mas não deve ser usado para determinar se a obra começou
export const hasProjectStarted = (project: WorkforceProject): boolean => {
  if (!project.previous_start_date) return false;
  const startDate = new Date(project.previous_start_date);
  if (isNaN(startDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  return startDate <= today;
};

// Helper para obter tipo de atraso
// IMPORTANTE: O atraso é determinado APENAS pela StartDate, não pela BeamsDate
// REGRA: Se a obra está fechada (status = "Closed"), ela NÃO pode estar atrasada
// Se não está fechada e a data passou, está atrasada
export const getOverdueType = (project: WorkforceProject): 'start' | null => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  
  // Se o status for "Closed", a obra já terminou, então NÃO está atrasada
  if (normalizedStatus === 'closed') {
    return null;
  }
  
  // Verificar se a StartDate foi ultrapassada
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
    if (today > startDate) return 'start';
  }
  
  return null;
};

// Helper para obter a data de referência baseada no modo (start ou beams)
export const getReferenceDate = (project: WorkforceProject, mode: 'start' | 'beams'): string | null => {
  if (mode === 'beams') {
    return project.previous_beams_date || project.previous_start_date || null;
  }
  return project.previous_start_date || null;
};

// Helper para obter os nomes das equipes atribuídas à obra via passos de contrato
export const getProjectTeams = (project: WorkforceProject): string[] => {
  if (!project.contract_steps || project.contract_steps.length === 0) return [];
  const teams = project.contract_steps
    .map(cs => cs.team)
    .filter((team): team is string => !!team && team.trim() !== '');
  return [...new Set(teams)];
};

// Helper para verificar se tem workforce atribuído (pelo menos uma equipe nos passos de contrato)
export const hasWorkforce = (project: WorkforceProject): boolean => {
  return getProjectTeams(project).length > 0;
};

export const hasStorage = (project: WorkforceProject): boolean => {
  return isTruthyFlag(project.storage);
};

const POSITIVE_STRINGS = ['yes', 'sim', 'true', '1', 'y'];

// Helper para verificar se um valor é verdadeiro (booleano ou string)
export const isTruthyFlag = (value?: string | boolean | null): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = value.toString().toLowerCase().trim();
  if (!normalized) return false;
  return POSITIVE_STRINGS.includes(normalized);
};

// Helper para calcular a métrica de completude da preparação da obra
export const getProjectCompletionMetrics = (project: WorkforceProject) => {
  let completedPoints = 0;
  let totalPoints = 0;

  // 1. Fieldwire Documents
  if (project.fieldwire && project.fieldwire.length > 0) {
    totalPoints += project.fieldwire.length;
    completedPoints += project.fieldwire.filter(fw => isTruthyFlag(fw.status)).length;
  }

  // 2. BuilderTrend
  totalPoints += 1;
  if (isTruthyFlag(project.buildertrend)) {
    completedPoints += 1;
  }

  // 3. QuickBooks Time
  totalPoints += 1;
  if (isTruthyFlag(project.qbtime)) {
    completedPoints += 1;
  }

  // 4. Storage
  totalPoints += 1;
  if (isTruthyFlag(project.storage)) {
    completedPoints += 1;
  }

  // 5. Contract Status
  if (project.contract_steps && project.contract_steps.length > 0) {
    totalPoints += project.contract_steps.length;
    completedPoints += project.contract_steps.filter(cs => isTruthyFlag(cs.status)).length;
  }

  // 6. Machines and Attachments
  if (project.machines && project.machines.length > 0) {
    totalPoints += project.machines.length;
    completedPoints += project.machines.filter(m => {
      if (!m.status) return false;
      const s = m.status.toString().toLowerCase().trim();
      return s === 'scheduled' || s === 'dispensed' || s === 'true' || s === 'yes' || s === '1';
    }).length;
  }

  const percentage = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  return {
    completedPoints,
    totalPoints,
    percentage
  };
};

