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
import type { TimesheetRow } from '../../../types/timesheet';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Tooltip customizado para o gráfico
interface TimesheetTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: TimesheetRow[];
  financialPass: boolean;
}

const TimesheetTooltipExternal = React.memo(function TimesheetTooltipExternal({ tooltip, chartLabels, chartDatasets, year, month, canvas, data, financialPass }: TimesheetTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let count: number = 0;
  let added: number = 0;
  let removed: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number }>;
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
  }, [periodo, count, added, removed]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  count = chartDatasets[0]?.data[dataIndex] || 0;
  const label = chartLabels[dataIndex];
  if (year && month) {
    const dia = label.padStart(2, '0');
    const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[2] === dia);
    added = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
    removed = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
    periodo = dayjs(`${year}-${month}-${dia}`).format('DD/MM/YYYY');
  } else if (year) {
    const mes = label.padStart(2, '0');
    const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[1] === mes);
    added = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
    removed = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
    periodo = dayjs(`${year}-${mes}-01`).format('MM/YYYY');
  } else {
    const ano = label;
    const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[0] === ano);
    added = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
    removed = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
    periodo = ano;
  }
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 120;
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
          <span style={{ color: 'var(--color-text-secondary)' }}>Contagem de Erros</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{count}</span>
        </div>
        {financialPass && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Valor Adicionado</span>
            <span style={{ color: '#1bbf5c', fontWeight: 500 }}>{added.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          </div>
        )}
        {financialPass && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Valor Removido</span>
            <span style={{ color: '#dc3545', fontWeight: 500 }}>{removed.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

interface TimesheetChartProps {
  filteredData: TimesheetRow[];
  selectedYear: string;
  selectedMonth: string;
  financialPass: boolean;
}

export function TimesheetChart({ filteredData, selectedYear, selectedMonth, financialPass }: TimesheetChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<TimesheetTooltipExternalProps>>(null);

  // Preparar dados do gráfico
  const { chartData, chartOptions } = useMemo(() => {
    if (filteredData.length === 0) {
      return { chartData: null, chartOptions: null };
    }

    // Lógica dinâmica para labels
    let chartLabels: string[] = [];
    let chartValues: number[] = [];

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado
      const errorCountByDay: Record<string, number> = {};
      filteredData.forEach(row => {
        if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length === 3) {
          const dia = row.date.split('-')[2];
          errorCountByDay[dia] = (errorCountByDay[dia] || 0) + 1;
        }
      });
      chartLabels = Object.keys(errorCountByDay).sort((a, b) => Number(a) - Number(b));
      chartValues = chartLabels.map(dia => errorCountByDay[dia]);
    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado
      const errorCountByMonth: Record<string, number> = {};
      filteredData.forEach(row => {
        if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length >= 2) {
          const mes = row.date.split('-')[1];
          errorCountByMonth[mes] = (errorCountByMonth[mes] || 0) + 1;
        }
      });
      chartLabels = Object.keys(errorCountByMonth).sort((a, b) => Number(a) - Number(b));
      chartValues = chartLabels.map(mes => errorCountByMonth[mes]);
    } else {
      // Gráfico ano a ano
      const errorCountByYear: Record<string, number> = {};
      filteredData.forEach(row => {
        if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length >= 1) {
          const ano = row.date.split('-')[0];
          errorCountByYear[ano] = (errorCountByYear[ano] || 0) + 1;
        }
      });
      chartLabels = Object.keys(errorCountByYear).sort((a, b) => Number(a) - Number(b));
      chartValues = chartLabels.map(ano => errorCountByYear[ano]);
    }

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-primary').trim() || '#2E6BE6';
    const borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';

    const chartData = {
      labels: chartLabels,
      datasets: [
        {
          label: 'Contagem de Erros',
          data: chartValues,
          borderColor: accent,
          backgroundColor: accent,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false, position: 'top' as const },
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
                chartDatasets: chartData.datasets,
                year: selectedYear,
                month: selectedMonth,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas: HTMLCanvasElement }).canvas : undefined,
                data: filteredData as TimesheetRow[],
                financialPass,
              });
            }
          }
        },
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: { color: '#6c757d' },
          title: {
            display: true,
            text: selectedYear && selectedMonth ? 'Days of Month' : selectedYear ? 'Months' : 'Years',
            color: '#6c757d',
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 }
          },
        },
        y: {
          grid: { color: borderDivider },
          ticks: { color: '#6c757d' },
          beginAtZero: true,
          title: {
            display: true,
            text: 'Error Count',
            color: '#6c757d',
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
  }, [filteredData, selectedYear, selectedMonth]);

  return (
    <>
      <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
        Error Count Over Time
      </h4>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
        <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500 }}>
          {chartData && chartOptions ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Carregando gráfico...</span>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip externo */}
      {externalTooltip && (
        <TimesheetTooltipExternal
          {...externalTooltip}
          tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
          chartLabels={externalTooltip.chartLabels || []}
          chartDatasets={externalTooltip.chartDatasets || []}
          year={externalTooltip.year || ''}
          month={externalTooltip.month || ''}
          canvas={externalTooltip.canvas}
          data={externalTooltip.data || []}
          financialPass={financialPass}
        />
      )}
    </>
  );
} 