
import React, { useMemo, useState, useRef } from 'react';
import type { SamsaraEvent, WexTransaction } from '../../../types/fuelControl';

interface FuelControlTableProps {
  filteredSamsara: SamsaraEvent[];
  filteredWex: WexTransaction[];
  selectedDrivers: string[];
  driverNames: Array<{ id: number; normalized_name: string; wex_name: string | null; samsara_name: string | null }>;
}

interface FuelDriverData {
  driver_name: string;
  average_performance: number;
  total_consumption: number;
  total_distance: number;
  wex_supplied: number;
  wex_value: number;
  idle_time_hours: number;
  idle_fuel_consumption: number;
}

export default function FuelControlTable({ filteredSamsara, filteredWex, selectedDrivers, driverNames }: FuelControlTableProps) {
  // Estados para ordenação da tabela
  const [sortBy, setSortBy] = React.useState<'driver' | 'performance' | 'total_distance' | 'total_consumption' | 'idle_fuel_consumption' | 'idle_time' | 'wex_supplied' | 'wex_value'>('driver');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Função para formatar o tempo de idle
  const formatIdleTime = (hours: number) => {
    if (!hours || hours === 0) return '0';
    
    // Retornar horas com 2 casas decimais
    return hours.toFixed(2);
  };

  // Dados processados para a tabela
  const processedData = useMemo(() => {
    const drivers: Record<string, FuelDriverData> = {};
    
    // Função para normalizar nomes
    const normalizeName = (name: string): string => {
      const found = driverNames.find(d => 
        d.wex_name === name || d.samsara_name === name
      );
      return found ? found.normalized_name : name;
    };
    
    // Processar dados do Samsara
    filteredSamsara.forEach(event => {
      const normalizedName = normalizeName(event.nome);
      if (!drivers[normalizedName]) {
        drivers[normalizedName] = {
          driver_name: normalizedName,
          average_performance: 0,
          total_consumption: 0,
          total_distance: 0,
          wex_supplied: 0,
          wex_value: 0,
          idle_time_hours: 0,
          idle_fuel_consumption: 0
        };
      }
      
      drivers[normalizedName].total_consumption += event.units || 0;
      
      // Processar eventos de viagem vs idle
      if (event.type === 'trip') {
        // Somar apenas distância de viagens
        drivers[normalizedName].total_distance += event.distancia || 0;
      } else if (event.type === 'idle') {
        // Calcular tempo parado em horas
        if (event.idle_duration) {
          // idle_duration já vem em horas como número
          const totalHours = event.idle_duration;
          drivers[normalizedName].idle_time_hours += totalHours;
        }
        
        // Somar combustível gasto com carro parado
        drivers[normalizedName].idle_fuel_consumption += event.units || 0;
      }
    });

    // Processar dados do WEX
    filteredWex.forEach(transaction => {
      const normalizedName = normalizeName(transaction.nome);
      if (!drivers[normalizedName]) {
        drivers[normalizedName] = {
          driver_name: normalizedName,
          average_performance: 0,
          total_consumption: 0,
          total_distance: 0,
          wex_supplied: 0,
          wex_value: 0,
          idle_time_hours: 0,
          idle_fuel_consumption: 0
        };
      }
      drivers[normalizedName].wex_supplied += transaction.units || 0;
      drivers[normalizedName].wex_value += transaction.valor || 0;
    });

    // Calcular performance média (MPG real baseado na distância e consumo de viagens)
    Object.values(drivers).forEach(driver => {
      // Calcular combustível gasto apenas em viagens (excluindo idle)
      const tripFuelConsumption = driver.total_consumption - driver.idle_fuel_consumption;
      
      if (tripFuelConsumption > 0 && driver.total_distance > 0) {
        driver.average_performance = Math.round((driver.total_distance / tripFuelConsumption) * 100) / 100;
      } else {
        driver.average_performance = 0;
      }
    });



    return drivers;
  }, [filteredSamsara, filteredWex, driverNames]);

  // Filtrar por motoristas selecionados
  const filteredData = useMemo(() => {
    if (selectedDrivers.length === 0) return processedData;
    return Object.fromEntries(
      Object.entries(processedData).filter(([driverName]) => 
        selectedDrivers.includes(driverName)
      )
    );
  }, [processedData, selectedDrivers]);

  // Dados agrupados e ordenados para a tabela
  const groupedData = useMemo(() => {
    const entries = Object.entries(filteredData);
    entries.sort((a, b) => {
      let vA, vB;
             if (sortBy === 'driver') {
         vA = a[0];
         vB = b[0];
       } else if (sortBy === 'performance') {
         vA = a[1].average_performance;
         vB = b[1].average_performance;
       } else if (sortBy === 'total_distance') {
         vA = a[1].total_distance;
         vB = b[1].total_distance;
       } else if (sortBy === 'total_consumption') {
         vA = a[1].total_consumption;
         vB = b[1].total_consumption;
       } else if (sortBy === 'idle_fuel_consumption') {
         vA = a[1].idle_fuel_consumption;
         vB = b[1].idle_fuel_consumption;
       } else if (sortBy === 'idle_time') {
         vA = a[1].idle_time_hours;
         vB = b[1].idle_time_hours;
       } else if (sortBy === 'wex_supplied') {
         vA = a[1].wex_supplied;
         vB = b[1].wex_supplied;
       } else { // wex_value
         vA = a[1].wex_value;
         vB = b[1].wex_value;
       }
      
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return Object.fromEntries(entries);
  }, [filteredData, sortBy, sortDir]);

  // Função para abrir o campo de busca e focar
  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Função para fechar o campo de busca
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  // Filtrar os dados agrupados conforme o texto
  const filteredGroupedData = useMemo(() => {
    if (!searchText.trim()) return groupedData;
    const lower = searchText.toLowerCase();
    return Object.fromEntries(
      Object.entries(groupedData).filter(([key]) => key.toLowerCase().includes(lower))
    );
  }, [groupedData, searchText]);

  return (
    <>
      <div style={{ 
        background: 'var(--color-background-primary)', 
        padding: '16px 20px 16px 20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }} className='justify-content-between'>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
              Data Overview
            </h4>
          </div>
          <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
            {/* Filtro de texto */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: searchOpen ? 'space-between' : 'center',
                position: 'relative',
                width: searchOpen ? 220 : 42,
                height: 42,
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                background: searchOpen ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: searchOpen ? 25 : 21,
                padding: searchOpen ? '2px 8px 2px 8px' : '4px',
                boxSizing: 'border-box',
              }}
            >
              <button
                type="button"
                className="btn-tertiary-custom d-flex align-items-center justify-content-center"
                style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, transition: 'all 0.2s', color: 'var(--color-accent-primary)', flexShrink: 0, background: 'transparent', border: 'none' }}
                onClick={handleOpenSearch}
                aria-label="Abrir busca"
                title="Buscar"
                tabIndex={searchOpen ? -1 : 0}
                disabled={searchOpen}
              >
                <i className="bi bi-search" />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar motorista..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                  fontSize: 15,
                  height: 32,
                  marginLeft: 4,
                  display: searchOpen ? 'block' : 'none',
                  padding: searchOpen ? '0 8px 0 4px' : '0',
                  width: searchOpen ? '100%' : 0,
                  minWidth: 0,
                  opacity: searchOpen ? 1 : 0,
                  pointerEvents: searchOpen ? 'auto' : 'none',
                  transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onBlur={() => { if (!searchText) handleCloseSearch(); }}
                tabIndex={searchOpen ? 0 : -1}
              />
            </div>

            {/* Ordenação */}
            <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                                                  <select value={sortBy} onChange={e => setSortBy(e.target.value as 'driver' | 'performance' | 'total_distance' | 'total_consumption' | 'idle_fuel_consumption' | 'idle_time' | 'wex_supplied' | 'wex_value')}
                   style={{
                     background: 'var(--color-background-primary)',
                     color: 'var(--color-text-primary)',
                     border: '1.5px solid var(--color-border-divider)',
                     borderRadius: 8,
                     padding: '4px 32px 4px 8px',
                     fontSize: 14,
                     appearance: 'none',
                     WebkitAppearance: 'none',
                     MozAppearance: 'none',
                     minWidth: 110,
                   }}>
                   <option value="driver">Driver</option>
                   <option value="performance">Performance (MPG)</option>
                   <option value="total_distance">Total Distance (mi)</option>
                   <option value="total_consumption">Total Consumed (gal)</option>
                   <option value="idle_fuel_consumption">Idle Fuel (gal)</option>
                   <option value="idle_time">Idle Time (hours)</option>
                   <option value="wex_supplied">WEX Supplied (gal)</option>
                   <option value="wex_value">WEX Value ($)</option>
                 </select>
                <i
                  className="bi bi-chevron-down"
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--color-accent-primary)',
                    fontSize: 16,
                  }}
                />
              </div>
              <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{ background: 'var(--color-background-primary)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {sortDir === 'asc' ? (
                  sortBy === 'driver' ? <i className="bi bi-sort-alpha-down" /> : <i className="bi bi-sort-numeric-down" />
                ) : (
                  sortBy === 'driver' ? <i className="bi bi-sort-alpha-up" /> : <i className="bi bi-sort-numeric-up" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '40vh', padding: '0 10px 10px 10px' }}>
        <div style={{ height: 327, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Driver</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Performance</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Total Distance (mi)</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Total Consumed (gal)</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Idle Fuel (gal)</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Idle Time</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>WEX Supplied (gal)</th>
                <th style={{ padding: '8px', border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>WEX Value ($)</th>
              </tr>
            </thead>
            <tbody>
                             {Object.entries(filteredGroupedData).map(([driverName, data]) => (
                <tr key={driverName}>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{data.driver_name}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>{data.average_performance.toFixed(1)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{data.total_distance.toFixed(1)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#1bbf5c', textAlign: 'right' }}>{data.total_consumption.toFixed(1)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'rgba(27, 191, 92, 0.75)', textAlign: 'right' }}>{data.idle_fuel_consumption.toFixed(1)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#ff6b35', textAlign: 'right' }}>{formatIdleTime(data.idle_time_hours)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#2E6BE6', textAlign: 'right' }}>{data.wex_supplied.toFixed(1)}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#dc3545', textAlign: 'right' }}>{data.wex_value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                </tr>
              ))}
                             {/* Interface de "sem dados" quando não há dados para exibir */}
               {Object.keys(filteredGroupedData).length === 0 && (
                 <tr>
                   <td colSpan={8} style={{ 
                     padding: '40px 20px', 
                     border: '1px solid var(--color-border-divider)', 
                     textAlign: 'center',
                     verticalAlign: 'middle'
                   }}>
                                           <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center'
                      }}>
                        <div style={{ 
                          fontSize: 48, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.5,
                          marginBottom: 16
                        }}>
                          <i className="bi bi-table"></i>
                        </div>
                        <div style={{ 
                          fontSize: 18, 
                          fontWeight: 500, 
                          color: 'var(--color-text-secondary)',
                          marginBottom: 8
                        }}>
                          Sem dados para exibir
                        </div>
                        <div style={{ 
                          fontSize: 14, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                          maxWidth: 300
                        }}>
                          Não há dados de combustível para o período e filtros selecionados
                        </div>
                      </div>
                   </td>
                 </tr>
               )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
