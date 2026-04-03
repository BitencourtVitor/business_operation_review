import React, { useState, useMemo, useEffect } from 'react';
import { usePremiumStorageData } from '../../hooks/usePremiumStorageData';
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar,
  AreaChart,
  Area,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import InventoryControlFilters from './InventoryControlFilters';

interface InventoryControlProps {
  theme?: 'light' | 'dark';
}

export const InventoryControl: React.FC<InventoryControlProps> = ({ theme = 'light' }) => {
  const { historicoSaldo, detalhesExcesso, gastosUsuario, productPrices, loading: storageLoading, error } = usePremiumStorageData();
  
  // State for Filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const loading = storageLoading;

  // Generate Year options
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const uniqueYears = new Set<string>();
    
    historicoSaldo.forEach(h => {
      const match = h.mes.match(/^(\d{4})/);
      if (match) uniqueYears.add(match[1]);
    });
    
    uniqueYears.add(currentYear); 
    return Array.from(uniqueYears).sort((a, b) => b.localeCompare(a));
  }, [historicoSaldo]);

  // Generate Month options dynamically based on available data
  const months = useMemo(() => {
    const uniqueMonths = new Set<string>();
    
    // From historicoSaldo (YYYY-MM)
    historicoSaldo.forEach(h => {
      const match = h.mes.match(/^(\d{4})-(\d{2})/);
      if (match) {
        const [_, year, month] = match;
        if (!selectedYear || year === selectedYear) {
          uniqueMonths.add(parseInt(month).toString());
        }
      }
    });

    // From detalhesExcesso (ISO string)
    detalhesExcesso.forEach(d => {
      try {
        const date = parseISO(d.movement_date);
        const year = format(date, 'yyyy');
        const month = format(date, 'M');
        if (!selectedYear || year === selectedYear) {
          uniqueMonths.add(month);
        }
      } catch (e) {
        // Ignore invalid dates
      }
    });

    // From gastosUsuario (YYYY-MM)
    gastosUsuario.forEach(u => {
      const match = u.mes.match(/^(\d{4})-(\d{2})/);
      if (match) {
        const [_, year, month] = match;
        if (!selectedYear || year === selectedYear) {
          uniqueMonths.add(parseInt(month).toString());
        }
      }
    });

    return Array.from(uniqueMonths).sort((a, b) => Number(a) - Number(b));
  }, [historicoSaldo, detalhesExcesso, gastosUsuario, selectedYear]);

  // Reset month if it's not available for the selected year
  useEffect(() => {
    if (selectedMonth && !months.includes(selectedMonth)) {
      setSelectedMonth('');
    }
  }, [selectedYear, months, selectedMonth]);

  // --- DATA PROCESSING ---

  // 1. Stock Adherence Month-by-Month (Service Level)
  const adherenceData = useMemo(() => {
    const grouped = new Map<string, { total: number, below: number }>();
    
    if (selectedYear) {
      for (let i = 0; i < 12; i++) {
        const monthKey = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
        grouped.set(monthKey, { total: 0, below: 0 });
      }
    }

    historicoSaldo.forEach(h => {
      const match = h.mes.match(/^(\d{4})-(\d{2})/);
      if (!match) return;

      const year = match[1];
      const month = match[2];
      const monthKey = `${year}-${month}`;

      if (selectedYear && year !== selectedYear) return;

      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, { total: 0, below: 0 });
      }
      const current = grouped.get(monthKey)!;
      current.total++;
      if (h.abaixo_minimo) current.below++;
    });

    return Array.from(grouped.entries())
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        return {
          fullDate: monthKey,
          displayDate: format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM'),
          fullMonthName: format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM'),
          adherence: data.total > 0 ? ((data.total - data.below) / data.total) * 100 : null,
          total: data.total,
          below: data.below
        };
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [historicoSaldo, selectedYear]);

  // 2. Financial Impact Data (Month-by-Month)
  const financialImpactData = useMemo(() => {
    if (!selectedYear) return [];
    
    const fullYearData = Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(parseInt(selectedYear), i, 1);
      return {
        mes: format(monthDate, 'MMM'),
        fullMonth: format(monthDate, 'MMMM'),
        fullDate: format(monthDate, 'yyyy-MM-dd'),
        totalCost: 0,
        excessCost: 0,
        normalCost: 0
      };
    });

    // Fill cost totals from detalhesExcesso
    detalhesExcesso.forEach(d => {
      const date = parseISO(d.movement_date);
      const year = format(date, 'yyyy');
      const monthIndex = parseInt(format(date, 'MM')) - 1;

      if (year === selectedYear) {
        const withdrawn = d.quantidade_retirada;
        const totalAtMoment = d.consumo_acumulado_momento;
        const limit = d.quantidade_limite;
        const price = d.valor_unitario || productPrices[d.product_id] || productPrices[d.product_nome] || 0;
        
        // Calculate excess portion of THIS withdrawal
        const previousTotal = totalAtMoment - withdrawn;
        const excessUnits = Math.max(0, totalAtMoment - Math.max(limit, previousTotal));
        const normalUnits = withdrawn - excessUnits;

        const excessCost = excessUnits * price;
        const normalCost = normalUnits * price;
        const totalCost = withdrawn * price;

        fullYearData[monthIndex].totalCost += totalCost;
        fullYearData[monthIndex].excessCost += excessCost;
        fullYearData[monthIndex].normalCost += normalCost;
      }
    });

    return fullYearData;
  }, [detalhesExcesso, selectedYear, productPrices]);

  // Filters and transformations
  const filteredExcess = useMemo(() => {
      const filtered = detalhesExcesso
      .filter(d => {
        const date = parseISO(d.movement_date);
        const year = format(date, 'yyyy');
        const month = format(date, 'MM'); 
        
        if (selectedYear && year !== selectedYear) return false;
        
        if (selectedMonth) {
          const selectedMonthNum = selectedMonth.padStart(2, '0');
          if (month !== selectedMonthNum) return false;
        }
        
        if (d.project_nome?.toUpperCase().includes('(TEST)')) return false;

        return d.consumo_acumulado_momento > d.quantidade_limite;
      });

    // Group by project_id (or project_nome if id is missing)
    const grouped: Record<string, any> = {};
    
    filtered.forEach(d => {
      const key = d.project_id || d.project_nome;
      if (!grouped[key]) {
        grouped[key] = {
          project_id: d.project_id,
          project_nome: d.project_nome,
          house_model_nome: d.house_model_nome,
          violations: []
        };
      }
      
      // Add violation if not already present (to avoid duplicates if the same product exceeded multiple times in the filtered period)
      // Or we can just show all of them. Let's show all unique product violations for that project.
      const existingViolation = grouped[key].violations.find((v: any) => v.product_nome === d.product_nome);
      if (!existingViolation) {
        grouped[key].violations.push({
          product_id: d.product_id,
          product_nome: d.product_nome,
          consumo_acumulado_momento: d.consumo_acumulado_momento,
          quantidade_limite: d.quantidade_limite,
          movement_date: d.movement_date,
          valor_unitario: d.valor_unitario,
          destinatario_id: d.destinatario_id,
          usuario_responsavel: d.usuario_responsavel
        });
      } else if (new Date(d.movement_date) > new Date(existingViolation.movement_date)) {
        // Keep the most recent violation for the same product in the grouped view
        existingViolation.product_id = d.product_id;
        existingViolation.consumo_acumulado_momento = d.consumo_acumulado_momento;
        existingViolation.quantidade_limite = d.quantidade_limite;
        existingViolation.movement_date = d.movement_date;
        existingViolation.valor_unitario = d.valor_unitario;
        existingViolation.destinatario_id = d.destinatario_id;
        existingViolation.usuario_responsavel = d.usuario_responsavel;
      }
    });

    return Object.values(grouped).sort((a: any, b: any) => a.project_nome.localeCompare(b.project_nome));
  }, [detalhesExcesso, selectedYear, selectedMonth, months]);

  // Chart Data Preparation
  const averageAdherence = useMemo(() => {
    if (selectedMonth) {
      const selectedMonthNum = selectedMonth.padStart(2, '0');
      const monthData = adherenceData.find(d => d.fullDate.endsWith(`-${selectedMonthNum}`));
      return monthData?.adherence ?? 100;
    }

    const dataWithAdherence = adherenceData.filter(d => d.adherence !== null);
    if (dataWithAdherence.length === 0) return 100;
    
    const sum = dataWithAdherence.reduce((acc, curr) => acc + curr.adherence!, 0);
    return sum / dataWithAdherence.length;
  }, [adherenceData, selectedMonth]);

  const { totalExcessCost, totalWithdrawnCost, totalExcessUnits } = useMemo(() => {
    // Determine the data subset based on selected year/month
    const relevantData = selectedMonth 
      ? [financialImpactData[parseInt(selectedMonth) - 1]]
      : financialImpactData;

    const costs = relevantData.reduce((acc, curr) => ({
      excess: acc.excess + (curr?.excessCost || 0),
      withdrawn: acc.withdrawn + (curr?.totalCost || 0)
    }), { excess: 0, withdrawn: 0 });

    // Calculate total excess units for the selected period (raw data to avoid deduplication)
    const units = detalhesExcesso.reduce((acc, d) => {
      const date = parseISO(d.movement_date);
      const year = format(date, 'yyyy');
      const month = format(date, 'M');
      
      if (year === selectedYear && (!selectedMonth || month === selectedMonth)) {
        const withdrawn = d.quantidade_retirada;
        const totalAtMoment = d.consumo_acumulado_momento;
        const limit = d.quantidade_limite;
        const previousTotal = totalAtMoment - withdrawn;
        const excessUnits = Math.max(0, totalAtMoment - Math.max(limit, previousTotal));
        return acc + excessUnits;
      }
      return acc;
    }, 0);

    return {
      totalExcessCost: costs.excess,
      totalWithdrawnCost: costs.withdrawn,
      totalExcessUnits: Math.round(units)
    };
  }, [financialImpactData, selectedMonth, selectedYear, detalhesExcesso]);
  
  if (loading) return (
    <div className="d-flex align-items-center justify-content-center" style={{ height: '100%', background: 'var(--color-background-primary)' }}>
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status"></div>
        <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Loading Inventory Data...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="d-flex align-items-center justify-content-center" style={{ height: '100%', background: 'var(--color-background-primary)' }}>
      <div className="alert alert-danger shadow-sm border-0 rounded-4 p-4 text-center" style={{ maxWidth: '400px' }}>
        <i className="bi bi-exclamation-triangle-fill fs-1 d-block mb-3"></i>
        <h5 className="alert-heading">Connection Error</h5>
        <p className="mb-0 opacity-75">{error}</p>
      </div>
    </div>
  );

  // --- STYLES ---
  const flatCardStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    borderRight: '1.5px solid var(--color-border-divider)',
    borderBottom: '1.5px solid var(--color-border-divider)',
    borderRadius: '0',
    boxShadow: 'none',
    transition: 'background 0.3s, color 0.3s',
    overflow: 'hidden',
    padding: '12px 0',
    minHeight: 0,
    flex: 1
  };

  const chartTitleStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: '16px',
    fontWeight: 400,
    minHeight: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginLeft: '24px',
    marginBottom: '8px'
  };

  const getAdherenceColor = (value: number) => {
    if (value >= 85) return 'var(--positive-color)';
    if (value >= 65) return 'var(--challenges-color)';
    return 'var(--negative-color)';
  };

  const InventoryTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          padding: '12px',
          borderRadius: '4px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
          color: 'var(--color-text-primary)',
          zIndex: 1000,
          minWidth: '200px'
        }}>
          <div style={{ 
            fontSize: '10px', 
            fontWeight: 800, 
            marginBottom: '10px', 
            color: 'var(--color-text-secondary)', 
            textTransform: 'uppercase', 
            letterSpacing: '1px',
            borderBottom: '1px solid var(--color-border-divider)',
            paddingBottom: '6px'
          }}>
            {data.fullMonth} {selectedYear}
          </div>

          <div className="d-flex flex-column gap-2">
            <div className="d-flex justify-content-between align-items-center">
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Excess Portion</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: data.excessCost > 0 ? 'var(--negative-color)' : 'inherit' }}>
                ${data.excessCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Normal Portion</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-brand-blue)' }}>
                ${data.normalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-1 pt-2" style={{ borderTop: '1px solid var(--color-border-divider)' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Total Withdrawn</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                ${data.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          padding: '12px',
          borderRadius: '4px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
          color: 'var(--color-text-primary)',
          zIndex: 1000,
          minWidth: '180px'
        }}>
          <div style={{ 
            fontSize: '10px', 
            fontWeight: 800, 
            marginBottom: '10px', 
            color: 'var(--color-text-secondary)', 
            textTransform: 'uppercase', 
            letterSpacing: '1px',
            borderBottom: '1px solid var(--color-border-divider)',
            paddingBottom: '6px'
          }}>
            {label}
          </div>

          <div className="d-flex flex-column gap-2">
            <div className="d-flex justify-content-between align-items-center">
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Adherence</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: getAdherenceColor(data.adherence) }}>
                {data.adherence?.toFixed(1)}%
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Below min</span>
              {data.below > 0 ? (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 900,
                  color: 'var(--negative-color)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  lineHeight: 1.2
                }}>
                  {data.below}
                </span>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', opacity: 0.7 }}>{data.below}</span>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const data = adherenceData.find(d => d.displayDate === payload.value);
    if (!data) return null;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fill="var(--color-text-secondary)" fontSize={10} fontWeight={600}>
          {data.displayDate}
        </text>
      </g>
    );
  };

  const CustomLabel = (props: any) => {
    const { x, y, index } = props;
    const data = adherenceData[index];
    if (!data || data.total === 0) return null;
    const hasBelow = data.below > 0;

    return (
      <g transform={`translate(${x},${y})`}>
        <rect 
          x="-20" 
          y="-30" 
          width="40" 
          height="18" 
          rx="4" 
          fill={hasBelow ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-background-primary)'}
          stroke={hasBelow ? 'rgba(239, 68, 68, 0.35)' : 'var(--color-border-divider)'}
          strokeWidth="1"
          style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))' }}
        />
        <text 
          x="0" 
          y="-17" 
          textAnchor="middle" 
          fill={hasBelow ? 'var(--negative-color)' : 'var(--color-text-primary)'}
          fontSize={9} 
          fontWeight={800}
        >
          {data.below}
        </text>
      </g>
    );
  };

  return (
    <div className={`d-flex flex-column ${theme === 'dark' ? 'dark' : ''}`} style={{ 
      height: '100%', 
      overflow: 'hidden', 
      background: 'var(--color-background-primary)', 
      color: 'var(--color-text-primary)',
      scrollBehavior: 'smooth'
    }}>
      
      {/* Header */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ 
        padding: '12px 24px', 
        borderBottom: '1px solid var(--color-border-divider)', 
        background: 'var(--color-background-primary)', 
        flex: '0 0 auto',
        zIndex: 100
      }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
          Inventory Control Index
        </h1>
        
        <div className="d-flex align-items-center gap-3">
          <InventoryControlFilters 
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            years={years}
            months={months}
          />
        </div>
      </div>

      <div className="container-fluid p-0 flex-grow-1 d-flex flex-column" style={{ overflow: 'hidden', minHeight: 0 }}>
        
        {/* KPI Grid - Takeoff Works Style */}
        <div className="d-flex flex-row align-items-stretch" style={{ 
          borderBottom: '1px solid var(--color-border-divider)', 
          background: 'var(--color-background-primary)',
          height: '80px',
          flexShrink: 0
        }}>
          {/* Stock Service Level - Primary Highlight */}
          <div className="d-flex flex-column justify-content-center align-items-center px-4" style={{ 
            minWidth: '220px',
            borderRight: '2px solid var(--color-border-divider)',
            background: 'rgba(var(--color-brand-blue-rgb), 0.04)',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 4, background: 'var(--color-brand-blue)', borderRadius: '0 4px 4px 0' }} />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 0, letterSpacing: '0.5px' }}>
              Stock Service Level
            </span>
            <div className="d-flex align-items-baseline gap-2">
              <span style={{ 
                color: getAdherenceColor(averageAdherence), 
                fontWeight: 800, 
                fontSize: 28, 
                lineHeight: 1 
              }}>
                {averageAdherence.toFixed(1)}
              </span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, opacity: 0.8 }}>%</span>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="d-flex flex-row align-items-stretch flex-grow-1">
          {/* Excess Units */}
          <div className="d-flex flex-column justify-content-center align-items-center px-4" style={{ 
            flex: 1,
            borderRight: '1px solid var(--color-border-divider)',
            minWidth: '180px'
          }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.3px' }}>
              Excess Units
            </span>
            <div className="d-flex align-items-center gap-2">
              <span style={{ 
                color: totalExcessUnits > 0 ? 'var(--negative-color)' : 'var(--positive-color)', 
                fontWeight: 700, 
                fontSize: 20,
                lineHeight: 1
              }}>
                {totalExcessUnits}
              </span>
              <div style={{ height: 4, background: 'var(--color-background-secondary)', borderRadius: 2, overflow: 'hidden', width: 60 }}>
                <div style={{ 
                  width: `${Math.min(100, (totalExcessUnits / 50) * 100)}%`, 
                  height: '100%', 
                  background: 'var(--negative-color)',
                  transition: 'width 0.6s ease'
                }} />
              </div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                Units
              </span>
            </div>
          </div>

          {/* Excess Cost Impact */}
          <div className="d-flex flex-column justify-content-center align-items-center px-4" style={{ 
            flex: 1,
            minWidth: '220px'
          }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.3px' }}>
              Financial Impact (Excess | Total)
            </span>
            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-baseline gap-1">
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--negative-color)' }}>$</span>
                <span style={{ 
                  color: 'var(--negative-color)', 
                  fontWeight: 700, 
                  fontSize: 20,
                  lineHeight: 1
                }}>
                  {totalExcessCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              
              <span style={{ color: 'var(--color-border-divider)', fontWeight: 300, fontSize: 18 }}>|</span>
              
              <div className="d-flex align-items-baseline gap-1">
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', opacity: 0.6 }}>$</span>
                <span style={{ 
                  color: 'var(--color-text-primary)', 
                  fontWeight: 700, 
                  fontSize: 20,
                  lineHeight: 1
                }}>
                  {totalWithdrawnCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0, overflow: 'hidden' }}>
          {/* Top Row: Adherence (60%) & Details (40%) */}
          <div className="d-flex flex-row" style={{ flex: '1 1 50%', borderBottom: '1px solid var(--color-border-divider)', minHeight: 0 }}>
            {/* Main Adherence Chart - 60% */}
            <div style={{ ...flatCardStyle, width: '60%', borderRight: '1.5px solid var(--color-border-divider)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h4 style={chartTitleStyle}>
                Stock Adherence Trend
              </h4>
              <div style={{ flex: 1, padding: '0 24px', minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={adherenceData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorAdh" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-divider)" opacity="0.3" />
                    <XAxis 
                      dataKey="displayDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={<CustomXAxisTick />} 
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      axisLine={false} 
                      tickLine={false} 
                      unit="%" 
                      tick={{ fill: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600 }} 
                    />
                    <Tooltip cursor={{ stroke: 'var(--color-border-divider)', strokeWidth: 1 }} content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="adherence" 
                      stroke="var(--color-accent-primary)" 
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorAdh)"
                      dot={{ r: 4, fill: 'var(--color-accent-primary)', strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      animationDuration={1500}
                      label={<CustomLabel />}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Violation Details - 40% */}
            <div style={{ ...flatCardStyle, width: '40%', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="d-flex justify-content-between align-items-center mb-0 pe-4">
                <h4 style={chartTitleStyle}>
                  Limit Violations Details
                </h4>
              </div>
              <div className="flex-grow-1 custom-scrollbar" style={{ padding: '0 24px', overflowY: 'auto', minHeight: 0 }}>
                {filteredExcess.length > 0 ? (
                  <div className="d-flex flex-column gap-3">
                    {filteredExcess.map((project: any, idx) => (
                      <div key={idx} className="d-flex flex-column mb-4" style={{ 
                        border: '1.5px solid var(--color-border-divider)', 
                        borderRadius: '8px', 
                        padding: '16px',
                        background: 'var(--color-background-primary)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div className="d-flex flex-column" style={{ gap: '2px' }}>
                            <div className="d-flex align-items-center gap-2">
                              <i className="bi bi-geo-alt" style={{ fontSize: '14px', color: 'var(--color-accent-primary)' }}></i>
                              <span className="fw-bold" style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>
                                {project.project_nome}
                              </span>
                            </div>
                            <div className="d-flex align-items-center gap-2" style={{ marginLeft: '22px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                                {project.house_model_nome}
                              </span>
                            </div>
                          </div>

                          <div className="d-flex gap-3 text-end">
                            <div className="d-flex flex-column align-items-end">
                              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--negative-color)' }}>
                                ${project.violations.reduce((sum: number, v: any) => {
                                  const excess = Math.max(0, v.consumo_acumulado_momento - v.quantidade_limite);
                                  const price = v.valor_unitario || productPrices[v.product_id] || productPrices[v.product_nome] || 0;
                                  return sum + (excess * price);
                                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Excess Cost
                              </div>
                            </div>

                            <div className="d-flex flex-column align-items-end" style={{ borderLeft: '1.5px solid var(--color-border-divider)', paddingLeft: '12px' }}>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                ${project.violations.reduce((sum: number, v: any) => {
                                  const total = v.consumo_acumulado_momento;
                                  const price = v.valor_unitario || productPrices[v.product_id] || productPrices[v.product_nome] || 0;
                                  return sum + (total * price);
                                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Total Cost
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* List of Material Violations */}
                        <div className="d-flex flex-column gap-2 mt-2">
                          {project.violations.map((violation: any, vIdx: number) => (
                            <div key={vIdx} style={{ 
                              padding: '10px 12px', 
                              background: 'rgba(var(--color-text-primary-rgb), 0.02)',
                              border: '1px solid var(--color-border-divider)',
                              borderRadius: '4px'
                            }}>
                              <div className="d-flex justify-content-between align-items-start">
                                <div className="d-flex align-items-center gap-2">
                                  <i className="bi bi-box" style={{ fontSize: '12px', color: 'var(--color-brand-blue)' }}></i>
                                  <div className="d-flex flex-column">
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-brand-blue)' }}>
                                      {violation.product_nome}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                                      {format(parseISO(violation.movement_date), 'dd MMM yyyy')}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="text-end">
                                  <div className="d-flex align-items-baseline justify-content-end gap-1">
                                    <span style={{ color: 'var(--negative-color)', fontWeight: 800, fontSize: '16px' }}>
                                      {violation.consumo_acumulado_momento}
                                    </span>
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600 }}>
                                      / {violation.quantidade_limite}
                                    </span>
                                  </div>
                                  <div className="d-flex flex-column align-items-end">
                                    <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                      Withdrawn / Limit
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 opacity-50">
                    <i className="bi bi-shield-check fs-2 mb-2"></i>
                    <span className="small fw-bold">No violations found</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row: Financial Impact (Full Width) */}
          <div className="d-flex flex-column" style={{ flex: '1 1 50%', minHeight: 0 }}>
            <div style={{ ...flatCardStyle, flex: 1, display: 'flex', flexDirection: 'column', borderBottom: 'none', height: '100%' }}>
              <div className="d-flex justify-content-between align-items-center mb-3 pe-4">
                  <h4 style={chartTitleStyle}>
                    Monthly Financial Impact Analysis
                  </h4>
                  <div className="d-flex gap-4">
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--negative-color)' }} />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Excess Withdrawal Cost</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-brand-blue)' }} />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Normal Withdrawal Cost</span>
                    </div>
                  </div>
              </div>
              <div style={{ flex: 1, padding: '0 24px', minHeight: '230px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ height: '230px', width: '100%', minWidth: '100px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financialImpactData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-divider)" opacity="0.3" />
                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600 }} />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600 }}
                          tickFormatter={(value) => `$${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                        />
                        <Tooltip cursor={{ fill: 'rgba(var(--color-text-primary-rgb), 0.05)' }} content={<InventoryTooltip />} />
                        <Bar 
                          dataKey="normalCost" 
                          name="Normal Withdrawal Cost" 
                          stackId="a" 
                          fill="var(--color-brand-blue)" 
                          radius={[0, 0, 0, 0]}
                          animationDuration={1500}
                        />
                        <Bar 
                          dataKey="excessCost" 
                          name="Excess Withdrawal Cost" 
                          stackId="a" 
                          fill="var(--negative-color)" 
                          radius={[4, 4, 0, 0]}
                          animationDuration={1500}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-premium-table {
          background: transparent !important;
          color: var(--color-text-primary) !important;
          border-color: var(--color-border-divider) !important;
        }
        .custom-premium-table thead tr {
          background: rgba(var(--color-text-primary-rgb), 0.05) !important;
          border-bottom: 1px solid var(--color-border-divider) !important;
        }
        .custom-premium-table thead th {
          background: transparent !important;
          color: var(--color-text-primary) !important;
          padding: 12px 16px !important;
        }
        .custom-premium-table td {
          color: var(--color-text-primary) !important;
          background: transparent !important;
          background-color: transparent !important;
          border-bottom: 1px solid var(--color-border-divider) !important;
        }
        .custom-premium-table tbody tr {
          background: transparent !important;
          background-color: transparent !important;
        }
        .custom-premium-table tbody tr:hover {
          background: rgba(var(--color-text-primary-rgb), 0.02) !important;
          transform: scale(1.002);
        }
        .tracking-widest {
          letter-spacing: 0.15em;
        }
        .fw-black {
          font-weight: 900;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(var(--color-text-primary-rgb), 0.1);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--color-text-primary-rgb), 0.2);
        }
      `}</style>
    </div>
  );
};
