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
import type { TakeoffRow } from '../../../types/takeoff';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Tooltip customizado para o gráfico Takeoff
interface TakeoffTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: TakeoffRow[];
}

const TakeoffTooltipExternal = React.memo(function TakeoffTooltipExternal({ tooltip, chartLabels, year, month, canvas, data }: TakeoffTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;
  let entregues = 0;
  let pendentes = 0;

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

  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [periodo, entregues, pendentes]);

  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  const label = chartLabels[dataIndex];

  // Determinar o período exibido
  if (year && month) {
    const dia = label.padStart(2, '0');
    periodo = dayjs(`${year}-${month}-${dia}`).format('DD/MM/YYYY');
    // Filtrar projetos daquele dia
    const rows = data.filter(row => row.data_solicitacao && row.data_solicitacao.startsWith(`${year}-${month}-${dia}`));
    entregues = rows.filter(row => row.data_solicitacao && row.entrega_real).length;
    pendentes = rows.filter(row => row.data_solicitacao && !row.entrega_real).length;
  } else if (year) {
    const mes = label.padStart(2, '0');
    periodo = dayjs(`${year}-${mes}-01`).format('MM/YYYY');
    const rows = data.filter(row => row.data_solicitacao && row.data_solicitacao.startsWith(`${year}-${mes}`));
    entregues = rows.filter(row => row.data_solicitacao && row.entrega_real).length;
    pendentes = rows.filter(row => row.data_solicitacao && !row.entrega_real).length;
  } else {
    // label no formato MM/YYYY
    if (label.includes('/')) {
      const [mes, ano] = label.split('/');
      periodo = dayjs(`${ano}-${mes}-01`).format('MM/YYYY');
      const rows = data.filter(row => row.data_solicitacao && row.data_solicitacao.startsWith(`${ano}-${mes}`));
      entregues = rows.filter(row => row.data_solicitacao && row.entrega_real).length;
      pendentes = rows.filter(row => row.data_solicitacao && !row.entrega_real).length;
    } else {
      periodo = label;
      const rows = data.filter(row => row.data_solicitacao && row.data_solicitacao.startsWith(label));
      entregues = rows.filter(row => row.data_solicitacao && row.entrega_real).length;
      pendentes = rows.filter(row => row.data_solicitacao && !row.entrega_real).length;
    }
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

  const total = entregues + pendentes;

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
          <span style={{ color: 'var(--color-text-secondary)' }}>Total de Projetos</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{total}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Entregues</span>
          <span style={{ color: '#1bbf5c', fontWeight: 500 }}>{entregues}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Pendentes</span>
          <span style={{ color: '#dc3545', fontWeight: 500 }}>{pendentes}</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

interface TakeoffChartProps {
  filteredData: TakeoffRow[];
  selectedYear: string;
  selectedMonth: string;
}

// Definir tipo local para datasets que aceitam null
type DatasetWithNulls = {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
};

export function PermitChart({ filteredData, selectedYear, selectedMonth }: TakeoffChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<TakeoffTooltipExternalProps>>(null);

  // Para Takeoff: entregue = data_solicitacao && entrega_real; pendente = data_solicitacao && !entrega_real
  const isEntregue = (row: TakeoffRow) => row.data_solicitacao && row.entrega_real;
  const isPendente = (row: TakeoffRow) => row.data_solicitacao && !row.entrega_real;

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
    let datasets: DatasetWithNulls[] = [];

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado
      const countByDay: Record<string, { entregues: number; pendentes: number }> = {};
      const daysInMonth = dayjs(`${selectedYear}-${selectedMonth}`).daysInMonth();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day.toString().padStart(2, '0');
        countByDay[dayStr] = { entregues: 0, pendentes: 0 };
      }
      filteredData.forEach(row => {
        if (row.data_solicitacao && row.data_solicitacao.split('-')[1] === selectedMonth && row.data_solicitacao.split('-')[0] === selectedYear) {
          const dia = row.data_solicitacao.split('-')[2];
          if (isEntregue(row)) countByDay[dia].entregues++;
          else if (isPendente(row)) countByDay[dia].pendentes++;
        }
      });
      // Sempre mostrar todos os dias do mês
      chartLabels = Object.keys(countByDay).sort((a, b) => Number(a) - Number(b));
      const entreguesData: (number | null)[] = chartLabels.map(dia => countByDay[dia].entregues > 0 ? countByDay[dia].entregues : null);
      const pendentesData: (number | null)[] = chartLabels.map(dia => countByDay[dia].pendentes > 0 ? countByDay[dia].pendentes : null);
      datasets = [];
      if (entreguesData.length > 0 && entreguesData.some(v => v !== null)) {
        datasets.push({ label: 'Entregues', data: entreguesData, borderColor: '#1bbf5c', backgroundColor: '#1bbf5c' });
      }
      if (pendentesData.length > 0 && pendentesData.some(v => v !== null)) {
        datasets.push({ label: 'Pendentes', data: pendentesData, borderColor: '#dc3545', backgroundColor: '#dc3545' });
      }
    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado
      const countByMonth: Record<string, { entregues: number; pendentes: number }> = {};
      for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        countByMonth[monthStr] = { entregues: 0, pendentes: 0 };
      }
      filteredData.forEach(row => {
        if (row.data_solicitacao && row.data_solicitacao.split('-')[0] === selectedYear) {
          const mes = row.data_solicitacao.split('-')[1];
          if (isEntregue(row)) countByMonth[mes].entregues++;
          else if (isPendente(row)) countByMonth[mes].pendentes++;
        }
      });
      // Sempre mostrar todos os meses do ano
      chartLabels = Object.keys(countByMonth).sort((a, b) => Number(a) - Number(b));
      const entreguesData: (number | null)[] = chartLabels.map(mes => countByMonth[mes].entregues > 0 ? countByMonth[mes].entregues : null);
      const pendentesData: (number | null)[] = chartLabels.map(mes => countByMonth[mes].pendentes > 0 ? countByMonth[mes].pendentes : null);
      datasets = [];
      if (entreguesData.length > 0 && entreguesData.some(v => v !== null)) {
        datasets.push({ label: 'Entregues', data: entreguesData, borderColor: '#1bbf5c', backgroundColor: '#1bbf5c' });
      }
      if (pendentesData.length > 0 && pendentesData.some(v => v !== null)) {
        datasets.push({ label: 'Pendentes', data: pendentesData, borderColor: '#dc3545', backgroundColor: '#dc3545' });
      }
    } else {
      // Gráfico mês/ano quando não há filtro de ano
      const countByMonthYear: Record<string, { entregues: number; pendentes: number }> = {};
      // Descobrir o range de meses/anos presentes nos dados filtrados
      let minYear = 9999, maxYear = 0, minMonth = 1, maxMonth = 12;
      filteredData.forEach(row => {
        if (row.data_solicitacao) {
          const [ano, mes] = [row.data_solicitacao.split('-')[0], row.data_solicitacao.split('-')[1]];
          const yearNum = Number(ano);
          const monthNum = Number(mes);
          if (yearNum < minYear) minYear = yearNum;
          if (yearNum > maxYear) maxYear = yearNum;
          if (monthNum < minMonth) minMonth = monthNum;
          if (monthNum > maxMonth) maxMonth = monthNum;
        }
      });
      // Se não houver dados, não renderiza nada
      if (minYear === 9999) {
        chartLabels = [];
        datasets = [];
      } else {
        // Montar todos os meses/anos do range
        const allMonthYears: string[] = [];
        for (let ano = minYear; ano <= maxYear; ano++) {
          for (let mes = 1; mes <= 12; mes++) {
            allMonthYears.push(`${mes.toString().padStart(2, '0')}/${ano}`);
          }
        }
        allMonthYears.forEach(key => {
          if (!countByMonthYear[key]) countByMonthYear[key] = { entregues: 0, pendentes: 0 };
        });
        filteredData.forEach(row => {
          if (row.data_solicitacao) {
            const ano = row.data_solicitacao.split('-')[0];
            const mes = row.data_solicitacao.split('-')[1];
            const key = `${mes}/${ano}`;
            if (!countByMonthYear[key]) countByMonthYear[key] = { entregues: 0, pendentes: 0 };
            if (isEntregue(row)) countByMonthYear[key].entregues++;
            else if (isPendente(row)) countByMonthYear[key].pendentes++;
          }
        });
        chartLabels = allMonthYears;
        const entreguesData: (number | null)[] = chartLabels.map(key => countByMonthYear[key].entregues > 0 ? countByMonthYear[key].entregues : null);
        const pendentesData: (number | null)[] = chartLabels.map(key => countByMonthYear[key].pendentes > 0 ? countByMonthYear[key].pendentes : null);
        datasets = [];
        if (entreguesData.length > 0 && entreguesData.some(v => v !== null)) {
          datasets.push({ label: 'Entregues', data: entreguesData, borderColor: '#1bbf5c', backgroundColor: '#1bbf5c' });
        }
        if (pendentesData.length > 0 && pendentesData.some(v => v !== null)) {
          datasets.push({ label: 'Pendentes', data: pendentesData, borderColor: '#dc3545', backgroundColor: '#dc3545' });
        }
      }
    }

    const borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';

    const chartData = {
      labels: chartLabels,
      datasets: (datasets as DatasetWithNulls[]).map(dataset => ({
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
                data: filteredData as TakeoffRow[],
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
            text: 'Projetos',
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
  }, [filteredData, selectedYear, selectedMonth]);



  return (
    <>
      <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
        Status dos Projetos ao Longo do Tempo
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
        <TakeoffTooltipExternal
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