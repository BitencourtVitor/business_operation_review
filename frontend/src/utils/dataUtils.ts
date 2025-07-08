import { supabase } from '../supabaseClient';

// Função utilitária para buscar todos os registros de uma tabela via paginação
export async function fetchAllRows(table: string) {
  const pageSize = 1000;
  let allRows: unknown[] = [];
  let from = 0;
  let to = pageSize - 1;
  let finished = false;

  while (!finished) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);
    if (error) throw error;
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < pageSize) {
        finished = true;
      } else {
        from += pageSize;
        to += pageSize;
      }
    } else {
      finished = true;
    }
  }
  return allRows;
}

/**
 * Normaliza strings para UTF-8 adequado
 * Remove caracteres especiais problemáticos e decodifica entidades HTML
 */
export function normalizeUtf8String(str: string | null | undefined): string {
  if (!str) return '';
  
  try {
    // Decodifica entidades HTML comuns
    const decoded = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&aacute;/g, 'á')
      .replace(/&agrave;/g, 'à')
      .replace(/&atilde;/g, 'ã')
      .replace(/&acirc;/g, 'â')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&ecirc;/g, 'ê')
      .replace(/&iacute;/g, 'í')
      .replace(/&igrave;/g, 'ì')
      .replace(/&ocirc;/g, 'ô')
      .replace(/&otilde;/g, 'õ')
      .replace(/&ograve;/g, 'ò')
      .replace(/&uacute;/g, 'ú')
      .replace(/&ugrave;/g, 'ù')
      .replace(/&ccedil;/g, 'ç')
      .replace(/&Aacute;/g, 'Á')
      .replace(/&Agrave;/g, 'À')
      .replace(/&Atilde;/g, 'Ã')
      .replace(/&Acirc;/g, 'Â')
      .replace(/&Eacute;/g, 'É')
      .replace(/&Egrave;/g, 'È')
      .replace(/&Ecirc;/g, 'Ê')
      .replace(/&Iacute;/g, 'Í')
      .replace(/&Igrave;/g, 'Ì')
      .replace(/&Ocirc;/g, 'Ô')
      .replace(/&Otilde;/g, 'Õ')
      .replace(/&Ograve;/g, 'Ò')
      .replace(/&Uacute;/g, 'Ú')
      .replace(/&Ugrave;/g, 'Ù')
      .replace(/&Ccedil;/g, 'Ç');
    
    // Normaliza espaços e remove caracteres problemáticos
    return decoded
      .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
      .trim();
  } catch (error) {
    console.warn('Erro ao normalizar string UTF-8:', error);
    return str;
  }
}

/**
 * Adiciona o mês atual à lista de meses se não estiver presente
 * @param months Lista de meses existentes (formato MM)
 * @param selectedYear Ano selecionado
 * @returns Lista de meses incluindo o mês atual se aplicável
 */
export function addCurrentMonthIfMissing(months: string[], selectedYear: string): string[] {
  if (!selectedYear) return months;
  
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear().toString();
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  
  // Sempre adiciona o mês atual se for o ano selecionado e não estiver na lista
  if (currentYear === selectedYear && !months.includes(currentMonth)) {
    const updatedMonths = [...months, currentMonth];
    return updatedMonths.sort((a, b) => Number(a) - Number(b));
  }
  
  return months;
}

/**
 * Adiciona o mês atual à lista de meses se não estiver presente (para nomes de meses em inglês)
 * @param months Lista de meses existentes (formato: January, February, etc.)
 * @param selectedYear Ano selecionado
 * @returns Lista de meses incluindo o mês atual se aplicável
 */
export function addCurrentMonthNameIfMissing(months: string[], selectedYear: string): string[] {
  if (!selectedYear) return months;
  
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear().toString();
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const currentMonthName = monthNames[currentDate.getMonth()];
  
  // Só adiciona o mês atual se for o ano selecionado e não estiver na lista
  if (currentYear === selectedYear && !months.includes(currentMonthName)) {
    const updatedMonths = [...months, currentMonthName];
    return updatedMonths.sort((a, b) => {
      return monthNames.indexOf(a) - monthNames.indexOf(b);
    });
  }
  
  return months;
} 