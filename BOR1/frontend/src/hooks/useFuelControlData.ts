import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { SamsaraEvent, WexTransaction, EmployeeName, FuelConsumptionData } from '../types/fuelControl';

export const useFuelControlData = () => {
  const [samsaraEvents, setSamsaraEvents] = useState<SamsaraEvent[]>([]);
  const [wexTransactions, setWexTransactions] = useState<WexTransaction[]>([]);
  const [employeeNames, setEmployeeNames] = useState<EmployeeName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSamsaraEvents = async () => {
    try {
      // Buscar TODOS os registros - usar count() primeiro para ver total
      const { count, error: countError } = await supabase
        .from('samsara_events')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      if (count && count > 1000) {
        // Se tem mais de 1000, buscar em lotes
        let allData: SamsaraEvent[] = [];
        const batchSize = 1000;
        
        for (let offset = 0; offset < count; offset += batchSize) {
          const { data, error } = await supabase
            .from('samsara_events')
            .select('*')
            .order('event_date', { ascending: false })
            .range(offset, offset + batchSize - 1);
            
          if (error) throw error;
          if (data) allData = [...allData, ...data];
        }
        
        setSamsaraEvents(allData);
      } else {
        // Se tem 1000 ou menos, buscar direto
        const { data, error } = await supabase
          .from('samsara_events')
          .select('*')
          .order('event_date', { ascending: false });

        if (error) throw error;
        setSamsaraEvents(data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar eventos Samsara:', err);
      setError('Erro ao carregar eventos Samsara');
    }
  };

  const fetchWexTransactions = async () => {
    try {
      // Buscar TODOS os registros - usar count() primeiro para ver total
      const { count, error: countError } = await supabase
        .from('wex_transactions')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      if (count && count > 1000) {
        // Se tem mais de 1000, buscar em lotes
        let allData: WexTransaction[] = [];
        const batchSize = 1000;
        
        for (let offset = 0; offset < count; offset += batchSize) {
          const { data, error } = await supabase
            .from('wex_transactions')
            .select('*')
            .order('transaction_date', { ascending: false })
            .range(offset, offset + batchSize - 1);
            
          if (error) throw error;
          if (data) allData = [...allData, ...data];
        }
        
        setWexTransactions(allData);
      } else {
        // Se tem 1000 ou menos, buscar direto
        const { data, error } = await supabase
          .from('wex_transactions')
          .select('*')
          .order('transaction_date', { ascending: false });

        if (error) throw error;
        setWexTransactions(data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar transações WEX:', err);
      setError('Erro ao carregar transações WEX');
    }
  };

  const fetchEmployeeNames = async () => {
    try {
      console.log('🔍 Hook Debug - Iniciando busca de employee_names...');
      
      const { data, error } = await supabase
        .from('employee_names')
        .select('*')
        .eq('is_active', true)
        .order('normalized_name');

      if (error) {
        console.error('❌ Hook Erro na consulta employee_names:', error);
        throw error;
      }
      
      console.log('🔍 Hook Debug - employee_names carregados:', data);
      console.log('🔍 Hook Debug - Quantidade de registros:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('🔍 Hook Debug - Primeiro registro:', data[0]);
      }
      
      setEmployeeNames(data || []);
    } catch (err) {
      console.error('❌ Hook Erro ao buscar nomes de funcionários:', err);
      setError('Erro ao carregar nomes de funcionários');
    }
  };

  const getFuelConsumptionData = (): FuelConsumptionData[] => {
    const consumptionMap = new Map<string, FuelConsumptionData>();

    // Processar eventos Samsara
    samsaraEvents.forEach(event => {
      const normalizedName = employeeNames.find(emp => 
        emp.samsara_name === event.nome || emp.wex_name === event.nome
      )?.normalized_name || event.nome;

      if (!consumptionMap.has(normalizedName)) {
        consumptionMap.set(normalizedName, {
          nome: normalizedName,
          total_units: 0,
          total_value: 0,
          event_count: 0,
          avg_consumption: 0
        });
      }

      const data = consumptionMap.get(normalizedName)!;
      data.total_units += event.units;
      data.event_count += 1;
    });

    // Processar transações WEX
    wexTransactions.forEach(transaction => {
      const normalizedName = employeeNames.find(emp => 
        emp.wex_name === transaction.nome || emp.samsara_name === transaction.nome
      )?.normalized_name || transaction.nome;

      if (!consumptionMap.has(normalizedName)) {
        consumptionMap.set(normalizedName, {
          nome: normalizedName,
          total_units: 0,
          total_value: 0,
          event_count: 0,
          avg_consumption: 0
        });
      }

      const data = consumptionMap.get(normalizedName)!;
      data.total_units += transaction.units;
      data.total_value += transaction.valor;
      data.event_count += 1;
    });

    // Calcular média de consumo
    consumptionMap.forEach(data => {
      data.avg_consumption = data.event_count > 0 ? data.total_units / data.event_count : 0;
    });

    return Array.from(consumptionMap.values()).sort((a, b) => b.total_units - a.total_units);
  };

  const getFilteredFuelData = (
    startDate: string,
    endDate: string,
    employeeNames: string[] = [],
    eventTypes: string[] = []
  ) => {
    const filteredSamsara = samsaraEvents.filter(event => {
      const eventDate = new Date(event.event_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const dateMatch = eventDate >= start && eventDate <= end;
      const employeeMatch = employeeNames.length === 0 || employeeNames.includes(event.nome);
      const typeMatch = eventTypes.length === 0 || eventTypes.includes(event.type);
      
      return dateMatch && employeeMatch && typeMatch;
    });

    const filteredWex = wexTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.transaction_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const dateMatch = transactionDate >= start && transactionDate <= end;
      const employeeMatch = employeeNames.length === 0 || employeeNames.includes(transaction.nome);
      
      return dateMatch && employeeMatch;
    });

    return { filteredSamsara, filteredWex };
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSamsaraEvents(),
        fetchWexTransactions(),
        fetchEmployeeNames()
      ]);
      setLoading(false);
    };

    loadData();
  }, []);

  return {
    samsaraEvents,
    wexTransactions,
    driverNames: employeeNames, // Renomear para manter consistência
    loading,
    error,
    getFuelConsumptionData,
    getFilteredFuelData,
    refetch: () => {
      setLoading(true);
      Promise.all([
        fetchSamsaraEvents(),
        fetchWexTransactions(),
        fetchEmployeeNames()
      ]).finally(() => setLoading(false));
    }
  };
};
