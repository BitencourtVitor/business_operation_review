import type { AccountingRow } from './accounting';

// Interface para o tooltip externo
export interface AccountingTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: AccountingRow[];
  selectedGroup: 'all' | 'receivables' | 'payables';
  separateAging: boolean;
}

export interface AccountingChartProps {
  filteredData: AccountingRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivables' | 'payables';
  separateAging: boolean;
  selectedDay: string;
  setSelectedDay: (day: string) => void;
  onComparisonMetricsChange?: (metrics: { filteredValue: number; totalValue: number; percentage: number } | null) => void;
  onForceSeparateAging?: (force: boolean) => void;
  selectedReceivablesCategories: string[];
  selectedPayablesCategories: string[];
  selectedAging: string[];
  unfilteredDataForChart: AccountingRow[];
}

export interface ChartDataset {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
  pointBackgroundColor: string;
  pointBorderColor: string;
  pointRadius: number;
  pointHoverRadius: number;
  borderWidth: number;
  fill: boolean;
  tension: number;
  spanGaps: boolean;
}

export interface ComparisonMetrics {
  filteredValue: number;
  totalValue: number;
  percentage: number;
}

export interface TransactionData {
  value: number;
  date: string;
}

export interface LegendItem {
  label: string;
  value: number;
  color: string;
} 