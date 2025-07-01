import { useContext } from 'react';
import { DataCacheContext } from '../contexts/DataCacheContextTypes';

export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (context === undefined) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
} 