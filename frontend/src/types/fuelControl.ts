// Tipos para as tabelas de combustível

export interface SamsaraEvent {
  id: number;
  event_key: string;
  event_date: string;
  nome: string;
  local: string | null;
  distancia: number;
  units: number;
  type: 'idle' | 'trip';
  duration: string | null;
  created_at: string;
}

export interface WexTransaction {
  id: number;
  transaction_key: string;
  transaction_date: string;
  nome: string;
  units: number;
  valor: number;
  local: string | null;
  created_at: string;
}

export interface EmployeeName {
  id: number;
  wex_name: string | null;
  samsara_name: string | null;
  normalized_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FuelConsumptionData {
  nome: string;
  total_units: number;
  total_value: number;
  event_count: number;
  avg_consumption: number;
}

export interface FuelAnalysisFilters {
  start_date: string;
  end_date: string;
  employee_names: string[];
  event_types: string[];
  locations: string[];
}
