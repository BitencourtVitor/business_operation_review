import { useEffect } from 'react';
import { useDataCache } from './useDataCache';

export function useAccountingDataCached(company?: string) {
  const { cache, fetchAccountingData } = useDataCache();
  const accountingData = cache.accounting;

  useEffect(() => {
    fetchAccountingData(company);
  }, [fetchAccountingData, company]);

  return {
    data: accountingData.data,
    loading: accountingData.loading,
    error: accountingData.error,
    refetch: () => fetchAccountingData(company),
    years: accountingData.years,
    months: accountingData.months,
    agingIntervals: accountingData.agingIntervals,
    receivablesCategories: accountingData.receivablesCategories,
    payablesCategories: accountingData.payablesCategories,
  };
} 