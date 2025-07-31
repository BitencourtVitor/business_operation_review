import React, { useMemo, useRef, useState, useEffect } from 'react';
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
  ArcElement,
} from 'chart.js';
import type { TooltipModel, Chart as ChartJSInstance } from 'chart.js';
import { RECEIVABLES_COLOR, PAYABLES_COLOR } from '../../../utils/accountingColors';
import ProjectChartTooltipExternal from '../../tooltips/ProjectChartTooltipExternal';
import { useAccountingDataCached } from '../../../hooks/useAccountingDataCached';
import { useProjectChartData } from '../../../hooks/useProjectChartData';
import { useProjectCarouselData } from '../../../hooks/useProjectCarouselData';
import { supabase } from '../../../supabaseClient';
import { ProjectPieChart } from './ProjectPieChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Componente ChartTypeDropdown baseado na estrutura dos filtros
function ChartTypeDropdown({ 
  chartType, 
  onChartTypeChange 
}: {
  chartType: 'line' | 'pie';
  onChartTypeChange: (type: 'line' | 'pie') => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const chartTypes = [
    { value: 'line' as const, label: 'Line Chart', icon: 'bi-graph-up' },
    { value: 'pie' as const, label: 'Pie Chart', icon: 'bi-pie-chart' }
  ];

  const selectedType = chartTypes.find(type => type.value === chartType);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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
          transition: 'all 0.2s ease',
          minWidth: 140
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
        <i className={`bi ${selectedType?.icon}`} style={{ fontSize: 14 }} />
        {selectedType?.label}
        <i className="bi bi-chevron-down" style={{ fontSize: 12, marginLeft: 'auto' }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 1000,
          marginTop: 4
        }}>
          {chartTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => {
                onChartTypeChange(type.value);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                color: chartType === type.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                fontSize: 14,
                fontWeight: chartType === type.value ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-background-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <i className={`bi ${type.icon}`} style={{ fontSize: 14 }} />
              {type.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProjectChartProps {
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivable' | 'payable';
  onNavigateToAccounting?: () => void;
}

// Funções utilitárias para calcular totais detalhados (mesma lógica do carrossel)
async function fetchExpensesTotal(estimateId: string): Promise<number> {
  const { data: estimateData } = await supabase
    .from('hvac_estimates')
    .select('customer_id, customer_name, external_id')
    .eq('id', estimateId)
    .single();
  if (!estimateData) return 0;
  
  const { data: billLinesRaw } = await supabase
    .from('hvac_bill_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const billLines = billLinesRaw || [];
  
  const { data: purchaseLinesRaw } = await supabase
    .from('hvac_purchase_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const purchaseLines = purchaseLinesRaw || [];
  
  const { data: vendorCreditLinesRaw } = await supabase
    .from('hvac_vendor_credit_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const vendorCreditLines = vendorCreditLinesRaw || [];
  
  const total = [...billLines, ...purchaseLines, ...vendorCreditLines].reduce((sum, l) => sum + Number(l.amount || 0), 0);
  return total;
}

async function fetchInvoicesTotal(estimateId: string): Promise<number> {
  const { data: estimateData } = await supabase
    .from('hvac_estimates')
    .select('customer_id, customer_name, external_id')
    .eq('id', estimateId)
    .single();
  if (!estimateData) return 0;
  
  const { data: invoicesDataRaw } = await supabase
    .from('hvac_invoices')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const invoicesData = invoicesDataRaw || [];
  
  const { data: depositLinesRaw } = await supabase
    .from('hvac_deposit_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id)
    .eq('customer_name', estimateData.customer_name)
    .lt('amount', 0);
  const depositLines = depositLinesRaw || [];
  
  const invoicesTotal = invoicesData.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  const backChargesTotal = depositLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return invoicesTotal + backChargesTotal;
}

const ProjectChart: React.FC<ProjectChartProps> = ({ selectedYear, selectedMonth, selectedGroup, onNavigateToAccounting }) => {
  const chartRef = useRef<ChartJSInstance<'line'> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipModel<'line'> | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'pie'>('line');
  
  // CONSULTA 1: SQL para "What I Received" e "What I Paid" - ATIVADO
  const { data: chartDataFromSQL, loading: sqlLoading } = useProjectChartData({
    selectedYear,
    selectedMonth,
    selectedGroup
  });

  // CONSULTA 2: JavaScript para "Outstanding Receivable" e "Outstanding Payable" - ATIVADO
  const { data: accountingData, loading: accountingLoading } = useAccountingDataCached();

  // CONSULTA 3: Dados do carrossel para calcular métricas de Profit and Loss
  const { data: carouselData, loading: carouselLoading } = useProjectCarouselData({
    dateFrom: selectedYear && selectedMonth ? `${selectedYear}-${selectedMonth}-01` : selectedYear ? `${selectedYear}-01-01` : '2020-01-01',
    dateTo: selectedYear && selectedMonth ? (() => {
      // Calcular o último dia do mês corretamente
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth);
      const lastDay = new Date(year, month, 0).getDate(); // Último dia do mês
      return `${selectedYear}-${selectedMonth}-${lastDay.toString().padStart(2, '0')}`;
    })() : selectedYear ? `${selectedYear}-12-31` : '2030-12-31',
    onlyAccepted: true
  });



  // Estados para totais detalhados (mesma lógica do carrossel)
  const [expensesTotals, setExpensesTotals] = useState<{ [estimateId: string]: number }>({});
  const [invoicesTotals, setInvoicesTotals] = useState<{ [estimateId: string]: number }>({});
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Forçar recálculo quando filtros mudarem
  useEffect(() => {
    setExpensesTotals({});
    setInvoicesTotals({});
  }, [selectedYear, selectedMonth]);

  // Calcular totais detalhados quando carouselData mudar
  useEffect(() => {
    if (!carouselData || carouselData.length === 0) return;
    
    let cancelled = false;
    async function fetchAll() {
      setDetailsLoading(true);
      const expenses: { [estimateId: string]: number } = {};
      const invoices: { [estimateId: string]: number } = {};
      
      await Promise.all(carouselData.map(async (estimate) => {
        expenses[estimate.estimate_id] = await fetchExpensesTotal(estimate.estimate_id);
        invoices[estimate.estimate_id] = await fetchInvoicesTotal(estimate.estimate_id);
      }));
      
      if (!cancelled) {
        setExpensesTotals(expenses);
        setInvoicesTotals(invoices);
        setDetailsLoading(false);
      }
    }
    
    fetchAll();
    return () => { cancelled = true; };
  }, [carouselData]);

  // Loading geral
  const isLoading = accountingLoading || sqlLoading || carouselLoading || detailsLoading;

     // Calcular dados filtrados (EXATAMENTE como no AccountingIndicators)
   const filteredData = useMemo(() => {
     if (!accountingData) {
       return [];
     }
     
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
        if (!dateToUse) return false;
        
        // Tentar diferentes formatos de data
        const parts = dateToUse.split('-');
        if (parts.length >= 2) {
          const month = parts[1];
          // Comparar com e sem padding
          return month === selectedMonth || 
                 String(Number(month)).padStart(2, '0') === selectedMonth ||
                 month === String(Number(selectedMonth));
        }
        return false;
             });
     }
     
     if (selectedGroup !== 'all') {
       const groupFilter = selectedGroup === 'receivable' ? 'receivables' : 'payables';
       filtered = filtered.filter(d => d.type === groupFilter);
     }
     
     return filtered;
  }, [accountingData, selectedYear, selectedMonth, selectedGroup]);

  // Calcular métricas usando dados do gráfico de linhas (TOTAIS REAIS EXIBIDOS)
  const metrics = useMemo(() => {
    // Se não há dados do gráfico, retornar zeros
    if (!chartDataFromSQL || chartDataFromSQL.length === 0) {
      return {
        totalReceived: 0,
        totalSpent: 0,
        profitProjects: 0,
        lossProjects: 0,
        averageProfitMargin: 0,
        averageLossMargin: 0
      };
    }

    // Calcular totais dos dados SQL (What I Received e What I Paid)
    let totalReceived = 0;
    let totalSpent = 0;

    // Somar todos os valores dos dados SQL que são exibidos no gráfico
    chartDataFromSQL.forEach(item => {
      totalReceived += item.receivable_amount || 0;
      totalSpent += item.payable_amount || 0;
    });

    // Para as métricas de projetos (profit/loss), ainda usar dados do carrossel
    // pois essas métricas são específicas por projeto
    let profitProjects = 0;
    let lossProjects = 0;
    
    // Arrays para calcular margens médias
    const profitMargins: number[] = [];
    const lossMargins: number[] = [];

    if (carouselData && carouselData.length > 0) {
      // Aplicar a mesma lógica de filtro do carrossel (customerIds únicos)
      const seen = new Set();
      const uniqueProjects = carouselData.filter(item => {
        if (!item.customer_id) return false;
        if (seen.has(item.customer_id)) return false;
        seen.add(item.customer_id);
        return true;
      });

      uniqueProjects.forEach(project => {
        // Usar totais detalhados (mesma lógica do carrossel)
        const projectReceived = invoicesTotals[project.estimate_id] ?? 0;
        const projectSpent = expensesTotals[project.estimate_id] ?? 0;
        
        // Profit/Loss do projeto
        const projectProfit = projectReceived - projectSpent;
        
        // Contar projetos lucrativos e com prejuízo
        if (projectProfit > 0) {
          profitProjects++;
          // Calcular margem de lucro (profit / received * 100)
          if (projectReceived > 0) {
            const profitMargin = (projectProfit / projectReceived) * 100;
            profitMargins.push(profitMargin);
          }
        } else if (projectProfit < 0) {
          lossProjects++;
          // Calcular margem de prejuízo (abs(profit) / received * 100)
          if (projectReceived > 0) {
            const lossMargin = (Math.abs(projectProfit) / projectReceived) * 100;
            lossMargins.push(lossMargin);
          }
        }
      });
    }

    // Calcular margens médias
    const averageProfitMargin = profitMargins.length > 0 
      ? profitMargins.reduce((sum, margin) => sum + margin, 0) / profitMargins.length 
      : 0;
    
    const averageLossMargin = lossMargins.length > 0 
      ? lossMargins.reduce((sum, margin) => sum + margin, 0) / lossMargins.length 
      : 0;

    return {
      totalReceived,
      totalSpent,
      profitProjects,
      lossProjects,
      averageProfitMargin,
      averageLossMargin
    };
  }, [chartDataFromSQL, carouselData, expensesTotals, invoicesTotals, selectedYear, selectedMonth]);



     const { chartData, chartOptions, hasData } = useMemo(() => {
     if (isLoading) {
       return { chartData: null, chartOptions: null, hasData: false };
     }
    
         // Se não há dados JavaScript mas há dados SQL, ainda devemos mostrar o gráfico
     // com as linhas SQL e Outstanding zeradas
     if (!filteredData || filteredData.length === 0) {
       console.log('FILTEREDDATA VAZIO - verificando se há dados SQL');
       
       // Se há dados SQL, criar gráfico com Outstanding zerado
       if (chartDataFromSQL && chartDataFromSQL.length > 0) {
         console.log('Há dados SQL - criando gráfico com Outstanding zerado');
         
         // Usar apenas dados SQL, com Outstanding zerado
         const labels = chartDataFromSQL.map(item => item.period_label);
         const receivableValues = chartDataFromSQL.map(item => item.receivable_amount || 0);
         const payableValues = chartDataFromSQL.map(item => item.payable_amount || 0);
         
         // Outstanding zerado
         const pendingReceivableValues = new Array(labels.length).fill(0);
         const pendingPayableValues = new Array(labels.length).fill(0);
         
         const datasets = [];
         if (selectedGroup === 'all') {
           datasets.push({
             label: 'Receivable',
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
             spanGaps: false,
           });
           datasets.push({
             label: 'Payable',
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
             spanGaps: false,
           });
           datasets.push({
             label: 'Outstanding Receivable',
             data: pendingReceivableValues,
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
             data: pendingPayableValues,
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
             spanGaps: false,
           });
           datasets.push({
             label: 'Outstanding Receivable',
             data: pendingReceivableValues,
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
             spanGaps: false,
           });
           datasets.push({
             label: 'Outstanding Payable',
             data: pendingPayableValues,
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
                 text: 'Days',
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

         return { chartData, chartOptions, hasData: true };
       }
       
       console.log('RETORNANDO POR FILTEREDDATA VAZIO E SEM DADOS SQL');
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
        pendingReceivableValues.push(receivablesValue > 0 ? receivablesValue : 0);
        pendingPayableValues.push(payablesValue > 0 ? payablesValue : 0);
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
      
      // Para visualização anual, incluir todos os meses do ano, mesmo que não tenham dados
      let mesesOrdenados: string[];
      if (selectedYear && !selectedMonth) {
        // Criar array com todos os meses do ano (01 a 12)
        mesesOrdenados = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      } else {
        // Usar apenas meses que têm dados
        mesesOrdenados = Array.from(mesesComDados).sort((a, b) => Number(a) - Number(b));
      }
      
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
        // Se não há dados para o mês, não fazer nada (valores ficarão como 0)
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
        pendingReceivableValues.push(receivablesValue > 0 ? receivablesValue : 0);
        pendingPayableValues.push(payablesValue > 0 ? payablesValue : 0);
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
        pendingReceivableValues: [totalReceivablesOutstanding > 0 ? totalReceivablesOutstanding : 0], 
        pendingPayableValues: [totalPayablesOutstanding > 0 ? totalPayablesOutstanding : 0] 
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
        // SQL retorna "7/2025", JavaScript usa "07"
        const sqlMonth = item.period_label.split('/')[0];
        const jsMonth = String(Number(label)).padStart(2, '0');
        
        return item.period_label === label || 
               item.period_label === label.toString() ||
               item.period_label === String(Number(label)).padStart(2, '0') ||
               sqlMonth === label ||
               sqlMonth === jsMonth ||
               String(Number(sqlMonth)).padStart(2, '0') === jsMonth;
      });
      
      // Se não encontrar correspondência exata, usar o item do mesmo índice
      const itemToUse = sqlItem || chartDataFromSQL?.[index];
      receivableValues.push(itemToUse?.receivable_amount || 0);
      payableValues.push(itemToUse?.payable_amount || 0);
    });

    

    // Filtrar períodos - incluir apenas períodos que têm pelo menos um tipo de dado
    const filtered = labels.map((label, idx) => {
      return {
        label,
        receivable: receivableValues[idx],
        payable: payableValues[idx],
        pendingReceivable: pendingReceivableValues[idx],
        pendingPayable: pendingPayableValues[idx],
      };
                    }).filter(row => {
                  // Verificar se há pelo menos um tipo de dado não-zero (incluindo valores negativos)
                  const hasSQLData = row.receivable !== 0 || row.payable !== 0;
                  const hasOutstandingData = (row.pendingReceivable || 0) !== 0 || (row.pendingPayable || 0) !== 0;
                  return hasSQLData || hasOutstandingData;
                });

    const filteredLabels = filtered.map(row => row.label);
    const filteredReceivableValues = filtered.map(row => row.receivable);
    const filteredPayableValues = filtered.map(row => row.payable);
    const filteredPendingReceivableValues = filtered.map(row => row.pendingReceivable ?? 0);
    const filteredPendingPayableValues = filtered.map(row => row.pendingPayable ?? 0);

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

    const hasData = filteredLabels.length > 0;
    
    return { chartData, chartOptions, hasData };
  }, [filteredData, selectedYear, selectedMonth, selectedGroup, isLoading, chartDataFromSQL]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Container principal que divide o espaço */}
      <div className='d-flex' style={{ width: '100%', height: '100%', minHeight: 0 }}>
        {/* Chart Container - 80% quando métricas estão ativas, 100% quando não */}
        <div style={{ 
          width: showMetrics ? '80%' : '100%', 
          transition: 'width 0.3s ease',
          background: 'var(--color-background-primary)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>
          {/* Header dentro do container do chart */}
          <div className='d-flex justify-content-between align-items-center' style={{ padding: '16px 32px 0 32px', background: 'var(--color-background-primary)', flexShrink: 0 }}>
            <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30, margin: 0 }}>Project Value Over Time</h4>
            <div className='d-flex align-items-center gap-2'>
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
              <button
                onClick={() => setShowMetrics(!showMetrics)}
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
                  transition: 'all 0.2s ease',
                  display: isLoading ? 'none' : 'flex'
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
                <i 
                  className="bi bi-eye" 
                  style={{ 
                    fontSize: 14,
                    color: showMetrics ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                    transition: 'color 0.2s ease'
                  }} 
                />
                {showMetrics ? 'Hide Metric' : 'Show Metric'}
              </button>
            </div>
          </div>
          
          {/* Chart area - ocupa todo o espaço restante */}
          <div style={{ 
            width: '100%', 
            background: 'var(--color-background-primary)',
            flex: 1,
            padding: '0 32px 24px 32px',
            position: 'relative',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
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
              <div style={{ flex: 1, minHeight: 0 }}>
                <Line ref={chartRef} data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>No data found for selected filters</span>
              </div>
            )}
            <ProjectChartTooltipExternal tooltip={tooltip} chartLabels={chartData?.labels || []} chartDatasets={chartData?.datasets || []} canvas={chartRef.current?.canvas || null} />
          </div>
        </div>

        {/* Metrics Container - 20% quando ativo */}
        {showMetrics && (
          <div style={{ 
            width: '20%', 
            transition: 'width 0.3s ease',
            borderLeft: '1px solid var(--color-border-divider)',
            background: 'var(--color-background-primary)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: 62, 
                width: '100%' 
              }}>
                <h4 style={{ 
                  color: 'var(--color-text-secondary)', 
                  fontSize: 18, 
                  fontWeight: 400, 
                  minHeight: 30, 
                  margin: 0,
                  width: '100%',
                  textAlign: 'center',
                  lineHeight: '62px',
                  display: 'block'
                }}>
                  Project Metrics
                </h4>
              </div>
              {/* 6 blocos de métricas em 2 colunas */}
              <div style={{ 
                display: 'grid',
                borderTop: '1px solid var(--color-border-divider)',
                gridTemplateColumns: '1fr 1fr',
                flex: 1,
                overflow: 'hidden'
              }}>
                {/* Coluna 1 - Dados Financeiros Positivos */}
                <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
                  {/* Bloco 1 - Valor Total Recebido */}
                  <div style={{
                    padding: '8px',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}>
                                         <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Total Received</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--positive-color)' }}>
                       ${metrics.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </div>
                  </div>

                  {/* Bloco 2 - Quantidade de Obras Lucrativas */}
                  <div style={{
                    padding: '8px',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    borderTop: '1px solid var(--color-border-divider)',
                    borderBottom: '1px solid var(--color-border-divider)',
                  }}>
                                         <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Profit Projects</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--positive-color)' }}>{metrics.profitProjects}</div>
                  </div>

                  {/* Bloco 3 - Terceira linha (placeholder) */}
                                     <div style={{
                     padding: '8px', 
                     flex: 1,
                     minHeight: 0,
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                     <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Average Profit Margin</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--positive-color)' }}>{metrics.averageProfitMargin.toFixed(1)}%</div>
                   </div>
                </div>

                {/* Coluna 2 - Dados Financeiros Negativos */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Bloco 4 - Valor Total Gasto */}
                  <div style={{
                    padding: '8px',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}>
                                         <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Total Spent</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--negative-color)' }}>
                       ${metrics.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </div>
                  </div>

                  {/* Bloco 5 - Quantidade de Obras Prejudicadas */}
                  <div style={{
                    padding: '8px',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    borderTop: '1px solid var(--color-border-divider)',
                    borderBottom: '1px solid var(--color-border-divider)',
                  }}>
                                         <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Loss Projects</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--negative-color)' }}>{metrics.lossProjects}</div>
                  </div>

                  {/* Bloco 6 - Terceira linha (placeholder) */}
                                     <div style={{
                     padding: '8px',
                     flex: 1,
                     minHeight: 0,
                     display: 'flex',
                     flexDirection: 'column',
                     justifyContent: 'center'
                   }}>
                     <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Average Loss Margin</div>
                     <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--negative-color)' }}>
                       {metrics.averageLossMargin > 0 ? `-${metrics.averageLossMargin.toFixed(1)}%` : '0.0%'}
                     </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectChart; 