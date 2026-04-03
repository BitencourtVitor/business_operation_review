// Funções utilitárias para cálculos

export function groupByMonthYear<T extends { mes: string | number; ano: string | number }>(arr: T[]): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const mesNum = Number(item.mes);
    const anoNum = Number(item.ano);
    const key = `${anoNum}-${mesNum}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateTotal(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
} 