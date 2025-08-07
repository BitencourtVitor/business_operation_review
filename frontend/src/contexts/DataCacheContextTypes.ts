import { createContext } from 'react';
import type { AccountingRow } from '../types/accounting';
import type { TimesheetRow } from '../types/timesheet';
import type { PermitRow } from '../types/permit';
import type { ProjectMonitoringHvacData } from '../hooks/useProjectMonitoringHvacData';

// Tipos para o cache
export interface CacheData {
  accounting: {
    data: AccountingRow[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
    years: string[];
    months: string[];
    agingIntervals: string[];
    receivablesCategories: string[];
    payablesCategories: string[];
  };
  timesheet: {
    data: TimesheetRow[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
    years: string[];
    months: string[];
    teams: string[];
    corporations: string[];
    errors: string[];
  };
  permit: {
    data: PermitRow[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
    years: string[];
    months: string[];
    models: string[];
    situations: string[];
    jobsites: string[];
  };
  quickbooks: {
    data: any;
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
  };
  projectMonitoringHvac: {
    data: ProjectMonitoringHvacData[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
    cities: string[];
    jobSites: string[];
    teams: string[];
  };
}

export interface DataCacheContextType {
  cache: CacheData;
  fetchAccountingData: (company?: string) => Promise<void>;
  fetchTimesheetData: () => Promise<void>;
  fetchPermitData: () => Promise<void>;
  fetchQuickbooksData: (company?: 'HVAC' | 'Framing') => Promise<void>;
  fetchProjectMonitoringHvacData: () => Promise<void>;
  clearCache: () => void;
  isDataStale: (dataType: keyof CacheData, maxAgeMinutes?: number) => boolean;
}

export const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined); 