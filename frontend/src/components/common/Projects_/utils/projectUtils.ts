// Formata valor para USD (padrão do projeto)
export function formatCurrency(amount?: number | null) {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Extrai o nome do projeto do nome bruto (customer_name)
export function getProjectName(rawName?: string | null) {
  if (!rawName) return '';
  const parts = rawName.split(':');
  return parts[parts.length - 1].trim();
}

// Formata data para MM/DD/YY (americano)
export function formatDateUS(date?: string | null) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
} 