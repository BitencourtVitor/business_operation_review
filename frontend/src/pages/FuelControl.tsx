import { useState, useEffect, useCallback } from 'react';
import { useFuelData } from '../contexts/FuelDataContext';
import {
  FuelControlFilters,
  FuelControlChart,
  FuelControlTable
} from '../components/common/FuelControl';
import FuelControlChartDetail from '../components/common/FuelControl/FuelControlChartDetail';
import React from 'react';

interface FuelControlProps {
  telaId: string;
  financialPass: boolean;
}

export default function FuelControl({ telaId: telaIdFromProps, financialPass }: FuelControlProps) {
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

  // Função para obter dados filtrados (apenas por data, não por motoristas - para mostrar todas as linhas)
  const getFilteredDataForCharts = useCallback(() => {
    let filteredSamsara = samsaraEvents || [];
    let filteredWex = wexTransactions || [];

    // Filtrar por ano apenas se um ano específico estiver selecionado
    if (selectedYear) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        return event.event_date >= `${selectedYear}-01-01` && event.event_date < `${Number(selectedYear) + 1}-01-01`;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        return transaction.transaction_date >= `${selectedYear}-01-01` && transaction.transaction_date < `${Number(selectedYear) + 1}-01-01`;
      });
    }

    // Filtrar por mês se selecionado
    if (selectedMonth) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        const monthStart = `${selectedYear}-${selectedMonth}-01`;
        const nextMonth = String(Number(selectedMonth) + 1).padStart(2, '0');
        const monthEnd = nextMonth === '13' ? `${Number(selectedYear) + 1}-01-01` : `${selectedYear}-${nextMonth}-01`;
        return event.event_date >= monthStart && event.event_date < monthEnd;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        const monthStart = `${selectedYear}-${selectedMonth}-01`;
        const nextMonth = String(Number(selectedMonth) + 1).padStart(2, '0');
        const monthEnd = nextMonth === '13' ? `${Number(selectedYear) + 1}-01-01` : `${selectedYear}-${nextMonth}-01`;
        return transaction.transaction_date >= monthStart && transaction.transaction_date < monthEnd;
      });
    }

    // NÃO filtrar por motoristas - deixar todos os dados para os gráficos exibirem
    // com cores diferentes baseadas na seleção

    return { filteredSamsara, filteredWex };
  }, [selectedYear, selectedMonth, samsaraEvents, wexTransactions]);

  // Função para obter dados filtrados (incluindo motoristas para a tabela)
  const getFilteredData = useCallback(() => {
    let filteredSamsara = samsaraEvents || [];
    let filteredWex = wexTransactions || [];

    // Filtrar por ano apenas se um ano específico estiver selecionado
    if (selectedYear) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        return event.event_date >= `${selectedYear}-01-01` && event.event_date < `${Number(selectedYear) + 1}-01-01`;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        return transaction.transaction_date >= `${selectedYear}-01-01` && transaction.transaction_date < `${Number(selectedYear) + 1}-01-01`;
      });
    }

    // Filtrar por mês se selecionado
    if (selectedMonth) {
      filteredSamsara = filteredSamsara.filter(event => {
        if (!event.event_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        const monthStart = `${selectedYear}-${selectedMonth}-01`;
        const nextMonth = String(Number(selectedMonth) + 1).padStart(2, '0');
        const monthEnd = nextMonth === '13' ? `${Number(selectedYear) + 1}-01-01` : `${selectedYear}-${nextMonth}-01`;
        return event.event_date >= monthStart && event.event_date < monthEnd;
      });

      filteredWex = filteredWex.filter(transaction => {
        if (!transaction.transaction_date) return false;
        // Usar comparação direta de datas para melhor performance e confiabilidade
        const monthStart = `${selectedYear}-${selectedMonth}-01`;
        const nextMonth = String(Number(selectedMonth) + 1).padStart(2, '0');
        const monthEnd = nextMonth === '13' ? `${Number(selectedYear) + 1}-01-01` : `${selectedYear}-${nextMonth}-01`;
        return transaction.transaction_date >= monthStart && transaction.transaction_date < monthEnd;
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
    }

    return { filteredSamsara, filteredWex };
  }, [selectedYear, selectedMonth, selectedDrivers, availableDriverOptions, samsaraEvents, wexTransactions, normalizeDriverName]);

  // Carregar anos e meses disponíveis + drivers disponíveis a partir dos dados reais
  useEffect(() => {
    console.log('🔍 FuelControl: useEffect executado');
    console.log('🔍 FuelControl: samsaraEvents:', samsaraEvents?.length || 0);
    console.log('🔍 FuelControl: wexTransactions:', wexTransactions?.length || 0);
    
    // Só prosseguir quando houver algum dado carregado
    if ((samsaraEvents && samsaraEvents.length > 0) || (wexTransactions && wexTransactions.length > 0)) {
      console.log(`Samsara: ${samsaraEvents?.length || 0} registros`);
      console.log(`WEX: ${wexTransactions?.length || 0} registros`);
      
      // Verificar dados de setembro 2025
      const samsaraSeptember2025 = samsaraEvents?.filter(event => {
        if (!event.event_date) return false;
        // Usar comparação direta de datas como no debugFuelData.ts
        return event.event_date >= '2025-09-01' && event.event_date < '2025-10-01';
      }) || [];
      
      const wexSeptember2025 = wexTransactions?.filter(transaction => {
        if (!transaction.transaction_date) return false;
        // Usar comparação direta de datas como no debugFuelData.ts
        return transaction.transaction_date >= '2025-09-01' && transaction.transaction_date < '2025-10-01';
      }) || [];
      
      // Extrair anos únicos dos dados reais usando comparação direta
      const samsaraYears = [...new Set(samsaraEvents.map(event => {
        if (!event.event_date) return null;
        // Extrair ano usando substring para melhor performance
        return event.event_date.substring(0, 4);
      }).filter(Boolean))];
      
      const wexYears = [...new Set(wexTransactions.map(transaction => {
        if (!transaction.transaction_date) return null;
        // Extrair ano usando substring para melhor performance
        return transaction.transaction_date.substring(0, 4);
      }).filter(Boolean))];
      
      // Combinar e ordenar anos únicos
      const allYears = [...new Set([...samsaraYears, ...wexYears])]
        .sort((a, b) => Number(b) - Number(a));
      
      setYears(allYears);

      // Definir ano padrão apenas uma vez (primeiro carregamento)
      if (!hasSetDefaultYearRef.current && allYears.length > 0 && !selectedYear) {
        // Priorizar 2025 se existir dados de setembro, caso contrário usar o primeiro ano
        const hasSeptember2025Data = (samsaraSeptember2025.length > 0 || wexSeptember2025.length > 0);
        const defaultYear = (allYears.includes('2025') && hasSeptember2025Data) ? '2025' : allYears[0];
        setSelectedYear(defaultYear);
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
      
      // Inicialmente, nenhum motorista selecionado para mostrar todas as linhas com cores diferentes
      if (availableDriverNames.length > 0 && selectedDrivers.length === 0) {
        setSelectedDrivers([]); // Array vazio = nenhum motorista selecionado
      }
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
             const filteredData = getFilteredDataForCharts();
             
             if (isDetailView) {
               return (
                 <FuelControlChartDetail 
                  filteredWex={filteredData?.filteredWex || []}
                  filteredSamsara={filteredData?.filteredSamsara || []}
                  selectedYear={selectedYear}
                  selectedMonth={selectedMonth}
                  selectedDrivers={selectedDrivers}
                  driverNames={driverNames || []}
                  financialPass={financialPass}
                />
               );
             }
             
             return (
              <FuelControlChart 
                filteredWex={filteredData?.filteredWex || []}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                selectedDrivers={selectedDrivers}
                driverNames={driverNames || []}
                financialPass={financialPass}
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
                filteredSamsara={filteredData?.filteredSamsara || []}
                filteredWex={filteredData?.filteredWex || []}
                selectedDrivers={selectedDrivers}
                driverNames={driverNames || []}
                financialPass={financialPass}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
