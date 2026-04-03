import type { AccountingRow } from '../types/accounting';

/**
 * Função utilitária para somar o menor open_balance por transação
 * Evita duplicação de transações na soma
 */
export function sumByMinTransaction(typeData: AccountingRow[], type: 'receivables' | 'payables' | 'all'): number {
  const map = new Map<string, number>();
  typeData.forEach((row: AccountingRow) => {
    const key = type === 'receivables' ? row.inv_num : row.bill_num;
    if (!key) return;
    if (!map.has(key)) map.set(key, row.open_balance);
    else map.set(key, Math.min(map.get(key)!, row.open_balance));
  });
  return Array.from(map.values()).reduce((sum, v) => sum + v, 0);
}

/**
 * Processa dados por transação única para evitar duplicação
 */
export function processDataByTransaction(
  data: AccountingRow[], 
  type: 'receivables' | 'payables',
  filterFn?: (row: AccountingRow) => boolean
): Record<string, number> {
  const transactionMap: Record<string, number> = {};
  
  data.forEach(row => {
    if (filterFn && !filterFn(row)) return;
    
    const transactionKey = type === 'receivables' ? row.inv_num : row.bill_num;
    if (!transactionKey) return;
    
    if (!transactionMap[transactionKey] || row.open_balance < transactionMap[transactionKey]) {
      transactionMap[transactionKey] = row.open_balance;
    }
  });
  
  return transactionMap;
}

/**
 * Agrupa dados por categoria usando transações únicas
 */
export function groupByCategoryWithUniqueTransactions(
  data: AccountingRow[],
  type: 'receivables' | 'payables'
): Record<string, number> {
  const categoryByTransaction: Record<string, Record<string, number>> = {};
  
  data.forEach(row => {
    if (row.category) {
      const transactionKey = type === 'receivables' ? row.inv_num : row.bill_num;
      if (!transactionKey) return;
      
      if (!categoryByTransaction[row.category]) {
        categoryByTransaction[row.category] = {};
      }
      
      // Para cada transação, pegar o menor open_balance
      if (!categoryByTransaction[row.category][transactionKey] || 
          row.open_balance < categoryByTransaction[row.category][transactionKey]) {
        categoryByTransaction[row.category][transactionKey] = row.open_balance;
      }
    }
  });
  
  // Calcular totais por categoria
  const categoryTotals: Record<string, number> = {};
  Object.keys(categoryByTransaction).forEach(category => {
    categoryTotals[category] = Object.values(categoryByTransaction[category]).reduce((sum, val) => sum + val, 0);
  });
  
  return categoryTotals;
}

/**
 * Agrupa dados por aging usando transações únicas
 */
export function groupByAgingWithUniqueTransactions(
  data: AccountingRow[],
  type: 'receivables' | 'payables'
): Record<string, number> {
  const agingByTransaction: Record<string, Record<string, number>> = {};
  
  data.forEach(row => {
    if (row.aging_intervals) {
      const transactionKey = type === 'receivables' ? row.inv_num : row.bill_num;
      if (!transactionKey) return;
      
      if (!agingByTransaction[row.aging_intervals]) {
        agingByTransaction[row.aging_intervals] = {};
      }
      
      // Para cada transação, pegar o menor open_balance
      if (!agingByTransaction[row.aging_intervals][transactionKey] || 
          row.open_balance < agingByTransaction[row.aging_intervals][transactionKey]) {
        agingByTransaction[row.aging_intervals][transactionKey] = row.open_balance;
      }
    }
  });
  
  // Calcular totais por aging
  const agingTotals: Record<string, number> = {};
  Object.keys(agingByTransaction).forEach(aging => {
    agingTotals[aging] = Object.values(agingByTransaction[aging]).reduce((sum, val) => sum + val, 0);
  });
  
  return agingTotals;
} 