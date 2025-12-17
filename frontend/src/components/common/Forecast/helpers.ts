import type { WorkforceProject, ForecastMachine } from './types';

// Helper para verificar se tem Fieldwire ativo
export const hasActiveFieldwire = (project: WorkforceProject): boolean => {
  return project.fieldwire?.some(fw => fw.status === true) || false;
};

// Helper para verificar se Fieldwire está completo (todos os documentos com status true)
export const isFieldwireComplete = (project: WorkforceProject): boolean => {
  if (!project.fieldwire || project.fieldwire.length === 0) return false;
  return project.fieldwire.every(fw => fw.status === true);
};

// Helper para verificar se Machines and Attachments está completo
export const isMachinesComplete = (project: WorkforceProject): boolean => {
  if (!project.machines || project.machines.length === 0) return false;
  return project.machines.every(m => m.status === true);
};

// Helper para verificar se tem contrato completo
export const hasCompleteContract = (project: WorkforceProject): boolean => {
  if (!project.contract_steps || project.contract_steps.length === 0) return false;
  return project.contract_steps.every(cs => cs.status === true);
};

// Helper para calcular porcentagem de contratos completos
export const getContractProgress = (project: WorkforceProject): number => {
  if (!project.contract_steps || project.contract_steps.length === 0) return 0;
  const completed = project.contract_steps.filter(cs => cs.status === true).length;
  return (completed / project.contract_steps.length) * 100;
};

// Helper para calcular porcentagem de Fieldwire completo
export const getFieldwireProgress = (project: WorkforceProject): number => {
  if (!project.fieldwire || project.fieldwire.length === 0) return 0;
  const completed = project.fieldwire.filter(fw => fw.status === true).length;
  return (completed / project.fieldwire.length) * 100;
};

// Helper para calcular porcentagem de máquinas ativas
export const getMachinesProgress = (project: WorkforceProject): number => {
  if (!project.machines || project.machines.length === 0) return 0;
  const active = project.machines.filter(m => m.status === true).length;
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

// Helper para verificar se a obra já iniciou baseado no STATUS (não na data)
// Se o status for diferente de "Not Started", a obra já começou
export const isProjectStartedByStatus = (project: WorkforceProject): boolean => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  return normalizedStatus !== 'not started';
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
// REGRA: Se a obra está iniciada (status ≠ "Not Started"), ela NÃO pode estar atrasada
// Só pode estar atrasada se status = "Not Started" E StartDate foi ultrapassada
export const getOverdueType = (project: WorkforceProject): 'start' | null => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  
  // Se o status for diferente de "Not Started", a obra já começou, então NÃO está atrasada
  if (normalizedStatus !== 'not started') {
    return null;
  }
  
  // Se o status for "Not Started", verificar se a StartDate foi ultrapassada
  // BeamsDate NÃO é usado para determinar atraso
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
    if (today > startDate) return 'start';
  }
  
  return null;
};

