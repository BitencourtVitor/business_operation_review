import { createContext } from 'react';
import type { AccountingRow } from '../types/accounting';
import type { TimesheetRow } from '../types/timesheet';
import type { PermitRow } from '../types/permit';

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
}

export interface DataCacheContextType {
  cache: CacheData;
  fetchAccountingData: () => Promise<void>;
  fetchTimesheetData: () => Promise<void>;
  fetchPermitData: () => Promise<void>;
  fetchQuickbooksData: () => Promise<void>;
  clearCache: () => void;
  isDataStale: (dataType: keyof CacheData, maxAgeMinutes?: number) => boolean;
}

export const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined); 