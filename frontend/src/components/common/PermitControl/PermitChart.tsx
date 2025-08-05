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
  ArcElement,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';
import dayjs from 'dayjs';
import { createPortal } from 'react-dom';
import type { PermitRow } from '../../../types/permit';
import { ChartTypeDropdown } from '../ChartTypeDropdown';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

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

  let caretX: number = 0;
  let caretY: number = 0;

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

    // Calcular contagens por situação e período
  const { situationCounts, periodo } = useMemo(() => {
    if (!opacity || !dataPoints || dataPoints.length === 0) {
      return { situationCounts: [], periodo: '' };
    }
    
    const currentDataIndex = dataPoints[0].dataIndex;
    const currentLabel = chartLabels[currentDataIndex];
    
    if (year && month) {
      const dia = currentLabel.padStart(2, '0');
      const rows = data.filter(row => {
        const relevantDate = getRelevantDate(row);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[2] === dia;
      });
      
      const situations = ['Not Applied', 'Applied', 'Issued'];
      const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
      
      return {
        situationCounts: situations.map((situation, index) => ({
          situation,
          count: rows.filter(d => d.situacao === situation).length,
          color: colors[index]
        })),
        periodo: dayjs(`${year}-${month}-${dia}`).format('DD/MM/YYYY')
      };
    } else if (year) {
      const mes = currentLabel.padStart(2, '0');
      const rows = data.filter(row => {
        const relevantDate = getRelevantDate(row);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[1] === mes;
      });
      
      const situations = ['Not Applied', 'Applied', 'Issued'];
      const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
      
      return {
        situationCounts: situations.map((situation, index) => ({
          situation,
          count: rows.filter(d => d.situacao === situation).length,
          color: colors[index]
        })),
        periodo: dayjs(`${year}-${mes}-01`).format('MM/YYYY')
      };
    } else {
      // Quando não há filtro de ano, o label vem no formato "MM/YYYY"
      if (currentLabel.includes('/')) {
        const [mes, ano] = currentLabel.split('/');
        const rows = data.filter(row => {
          const relevantDate = getRelevantDate(row);
          return relevantDate && typeof relevantDate === 'string' && 
                 relevantDate.split('-')[0] === ano && 
                 relevantDate.split('-')[1] === mes;
        });
        
        const situations = ['Not Applied', 'Applied', 'Issued'];
        const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
        
        return {
          situationCounts: situations.map((situation, index) => ({
            situation,
            count: rows.filter(d => d.situacao === situation).length,
            color: colors[index]
          })),
          periodo: dayjs(`${ano}-${mes}-01`).format('MM/YYYY')
        };
      } else {
        // Fallback para formato antigo (apenas ano)
        const ano = currentLabel;
        const rows = data.filter(row => {
          const relevantDate = getRelevantDate(row);
          return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[0] === ano;
        });
        
        const situations = ['Not Applied', 'Applied', 'Issued'];
        const colors = ['var(--negative-color)', 'var(--challenges-color)', 'var(--positive-color)'];
        
        return {
          situationCounts: situations.map((situation, index) => ({
            situation,
            count: rows.filter(d => d.situacao === situation).length,
            color: colors[index]
          })),
          periodo: ano
        };
      }
    }
  }, [year, month, data, getRelevantDate, opacity, dataPoints, chartLabels]);

  // Medir largura real do tooltip após renderizar
  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [periodo, situationCounts]);

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
  // Estado para tipo de gráfico
  const [chartType, setChartType] = useState<'line' | 'pie'>('line');

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

  // Preparar dados do gráfico de pizza
  const { pieChartData, pieChartOptions, statusAverages } = useMemo(() => {
    if (filteredData.length === 0) {
      return { pieChartData: null, pieChartOptions: null, statusAverages: {} };
    }

    // Calcular contagens por situação
    const situationCounts = {
      'Not Applied': 0,
      'Applied': 0,
      'Issued': 0
    };

    // Calcular dias de processamento por situação
    const situationDays = {
      'Not Applied': [] as number[],
      'Applied': [] as number[],
      'Issued': [] as number[]
    };

    const currentDate = new Date();

    filteredData.forEach(row => {
      if (row.situacao in situationCounts) {
        situationCounts[row.situacao as keyof typeof situationCounts]++;
      }
      
      // Calcular dias de processamento baseado na situação
      let days = 0;
      
      if (row.situacao === 'Issued') {
        // Issued: data_emissao - data_aplicacao
        if (row.emissao && row.aplicacao) {
          const emissaoDate = new Date(row.emissao);
          const aplicacaoDate = new Date(row.aplicacao);
          days = Math.ceil((emissaoDate.getTime() - aplicacaoDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else if (row.situacao === 'Applied') {
        // Applied: data_atual - data_aplicacao
        if (row.aplicacao) {
          const aplicacaoDate = new Date(row.aplicacao);
          days = Math.ceil((currentDate.getTime() - aplicacaoDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else {
        // Not Applied: data_atual - data_solicitacao
        if (row.solicitacao) {
          const solicitacaoDate = new Date(row.solicitacao);
          days = Math.ceil((currentDate.getTime() - solicitacaoDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      
      if (days > 0) {
        situationDays[row.situacao as keyof typeof situationDays].push(days);
      }
    });

    // Calcular médias de dias por situação
    const statusAverages: Record<string, number> = {};
    Object.keys(situationDays).forEach(situation => {
      const days = situationDays[situation as keyof typeof situationDays];
      if (days.length > 0) {
        statusAverages[situation] = Math.round(days.reduce((sum, day) => sum + day, 0) / days.length);
      } else {
        statusAverages[situation] = 0;
      }
    });

    // Filtrar apenas situações com dados e baseado no filtro
    const situationsToShow = selectedSituation.length === 0 
      ? ['Not Applied', 'Applied', 'Issued'] 
      : selectedSituation;

    const labels = situationsToShow.filter(situation => situationCounts[situation as keyof typeof situationCounts] > 0);
    const data = labels.map(situation => situationCounts[situation as keyof typeof situationCounts]);
    const colors = labels.map(situation => {
      switch (situation) {
        case 'Not Applied': return '#dc3545';
        case 'Applied': return '#ffc107';
        case 'Issued': return '#1bbf5c';
        default: return '#6c757d';
      }
    });

    const pieChartData = {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 2,
      }]
    };

    const pieChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Desabilitar legenda padrão para usar a customizada
        },
        tooltip: {
          enabled: false
        }
      }
    };

    return { pieChartData, pieChartOptions, statusAverages };
  }, [filteredData, selectedSituation]);



  return (
    <>
      {/* Header com título */}
      <div className='px-4 py-2 d-flex justify-content-between align-items-center' style={{ borderBottom: '1px solid var(--color-border-divider)', height: 56 }}>
        <h4 className='m-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          Permit Status Over Time
        </h4>
        
        {/* Select para seleção do tipo de gráfico */}
        <div className="input-group" style={{ minWidth: 200, maxWidth: 200, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
            <i className={`bi ${chartType === 'line' ? 'bi-graph-up' : 'bi-pie-chart'}`} style={{ fontSize: 17 }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
            <ChartTypeDropdown 
              chartType={chartType}
              onChartTypeChange={setChartType}
            />
          </div>
        </div>
      </div>
      
      {chartType === 'line' ? (
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
      ) : (
        <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
          <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 0 }}>
            {/* Filtros - Lado esquerdo */}
            <div style={{ width: 340, minWidth: 260, maxWidth: 400, display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100%', padding: 10, borderRight: '1px solid var(--color-border-divider)' }}>
              {/* Título dos projetos */}
              <div style={{ marginBottom: 20 }}>
                <h5 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  Permits
                </h5>
              </div>

                             {/* Listagem dos projetos */}
               <div style={{ 
                 flex: 1, 
                 overflowY: 'auto',
                 borderRadius: 8,
                 padding: '8px 12px'
               }} className="custom-scrollbar">
                 {filteredData.length > 0 ? (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                     {(() => {
                       // Agrupar permits por situação
                       const groupedPermits: Record<string, PermitRow[]> = {
                         'Issued': [],
                         'Applied': [],
                         'Not Applied': []
                       };
                       
                       // Organizar permits por situação
                       filteredData.forEach(permit => {
                         if (permit.situacao in groupedPermits) {
                           groupedPermits[permit.situacao].push(permit);
                         }
                       });
                       
                       // Ordem das situações para exibição
                       const situationOrder = ['Issued', 'Applied', 'Not Applied'];
                       
                       return situationOrder.map(situation => {
                         const permits = groupedPermits[situation];
                         if (permits.length === 0) return null;
                         
                         const statusColor = (() => {
                           switch (situation) {
                             case 'Not Applied': return '#dc3545';
                             case 'Applied': return '#ffc107';
                             case 'Issued': return '#1bbf5c';
                             default: return '#6c757d';
                           }
                         })();
                         
                         return (
                           <div key={situation}>
                             {/* Header do grupo */}
                             <div style={{ 
                               display: 'flex', 
                               alignItems: 'center', 
                               gap: 8,
                               padding: '8px 0',
                               borderBottom: '1px solid var(--color-border-divider)',
                               marginBottom: 4
                             }}>
                               <span style={{ 
                                 display: 'inline-block', 
                                 width: 12, 
                                 height: 12, 
                                 borderRadius: 6, 
                                 background: statusColor,
                                 flexShrink: 0
                               }} />
                               <span style={{ 
                                 color: 'var(--color-text-primary)', 
                                 fontSize: 14,
                                 fontWeight: 600,
                                 textTransform: 'uppercase'
                               }}>
                                 {situation} ({permits.length})
                               </span>
                             </div>
                             
                             {/* Permits do grupo */}
                             {permits.map((permit, index) => (
                               <div 
                                 key={`${situation}-${index}`}
                                 style={{ 
                                   display: 'flex', 
                                   alignItems: 'center', 
                                   gap: 8,
                                   padding: '4px 0 4px 18px',
                                   borderBottom: index < permits.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                                 }}
                               >
                                 <span style={{ 
                                   display: 'inline-block', 
                                   width: 8, 
                                   height: 8, 
                                   borderRadius: 4, 
                                   background: statusColor,
                                   opacity: 0.7,
                                   flexShrink: 0
                                 }} />
                                 <span style={{ 
                                   color: 'var(--color-text-primary)', 
                                   fontSize: 13,
                                   lineHeight: 1.3,
                                   overflow: 'hidden',
                                   textOverflow: 'ellipsis',
                                   whiteSpace: 'nowrap'
                                 }}>
                                   {permit.jobsite && permit.lot_address 
                                     ? `${permit.jobsite} - ${permit.lot_address}`
                                     : permit.jobsite || permit.lot_address || `Permit ${index + 1}`
                                   }
                                 </span>
                               </div>
                             ))}
                           </div>
                         );
                       });
                     })()}
                   </div>
                 ) : (
                   <div style={{ 
                     color: 'var(--color-text-secondary)', 
                     fontSize: 12, 
                     fontStyle: 'italic',
                     textAlign: 'center',
                     padding: '12px 0'
                   }}>
                     No permits found for selected filters
                   </div>
                 )}
               </div>
            </div>

            {/* Gráfico centralizado e legenda à direita */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0 }}>
              {pieChartData && pieChartOptions ? (
                <>
                  <div style={{ width: '100%', maxWidth: 500, minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ height: 350, width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ height: '75%', width: 'auto', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Pie 
                          data={pieChartData} 
                          options={{ 
                            ...pieChartOptions, 
                            maintainAspectRatio: false,
                            plugins: {
                              ...pieChartOptions.plugins,
                              tooltip: {
                                enabled: false
                              }
                            }
                          }} 
                          height={0} 
                          width={0} 
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ width: 400, maxHeight: 350, display: 'flex', flexDirection: 'column' }}>
                    {/* Título fixo da legenda */}
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 10, flex: '0 0 auto' }}>
                      Distribution
                    </div>
                    {/* Cabeçalho da tabela */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '10px 1fr 40px 70px',
                      gap: 8,
                      marginBottom: 6,
                      padding: '0 10px',
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      fontWeight: 500
                    }}>
                      <span></span> {/* Coluna da cor */}
                      <span>Status</span>
                      <span style={{ textAlign: 'right' }}>Count</span>
                      <span 
                        style={{ 
                          textAlign: 'right',
                          cursor: 'help',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          const tooltip = document.createElement('div');
                          tooltip.id = 'custom-tooltip';
                          tooltip.style.cssText = `
                            position: fixed;
                            left: ${e.clientX + 10}px;
                            top: ${e.clientY - 10}px;
                            background: var(--color-background-secondary);
                            color: var(--color-text-primary);
                            border: 1.5px solid var(--color-border-divider);
                            border-radius: 8px;
                            padding: 12px;
                            font-size: 12px;
                            max-width: 250px;
                            z-index: 10000;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                            pointer-events: none;
                          `;
                          tooltip.innerHTML = `
                            <div style="font-weight: 600; margin-bottom: 6px;">Average Processing Time</div>
                            <div style="line-height: 1.4;">
                              Shows the average number of days permits spend in each status.
                            </div>
                          `;
                          document.body.appendChild(tooltip);
                        }}
                        onMouseLeave={() => {
                          const tooltip = document.getElementById('custom-tooltip');
                          if (tooltip) {
                            tooltip.remove();
                          }
                        }}
                      >
                        Avg Days
                      </span>
                    </div>
                    {/* Legenda customizada com overflowY */}
                    <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                      {pieChartData?.labels && pieChartData.labels.length > 0 && (() => {
                        // Ordenar os status pelo valor (decrescente)
                        const legendItems = pieChartData.labels.map((label, idx) => ({
                          label: label,
                          value: pieChartData.datasets[0].data && pieChartData.datasets[0].data[idx] ? Number(pieChartData.datasets[0].data[idx]) : 0,
                          color: pieChartData.datasets[0].backgroundColor ? (Array.isArray(pieChartData.datasets[0].backgroundColor) ? pieChartData.datasets[0].backgroundColor[idx] : pieChartData.datasets[0].backgroundColor) : '#ccc',
                          averageDays: statusAverages[label] || 0,
                        }));
                        legendItems.sort((a, b) => b.value - a.value);

                        return (
                          <div style={{ padding: '0 10px' }}>
                            {legendItems.map((item) => (
                              <div 
                                key={item.label as string} 
                                style={{ 
                                  display: 'grid',
                                  gridTemplateColumns: '10px 1fr 40px 70px',
                                  gap: 8,
                                  alignItems: 'center',
                                  padding: '4px 0',
                                  borderBottom: '1px solid var(--color-border-divider)'
                                }}
                              >
                                <span style={{ 
                                  display: 'inline-block', 
                                  width: 10, 
                                  height: 10, 
                                  borderRadius: 5, 
                                  background: item.color,
                                  flexShrink: 0
                                }} />
                                <span style={{ 
                                  color: 'var(--color-text-secondary)', 
                                  fontSize: 13 
                                }}>
                                  {item.label}
                                </span>
                                <span style={{ 
                                  color: 'var(--color-text-primary)', 
                                  fontSize: 13, 
                                  textAlign: 'right' 
                                }}>
                                  {item.value ? item.value.toLocaleString() : ''}
                                </span>
                                <span 
                                  style={{ 
                                    color: 'var(--color-accent-primary)', 
                                    fontSize: 12, 
                                    fontWeight: 500, 
                                    textAlign: 'right',
                                    cursor: 'help'
                                  }}
                                  onMouseEnter={(e) => {
                                    const tooltip = document.createElement('div');
                                    tooltip.id = 'custom-tooltip';
                                    tooltip.style.cssText = `
                                      position: fixed;
                                      left: ${e.clientX + 10}px;
                                      top: ${e.clientY - 10}px;
                                      background: var(--color-background-secondary);
                                      color: var(--color-text-primary);
                                      border: 1.5px solid var(--color-border-divider);
                                      border-radius: 8px;
                                      padding: 12px;
                                      font-size: 12px;
                                      max-width: 250px;
                                      z-index: 10000;
                                      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                                      pointer-events: none;
                                    `;
                                    const explanation = item.label === 'Issued' 
                                      ? 'Time from application to issuance.' 
                                      : item.label === 'Applied' 
                                      ? 'Time from application to current date.' 
                                      : 'Time from request to current date.';
                                    tooltip.innerHTML = `
                                      <div style="font-weight: 600; margin-bottom: 6px;">${item.label} - ${item.averageDays} days</div>
                                      <div style="line-height: 1.4;">
                                        ${explanation}
                                      </div>
                                    `;
                                    document.body.appendChild(tooltip);
                                  }}
                                  onMouseLeave={() => {
                                    const tooltip = document.getElementById('custom-tooltip');
                                    if (tooltip) {
                                      tooltip.remove();
                                    }
                                  }}
                                >
                                  {item.averageDays > 0 ? item.averageDays : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                  fontSize: 16,
                  fontStyle: 'italic'
                }}>
                  {filteredData.length === 0 ? 'Nenhum dado encontrado para os filtros selecionados' : 'Carregando gráfico...'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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