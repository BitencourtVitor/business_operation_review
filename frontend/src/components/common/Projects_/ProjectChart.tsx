import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { createClient } from '@supabase/supabase-js';
import type { TooltipModel, Chart as ChartJSInstance } from 'chart.js';
import { RECEIVABLES_COLOR, PAYABLES_COLOR } from '../../../utils/accountingColors';
import ProjectChartTooltipExternal from '../../tooltips/ProjectChartTooltipExternal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface ProjectChartProps {
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivable' | 'payable';
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ProjectChart: React.FC<ProjectChartProps> = ({ selectedYear, selectedMonth, selectedGroup }) => {
  const [receivableData, setReceivableData] = useState<Array<{ txn_date: string; total_amount: number }>>([]);
  const [payableData, setPayableData] = useState<Array<{ txn_date: string; total_amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<ChartJSInstance<'line'> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipModel<'line'> | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [{ data: payments }, { data: billPayments }] = await Promise.all([
        supabase.from('hvac_payments').select('txn_date, total_amount'),
        supabase.from('hvac_bill_payments').select('txn_date, total_amount'),
      ]);
      setReceivableData(payments || []);
      setPayableData(billPayments || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  const { chartData, chartOptions, hasData } = useMemo(() => {
    if (loading) return { chartData: null, chartOptions: null, hasData: false };
    function groupByPeriod(data: Array<{ txn_date: string; total_amount: number }>, period: 'year' | 'month' | 'day') {
      const map = new Map<string, number>();
      data.forEach(row => {
        if (!row.txn_date || typeof row.total_amount !== 'number') return;
        const [year, month, day] = row.txn_date.split('-');
        let key = '';
        if (period === 'year') key = `${year}`;
        else if (period === 'month') key = `${month}/${year}`;
        else if (period === 'day') key = `${day}/${month}/${year}`;
        map.set(key, (map.get(key) || 0) + row.total_amount);
      });
      return map;
    }
    let period: 'year' | 'month' | 'day' = 'month';
    if (selectedYear && selectedMonth) period = 'day';
    else if (selectedYear) period = 'month';
    else period = 'month';
    const filterFn = (row: { txn_date: string }) => {
      if (!row.txn_date) return false;
      const [year, month] = row.txn_date.split('-');
      if (selectedYear && year !== selectedYear) return false;
      if (selectedMonth && month !== selectedMonth) return false;
      return true;
    };
    const filteredReceivable = receivableData.filter(filterFn);
    const filteredPayable = payableData.filter(filterFn);
    const receivableMap = groupByPeriod(filteredReceivable, period);
    const payableMap = groupByPeriod(filteredPayable, period);
    let labels: string[] = [];
    if (period === 'month') {
      labels = Array.from(new Set([
        ...Array.from(receivableMap.keys()),
        ...Array.from(payableMap.keys()),
      ])).sort((a, b) => {
        const [ma, ya] = a.split('/');
        const [mb, yb] = b.split('/');
        const da = new Date(Number(ya), Number(ma) - 1);
        const db = new Date(Number(yb), Number(mb) - 1);
        return da.getTime() - db.getTime();
      });
    } else {
      labels = Array.from(new Set([
        ...Array.from(receivableMap.keys()),
        ...Array.from(payableMap.keys()),
      ])).sort((a, b) => {
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        const dA = new Date(Number(ya), Number(ma) - 1, Number(da));
        const dB = new Date(Number(yb), Number(mb) - 1, Number(db));
        return dA.getTime() - dB.getTime();
      });
    }
    const receivableValues = labels.map(l => receivableMap.get(l) || 0);
    const payableValues = labels.map(l => payableMap.get(l) || 0);
    const datasets = [];
    if (selectedGroup === 'all') {
      datasets.push({
        label: 'Recebível',
        data: receivableValues,
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
        label: 'Pagável',
        data: payableValues,
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
    } else if (selectedGroup === 'receivable') {
      datasets.push({
        label: 'Recebível',
        data: receivableValues,
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
    } else {
      datasets.push({
        label: 'Pagável',
        data: payableValues,
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
    }
    const chartData = {
      labels,
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
    const hasData = labels.length > 0 && datasets[0].data.some((v: number) => v > 0);
    return { chartData, chartOptions, hasData };
  }, [receivableData, payableData, selectedYear, selectedMonth, loading, selectedGroup]);

  return (
    <div style={{ width: '100%', background: 'var(--color-background-primary)', borderRadius: 0, margin: 0, borderBottom: '1.5px solid var(--color-border-divider)', padding: 0 }}>
      <div className='d-flex justify-content-between align-items-center' style={{ padding: '16px 32px 0 32px', background: 'var(--color-background-primary)' }}>
        <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30, margin: 0 }}>Project Value Over Time</h4>
      </div>
      <div style={{ width: '100%', height: 340, minHeight: 220, maxHeight: 400, padding: '0 32px 24px 32px' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Carregando gráfico...</span>
          </div>
        ) : hasData && chartData && chartOptions ? (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Nenhum dado encontrado para os filtros selecionados</span>
          </div>
        )}
        <ProjectChartTooltipExternal tooltip={tooltip} chartLabels={chartData?.labels || []} chartDatasets={chartData?.datasets || []} canvas={chartRef.current?.canvas || null} />
      </div>
    </div>
  );
};

export default ProjectChart; 