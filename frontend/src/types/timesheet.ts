// Tipos específicos para Timesheet Analysis

export interface TimesheetRow {
  id: string;
  date: string;
  nome: string;
  error: string;
  team: string;
  corporation: string;
  payrate: string;
  add_time_hour: string;
  remove_time_hour: string;
  add_dollar: string;
  remove_dollar: string;
  total: string;
}

export interface TimesheetChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
  }[];
}

export interface TimesheetTooltipExternalProps {
  tooltip: Record<string, unknown>;
  chartLabels: string[];
  chartDatasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
  }[];
  year: number;
  month: number;
  canvas?: HTMLCanvasElement;
  data: TimesheetRow[];
}

export interface JobCostingTimesheetRow {
  id: number;
  client: string;
  jobsite: string;
  lot_building: string | null;
  worktype: string | null;
  employee_name: string;
  regular_rate: number;
  regular_hours: number;
  reference_month: string;
  created_at: string;
} 