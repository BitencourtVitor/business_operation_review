/**
 * Utilitários para manipulação de datas sem problemas de timezone
 */

/**
 * Converte uma string de data no formato YYYY-MM-DD para o formato MM/DD
 * sem problemas de timezone (apenas mês e dia)
 */
export const formatDateUSShort = (dateString?: string | null): string => {
  if (!dateString) return '-';
  
  try {
    // Se já está no formato correto, retornar apenas mês/dia
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
    
    // Se está no formato YYYY-MM-DD, converter para MM/DD
    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-');
      return `${month}/${day}`;
    }
    
    // Fallback: tentar usar Date mas com tratamento de timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit',
      timeZone: 'UTC' // Forçar UTC para evitar problemas de timezone
    });
  } catch (error) {
    console.error('Erro ao formatar data:', dateString, error);
    return '-';
  }
};

/**
 * Converte uma string de data no formato YYYY-MM-DD para o formato MM/DD/YYYY
 * sem problemas de timezone
 */
export const formatDateUS = (dateString?: string | null): string => {
  if (!dateString) return '-';
  
  try {
    // Se já está no formato correto, retornar como está
    if (dateString.includes('/')) {
      return dateString;
    }
    
    // Se está no formato YYYY-MM-DD, converter para MM/DD/YYYY
    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-');
      return `${month}/${day}/${year}`;
    }
    
    // Fallback: tentar usar Date mas com tratamento de timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric',
      timeZone: 'UTC' // Forçar UTC para evitar problemas de timezone
    });
  } catch (error) {
    console.error('Erro ao formatar data:', dateString, error);
    return '-';
  }
};

/**
 * Converte uma string de data no formato YYYY-MM-DD para o formato DD/MM/YYYY
 * sem problemas de timezone
 */
export const formatDateBR = (dateString?: string | null): string => {
  if (!dateString) return '-';
  
  try {
    // Se já está no formato correto, retornar como está
    if (dateString.includes('/')) {
      return dateString;
    }
    
    // Se está no formato YYYY-MM-DD, converter para DD/MM/YYYY
    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    
    // Fallback: tentar usar Date mas com tratamento de timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      timeZone: 'UTC' // Forçar UTC para evitar problemas de timezone
    });
  } catch (error) {
    console.error('Erro ao formatar data:', dateString, error);
    return '-';
  }
};

/**
 * Calcula a diferença em dias entre duas datas no formato YYYY-MM-DD
 * sem problemas de timezone
 */
export const calculateDaysDifference = (startDate: string, endDate: string): number => {
  try {
    const start = new Date(startDate + 'T00:00:00Z'); // Forçar UTC
    const end = new Date(endDate + 'T00:00:00Z'); // Forçar UTC
    
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.error('Erro ao calcular diferença de datas:', startDate, endDate, error);
    return 0;
  }
};

/**
 * Valida se uma string é uma data válida no formato YYYY-MM-DD
 */
export const isValidDate = (dateString: string): boolean => {
  if (!dateString) return false;
  
  try {
    const date = new Date(dateString + 'T00:00:00Z');
    return !isNaN(date.getTime()) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  } catch {
    return false;
  }
};
