import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import type { SamsaraEvent, WexTransaction, EmployeeName } from '../types/fuelControl';

interface FuelDataContextType {
  samsaraEvents: SamsaraEvent[];
  wexTransactions: WexTransaction[];
  employeeNames: EmployeeName[];
  loading: boolean;
  error: string | null;
  isDataLoaded: boolean;
  progress: number;
}

const FuelDataContext = createContext<FuelDataContextType | undefined>(undefined);

interface FuelDataProviderProps {
  children: ReactNode;
}

export const FuelDataProvider: React.FC<FuelDataProviderProps> = ({ children }) => {
  const [samsaraEvents, setSamsaraEvents] = useState<SamsaraEvent[]>([]);
  const [wexTransactions, setWexTransactions] = useState<WexTransaction[]>([]);
  const [employeeNames, setEmployeeNames] = useState<EmployeeName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [samsaraProgress, setSamsaraProgress] = useState(0);
  const [wexProgress, setWexProgress] = useState(0);
  const [employeeProgress, setEmployeeProgress] = useState(0);



  const fetchSamsaraEvents = async () => {
    try {
      setSamsaraProgress(0);
      
      // Primeiro contar quantos registros existem
      const { count, error: countError } = await supabase
        .from('samsara_events')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      if (count && count > 1000) {
        // Se tem mais de 1000, buscar em lotes
        let allData: SamsaraEvent[] = [];
        const batchSize = 1000;
        const totalBatches = Math.ceil(count / batchSize);
        
        for (let offset = 0; offset < count; offset += batchSize) {
          const { data, error } = await supabase
            .from('samsara_events')
            .select('*')
            .order('event_date', { ascending: false })
            .range(offset, offset + batchSize - 1);
            
          if (error) throw error;
          if (data) {
            allData = [...allData, ...data];
            const currentBatch = Math.min(Math.floor(offset / batchSize) + 1, totalBatches);
            const percent = Math.min(100, Math.round((currentBatch / totalBatches) * 100));
            setSamsaraProgress(percent);
          }
        }
        
        setSamsaraProgress(100);
        setSamsaraEvents(allData);
      } else {
        // Se tem 1000 ou menos, buscar direto
        const { data, error } = await supabase
          .from('samsara_events')
          .select('*')
          .order('event_date', { ascending: false });

        if (error) throw error;
        setSamsaraProgress(100);
        setSamsaraEvents(data || []);
      }
    } catch (err) {
      setError('Erro ao carregar eventos Samsara');
    }
  };

  const fetchWexTransactions = async () => {
    try {
      setWexProgress(0);
      
      // Primeiro contar quantos registros existem
      const { count, error: countError } = await supabase
        .from('wex_transactions')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      if (count && count > 1000) {
        // Se tem mais de 1000, buscar em lotes
        let allData: WexTransaction[] = [];
        const batchSize = 1000;
        const totalBatches = Math.ceil(count / batchSize);
        
        for (let offset = 0; offset < count; offset += batchSize) {
          const { data, error } = await supabase
            .from('wex_transactions')
            .select('*')
            .order('transaction_date', { ascending: false })
            .range(offset, offset + batchSize - 1);
            
          if (error) throw error;
          if (data) {
            allData = [...allData, ...data];
            const currentBatch = Math.min(Math.floor(offset / batchSize) + 1, totalBatches);
            const percent = Math.min(100, Math.round((currentBatch / totalBatches) * 100));
            setWexProgress(percent);
          }
        }
        
        setWexProgress(100);
        setWexTransactions(allData);
      } else {
        // Se tem 1000 ou menos, buscar direto
        const { data, error } = await supabase
          .from('wex_transactions')
          .select('*')
          .order('transaction_date', { ascending: false });

        if (error) throw error;
        setWexProgress(100);
        setWexTransactions(data || []);
      }
    } catch (err) {
      setError('Erro ao carregar transações WEX');
    }
  };

  const fetchEmployeeNames = async () => {
    try {
      setEmployeeProgress(0);
      
      const { data, error } = await supabase
        .from('employee_names')
        .select('*')
        .eq('is_active', true)
        .order('normalized_name');

      if (error) throw error;
      setEmployeeProgress(100);
      setEmployeeNames(data || []);
    } catch (err) {
      setError('Erro ao carregar nomes de funcionários');
    }
  };

  const loadAllData = async () => {
    if (isDataLoaded) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // Carregar todos os dados em paralelo
      await Promise.all([
        fetchSamsaraEvents(),
        fetchWexTransactions(),
        fetchEmployeeNames()
      ]);
      setIsDataLoaded(true);
    } catch (err) {
      setError('Erro durante carregamento dos dados');
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados automaticamente quando o provider for montado
  useEffect(() => {
    loadAllData();
  }, []);

  const value: FuelDataContextType = {
    samsaraEvents,
    wexTransactions,
    employeeNames,
    loading,
    error,
    isDataLoaded,
    progress: Math.round((samsaraProgress + wexProgress + employeeProgress) / 3)
  };

  return (
    <FuelDataContext.Provider value={value}>
      {children}
    </FuelDataContext.Provider>
  );
};

export const useFuelData = (): FuelDataContextType => {
  const context = useContext(FuelDataContext);
  if (context === undefined) {
    throw new Error('useFuelData deve ser usado dentro de um FuelDataProvider');
  }
  return context;
};
