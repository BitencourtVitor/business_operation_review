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
import ProjectChartTooltipExternal from '../../tooltips/ProjectChartTooltipExternal';
import { useAccountingDataCached } from '../../../hooks/useAccountingDataCached';
import { useProjectChartData } from '../../../hooks/useProjectChartData';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface ProjectChartProps {
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivable' | 'payable';
  onNavigateToAccounting?: () => void;
}

const ProjectChart: React.FC<ProjectChartProps> = ({ selectedYear, selectedMonth, selectedGroup, onNavigateToAccounting }) => {
  const chartRef = useRef<ChartJSInstance<'line'> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipModel<'line'> | null>(null);
  
  // CONSULTA 1: SQL para "What I Received" e "What I Paid" - ATIVADO
  const { data: chartDataFromSQL, loading: sqlLoading } = useProjectChartData({
    selectedYear,
    selectedMonth,
    selectedGroup
  });

  // CONSULTA 2: JavaScript para "Outstanding Receivable" e "Outstanding Payable" - ATIVADO
  const { data: accountingData, loading: accountingLoading } = useAccountingDataCached();

  // Loading geral
  const isLoading = accountingLoading || sqlLoading;

  // Calcular dados filtrados (EXATAMENTE como no AccountingIndicators)
  const filteredData = useMemo(() => {
    if (!accountingData) return [];
    
    let filtered = accountingData;
    
    if (selectedYear) {
      filtered = filtered.filter(d => {
        const hasDate = d.date && d.date.startsWith(selectedYear + '-');
        const hasDateField = d.date_field && d.date_field.startsWith(selectedYear + '-');
        return hasDate || hasDateField;
      });
    }
    
    if (selectedMonth) {
      filtered = filtered.filter(d => {
        const dateToUse = d.date || d.date_field;
        return dateToUse && String(Number(dateToUse.split('-')[1])).padStart(2, '0') === selectedMonth;
      });
    }
    
    if (selectedGroup !== 'all') {
      const groupFilter = selectedGroup === 'receivable' ? 'receivables' : 'payables';
      filtered = filtered.filter(d => d.type === groupFilter);
    }
    
    return filtered;
  }, [accountingData, selectedYear, selectedMonth, selectedGroup]);

  const { chartData, chartOptions, hasData } = useMemo(() => {
    if (isLoading) return { chartData: null, chartOptions: null, hasData: false };
    
    if (!filteredData || filteredData.length === 0) {
      return { chartData: null, chartOptions: null, hasData: false };
    }

    // Determinar período para agrupamento (igual ao AccountingChart)
    let period: 'year' | 'month' | 'day' = 'month';
    if (selectedYear && selectedMonth) period = 'day';
    else if (selectedYear) period = 'month';
    else period = 'month';

    // APLICAR EXATAMENTE A MESMA LÓGICA DO ACCOUNTINGCHART
    let chartLabels: string[] = [];
    let outstandingData = { pendingReceivableValues: [] as (number | null)[], pendingPayableValues: [] as (number | null)[] };

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado (igual ao AccountingChart)
      const receivablesByDay: Record<string, { value: number; date: string }> = {};
      const payablesByDay: Record<string, { value: number; date: string }> = {};
      
      // Receivables: para cada dia, pegar o open_balance mais recente de cada transação (inv_num)
      filteredData.filter(row => row.type === 'receivables' && !!row.date_field && row.date_field.split('-').length === 3 && row.open_balance > 0).forEach(row => {
        const dia = String(Number(row.date_field!.split('-')[2])).padStart(2, '0');
        const transaction = row.inv_num; // Código da transação
        const key = `${dia}-${transaction}`;
        const currentDate = row.date_field!;
        if (!receivablesByDay[key] || currentDate > receivablesByDay[key].date) {
          receivablesByDay[key] = { value: row.open_balance, date: currentDate };
        }
      });
      
      // Payables: para cada dia, pegar o open_balance mais recente de cada transação (bill_num)
      filteredData.filter(row => row.type === 'payables' && !!row.date_field && row.date_field.split('-').length === 3 && row.open_balance > 0).forEach(row => {
        const dia = String(Number(row.date_field!.split('-')[2])).padStart(2, '0');
        const transaction = row.bill_num; // Código da transação
        const key = `${dia}-${transaction}`;
        const currentDate = row.date_field!;
        if (!payablesByDay[key] || currentDate > payablesByDay[key].date) {
          payablesByDay[key] = { value: row.open_balance, date: currentDate };
        }
      });
      
      // Agrupar por dia - somar todas as transações distintas (usando os valores mais recentes)
      const receivablesSumByDay: Record<string, number> = {};
      Object.keys(receivablesByDay).forEach(key => {
        const dia = key.split('-')[0];
        receivablesSumByDay[dia] = (receivablesSumByDay[dia] || 0) + receivablesByDay[key].value;
      });
      
      const payablesSumByDay: Record<string, number> = {};
      Object.keys(payablesByDay).forEach(key => {
        const dia = key.split('-')[0];
        payablesSumByDay[dia] = (payablesSumByDay[dia] || 0) + payablesByDay[key].value;
      });
      
      // Coletar todos os dias válidos presentes nos dados (com open_balance > 0)
      const diasValidosSet = new Set<string>();
      filteredData.forEach(row => {
        if (!!row.date_field && 
            row.date_field.split('-').length === 3 && 
            row.open_balance > 0 && 
            row.date_field.startsWith(`${selectedYear}-${selectedMonth}`)) {
          const dia = String(Number(row.date_field.split('-')[2])).padStart(2, '0');
          diasValidosSet.add(dia);
        }
      });
      chartLabels = Array.from(diasValidosSet).sort((a, b) => Number(a) - Number(b));

      // Preparar dados para o gráfico
      const pendingReceivableValues: (number | null)[] = [];
      const pendingPayableValues: (number | null)[] = [];
      
      chartLabels.forEach(dia => {
        const receivablesValue = receivablesSumByDay[dia] || 0;
        const payablesValue = payablesSumByDay[dia] || 0;
        pendingReceivableValues.push(receivablesValue > 0 ? receivablesValue : null);
        pendingPayableValues.push(payablesValue > 0 ? payablesValue : null);
      });

      outstandingData = { pendingReceivableValues, pendingPayableValues };

    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado (igual ao AccountingChart)
      const receivablesByMonth: Record<string, { value: number; date: string }> = {};
      const payablesByMonth: Record<string, { value: number; date: string }> = {};
      
      // Para cada mês, encontrar o último dia com dados e pegar os valores desse dia
      const mesesComDados = new Set<string>();
      filteredData.forEach(row => {
        if (!!row.date_field && row.date_field.split('-').length >= 2 && row.open_balance > 0) {
          const mes = String(Number(row.date_field.split('-')[1])).padStart(2, '0');
          mesesComDados.add(mes);
        }
      });
      
      const mesesOrdenados = Array.from(mesesComDados).sort((a, b) => Number(a) - Number(b));
      
      // Para cada mês, encontrar o último dia com dados
      mesesOrdenados.forEach(mes => {
        const dadosDoMes = filteredData.filter(row => 
          row.date_field && 
          String(Number(row.date_field.split('-')[1])).padStart(2, '0') === mes &&
          row.open_balance > 0
        );
        
        if (dadosDoMes.length > 0) {
          // Encontrar o último dia do mês com dados
          const ultimoDia = Math.max(...dadosDoMes.map(row => Number(row.date_field!.split('-')[2])));
          
          // Pegar apenas os dados do último dia
          const dadosUltimoDia = dadosDoMes.filter(row => 
            Number(row.date_field!.split('-')[2]) === ultimoDia
          );
          
          // Para cada transação no último dia, pegar o valor mais recente
          const receivablesUltimoDia = dadosUltimoDia.filter(row => row.type === 'receivables');
          const payablesUltimoDia = dadosUltimoDia.filter(row => row.type === 'payables');
          
          // Processar receivables do último dia
          receivablesUltimoDia.forEach(row => {
            const transaction = row.inv_num;
            if (transaction) {
              const key = `${mes}-${transaction}`;
              const currentDate = row.date_field!;
              if (!receivablesByMonth[key] || currentDate > receivablesByMonth[key].date) {
                receivablesByMonth[key] = { value: row.open_balance, date: currentDate };
              }
            }
          });
          
          // Processar payables do último dia
          payablesUltimoDia.forEach(row => {
            const transaction = row.bill_num;
            if (transaction) {
              const key = `${mes}-${transaction}`;
              const currentDate = row.date_field!;
              if (!payablesByMonth[key] || currentDate > payablesByMonth[key].date) {
                payablesByMonth[key] = { value: row.open_balance, date: currentDate };
              }
            }
          });
        }
      });
      
      // Agrupar por mês - somar todas as transações distintas (usando os valores mais recentes)
      const receivablesSumByMonth: Record<string, number> = {};
      Object.keys(receivablesByMonth).forEach(key => {
        const mes = key.split('-')[0];
        receivablesSumByMonth[mes] = (receivablesSumByMonth[mes] || 0) + receivablesByMonth[key].value;
      });
      
      const payablesSumByMonth: Record<string, number> = {};
      Object.keys(payablesByMonth).forEach(key => {
        const mes = key.split('-')[0];
        payablesSumByMonth[mes] = (payablesSumByMonth[mes] || 0) + payablesByMonth[key].value;
      });

      chartLabels = mesesOrdenados;

      // Preparar dados para o gráfico
      const pendingReceivableValues: (number | null)[] = [];
      const pendingPayableValues: (number | null)[] = [];
      
      chartLabels.forEach(mes => {
        const receivablesValue = receivablesSumByMonth[mes] || 0;
        const payablesValue = payablesSumByMonth[mes] || 0;
        pendingReceivableValues.push(receivablesValue > 0 ? receivablesValue : null);
        pendingPayableValues.push(payablesValue > 0 ? payablesValue : null);
      });

      outstandingData = { pendingReceivableValues, pendingPayableValues };

    } else {
      // Gráfico geral (sem filtros de ano/mês) - usar total geral
      const receivablesWithOpenBalance = filteredData.filter(row => 
        row.type === 'receivables' && 
        row.open_balance > 0
      );
      
      const payablesWithOpenBalance = filteredData.filter(row => 
        row.type === 'payables' && 
        row.open_balance > 0
      );

      const totalReceivablesOutstanding = receivablesWithOpenBalance.reduce((sum, row) => sum + row.open_balance, 0);
      const totalPayablesOutstanding = payablesWithOpenBalance.reduce((sum, row) => sum + row.open_balance, 0);

      chartLabels = ['Current Period'];
      outstandingData = { 
        pendingReceivableValues: [totalReceivablesOutstanding > 0 ? totalReceivablesOutstanding : null], 
        pendingPayableValues: [totalPayablesOutstanding > 0 ? totalPayablesOutstanding : null] 
      };
    }

    const { pendingReceivableValues, pendingPayableValues } = outstandingData;

    // Usar dados SQL para "What I Received" e "What I Paid"
    const labels = chartLabels;
    
    // Mapear dados SQL para os mesmos labels do JavaScript
    const receivableValues: number[] = [];
    const payableValues: number[] = [];
    
    labels.forEach((label, index) => {
      // Encontrar o item correspondente nos dados SQL
      const sqlItem = chartDataFromSQL?.find(item => {
        // Tentar diferentes formatos de label
        return item.period_label === label || 
               item.period_label === label.toString() ||
               item.period_label === String(Number(label)).padStart(2, '0');
      });
      
      // Se não encontrar correspondência exata, usar o item do mesmo índice
      const itemToUse = sqlItem || chartDataFromSQL?.[index];
      receivableValues.push(itemToUse?.receivable_amount || 0);
      payableValues.push(itemToUse?.payable_amount || 0);
    });

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
      // Sempre incluir períodos que têm dados de Outstanding, independente do grupo selecionado
      const hasOutstandingData = row.pendingReceivable !== null && row.pendingPayable !== null;
      
      if (selectedGroup === 'all') {
        return row.receivable > 0 || row.payable > 0 || hasOutstandingData;
      } else if (selectedGroup === 'receivable') {
        return row.receivable > 0 || row.pendingReceivable !== null;
      } else {
        return row.payable > 0 || row.pendingPayable !== null;
      }
    });

    // Se não há dados filtrados mas há dados de Outstanding, incluir pelo menos um período
    if (filtered.length === 0 && (pendingReceivableValues.some(v => v !== null) || pendingPayableValues.some(v => v !== null))) {
      const outstandingPeriods = labels.map((label, idx) => ({
        label,
        receivable: receivableValues[idx],
        payable: payableValues[idx],
        pendingReceivable: pendingReceivableValues[idx],
        pendingPayable: pendingPayableValues[idx],
      })).filter(row => row.pendingReceivable !== null || row.pendingPayable !== null);
      
      if (outstandingPeriods.length > 0) {
        filtered.push(...outstandingPeriods);
      }
    }

    const filteredLabels = filtered.map(row => row.label);
    const filteredReceivableValues = filtered.map(row => row.receivable);
    const filteredPayableValues = filtered.map(row => row.payable);
    const filteredPendingReceivableValues = filtered.map(row => row.pendingReceivable || 0);
    const filteredPendingPayableValues = filtered.map(row => row.pendingPayable || 0);

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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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
        spanGaps: false,
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

    const hasData = filteredLabels.length > 0 && (
      filteredReceivableValues.some((v: number) => v > 0) || 
      filteredPayableValues.some((v: number) => v > 0) ||
      filteredPendingReceivableValues.some((v: number | null) => v !== null) ||
      filteredPendingPayableValues.some((v: number | null) => v !== null)
    );
    
    return { chartData, chartOptions, hasData };
  }, [filteredData, selectedYear, selectedMonth, selectedGroup, isLoading, chartDataFromSQL]);

  return (
    <div style={{ width: '100%', background: 'var(--color-background-primary)', borderRadius: 0, margin: 0, borderBottom: '1.5px solid var(--color-border-divider)', padding: 0 }}>
      <div className='d-flex justify-content-between align-items-center' style={{ padding: '16px 32px 0 32px', background: 'var(--color-background-primary)' }}>
        <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30, margin: 0 }}>Project Value Over Time</h4>
        {onNavigateToAccounting && (
          <button
            onClick={onNavigateToAccounting}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ 
              padding: '8px 16px', 
              fontSize: 14, 
              fontWeight: 500,
              borderRadius: 6,
              gap: 8,
              border: '1px solid var(--color-border-divider)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-border-divider)';
            }}
          >
            <i className="bi bi-cash" style={{ fontSize: 14 }} />
            Outstanding Details
          </button>
        )}
      </div>
      <div style={{ width: '100%', height: 340, minHeight: 220, maxHeight: 400, padding: '0 32px 24px 32px' }}>
        {isLoading ? (
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
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Carregando projetos...</span>
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