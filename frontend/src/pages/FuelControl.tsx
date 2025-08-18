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
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  
  // Estado para opções de drivers disponíveis
  const [availableDriverOptions, setAvailableDriverOptions] = useState<string[]>([]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const hasSetDefaultYearRef = React.useRef<boolean>(false);

  // Estados para métricas calculadas
  const [metrics, setMetrics] = useState({
    performance: 0,
    consumed: 0,
    supplied: 0,
    distance: 0,
    amountSpent: 0
  });

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

    // Filtrar por motoristas selecionados
    if (selectedDrivers.length > 0) {
      filteredSamsara = filteredSamsara.filter(event => {
        const normalizedName = normalizeDriverName(event.nome);
        return selectedDrivers.includes(normalizedName);
      });

      filteredWex = filteredWex.filter(transaction => {
        const normalizedName = normalizeDriverName(transaction.nome);
        return selectedDrivers.includes(normalizedName);
      });
    }

    // Filtrar por tipos selecionados
    if (selectedEventTypes.length > 0) {
      filteredSamsara = filteredSamsara.filter(event => 
        selectedEventTypes.includes(event.type)
      );
    }

    return { filteredSamsara, filteredWex };
  }, [selectedYear, selectedMonth, selectedDrivers, selectedEventTypes, samsaraEvents, wexTransactions, normalizeDriverName]);

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

      // Extrair nomes normalizados que realmente aparecem nos dados (dedupe case-insensitive)
      const availableDriversMap = new Map<string, string>();

      // Adicionar nomes do Samsara
      samsaraEvents.forEach(event => {
        if (!event.nome) return;
        const normalized = normalizeDriverName(event.nome).trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (!availableDriversMap.has(key)) {
          availableDriversMap.set(key, normalized);
        }
      });

      // Adicionar nomes do WEX
      wexTransactions.forEach(transaction => {
        if (!transaction.nome) return;
        const normalized = normalizeDriverName(transaction.nome).trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (!availableDriversMap.has(key)) {
          availableDriversMap.set(key, normalized);
        }
      });

      // Converter para array e ordenar alfabeticamente
      const availableDriverNames = Array.from(availableDriversMap.values()).sort((a, b) => a.localeCompare(b));

      // Atualizar opções disponíveis
      setAvailableDriverOptions(availableDriverNames);
      
      // Inicializar seleção de drivers se vazia ou inválida
      if (selectedDrivers.length === 0 || !selectedDrivers.some(driver => availableDriverNames.includes(driver))) {
        setSelectedDrivers(availableDriverNames);
      }
    }
  }, [samsaraEvents, wexTransactions, normalizeDriverName]);

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

  // Calcular métricas baseadas nos filtros selecionados
  useEffect(() => {
    if (!selectedYear) return;

    const { filteredSamsara, filteredWex } = getFilteredData();

    // Calcular métricas
    let totalConsumed = 0;
    let totalSupplied = 0;
    let totalDistance = 0;
    let totalAmountSpent = 0;

    // Calcular consumo total (Samsara)
    filteredSamsara.forEach(event => {
      totalConsumed += event.units;
      if (event.type === 'trip') {
        totalDistance += event.distancia;
      }
    });

    // Calcular abastecimento total (WEX)
    filteredWex.forEach(transaction => {
      totalSupplied += transaction.units;
      totalAmountSpent += transaction.valor;
    });

    // Calcular performance (milhas por galão)
    const performance = totalDistance > 0 && totalConsumed > 0 
      ? totalDistance / totalConsumed 
      : 0;

    setMetrics({
      performance: Math.round(performance * 100) / 100, // Arredondar para 2 casas decimais
      consumed: Math.round(totalConsumed * 100) / 100,
      supplied: Math.round(totalSupplied * 100) / 100,
      distance: Math.round(totalDistance * 100) / 100,
      amountSpent: Math.round(totalAmountSpent * 100) / 100
    });
  }, [selectedYear, selectedMonth, selectedDrivers, selectedEventTypes, driverNames, getFilteredData]);

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
          selectedEventTypes={selectedEventTypes}
          setSelectedEventTypes={setSelectedEventTypes}
          years={years}
          months={months}
          availableDrivers={availableDriverOptions}
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
        
                 {/* Área inferior: Tabela (75%) + Métricas (25%) lado a lado */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
                     {/* Tabela de Performance - 75% da largura */}
           <div style={{ width: '75%', height: '100%', borderRight: '1px solid var(--color-border-divider)', overflow: 'hidden' }}>
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
          
                     {/* Métricas de Resumo - 25% da largura */}
           <div style={{ 
             width: '25%', 
             height: '100%', 
             background: 'var(--color-background-primary)', 
             overflow: 'hidden',
             display: 'flex',
             flexDirection: 'column'
           }}>
                         {/* Header das métricas */}
             <div style={{ 
               background: 'var(--color-background-primary)', 
               padding: '16px 20px 16px 20px'
             }}>
               <h4 style={{ 
                 color: 'var(--color-text-secondary)', 
                 fontSize: 18, 
                 fontWeight: 400, 
                 margin: 0,
                 textAlign: 'center'
               }}>
                 Fuel Metrics
               </h4>
             </div>
             
             {/* Container dos cards de métricas */}
             <div style={{ 
               flex: 1, 
               display: 'flex', 
               flexDirection: 'column', 
               overflow: 'hidden',
               minHeight: 0
             }}>
                                               {/* Primeiro bloco - Desempenho Médio com bordas superior e inferior */}
                 <div style={{ 
                   background: 'var(--color-background-primary)', 
                   borderTop: '1px solid var(--color-border-divider)',
                   borderBottom: '1px solid var(--color-border-divider)',
                   padding: '20px',
                   flex: '0 0 auto',
                   minHeight: '80px',
                   display: 'flex',
                   flexDirection: 'row',
                   alignItems: 'center',
                   justifyContent: 'space-evenly'
                 }}>
                                       <div style={{ fontSize: '16px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                      Performance
                    </div>
                   <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                     {metrics.performance} mi/gal
                   </div>
                 </div>

               {/* Grid 2x2 das métricas específicas - mesmo layout do PROJECTS */}
               <div style={{ 
                 flex: 1,
                 display: 'grid',
                 gridTemplateColumns: '1fr 1fr',
                 gridTemplateRows: '1fr 1fr',
                 minHeight: 0
               }}>
                                                     {/* Primeira linha, primeira coluna - Quantidade Consumida (SAMSARA) */}
                   <div style={{ 
                     background: 'var(--color-background-primary)', 
                     borderRight: '1px solid var(--color-border-divider)',
                     borderBottom: '1px solid var(--color-border-divider)',
                     padding: '16px',
                     textAlign: 'center',
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                     <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                       Consumed
                     </div>
                     <div style={{ fontSize: '18px', fontWeight: '600', color: '#1bbf5c' }}>
                       {metrics.consumed} gal
                     </div>
                  </div>

                                     {/* Primeira linha, segunda coluna - Quantidade Abastecida (WEX) */}
                   <div style={{ 
                     background: 'var(--color-background-primary)', 
                     borderBottom: '1px solid var(--color-border-divider)',
                     padding: '16px',
                     textAlign: 'center',
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                       <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                        Supplied
                      </div>
                       <div style={{ fontSize: '18px', fontWeight: '600', color: '#2E6BE6' }}>
                         {metrics.supplied} gal
                       </div>
                   </div>

                   {/* Segunda linha, primeira coluna - Distância Percorrida */}
                   <div style={{ 
                     background: 'var(--color-background-primary)', 
                     borderRight: '1px solid var(--color-border-divider)',
                     padding: '16px',
                     textAlign: 'center',
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                     <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                       Distance Traveled
                     </div>
                     <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                         {metrics.distance} mi
                       </div>
                   </div>

                   {/* Segunda linha, segunda coluna - Valor Gasto */}
                   <div style={{ 
                     background: 'var(--color-background-primary)', 
                     padding: '16px',
                     textAlign: 'center',
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                      Amount Spent
                    </div>
                     <div style={{ fontSize: '18px', fontWeight: '600', color: '#dc3545' }}>
                       ${metrics.amountSpent.toFixed(2)}
                     </div>
                  </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
