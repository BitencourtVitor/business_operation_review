import React, { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
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
import type { TooltipModel, Chart as ChartJSInstance } from 'chart.js';
import { RECEIVABLES_COLOR, PAYABLES_COLOR } from '../../../utils/accountingColors';
import { useProjectChartData } from '../../../hooks/useProjectChartData';
import ProjectChartTooltipExternal from '../../tooltips/ProjectChartTooltipExternal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface ProjectChartProps {
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivable' | 'payable';
}

const ProjectChart: React.FC<ProjectChartProps> = ({ selectedYear, selectedMonth, selectedGroup }) => {
  const chartRef = useRef<ChartJSInstance<'line'> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipModel<'line'> | null>(null);
  
  // Usar o hook otimizado que chama a função SQL
  const { data: chartDataFromSQL, loading } = useProjectChartData({
    selectedYear,
    selectedMonth,
    selectedGroup
  });

  const { chartData, chartOptions, hasData } = useMemo(() => {
    if (loading) return { chartData: null, chartOptions: null, hasData: false };
    
    if (!chartDataFromSQL || chartDataFromSQL.length === 0) {
      return { chartData: null, chartOptions: null, hasData: false };
    }

    // Extrair labels e valores dos dados SQL
    const labels = chartDataFromSQL.map(row => row.period_label);
    const receivableValues = chartDataFromSQL.map(row => row.receivable_amount);
    const payableValues = chartDataFromSQL.map(row => row.payable_amount);
    const pendingReceivableValues = chartDataFromSQL.map(row => row.pending_receivable_amount);
    const pendingPayableValues = chartDataFromSQL.map(row => row.pending_payable_amount);

    // Filtrar períodos onde todos os valores são zero
    const filtered = labels.map((label, idx) => {
      return {
        label,
        receivable: receivableValues[idx],
        payable: payableValues[idx],
        pendingReceivable: pendingReceivableValues[idx],
        pendingPayable: pendingPayableValues[idx],
      };
    }).filter(row => {
      if (selectedGroup === 'all') {
        return row.receivable > 0 || row.payable > 0 || row.pendingReceivable > 0 || row.pendingPayable > 0;
      } else if (selectedGroup === 'receivable') {
        return row.receivable > 0 || row.pendingReceivable > 0;
      } else {
        return row.payable > 0 || row.pendingPayable > 0;
      }
    });

    const filteredLabels = filtered.map(row => row.label);
    const filteredReceivableValues = filtered.map(row => row.receivable);
    const filteredPayableValues = filtered.map(row => row.payable);
    const filteredPendingReceivableValues = filtered.map(row => row.pendingReceivable);
    const filteredPendingPayableValues = filtered.map(row => row.pendingPayable);

    // Determinar período para título do gráfico
    let period: 'year' | 'month' | 'day' = 'month';
    if (selectedYear && selectedMonth) period = 'day';
    else if (selectedYear) period = 'month';
    else period = 'month';

    const datasets = [];
    if (selectedGroup === 'all') {
      datasets.push({
        label: 'Receivable',
        data: filteredReceivableValues,
        borderColor: RECEIVABLES_COLOR as string,
        backgroundColor: RECEIVABLES_COLOR as string,
        pointBackgroundColor: RECEIVABLES_COLOR as string,
        pointBorderColor: RECEIVABLES_COLOR as string,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: 'Payable',
        data: filteredPayableValues,
        borderColor: PAYABLES_COLOR as string,
        backgroundColor: PAYABLES_COLOR as string,
        pointBackgroundColor: PAYABLES_COLOR as string,
        pointBorderColor: PAYABLES_COLOR as string,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: 'Outstanding Receivable',
        data: filteredPendingReceivableValues,
        borderColor: 'rgba(76, 175, 80, 0.7)',
        backgroundColor: 'rgba(76, 175, 80, 0.18)',
        borderDash: [8, 6],
        pointRadius: 4,
        pointBackgroundColor: 'rgba(76, 175, 80, 0.7)',
        pointBorderColor: 'rgba(76, 175, 80, 0.7)',
        pointHoverRadius: 6,
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: 'Outstanding Payable',
        data: filteredPendingPayableValues,
        borderColor: 'rgba(211, 47, 47, 0.7)',
        backgroundColor: 'rgba(211, 47, 47, 0.18)',
        borderDash: [8, 6],
        pointRadius: 4,
        pointBackgroundColor: 'rgba(211, 47, 47, 0.7)',
        pointBorderColor: 'rgba(211, 47, 47, 0.7)',
        pointHoverRadius: 6,
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      });
    } else if (selectedGroup === 'receivable') {
      datasets.push({
        label: 'Receivable',
        data: filteredReceivableValues,
        borderColor: RECEIVABLES_COLOR as string,
        backgroundColor: RECEIVABLES_COLOR as string,
        pointBackgroundColor: RECEIVABLES_COLOR as string,
        pointBorderColor: RECEIVABLES_COLOR as string,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: 'Outstanding Receivable',
        data: filteredPendingReceivableValues,
        borderColor: 'rgba(76, 175, 80, 0.18)',
        backgroundColor: 'rgba(76, 175, 80, 0.06)',
        borderDash: [8, 6],
        pointRadius: 0,
        pointBackgroundColor: 'rgba(76, 175, 80, 0.18)',
        pointBorderColor: 'rgba(76, 175, 80, 0.18)',
        pointHoverRadius: 0,
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      });
    } else {
      datasets.push({
        label: 'Payable',
        data: filteredPayableValues,
        borderColor: PAYABLES_COLOR as string,
        backgroundColor: PAYABLES_COLOR as string,
        pointBackgroundColor: PAYABLES_COLOR as string,
        pointBorderColor: PAYABLES_COLOR as string,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: 'Outstanding Payable',
        data: filteredPendingPayableValues,
        borderColor: 'rgba(211, 47, 47, 0.18)',
        backgroundColor: 'rgba(211, 47, 47, 0.06)',
        borderDash: [8, 6],
        pointRadius: 0,
        pointBackgroundColor: 'rgba(211, 47, 47, 0.18)',
        pointBorderColor: 'rgba(211, 47, 47, 0.18)',
        pointHoverRadius: 0,
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      });
    }

    const chartData = {
      labels: filteredLabels,
      datasets,
    };

    const isDark = document.documentElement.classList.contains('dark');
    const textSecondary = isDark ? '#adb5bd' : '#6c757d';
    const borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
    
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
          external: (context: { chart: ChartJSInstance<'line'>; tooltip: TooltipModel<'line'> }) => {
            if (!context.tooltip || context.tooltip.opacity === 0) {
              setTooltip(null);
              return;
            }
            setTooltip(context.tooltip);
          }
        },
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: { color: textSecondary },
          title: {
            display: true,
            text: period === 'day' ? 'Days' : 'Months',
            color: textSecondary,
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 }
          },
        },
        y: {
          grid: { color: borderDivider },
          ticks: {
            color: textSecondary,
            font: { size: 11 },
            padding: 8,
            callback: function(value: string | number) {
              if (typeof value === 'number') return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
              return value;
            },
          },
          beginAtZero: true,
          title: {
            display: true,
            text: 'Amount (USD)',
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

    const hasData = filteredLabels.length > 0 && datasets[0].data.some((v: number) => v > 0);
    return { chartData, chartOptions, hasData };
  }, [chartDataFromSQL, selectedYear, selectedMonth, selectedGroup, loading]);

  return (
    <div style={{ width: '100%', background: 'var(--color-background-primary)', borderRadius: 0, margin: 0, borderBottom: '1.5px solid var(--color-border-divider)', padding: 0 }}>
      <div className='d-flex justify-content-between align-items-center' style={{ padding: '16px 32px 0 32px', background: 'var(--color-background-primary)' }}>
        <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30, margin: 0 }}>Project Value Over Time</h4>
      </div>
      <div style={{ width: '100%', height: 340, minHeight: 220, maxHeight: 400, padding: '0 32px 24px 32px' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{
                width: 32,
                height: 32,
                border: '3px solid var(--color-border-divider)',
                borderTop: '3px solid var(--color-accent-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Carregando projetos...</span>
            </div>
          </div>
        ) : hasData && chartData && chartOptions ? (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>No data found for selected filters</span>
          </div>
        )}
        <ProjectChartTooltipExternal tooltip={tooltip} chartLabels={chartData?.labels || []} chartDatasets={chartData?.datasets || []} canvas={chartRef.current?.canvas || null} />
      </div>
    </div>
  );
};

export default ProjectChart; 