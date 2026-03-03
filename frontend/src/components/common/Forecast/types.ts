export type DateMode = 'start' | 'beams';

export interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: string | null;
  lastupdate_datetimez: string | null;
}

export interface ForecastMachine {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: string | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
}

export interface ForecastContractStep {
  id: number;
  obra_id: string;
  team: string;
  step: string | null;
  status: string | null;
  lastupdate_datetimez: string | null;
}

export interface WorkforceProject {
  id: string;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null;
  hvac: boolean | null;
  buildertrend: boolean | null;
  storage: boolean | null;
  qbtime: boolean | null;
  machine_provider: string | null;
  status: string | null;
  address: string | null;
  previous_beams_date: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
  obs: string | null;
  create_datetime: string | null;
  lastupdate_datetimez: string | null;
  fieldwire?: ForecastFieldwire[];
  machines?: ForecastMachine[];
  contract_steps?: ForecastContractStep[];
}

export interface ForecastData {
  cliente: string;
  job_site: string;
  month: string;
  year: number;
  projectCount: number;
  startDate?: string | null;
  endDate?: string | null;
}

// Tipagem para os 4 status do Forecast
export type ForecastProjectStatus = 'closed' | 'overdue' | 'open' | 'not started';

