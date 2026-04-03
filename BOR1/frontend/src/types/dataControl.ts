export interface ForecastData {
  id: string;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null;
  status: string | null;
  address: string | null;
  previous_beams_date: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
  obs: string | null;
  hvac: boolean | null;
  buildertrend: boolean | null;
  machine_provider: string | null;
  create_datetime: string | null;
  lastupdate_datetimez: string | null;
  storage: boolean | null;
  qbtime: boolean | null;
}

export interface ForecastContract {
  id: number;
  obra_id: string;
  name: string;
  created_at?: string;
}

export interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
  team?: string | null;
}

export interface ForecastMachines {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: string | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
  team?: string | null;
}

export interface ForecastContractSteps {
  id: number;
  obra_id: string;
  contract_id?: number;
  step: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
  team: string;
}

export interface SubcontractorPerformance {
  id: string;
  obra_id: string;
  event: string;
  estimated_date_type: string;
  subcontractor: string | null;
  event_datetime: string | null;
  user_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Tabelas de Categorização
export interface C_Workforce {
  id: number;
  name: string;
}

export interface C_Fieldwire {
  id: number;
  category: string;
  document: string;
  where_location: string | null;
  notes: string | null;
}

export interface C_Machines {
  id: number;
  category: string;
  subcategory: string;
  equipment_category: string;
  title: string;
}

export interface C_ContractedSteps {
  id: number;
  step: string;
}

export interface C_MachineProvider {
  id: number;
  name: string;
}
