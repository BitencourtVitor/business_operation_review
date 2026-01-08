export interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

export interface ForecastMachine {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: boolean | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
}

export interface ForecastContractStep {
  id: number;
  obra_id: string;
  step: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

export interface WorkforceProject {
  id: string;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null;
  workforce: string | null;
  hvac: boolean | null;
  buildertrend: boolean | null;
  storage: boolean | null;
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
  startDate: string;
  endDate: string;
}

