import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
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
      
      // Primeiro, contar o total de registros
      const { count, error: countError } = await supabase
        .from('samsara_events')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      // Buscar TODOS os dados em lotes maiores para melhor performance
      let allData: SamsaraEvent[] = [];
      let from = 0;
      const batchSize = 2000; // Aumentado para 2000
      const totalRecords = count || 0;
      
      while (from < totalRecords) {
        const { data, error } = await supabase
          .from('samsara_events')
          .select('*')
          .order('event_date', { ascending: false })
          .range(from, from + batchSize - 1);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += batchSize;
          
          // Atualizar progresso
          const progress = Math.round((allData.length / totalRecords) * 100);
          setSamsaraProgress(progress);
        } else {
          break;
        }
      }
      
      setSamsaraProgress(100);
      setSamsaraEvents(allData);
    } catch (error) {
      console.error('Erro ao carregar eventos Samsara:', error);
      setError('Erro ao carregar eventos Samsara');
    }
  };

  const fetchWexTransactions = async () => {
    try {
      setWexProgress(0);
      
      // Primeiro, contar o total de registros
      const { count, error: countError } = await supabase
        .from('wex_transactions')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      // Buscar TODOS os dados em lotes maiores para melhor performance
      let allData: WexTransaction[] = [];
      let from = 0;
      const batchSize = 2000; // Aumentado para 2000
      const totalRecords = count || 0;
      
      while (from < totalRecords) {
        const { data, error } = await supabase
          .from('wex_transactions')
          .select('*')
          .order('transaction_date', { ascending: false })
          .range(from, from + batchSize - 1);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += batchSize;
          
          // Atualizar progresso
          const progress = Math.round((allData.length / totalRecords) * 100);
          setWexProgress(progress);
        } else {
          break;
        }
      }
      
      setWexProgress(100);
      setWexTransactions(allData);
    } catch (err) {
      console.error('Erro ao carregar transações WEX:', err);
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
