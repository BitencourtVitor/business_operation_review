import { useEffect } from 'react';
import { useDataCache } from './useDataCache';

export function useAccountingDataCached() {
  const { cache, fetchAccountingData } = useDataCache();
  const accountingData = cache.accounting;

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  return {
    data: accountingData.data,
    loading: accountingData.loading,
    error: accountingData.error,
    refetch: fetchAccountingData,
    years: accountingData.years,
    months: accountingData.months,
    agingIntervals: accountingData.agingIntervals,
    receivablesCategories: accountingData.receivablesCategories,
    payablesCategories: accountingData.payablesCategories,
  };
} 