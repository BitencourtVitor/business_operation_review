import { useState, useEffect, useCallback } from 'react';
import { useFuelData } from '../contexts/FuelDataContext';
import {
  FuelControlFilters,
  FuelControlChart,
  FuelControlTable
} from '../components/common/FuelControl';
import React from 'react';

interface FuelControlProps {
  telaId: string;
}

export default function FuelControl({ telaId: telaIdFromProps }: FuelControlProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>(''); // Default to 2025
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // Default to "Todos"
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [isDetailView, setIsDetailView] = useState<boolean>(false); // Switch Principal/Detalhe
  
  // Estado para opções de drivers disponíveis
  const [availableDriverOptions, setAvailableDriverOptions] = useState<string[]>([]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const hasSetDefaultYearRef = React.useRef<boolean>(false);



  // useEffect para telaId
  useEffect(() => {
    if (telaIdFromProps && telaIdFromProps !== telaId) {
      setTelaId(telaIdFromProps);
    }
  }, [telaIdFromProps, telaId]);

  const {
    employeeNames: driverNames,
    loading: fuelDataLoading,
    error,
    samsaraEvents,
    wexTransactions,
    progress
  } = useFuelData();

  // Função para normalizar nomes de motoristas
  const normalizeDriverName = useCallback((name: string | null | undefined): string => {
    if (!name) return '';
    const trimmedName = name.trim();
    if (!trimmedName) return '';
    
    // Se já está normalizado, retornar como está
    if (driverNames?.find(d => d.normalized_name === trimmedName)) {
      return trimmedName;
    }
    
    // Buscar por wex_name ou samsara_name
    const normalized = driverNames?.find(d => 
      d.wex_name === trimmedName || d.samsara_name === trimmedName
    );
    
    return normalized?.normalized_name || trimmedName;
  }, [driverNames]);

  // Função para obter dados filtrados
  const getFilteredData = useCallback(() => {
    let filteredSamsara = samsaraEvents || [];
    let filteredWex = wexTransactions || [];

    // Filtrar por ano apenas se um ano específico estiver selecionado
    if (selectedYear) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        const eventYear = event.event_date.split('-')[0];
        return eventYear === selectedYear;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        const transactionYear = transaction.transaction_date.split('-')[0];
        return transactionYear === selectedYear;
      });
    }

    // Filtrar por mês se selecionado
    if (selectedMonth) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        const eventMonth = event.event_date.split('-')[1];
        return eventMonth === selectedMonth;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        const transactionMonth = transaction.transaction_date.split('-')[1];
        return transactionMonth === selectedMonth;
      });
    }

    // Garantir que sempre haja drivers selecionados
    const driversToUse = selectedDrivers.length > 0 ? selectedDrivers : availableDriverOptions;
    
    // Filtrar por motoristas selecionados
    if (driversToUse.length > 0) {
      
      
      
      filteredSamsara = filteredSamsara.filter(event => {
        const normalizedName = normalizeDriverName(event.nome);
        return driversToUse.includes(normalizedName);
      });

      filteredWex = filteredWex.filter(transaction => {
        const normalizedName = normalizeDriverName(transaction.nome);
        return driversToUse.includes(normalizedName);
      });
    } else {
      
    }

    return { filteredSamsara, filteredWex };
  }, [selectedYear, selectedMonth, selectedDrivers, availableDriverOptions, samsaraEvents, wexTransactions, normalizeDriverName]);

  // Carregar anos e meses disponíveis + drivers disponíveis a partir dos dados reais
  useEffect(() => {
    // Só prosseguir quando houver algum dado carregado
    if ((samsaraEvents && samsaraEvents.length > 0) || (wexTransactions && wexTransactions.length > 0)) {
      // Extrair anos únicos dos dados reais
      const samsaraYears = [...new Set(samsaraEvents.map(event => 
        event.event_date?.split('-')[0]
      ).filter(Boolean))];
      
      const wexYears = [...new Set(wexTransactions.map(transaction => 
        transaction.transaction_date?.split('-')[0]
      ).filter(Boolean))];
      
      // Combinar e ordenar anos únicos
      const allYears = [...new Set([...samsaraYears, ...wexYears])]
        .sort((a, b) => Number(b) - Number(a));
      setYears(allYears);

      // Definir ano padrão apenas uma vez (primeiro carregamento)
      if (!hasSetDefaultYearRef.current && allYears.length > 0 && !selectedYear) {
        setSelectedYear(allYears[0]);
        hasSetDefaultYearRef.current = true;
      }

      // Usar todos os nomes da tabela employee_names que estão ativos
      const availableDriverNames = driverNames
        ?.filter(driver => driver.is_active)
        ?.map(driver => driver.normalized_name)
        ?.filter(name => name && name.trim()) // Remove nomes vazios
        ?.sort((a, b) => a.localeCompare(b)) || [];

      // Atualizar opções disponíveis
      setAvailableDriverOptions(availableDriverNames);
      
      // Sempre sincronizar drivers selecionados com os disponíveis
      if (availableDriverNames.length > 0) {


        setSelectedDrivers([...availableDriverNames]); // Usar spread para criar novo array
      }
      
      // Log para debug
      
      
      
    }
  }, [samsaraEvents, wexTransactions, normalizeDriverName, driverNames]);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    if (!selectedYear) {
      setMonths([]);
      if (selectedMonth) setSelectedMonth('');
      return;
    }

    const monthsList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    setMonths(monthsList);

    setSelectedMonth(''); // Set month to "Todos" by default
  }, [selectedYear]);



  // Loading e error handling
  if (fuelDataLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 260,
            height: 10,
            background: 'var(--color-background-secondary)',
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--color-border-divider)'
          }} />
          <div style={{
            position: 'relative',
            width: 260,
            height: 10,
            marginTop: -22
          }}>
            <div style={{
              width: `${progress}%`,
              height: 10,
              background: 'var(--color-accent-primary)'
            }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Carregando dados de combustível: {progress}%</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>Erro ao carregar dados: {error}</span>
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Fuel Control</h1>
                 <FuelControlFilters
           selectedYear={selectedYear}
           setSelectedYear={setSelectedYear}
           selectedMonth={selectedMonth}
           setSelectedMonth={setSelectedMonth}
           selectedDrivers={selectedDrivers}
           setSelectedDrivers={setSelectedDrivers}
           years={years}
           months={months}
           availableDrivers={availableDriverOptions}
           isDetailView={isDetailView}
           setIsDetailView={setIsDetailView}
         />
      </div>
      
      {/* Container principal com flex para distribuir o espaço */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                 {/* Gráficos principais - ocupam todo o espaço disponível */}
         <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
           {(() => {
             const filteredData = getFilteredData();
             return (
               <FuelControlChart 
                 filteredSamsara={filteredData.filteredSamsara}
                 filteredWex={filteredData.filteredWex}
                 selectedYear={selectedYear}
                 selectedMonth={selectedMonth}
                 driverNames={driverNames || []}
               />
             );
           })()}
         </div>
        
                 {/* Área inferior: Tabela ocupando 100% da largura */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {(() => {
            const filteredData = getFilteredData();
            return (
              <FuelControlTable 
                filteredSamsara={filteredData.filteredSamsara}
                filteredWex={filteredData.filteredWex}
                selectedDrivers={selectedDrivers}
                driverNames={driverNames || []}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
