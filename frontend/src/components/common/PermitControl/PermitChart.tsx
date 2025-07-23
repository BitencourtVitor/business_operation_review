import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import dayjs from 'dayjs';
import { createPortal } from 'react-dom';
import type { PermitRow } from '../../../types/permit';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Tooltip customizado para o gráfico
interface PermitTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: PermitRow[];
}

const PermitTooltipExternal = React.memo(function PermitTooltipExternal({ tooltip, chartLabels, year, month, canvas, data }: PermitTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;
  let situationCounts: Array<{ situation: string; count: number; color: string }> = [];

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number; datasetIndex: number }>;
    caretX?: number;
    caretY?: number;
  };
  const opacity = safeTooltip.opacity;
  const dataPoints = safeTooltip.dataPoints;
  const caretXVal = safeTooltip.caretX;
  const caretYVal = safeTooltip.caretY;
  
  // Medir largura real do tooltip após renderizar
  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [periodo, situationCounts]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  const label = chartLabels[dataIndex];

  // Função para obter a data apropriada baseada na situação
  const getRelevantDate = (row: PermitRow): string | null => {
    if (row.situacao === 'Not Applied') {
      return row.solicitacao;
    } else if (row.situacao === 'Applied') {
      return row.aplicacao;
    } else if (row.situacao === 'Issued') {
      return row.emissao;
    }
    return null;
  };

  // Calcular contagens por situação
  if (year && month) {
    const dia = label.padStart(2, '0');
    const rows = data.filter(row => {
      const relevantDate = getRelevantDate(row);
      return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[2] === dia;
    });
    
    const situations = ['Not Applied', 'Applied', 'Issued'];
    const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
    
    situationCounts = situations.map((situation, index) => ({
      situation,
      count: rows.filter(d => d.situacao === situation).length,
      color: colors[index]
    }));
    
    periodo = dayjs(`${year}-${month}-${dia}`).format('DD/MM/YYYY');
  } else if (year) {
    const mes = label.padStart(2, '0');
    const rows = data.filter(row => {
      const relevantDate = getRelevantDate(row);
      return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[1] === mes;
    });
    
    const situations = ['Not Applied', 'Applied', 'Issued'];
    const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
    
    situationCounts = situations.map((situation, index) => ({
      situation,
      count: rows.filter(d => d.situacao === situation).length,
      color: colors[index]
    }));
    
    periodo = dayjs(`${year}-${mes}-01`).format('MM/YYYY');
  } else {
    // Quando não há filtro de ano, o label vem no formato "MM/YYYY"
    if (label.includes('/')) {
      const [mes, ano] = label.split('/');
      const rows = data.filter(row => {
        const relevantDate = getRelevantDate(row);
        return relevantDate && typeof relevantDate === 'string' && 
               relevantDate.split('-')[0] === ano && 
               relevantDate.split('-')[1] === mes;
      });
      
      const situations = ['Not Applied', 'Applied', 'Issued'];
      const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
      
      situationCounts = situations.map((situation, index) => ({
        situation,
        count: rows.filter(d => d.situacao === situation).length,
        color: colors[index]
      }));
      
      periodo = dayjs(`${ano}-${mes}-01`).format('MM/YYYY');
    } else {
      // Fallback para formato antigo (apenas ano)
      const ano = label;
      const rows = data.filter(row => {
        const relevantDate = getRelevantDate(row);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[0] === ano;
      });
      
      const situations = ['Not Applied', 'Applied', 'Issued'];
      const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
      
      situationCounts = situations.map((situation, index) => ({
        situation,
        count: rows.filter(d => d.situacao === situation).length,
        color: colors[index]
      }));
      
      periodo = ano;
    }
  }

  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 120 + (situationCounts.length > 0 ? situationCounts.length * 20 : 0);
  const padding = 12;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - realWidth - offsetX;
    }
    if (absTop < rect.top + padding) absTop = rect.top + padding;
    if (absTop + tooltipHeight > rect.bottom - padding) absTop = rect.bottom - tooltipHeight - padding;
  }

  const totalCount = situationCounts.reduce((sum, item) => sum + item.count, 0);

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: absLeft,
        top: absTop,
        transform: 'none',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: 16,
        minWidth: 220,
        maxWidth: 320,
        zIndex: 9999,
        opacity: 0.9,
        pointerEvents: 'none',
        fontSize: 14,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      {periodo && <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', marginBottom: 8, fontSize: 15 }}>{`Período: ${periodo}`}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Total de Permits</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{totalCount}</span>
        </div>
        {situationCounts.map((item, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{item.situation}</span>
            <span style={{ color: item.color, fontWeight: 500 }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
});

interface PermitChartProps {
  filteredData: PermitRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedSituation: string[];
}

export function PermitChart({ filteredData, selectedYear, selectedMonth, selectedSituation }: PermitChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<PermitTooltipExternalProps>>(null);

  // Função para obter a data apropriada baseada na situação
  const getRelevantDate = (row: PermitRow): string | null => {
    if (row.situacao === 'Not Applied') {
      return row.solicitacao;
    } else if (row.situacao === 'Applied') {
      return row.aplicacao;
    } else if (row.situacao === 'Issued') {
      return row.emissao;
    }
    return null;
  };

  // Preparar dados do gráfico
  const { chartData, chartOptions } = useMemo(() => {
    if (filteredData.length === 0) {
      return { chartData: null, chartOptions: null };
    }

    // Cores do tema (igual contabilidade)
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textSecondary = isDark ? '#adb5bd' : '#6c757d';

    // Lógica dinâmica para labels
    let chartLabels: string[] = [];
    let datasets: Array<{ label: string; data: (number | null)[]; borderColor: string; backgroundColor: string }> = [];

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado
      const permitCountByDay: Record<string, { notApplied: number; applied: number; issued: number }> = {};
      
      // Inicializar todos os dias do mês
      const daysInMonth = dayjs(`${selectedYear}-${selectedMonth}`).daysInMonth();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day.toString().padStart(2, '0');
        permitCountByDay[dayStr] = { notApplied: 0, applied: 0, issued: 0 };
      }

      filteredData.forEach(row => {
        const relevantDate = getRelevantDate(row);
        if (relevantDate && typeof relevantDate === 'string' && relevantDate.split('-').length === 3) {
          const dia = relevantDate.split('-')[2];
          if (permitCountByDay[dia]) {
            if (row.situacao === 'Not Applied') {
              permitCountByDay[dia].notApplied++;
            } else if (row.situacao === 'Applied') {
              permitCountByDay[dia].applied++;
            } else if (row.situacao === 'Issued') {
              permitCountByDay[dia].issued++;
            }
          }
        }
      });

      chartLabels = Object.keys(permitCountByDay).sort((a, b) => Number(a) - Number(b));
      
      // Definir quais situações mostrar baseado no filtro
      const situationsToShow = selectedSituation.length === 0 
        ? ['Not Applied', 'Applied', 'Issued'] 
        : selectedSituation;
      
      datasets = situationsToShow.map(situation => {
        let data: (number | null)[];
        let color: string;
        
        if (situation === 'Not Applied') {
          data = chartLabels.map(dia => permitCountByDay[dia].notApplied > 0 ? permitCountByDay[dia].notApplied : null);
          color = '#dc3545';
        } else if (situation === 'Applied') {
          data = chartLabels.map(dia => permitCountByDay[dia].applied > 0 ? permitCountByDay[dia].applied : null);
          color = '#ffc107';
        } else { // Issued
          data = chartLabels.map(dia => permitCountByDay[dia].issued > 0 ? permitCountByDay[dia].issued : null);
          color = '#1bbf5c';
        }
        
        return {
          label: situation,
          data: data,
          borderColor: color,
          backgroundColor: color,
        };
      });
    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado
      const permitCountByMonth: Record<string, { notApplied: number; applied: number; issued: number }> = {};
      
      // Inicializar todos os meses do ano
      for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        permitCountByMonth[monthStr] = { notApplied: 0, applied: 0, issued: 0 };
      }

      filteredData.forEach(row => {
        const relevantDate = getRelevantDate(row);
        if (relevantDate && typeof relevantDate === 'string' && relevantDate.split('-').length >= 2) {
          const mes = relevantDate.split('-')[1];
          if (permitCountByMonth[mes]) {
            if (row.situacao === 'Not Applied') {
              permitCountByMonth[mes].notApplied++;
            } else if (row.situacao === 'Applied') {
              permitCountByMonth[mes].applied++;
            } else if (row.situacao === 'Issued') {
              permitCountByMonth[mes].issued++;
            }
          }
        }
      });

      chartLabels = Object.keys(permitCountByMonth).sort((a, b) => Number(a) - Number(b));
      
      // Definir quais situações mostrar baseado no filtro
      const situationsToShow = selectedSituation.length === 0 
        ? ['Not Applied', 'Applied', 'Issued'] 
        : selectedSituation;
      
      datasets = situationsToShow.map(situation => {
        let data: (number | null)[];
        let color: string;
        
        if (situation === 'Not Applied') {
          data = chartLabels.map(mes => permitCountByMonth[mes].notApplied > 0 ? permitCountByMonth[mes].notApplied : null);
          color = '#dc3545';
        } else if (situation === 'Applied') {
          data = chartLabels.map(mes => permitCountByMonth[mes].applied > 0 ? permitCountByMonth[mes].applied : null);
          color = '#ffc107';
        } else { // Issued
          data = chartLabels.map(mes => permitCountByMonth[mes].issued > 0 ? permitCountByMonth[mes].issued : null);
          color = '#1bbf5c';
        }
        
        return {
          label: situation,
          data: data,
          borderColor: color,
          backgroundColor: color,
        };
      });
    } else {
      // Gráfico mês/ano quando não há filtro de ano
      const permitCountByMonthYear: Record<string, { notApplied: number; applied: number; issued: number }> = {};

      filteredData.forEach(row => {
        const relevantDate = getRelevantDate(row);
        if (relevantDate && typeof relevantDate === 'string' && relevantDate.split('-').length >= 2) {
          const ano = relevantDate.split('-')[0];
          const mes = relevantDate.split('-')[1];
          const monthYearKey = `${mes}/${ano}`;
          
          if (!permitCountByMonthYear[monthYearKey]) {
            permitCountByMonthYear[monthYearKey] = { notApplied: 0, applied: 0, issued: 0 };
          }
          if (row.situacao === 'Not Applied') {
            permitCountByMonthYear[monthYearKey].notApplied++;
          } else if (row.situacao === 'Applied') {
            permitCountByMonthYear[monthYearKey].applied++;
          } else if (row.situacao === 'Issued') {
            permitCountByMonthYear[monthYearKey].issued++;
          }
        }
      });

      chartLabels = Object.keys(permitCountByMonthYear).sort((a, b) => {
        const [mesA, anoA] = a.split('/');
        const [mesB, anoB] = b.split('/');
        const dateA = new Date(Number(anoA), Number(mesA) - 1);
        const dateB = new Date(Number(anoB), Number(mesB) - 1);
        return dateA.getTime() - dateB.getTime();
      });
      
      // Definir quais situações mostrar baseado no filtro
      const situationsToShow = selectedSituation.length === 0 
        ? ['Not Applied', 'Applied', 'Issued'] 
        : selectedSituation;
      
      datasets = situationsToShow.map(situation => {
        let data: (number | null)[];
        let color: string;
        
        if (situation === 'Not Applied') {
          data = chartLabels.map(monthYear => permitCountByMonthYear[monthYear].notApplied > 0 ? permitCountByMonthYear[monthYear].notApplied : null);
          color = '#dc3545';
        } else if (situation === 'Applied') {
          data = chartLabels.map(monthYear => permitCountByMonthYear[monthYear].applied > 0 ? permitCountByMonthYear[monthYear].applied : null);
          color = '#ffc107';
        } else { // Issued
          data = chartLabels.map(monthYear => permitCountByMonthYear[monthYear].issued > 0 ? permitCountByMonthYear[monthYear].issued : null);
          color = '#1bbf5c';
        }
        
        return {
          label: situation,
          data: data,
          borderColor: color,
          backgroundColor: color,
        };
      });
    }

    const borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';

    const chartData = {
      labels: chartLabels,
      datasets: datasets.map(dataset => ({
        ...dataset,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      })),
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: textSecondary,
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 12, weight: 500 }
          }
        },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setExternalTooltip(null);
              return;
            }
            if (chartData) {
              setExternalTooltip({
                tooltip: context.tooltip,
                chartLabels,
                year: selectedYear,
                month: selectedMonth,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas: HTMLCanvasElement }).canvas : undefined,
                data: filteredData as PermitRow[],
              });
            }
          }
        },
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: { color: textSecondary },
          title: {
            display: true,
            text: selectedYear && selectedMonth ? 'Days of Month' : selectedYear ? 'Months' : 'Months/Years',
            color: textSecondary,
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 }
          },
        },
        y: {
          grid: { color: borderDivider },
          ticks: {
            color: textSecondary,
            stepSize: 1,
            callback: function(value: string | number) {
              // Só mostra inteiros
              if (Number.isInteger(value)) return value;
              return '';
            },
            font: { size: 11 },
            padding: 8
          },
          beginAtZero: true,
          title: {
            display: true,
            text: 'Permit Count',
            color: textSecondary,
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 }
          },
        },
      },
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 10,
          right: 10
        }
      }
    };

    return { chartData, chartOptions };
  }, [filteredData, selectedYear, selectedMonth, selectedSituation]);



  return (
    <>
      <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
        Permit Status Over Time
      </h4>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
        <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500 }}>
          {chartData && chartOptions ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {filteredData.length === 0 ? 'Nenhum dado encontrado para os filtros selecionados' : 'Carregando gráfico...'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip externo */}
      {externalTooltip && (
        <PermitTooltipExternal
          {...externalTooltip}
          tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
          chartLabels={externalTooltip.chartLabels || []}
          year={externalTooltip.year || ''}
          month={externalTooltip.month || ''}
          canvas={externalTooltip.canvas}
          data={externalTooltip.data || []}
        />
      )}
    </>
  );
} 