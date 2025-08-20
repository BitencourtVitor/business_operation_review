/**
 * Utilitários para cálculos de semanas ISO 8601
 */

/**
 * Obtém o número da semana ISO 8601 para uma data
 * @param date - Data para calcular a semana
 * @returns Número da semana (1-53)
 */
export function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  
  // Quinta-feira da semana atual
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  
  // Primeiro dia do ano
  const yearStart = new Date(d.getFullYear(), 0, 1);
  
  // Ajustar para quinta-feira se necessário
  yearStart.setDate(yearStart.getDate() + 3 - (yearStart.getDay() + 6) % 7);
  
  // Calcular a semana
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  
  return weekNo;
}

/**
 * Obtém todas as semanas de um ano
 * @param year - Ano para calcular as semanas
 * @returns Array com números das semanas (1-53)
 */
export function getWeeksInYear(year: number): number[] {
  // Para o padrão ISO 8601, um ano pode ter 52 ou 53 semanas
  // Vamos calcular todas as semanas possíveis
  
  const weeks: number[] = [];
  
  // Verificar se o ano tem 52 ou 53 semanas
  // Um ano tem 53 semanas se:
  // 1. Começa em uma quinta-feira (ano bissexto), ou
  // 2. Começa em uma quarta-feira (ano normal)
  
  // Primeiro dia do ano
  const yearStart = new Date(year, 0, 1);
  const dayOfWeek = yearStart.getDay(); // 0 = Domingo, 1 = Segunda, etc.
  
  // Verificar se é ano bissexto
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  
  let totalWeeks = 52;
  
  if (isLeapYear) {
    // Ano bissexto: 53 semanas se começa em quinta-feira (4)
    if (dayOfWeek === 4) {
      totalWeeks = 53;
    }
  } else {
    // Ano normal: 53 semanas se começa em quarta-feira (3)
    if (dayOfWeek === 3) {
      totalWeeks = 53;
    }
  }
  
  // Gerar array com todas as semanas
  for (let i = 1; i <= totalWeeks; i++) {
    weeks.push(i);
  }
  
  return weeks;
}

/**
 * Obtém as semanas de um mês específico
 * @param year - Ano
 * @param month - Mês (0-11, onde 0 = Janeiro)
 * @returns Array com números das semanas do mês
 */
export function getWeeksInMonth(year: number, month: number): number[] {
  const weeks = new Set<number>();
  
  // Último dia do mês
  const lastDay = new Date(year, month + 1, 0);
  
  // Adicionar semanas de todos os dias do mês
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const week = getISOWeek(date);
    weeks.add(week);
  }
  
  // Também verificar se há semanas que começam no mês anterior
  // mas que incluem dias do mês atual
  if (month > 0) {
    // Verificar o último dia do mês anterior
    const lastDayPrevMonth = new Date(year, month, 0);
    for (let day = lastDayPrevMonth.getDate() - 6; day <= lastDayPrevMonth.getDate(); day++) {
      if (day > 0) {
        const date = new Date(year, month - 1, day);
        const week = getISOWeek(date);
        // Se a semana inclui dias do mês atual, adicionar
        if (week >= 1 && week <= 53) {
          weeks.add(week);
        }
      }
    }
  }
  
  return Array.from(weeks).sort((a, b) => a - b);
}

/**
 * Obtém o intervalo de datas de uma semana específica
 * @param year - Ano
 * @param week - Número da semana
 * @returns Objeto com data de início e fim da semana
 */
export function getWeekDateRange(year: number, week: number): { start: Date; end: Date } {
  // Primeiro dia do ano
  const yearStart = new Date(year, 0, 1);
  
  // Ajustar para quinta-feira se necessário
  yearStart.setDate(yearStart.getDate() + 3 - (yearStart.getDay() + 6) % 7);
  
  // Calcular o primeiro dia da semana
  const weekStart = new Date(yearStart.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  
  // Último dia da semana (domingo)
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  return { start: weekStart, end: weekEnd };
}

/**
 * Formata uma semana com intervalo de datas
 * @param year - Ano
 * @param week - Número da semana
 * @returns String formatada (ex: "Week 1 (Jan 1-7)")
 */
export function formatWeekWithDates(year: number, week: number): string {
  const { start, end } = getWeekDateRange(year, week);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const startMonth = monthNames[start.getMonth()];
  const endMonth = monthNames[end.getMonth()];
  
  if (start.getMonth() === end.getMonth()) {
    // Mesma semana, mesmo mês
    return `${startMonth} ${start.getDate()}-${end.getDate()}`;
  } else {
    // Semana que cruza meses
    return `${startMonth} ${start.getDate()}-${endMonth} ${end.getDate()}`;
  }
}
