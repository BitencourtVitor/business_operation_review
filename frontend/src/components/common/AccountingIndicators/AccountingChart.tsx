import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import type { AccountingRow } from '../../../types/accounting';
import { AccountingLineChart } from './AccountingLineChart';
import { AccountingPieChart } from './AccountingPieChart';
import { AccountingTooltipExternal } from '../../tooltips/AccountingTooltipExternal';
import { PieChartTooltipExternal } from '../../tooltips/PieChartTooltipExternal';
import { generateCoolColors, generateWarmColors, RECEIVABLES_COLOR, PAYABLES_COLOR } from '../../../utils/accountingColors';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Componente ChartTypeDropdown baseado na estrutura dos filtros
function ChartTypeDropdown({ 
  chartType, 
  onChartTypeChange 
}: {
  chartType: 'line' | 'pie';
  onChartTypeChange: (type: 'line' | 'pie') => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const getChartTypeDisplayText = () => {
    switch (chartType) {
      case 'line':
        return 'Line Chart';
      case 'pie':
        return 'Pie Chart';
      default:
        return 'Line Chart';
    }
  };

  const chartTypeOptions = [
    { value: 'line', label: 'Line Chart' },
    { value: 'pie', label: 'Pie Chart' }
  ];

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      {chartTypeOptions.map(option => (
        <div
          key={option.value}
          style={{
            padding: '6px 12px',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            background: chartType === option.value ? 'var(--color-background-secondary)' : 'transparent',
            borderBottom: '1px solid var(--color-border-divider)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onChartTypeChange(option.value as 'line' | 'pie');
            setOpen(false);
          }}
          onMouseEnter={(e) => {
            if (chartType !== option.value) {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = chartType === option.value ? 'var(--color-background-secondary)' : 'transparent';
          }}
        >
          <i className={`bi ${option.value === 'line' ? 'bi-graph-up' : 'bi-pie-chart'}`} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          {option.label}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {getChartTypeDisplayText()}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

// Interface para o tooltip externo
interface AccountingTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: AccountingRow[];
  selectedGroup: 'all' | 'receivables' | 'payables';
  separateAging: boolean;
}

// Interface para o tooltip do pie chart
interface PieChartTooltipExternalProps {
  tooltip: {
    opacity: number;
    caretX: number;
    caretY: number;
    labelColors: Array<{
      backgroundColor: string;
      borderColor: string;
    }>;
    dataPoints: Array<{
      dataIndex: number;
      datasetIndex: number;
      label: string;
      value: number;
      formattedValue: string;
    }>;
  };
  year: string;
  month: string;
  day: string;
  selectedGroup: 'all' | 'receivables' | 'payables';
  groupBy: 'category' | 'aging';
  compareWithTotal: boolean;
  separateAging: boolean;
  chartData?: {
    labels: string[];
    datasets: Array<{
      data: number[];
      backgroundColor: string[];
    }>;
  };
  chartCanvas?: HTMLCanvasElement | null;
}

interface AccountingChartProps {
  filteredData: AccountingRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivables' | 'payables';
  separateAging: boolean;
  selectedDay: string;
  setSelectedDay: (day: string) => void;
  onComparisonMetricsChange?: (metrics: { filteredValue: number; totalValue: number; percentage: number } | null) => void;
  onForceSeparateAging?: (force: boolean) => void;
  selectedReceivablesCategories: string[];
  selectedPayablesCategories: string[];
  selectedAging: string[];
  unfilteredDataForChart: AccountingRow[];
}

export function AccountingChart({ 
  filteredData, 
  selectedYear, 
  selectedMonth, 
  selectedGroup, 
  separateAging,
  selectedDay,
  setSelectedDay,
  onComparisonMetricsChange,
  onForceSeparateAging,
  selectedReceivablesCategories,
  selectedPayablesCategories,
  selectedAging,
  unfilteredDataForChart
}: AccountingChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<AccountingTooltipExternalProps>>(null);
  const [pieTooltip, setPieTooltip] = useState<null | Partial<PieChartTooltipExternalProps>>(null);
  const [pieChartCanvas, setPieChartCanvas] = useState<HTMLCanvasElement | null>(null);
  
  // Estados para gráfico de pizza
  const [chartType, setChartType] = useState<'line' | 'pie'>('line');
  const [compareWithTotal, setCompareWithTotal] = useState<boolean>(false);
  const [groupBy, setGroupBy] = useState<'category' | 'aging'>('category');

  // Remover estado para customers selecionados - não é mais necessário
  // const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);

  // Obter dias disponíveis apenas quando um mês estiver selecionado
  const diasComDados = useMemo(() => {
    if (!selectedYear || !selectedMonth) return [];
    
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
    return Array.from(diasValidosSet).sort((a, b) => Number(a) - Number(b));
  }, [filteredData, selectedYear, selectedMonth]);

  // Preparar dados do gráfico
  const { chartData, chartOptions, hasData } = useMemo(() => {
    // Cores do tema
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textSecondary = isDark ? '#adb5bd' : '#6c757d';

    const chartLabels: string[] = [];
    const chartDatasets: Array<{
      label: string;
      data: (number | null)[];
      borderColor: string;
      backgroundColor: string;
      pointBackgroundColor: string;
      pointBorderColor: string;
      pointRadius: number;
      pointHoverRadius: number;
      borderWidth: number;
      fill: boolean;
      tension: number;
      spanGaps: boolean;
    }> = [];

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado
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
      
      chartLabels.push(...diasComDados);

      if (separateAging && selectedGroup === 'receivables') {
        // Só aging de Receivables
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateCoolColors(agingIntervals.length);
        agingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(dia => {
            const receivablesByDayAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${dia}-${transaction}`;
                const currentDate = d.date_field!;
                if (!receivablesByDayAndAging[key] || currentDate > receivablesByDayAndAging[key].date) {
                  receivablesByDayAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(receivablesByDayAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: colors[index],
            backgroundColor: colors[index],
            pointBackgroundColor: colors[index],
            pointBorderColor: colors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (separateAging && selectedGroup === 'payables') {
        // Só aging de Payables
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateWarmColors(agingIntervals.length);
        agingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(dia => {
            const payablesByDayAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${dia}-${transaction}`;
                const currentDate = d.date_field!;
                if (!payablesByDayAndAging[key] || currentDate > payablesByDayAndAging[key].date) {
                  payablesByDayAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(payablesByDayAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: colors[index],
            backgroundColor: colors[index],
            pointBackgroundColor: colors[index],
            pointBorderColor: colors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (separateAging && selectedGroup === 'all') {
        // Ambos
        const receivablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const payablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const receivablesColors = generateCoolColors(receivablesAgingIntervals.length);
        const payablesColors = generateWarmColors(payablesAgingIntervals.length);
        receivablesAgingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(dia => {
            const receivablesByDayAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${dia}-${transaction}`;
                const currentDate = d.date_field!;
                if (!receivablesByDayAndAging[key] || currentDate > receivablesByDayAndAging[key].date) {
                  receivablesByDayAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(receivablesByDayAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: receivablesColors[index % receivablesColors.length],
            backgroundColor: receivablesColors[index % receivablesColors.length],
            pointBackgroundColor: receivablesColors[index % receivablesColors.length],
            pointBorderColor: receivablesColors[index % receivablesColors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
        payablesAgingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(dia => {
            const payablesByDayAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${dia}-${transaction}`;
                const currentDate = d.date_field!;
                if (!payablesByDayAndAging[key] || currentDate > payablesByDayAndAging[key].date) {
                  payablesByDayAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(payablesByDayAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: payablesColors[index],
            backgroundColor: payablesColors[index],
            pointBackgroundColor: payablesColors[index],
            pointBorderColor: payablesColors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (selectedGroup !== 'payables') {
        // Gráfico normal (receivables como linha única)
        const receivablesData: (number | null)[] = [];
        chartLabels.forEach(dia => {
          const value = receivablesSumByDay[dia] || 0;
          receivablesData.push(value > 0 ? value : null); // null se não há dados
        });
        
        chartDatasets.push({
          label: 'Receivables',
          data: receivablesData,
          borderColor: RECEIVABLES_COLOR,
          backgroundColor: RECEIVABLES_COLOR,
          pointBackgroundColor: RECEIVABLES_COLOR,
          pointBorderColor: RECEIVABLES_COLOR,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          spanGaps: false, // não conectar pontos quando há gaps
        });
      }
      
      // Adicionar payables apenas se não estiver filtrando por receivables e não estiver separando por aging
      if (selectedGroup !== 'receivables' && !separateAging) {
        const payablesData: (number | null)[] = [];
        chartLabels.forEach(dia => {
          const value = payablesSumByDay[dia] || 0;
          payablesData.push(value > 0 ? value : null); // null se não há dados
        });
        
        chartDatasets.push({
          label: 'Payables',
          data: payablesData,
          borderColor: PAYABLES_COLOR,
          backgroundColor: PAYABLES_COLOR,
          pointBackgroundColor: PAYABLES_COLOR,
          pointBorderColor: PAYABLES_COLOR,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          spanGaps: false, // não conectar pontos quando há gaps
        });
      }
    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado
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

      chartLabels.push(...mesesOrdenados);

      if (separateAging && selectedGroup === 'receivables') {
        // Só aging de Receivables
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateCoolColors(agingIntervals.length);
        agingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(mes => {
            // Encontrar o último dia do mês com dados para este aging
            const dadosDoMes = filteredData.filter(d => 
              d.type === 'receivables' && 
              d.aging_intervals === aging && 
              d.date_field && 
              String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && 
              d.open_balance > 0
            );
            if (dadosDoMes.length > 0) {
              // Encontrar o último dia do mês com dados
              const ultimoDia = Math.max(...dadosDoMes.map(d => Number(d.date_field!.split('-')[2])));
              // Pegar apenas os dados do último dia
              const dadosUltimoDia = dadosDoMes.filter(d => 
                Number(d.date_field!.split('-')[2]) === ultimoDia
              );
              // Para cada transação no último dia, pegar o valor mais recente
              const receivablesByMonthAndAging: Record<string, { value: number; date: string }> = {};
              dadosUltimoDia.forEach(d => {
                const transaction = d.inv_num;
                if (transaction) {
                  const key = `${mes}-${transaction}`;
                  const currentDate = d.date_field!;
                  if (!receivablesByMonthAndAging[key] || currentDate > receivablesByMonthAndAging[key].date) {
                    receivablesByMonthAndAging[key] = { value: d.open_balance, date: currentDate };
                  }
                }
              });
              const value = Object.values(receivablesByMonthAndAging).reduce((sum, val) => sum + val.value, 0);
              data.push(value > 0 ? value : null);
            } else {
              data.push(null);
            }
          });
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: colors[index],
            backgroundColor: colors[index],
            pointBackgroundColor: colors[index],
            pointBorderColor: colors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (separateAging && selectedGroup === 'payables') {
        // Só aging de Payables
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateWarmColors(agingIntervals.length);
        agingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(mes => {
            const payablesByMonthAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${mes}-${transaction}`;
                const currentDate = d.date_field!;
                if (!payablesByMonthAndAging[key] || currentDate > payablesByMonthAndAging[key].date) {
                  payablesByMonthAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(payablesByMonthAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: colors[index],
            backgroundColor: colors[index],
            pointBackgroundColor: colors[index],
            pointBorderColor: colors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (separateAging && selectedGroup === 'all') {
        // Ambos
        const receivablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const payablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const receivablesColors = generateCoolColors(receivablesAgingIntervals.length);
        const payablesColors = generateWarmColors(payablesAgingIntervals.length);
        receivablesAgingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(mes => {
            const receivablesByMonthAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${mes}-${transaction}`;
                const currentDate = d.date_field!;
                if (!receivablesByMonthAndAging[key] || currentDate > receivablesByMonthAndAging[key].date) {
                  receivablesByMonthAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(receivablesByMonthAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: receivablesColors[index],
            backgroundColor: receivablesColors[index],
            pointBackgroundColor: receivablesColors[index],
            pointBorderColor: receivablesColors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
        payablesAgingIntervals.forEach((aging, index) => {
          const data: (number | null)[] = [];
          chartLabels.forEach(mes => {
            const payablesByMonthAndAging: Record<string, { value: number; date: string }> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${mes}-${transaction}`;
                const currentDate = d.date_field!;
                if (!payablesByMonthAndAging[key] || currentDate > payablesByMonthAndAging[key].date) {
                  payablesByMonthAndAging[key] = { value: d.open_balance, date: currentDate };
                }
              });
            const value = Object.values(payablesByMonthAndAging).reduce((sum, val) => sum + val.value, 0);
            data.push(value > 0 ? value : null);
          });
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: payablesColors[index],
            backgroundColor: payablesColors[index],
            pointBackgroundColor: payablesColors[index],
            pointBorderColor: payablesColors[index],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
            spanGaps: false,
          });
        });
      } else if (selectedGroup !== 'payables') {
        // Gráfico normal (receivables como linha única)
        const receivablesData: (number | null)[] = [];
        chartLabels.forEach(mes => {
          const value = receivablesSumByMonth[mes] || 0;
          receivablesData.push(value > 0 ? value : null); // null se não há dados
        });
        
        chartDatasets.push({
          label: 'Receivables',
          data: receivablesData,
          borderColor: RECEIVABLES_COLOR,
          backgroundColor: RECEIVABLES_COLOR,
          pointBackgroundColor: RECEIVABLES_COLOR,
          pointBorderColor: RECEIVABLES_COLOR,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          spanGaps: false, // não conectar pontos quando há gaps
        });
      }
      
      // Adicionar payables apenas se não estiver filtrando por receivables e não estiver separando por aging
      if (selectedGroup !== 'receivables' && !separateAging) {
        const payablesData: (number | null)[] = [];
        chartLabels.forEach(mes => {
          const value = payablesSumByMonth[mes] || 0;
          payablesData.push(value > 0 ? value : null); // null se não há dados
        });
        
        chartDatasets.push({
          label: 'Payables',
          data: payablesData,
          borderColor: PAYABLES_COLOR,
          backgroundColor: PAYABLES_COLOR,
          pointBackgroundColor: PAYABLES_COLOR,
          pointBorderColor: PAYABLES_COLOR,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          spanGaps: false, // não conectar pontos quando há gaps
        });
      }
    }

    const chartData = {
      labels: chartLabels,
      datasets: chartDatasets,
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
          }
        },
        title: { display: false },
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
                data: filteredData as AccountingRow[],
                selectedGroup,
                separateAging,
              });
            }
          }
        },
      },
      scales: {
        x: {
          grid: { 
            color: textSecondary, 
            drawBorder: true,
            lineWidth: 1,
            drawOnChartArea: true,
            drawTicks: true,
          },
          ticks: { 
            color: textSecondary,
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 0,
            padding: 8
          },
          title: {
            display: true,
            text: selectedYear && selectedMonth ? 'Days of Month' : 'Months',
            color: textSecondary,
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 }
          },
        },
        y: {
          grid: { 
            color: textSecondary, 
            drawBorder: true,
            lineWidth: 1,
            drawOnChartArea: true,
            drawTicks: true,
          },
          ticks: {
            color: textSecondary,
            font: { size: 11 },
            callback: function(tickValue: string | number) {
              const n = typeof tickValue === 'number' ? tickValue : Number(tickValue);
              if (isNaN(n)) return tickValue;
              let label = '';
              if (Math.abs(n) >= 1_000_000) {
                label = `$ ${(n/1_000_000).toFixed(1)}M`;
              } else if (Math.abs(n) >= 1_000) {
                label = `$ ${(n/1_000).toFixed(0)}K`;
              } else {
                label = `$ ${n}`;
              }
              return label;
            },
            padding: 8
          },
          beginAtZero: true,
          title: {
            display: true,
            text: 'Value ($)',
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

    // Verificar se há dados válidos
    const hasData = chartDatasets.length > 0 && chartDatasets.some(dataset => 
      dataset.data.some(value => value !== null && value > 0)
    );

    return { chartData, chartOptions, hasData };
  }, [filteredData, selectedYear, selectedMonth, selectedGroup, separateAging]);

  // Gerar dados para gráfico de pizza
  const { doughnutData, doughnutOptions, comparisonMetrics, hasPieData } = useMemo(() => {
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textSecondary = isDark ? '#adb5bd' : '#6c757d';

    const filteredDataForPie = filteredData.filter(row => row.open_balance > 0);
    const unfilteredDataForPie = unfilteredDataForChart.filter(row => row.open_balance > 0);

    // NOVA LÓGICA: Se não há dia selecionado, pegar o último dia do mês para cada grupo
    let receivablesData: typeof filteredDataForPie = [];
    let payablesData: typeof filteredDataForPie = [];
    let unfilteredReceivablesData: typeof unfilteredDataForPie = [];
    let unfilteredPayablesData: typeof unfilteredDataForPie = [];
    
    if (selectedYear && selectedMonth && !selectedDay) {
      // Receivables: último dia do mês com dados
      const receivablesRows = filteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && row.date_field.startsWith(`${selectedYear}-${selectedMonth}`));
      const unfilteredReceivablesRows = unfilteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && row.date_field.startsWith(`${selectedYear}-${selectedMonth}`));
      let lastDayReceivables = '';
      if (receivablesRows.length > 0) {
        lastDayReceivables = receivablesRows.reduce((max, row) => {
          const d = row.date_field!.split('-')[2];
          return Number(d) > Number(max) ? d : max;
        }, '01');
      }
      receivablesData = receivablesRows.filter(row => row.date_field && row.date_field.split('-')[2] === lastDayReceivables);
      unfilteredReceivablesData = unfilteredReceivablesRows.filter(row => row.date_field && row.date_field.split('-')[2] === lastDayReceivables);

      // Payables: último dia do mês com dados
      const payablesRows = filteredDataForPie.filter(row => row.type === 'payables' && row.date_field && row.date_field.startsWith(`${selectedYear}-${selectedMonth}`));
      const unfilteredPayablesRows = unfilteredDataForPie.filter(row => row.type === 'payables' && row.date_field && row.date_field.startsWith(`${selectedYear}-${selectedMonth}`));
      let lastDayPayables = '';
      if (payablesRows.length > 0) {
        lastDayPayables = payablesRows.reduce((max, row) => {
          const d = row.date_field!.split('-')[2];
          return Number(d) > Number(max) ? d : max;
        }, '01');
      }
      payablesData = payablesRows.filter(row => row.date_field && row.date_field.split('-')[2] === lastDayPayables);
      unfilteredPayablesData = unfilteredPayablesRows.filter(row => row.date_field && row.date_field.split('-')[2] === lastDayPayables);
    } else if (selectedYear && !selectedMonth && !selectedDay) {
      // NOVO: Apenas ano selecionado, pegar o último dia do ano para cada grupo
      // Receivables
      const receivablesRows = filteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && row.date_field.startsWith(`${selectedYear}-`));
      const unfilteredReceivablesRows = unfilteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && row.date_field.startsWith(`${selectedYear}-`));
      let lastDateReceivables = '';
      if (receivablesRows.length > 0) {
        lastDateReceivables = receivablesRows.reduce((max, row) => {
          return row.date_field! > max ? row.date_field! : max;
        }, '');
      }
      receivablesData = receivablesRows.filter(row => row.date_field === lastDateReceivables);
      unfilteredReceivablesData = unfilteredReceivablesRows.filter(row => row.date_field === lastDateReceivables);
      // Payables
      const payablesRows = filteredDataForPie.filter(row => row.type === 'payables' && row.date_field && row.date_field.startsWith(`${selectedYear}-`));
      const unfilteredPayablesRows = unfilteredDataForPie.filter(row => row.type === 'payables' && row.date_field && row.date_field.startsWith(`${selectedYear}-`));
      let lastDatePayables = '';
      if (payablesRows.length > 0) {
        lastDatePayables = payablesRows.reduce((max, row) => {
          return row.date_field! > max ? row.date_field! : max;
        }, '');
      }
      payablesData = payablesRows.filter(row => row.date_field === lastDatePayables);
      unfilteredPayablesData = unfilteredPayablesRows.filter(row => row.date_field === lastDatePayables);
    } else if (selectedDay) {
      // Se há dia selecionado, filtrar ambos pelo dia
      receivablesData = filteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && String(Number(row.date_field.split('-')[2])).padStart(2, '0') === selectedDay);
      payablesData = filteredDataForPie.filter(row => row.type === 'payables' && row.date_field && String(Number(row.date_field.split('-')[2])).padStart(2, '0') === selectedDay);
      unfilteredReceivablesData = unfilteredDataForPie.filter(row => row.type === 'receivables' && row.date_field && String(Number(row.date_field.split('-')[2])).padStart(2, '0') === selectedDay);
      unfilteredPayablesData = unfilteredDataForPie.filter(row => row.type === 'payables' && row.date_field && String(Number(row.date_field.split('-')[2])).padStart(2, '0') === selectedDay);
    } else {
      // Fallback: tudo
      receivablesData = filteredDataForPie.filter(row => row.type === 'receivables');
      payablesData = filteredDataForPie.filter(row => row.type === 'payables');
      unfilteredReceivablesData = unfilteredDataForPie.filter(row => row.type === 'receivables');
      unfilteredPayablesData = unfilteredDataForPie.filter(row => row.type === 'payables');
    }

    let labels: string[] = [];
    let data: number[] = [];
    let comparisonMetrics = null;

    if (selectedGroup === 'all') {
      if (separateAging) {
        // Quando separateAging está ativo, agrupar por aging intervals
        const receivablesAgingTotals: Record<string, number> = {};
        const payablesAgingTotals: Record<string, number> = {};
        // Processar receivables por aging
        receivablesData.forEach(row => {
          if (row.aging_intervals) {
            receivablesAgingTotals[row.aging_intervals] = (receivablesAgingTotals[row.aging_intervals] || 0) + row.open_balance;
          }
        });
        // Processar payables por aging
        payablesData.forEach(row => {
          if (row.aging_intervals) {
            payablesAgingTotals[row.aging_intervals] = (payablesAgingTotals[row.aging_intervals] || 0) + row.open_balance;
          }
        });
        // Combinar labels e dados
        const allAgingLabels = [...new Set([...Object.keys(receivablesAgingTotals), ...Object.keys(payablesAgingTotals)])];
        allAgingLabels.forEach(aging => {
          const receivablesValue = receivablesAgingTotals[aging] || 0;
          const payablesValue = payablesAgingTotals[aging] || 0;
          if (receivablesValue > 0) {
            labels.push(`Receivables - ${aging}`);
            data.push(receivablesValue);
          }
          if (payablesValue > 0) {
            labels.push(`Payables - ${aging}`);
            data.push(payablesValue);
          }
        });
      } else {
        // Lógica original para quando separateAging está desativado
        let receivablesTotal = 0;
        let payablesTotal = 0;
        // Receivables: menor open_balance por inv_num
        const receivablesByInv: Record<string, number> = {};
        receivablesData.forEach(row => {
          if (!row.inv_num) return;
          if (!(row.inv_num in receivablesByInv)) receivablesByInv[row.inv_num] = row.open_balance;
          else receivablesByInv[row.inv_num] = Math.min(receivablesByInv[row.inv_num], row.open_balance);
        });
        receivablesTotal = Object.values(receivablesByInv).reduce((sum, v) => sum + v, 0);
        // Payables: menor open_balance por bill_num
        const payablesByBill: Record<string, number> = {};
        payablesData.forEach(row => {
          if (!row.bill_num) return;
          if (!(row.bill_num in payablesByBill)) payablesByBill[row.bill_num] = row.open_balance;
          else payablesByBill[row.bill_num] = Math.min(payablesByBill[row.bill_num], row.open_balance);
        });
        payablesTotal = Object.values(payablesByBill).reduce((sum, v) => sum + v, 0);
        labels = ['Receivables', 'Payables'];
        data = [receivablesTotal, payablesTotal];
      }
    } else {
      // Lógica para Receivables ou Payables específicos
      const typeData = selectedGroup === 'receivables' ? receivablesData : payablesData;
      const unfilteredTypeData = selectedGroup === 'receivables' ? unfilteredReceivablesData : unfilteredPayablesData;
      
      if (groupBy === 'category') {
        // Agrupar por categoria - usar lógica de transação única
        const categoryTotals: Record<string, number> = {};
        const categoryByTransaction: Record<string, Record<string, number>> = {};
        
        typeData.forEach(row => {
          if (row.category) {
            const transactionKey = selectedGroup === 'receivables' ? row.inv_num : row.bill_num;
            if (!transactionKey) return;
            
            if (!categoryByTransaction[row.category]) {
              categoryByTransaction[row.category] = {};
            }
            
            // Para cada transação, pegar o menor open_balance
            if (!categoryByTransaction[row.category][transactionKey] || 
                row.open_balance < categoryByTransaction[row.category][transactionKey]) {
              categoryByTransaction[row.category][transactionKey] = row.open_balance;
            }
          }
        });
        
        // Calcular totais por categoria
        Object.keys(categoryByTransaction).forEach(category => {
          categoryTotals[category] = Object.values(categoryByTransaction[category]).reduce((sum, val) => sum + val, 0);
        });
        
        if (compareWithTotal) {
          // Mostrar dados filtrados + total do restante
          labels = [];
          data = [];
          
          // Verificar se há filtros de categoria aplicados (dos filtros superiores)
          const hasCategoryFilters = selectedGroup === 'receivables' 
            ? selectedReceivablesCategories.length > 0 
            : selectedPayablesCategories.length > 0;
          
          if (hasCategoryFilters) {
            // Se há filtros de categoria dos filtros superiores, usar apenas as categorias filtradas
            const selectedCategories = selectedGroup === 'receivables' ? selectedReceivablesCategories : selectedPayablesCategories;
            const filteredCategoryTotals: Record<string, number> = {};
            
            selectedCategories.forEach(category => {
              if (categoryTotals[category]) {
                filteredCategoryTotals[category] = categoryTotals[category];
              }
            });
            
            // Adicionar categorias filtradas
            Object.keys(filteredCategoryTotals).forEach(category => {
              const value = filteredCategoryTotals[category];
              if (value > 0) {
                labels.push(category);
                data.push(value);
              }
            });
            
            // Calcular total do restante (categorias não selecionadas)
            const totalFilteredValue = Object.values(filteredCategoryTotals).reduce((sum, val) => sum + val, 0);
            const totalAllCategories = sumByMinTransaction(unfilteredTypeData, selectedGroup);
            const remainingValue = totalAllCategories - totalFilteredValue;
            
            // Adicionar categoria "Total" se houver valor restante
            if (remainingValue > 0) {
              labels.push('Total');
              data.push(remainingValue);
            }
            
            // Calcular métricas de comparação
            const percentage = totalAllCategories > 0 ? (totalFilteredValue / totalAllCategories) * 100 : 0;
            comparisonMetrics = {
              filteredValue: totalFilteredValue,
              totalValue: totalAllCategories,
              percentage: percentage
            };
          } else {
            // Sem filtro de categorias, mostrar todas as categorias + total geral
            // Para simular o "Compare with total", vamos mostrar as categorias principais + uma categoria "Total"
            const sortedCategories = Object.entries(categoryTotals)
              .sort(([,a], [,b]) => b - a) // Ordenar por valor decrescente
              .filter(([,value]) => value > 0);
            
            // Mostrar apenas as 3 primeiras categorias + Total
            const topCategories = sortedCategories.slice(0, 3);
            const remainingCategories = sortedCategories.slice(3);
            
            // Adicionar categorias principais
            topCategories.forEach(([category, value]) => {
              labels.push(category);
              data.push(value);
            });
            
            // Calcular total do restante
            const totalTopCategories = topCategories.reduce((sum, [,value]) => sum + value, 0);
            const totalRemainingCategories = remainingCategories.reduce((sum, [,value]) => sum + value, 0);
            
            // Adicionar categoria "Total" se houver valor restante
            if (totalRemainingCategories > 0) {
              labels.push('Total');
              data.push(totalRemainingCategories);
            }
            
            // Calcular métricas de comparação
            const totalAllCategories = sumByMinTransaction(unfilteredTypeData, selectedGroup);
            const filteredValue = totalTopCategories;
            const percentage = totalAllCategories > 0 ? (filteredValue / totalAllCategories) * 100 : 0;
            
            comparisonMetrics = {
              filteredValue: filteredValue,
              totalValue: totalAllCategories,
              percentage: percentage
            };
          }
        } else {
          // Sem comparação, mostrar apenas dados filtrados ou todos
          const hasCategoryFilters = selectedGroup === 'receivables' 
            ? selectedReceivablesCategories.length > 0 
            : selectedPayablesCategories.length > 0;
            
          if (hasCategoryFilters) {
            const selectedCategories = selectedGroup === 'receivables' ? selectedReceivablesCategories : selectedPayablesCategories;
            const filteredCategoryTotals: Record<string, number> = {};
            
            selectedCategories.forEach(category => {
              if (categoryTotals[category]) {
                filteredCategoryTotals[category] = categoryTotals[category];
              }
            });
            
            labels = Object.keys(filteredCategoryTotals);
            data = Object.values(filteredCategoryTotals);
          } else {
            // Sem filtro de categorias, mostrar apenas totais
            labels = Object.keys(categoryTotals);
            data = Object.values(categoryTotals);
          }
        }
      } else if (groupBy === 'aging') {
        // Agrupar por aging interval - usar lógica de transação única
        const agingTotals: Record<string, number> = {};
        const agingByTransaction: Record<string, Record<string, number>> = {};
        
        typeData.forEach(row => {
          if (row.aging_intervals) {
            const transactionKey = selectedGroup === 'receivables' ? row.inv_num : row.bill_num;
            if (!transactionKey) return;
            
            if (!agingByTransaction[row.aging_intervals]) {
              agingByTransaction[row.aging_intervals] = {};
            }
            
            // Para cada transação, pegar o menor open_balance
            if (!agingByTransaction[row.aging_intervals][transactionKey] || 
                row.open_balance < agingByTransaction[row.aging_intervals][transactionKey]) {
              agingByTransaction[row.aging_intervals][transactionKey] = row.open_balance;
            }
          }
        });
        
        // Calcular totais por aging
        Object.keys(agingByTransaction).forEach(aging => {
          agingTotals[aging] = Object.values(agingByTransaction[aging]).reduce((sum, val) => sum + val, 0);
        });
        
        if (compareWithTotal) {
          // Mostrar dados filtrados + total do restante
          labels = [];
          data = [];
          
          // Verificar se há filtros de aging aplicados (dos filtros superiores)
          const hasAgingFilters = selectedAging.length > 0;
          
          if (hasAgingFilters) {
            // Se há filtros de aging dos filtros superiores, usar apenas os aging intervals filtrados
            const filteredAgingTotals: Record<string, number> = {};
            
            selectedAging.forEach(aging => {
              if (agingTotals[aging]) {
                filteredAgingTotals[aging] = agingTotals[aging];
              }
            });
            
            // Adicionar aging intervals filtrados
            Object.keys(filteredAgingTotals).forEach(aging => {
              const value = filteredAgingTotals[aging];
              if (value > 0) {
                labels.push(aging);
                data.push(value);
              }
            });
            
            // Calcular total do restante (aging intervals não selecionados)
            const totalFilteredValue = Object.values(filteredAgingTotals).reduce((sum, val) => sum + val, 0);
            const totalAllAging = sumByMinTransaction(unfilteredTypeData, selectedGroup);
            const remainingValue = totalAllAging - totalFilteredValue;
            
            // Adicionar categoria "Total" se houver valor restante
            if (remainingValue > 0) {
              labels.push('Total');
              data.push(remainingValue);
            }
            
            // Calcular métricas de comparação
            const percentage = totalAllAging > 0 ? (totalFilteredValue / totalAllAging) * 100 : 0;
            comparisonMetrics = {
              filteredValue: totalFilteredValue,
              totalValue: totalAllAging,
              percentage: percentage
            };
          } else {
            // Sem filtro de aging, mostrar todos os aging intervals + total geral
            // Para simular o "Compare with total", vamos mostrar os aging intervals principais + uma categoria "Total"
            const sortedAging = Object.entries(agingTotals)
              .sort(([,a], [,b]) => b - a) // Ordenar por valor decrescente
              .filter(([,value]) => value > 0);
            
            // Mostrar apenas os 3 primeiros aging intervals + Total
            const topAging = sortedAging.slice(0, 3);
            const remainingAging = sortedAging.slice(3);
            
            // Adicionar aging intervals principais
            topAging.forEach(([aging, value]) => {
              labels.push(aging);
              data.push(value);
            });
            
            // Calcular total do restante
            const totalTopAging = topAging.reduce((sum, [,value]) => sum + value, 0);
            const totalRemainingAging = remainingAging.reduce((sum, [,value]) => sum + value, 0);
            
            // Adicionar categoria "Total" se houver valor restante
            if (totalRemainingAging > 0) {
              labels.push('Total');
              data.push(totalRemainingAging);
            }
            
            // Calcular métricas de comparação
            const totalAllAging = sumByMinTransaction(unfilteredTypeData, selectedGroup);
            const filteredValue = totalTopAging;
            const percentage = totalAllAging > 0 ? (filteredValue / totalAllAging) * 100 : 0;
            
            comparisonMetrics = {
              filteredValue: filteredValue,
              totalValue: totalAllAging,
              percentage: percentage
            };
          }
        } else {
          // Sem comparação, mostrar apenas dados filtrados ou todos
          const hasAgingFilters = selectedAging.length > 0;
          
          if (hasAgingFilters) {
            const filteredAgingTotals: Record<string, number> = {};
            
            selectedAging.forEach(aging => {
              if (agingTotals[aging]) {
                filteredAgingTotals[aging] = agingTotals[aging];
              }
            });
            
            labels = Object.keys(filteredAgingTotals);
            data = Object.values(filteredAgingTotals);
          } else {
            // Sem filtro de aging, mostrar apenas totais
            labels = Object.keys(agingTotals);
            data = Object.values(agingTotals);
          }
        }
      }
    }

    // Filtrar apenas valores > 0
    const validIndices = data.map((value, index) => ({ value, index })).filter(item => item.value > 0);
    labels = validIndices.map(item => labels[item.index]);
    data = validIndices.map(item => item.value);
    
    // Gerar cores baseado no tipo de dados
    let colors: string[];
    if (selectedGroup === 'all') {
      if (separateAging) {
        // Quando separateAging está ativo, usar cores baseadas no tipo (Receivables/Payables)
        // Primeiro, identificar quantos aging intervals únicos existem
        const receivablesAgingCount = new Set(labels.filter(label => label.startsWith('Receivables')).map(label => label.replace('Receivables - ', ''))).size;
        const payablesAgingCount = new Set(labels.filter(label => label.startsWith('Payables')).map(label => label.replace('Payables - ', ''))).size;
        
        // Gerar cores para receivables e payables
        const receivablesColors = generateCoolColors(receivablesAgingCount);
        const payablesColors = generateWarmColors(payablesAgingCount);
        
        // Mapear cores para cada label
        const receivablesColorMap = new Map<string, string>();
        const payablesColorMap = new Map<string, string>();
        
        let receivablesIndex = 0;
        let payablesIndex = 0;
        
        labels.forEach(label => {
          if (label.startsWith('Receivables')) {
            const aging = label.replace('Receivables - ', '');
            if (!receivablesColorMap.has(aging)) {
              receivablesColorMap.set(aging, receivablesColors[receivablesIndex % receivablesColors.length]);
              receivablesIndex++;
            }
          } else if (label.startsWith('Payables')) {
            const aging = label.replace('Payables - ', '');
            if (!payablesColorMap.has(aging)) {
              payablesColorMap.set(aging, payablesColors[payablesIndex % payablesColors.length]);
              payablesIndex++;
            }
          }
        });
        
        colors = labels.map(label => {
          if (label.startsWith('Receivables')) {
            const aging = label.replace('Receivables - ', '');
            return receivablesColorMap.get(aging) || generateCoolColors(1)[0];
          } else {
            const aging = label.replace('Payables - ', '');
            return payablesColorMap.get(aging) || generateWarmColors(1)[0];
          }
        });
      } else {
        // Quando separateAging está desativado, usar cores específicas para Receivables e Payables
        colors = [RECEIVABLES_COLOR, PAYABLES_COLOR];
      }
    } else {
      // Para Receivables ou Payables específicos
      if (compareWithTotal) {
        // Quando comparando com total, usar cores para itens filtrados + cor especial para Total
        const filteredLabels = labels.filter(label => label !== 'Total');
        const baseColors = selectedGroup === 'receivables' 
          ? generateCoolColors(filteredLabels.length)
          : generateWarmColors(filteredLabels.length);
        
        colors = labels.map((label) => {
          if (label === 'Total') {
            // Cor especial para Total (mais escura)
            return selectedGroup === 'receivables' ? '#1e3a8a' : '#991b1b';
          } else {
            // Cor normal para itens filtrados
            const index = filteredLabels.indexOf(label);
            return baseColors[index % baseColors.length];
          }
        });
      } else {
        // Comportamento normal
        colors = selectedGroup === 'receivables' 
          ? generateCoolColors(labels.length)
          : generateWarmColors(labels.length);
      }
    }

    const doughnutData = {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors.map(color => color + '80'),
        borderWidth: 2,
        hoverBorderWidth: 3,
      }]
    };

    const doughnutOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: {
            color: textSecondary,
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 15,
          }
        },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            // Capturar o canvas do gráfico
            if (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) {
              setPieChartCanvas((context.chart as { canvas: HTMLCanvasElement }).canvas);
            }
            
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setPieTooltip(null);
              return;
            }
            
            if (doughnutData) {
              setPieTooltip({
                tooltip: context.tooltip as {
                  opacity: number;
                  caretX: number;
                  caretY: number;
                  labelColors: Array<{
                    backgroundColor: string;
                    borderColor: string;
                  }>;
                  dataPoints: Array<{
                    dataIndex: number;
                    datasetIndex: number;
                    label: string;
                    value: number;
                    formattedValue: string;
                  }>;
                },
                year: selectedYear,
                month: selectedMonth,
                day: selectedDay,
                selectedGroup,
                groupBy,
                compareWithTotal,
                separateAging,
                chartData: doughnutData,
                chartCanvas: pieChartCanvas,
              });
            }
          }
        },
        customCanvasBackgroundColor: {
          color: 'transparent',
        }
      }
    };

    // Verificar se há dados válidos para o gráfico de pizza
    const hasPieData = data.length > 0 && data.some(value => value > 0);

    return { doughnutData, doughnutOptions, comparisonMetrics, hasPieData };
  }, [filteredData, selectedGroup, groupBy, selectedAging, selectedDay, compareWithTotal, separateAging, selectedReceivablesCategories, selectedPayablesCategories, unfilteredDataForChart]);

  // Notificar mudanças nas métricas de comparação
  React.useEffect(() => {
    if (onComparisonMetricsChange) {
      onComparisonMetricsChange(comparisonMetrics);
    }
  }, [comparisonMetrics, onComparisonMetricsChange]);

  // Reset selectedCustomers quando groupBy mudar
  React.useEffect(() => {
    // Removido - não é mais necessário
  }, [groupBy]);

  // Efeito para forçar separateAging quando groupBy é 'aging' no Pie Chart
  React.useEffect(() => {
    if (onForceSeparateAging) {
      if (chartType === 'pie' && groupBy === 'aging') {
        onForceSeparateAging(true);
      } else {
        onForceSeparateAging(false);
      }
    }
  }, [chartType, groupBy, onForceSeparateAging]);

  // Efeito para resetar controles quando sair do Pie Chart
  React.useEffect(() => {
    if (chartType === 'line') {
      // Resetar filtro de dia para "All"
      setSelectedDay('');
      // Desligar comparação com total
      setCompareWithTotal(false);
    }
  }, [chartType, setSelectedDay]);

  // Função para lidar com hover do elemento do gráfico usando API do Chart.js
  const handleElementHover = React.useCallback((element: {
    index: number;
    datasetIndex: number;
    label: string;
    value: number;
    color: string;
    percentage: number;
    position: { x: number; y: number };
  } | null) => {
    if (element) {
      // Criar tooltip personalizado com dados do elemento focado
      setPieTooltip({
        tooltip: {
          opacity: 1,
          caretX: element.position.x,
          caretY: element.position.y,
          labelColors: [{
            backgroundColor: element.color,
            borderColor: element.color
          }],
          dataPoints: [{
            dataIndex: element.index,
            datasetIndex: element.datasetIndex,
            label: element.label,
            value: element.value,
            formattedValue: `$${element.value.toLocaleString()}`
          }]
        },
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
        selectedGroup,
        groupBy,
        compareWithTotal,
        separateAging,
        chartData: doughnutData,
        chartCanvas: pieChartCanvas,
      });
    } else {
      setPieTooltip(null);
    }
  }, [selectedYear, selectedMonth, selectedDay, selectedGroup, groupBy, compareWithTotal, separateAging, doughnutData, pieChartCanvas]);

  // Remover lógica de customers - não é mais necessária
  // const availableCustomers = useMemo(() => {
  //   const customers = new Set<string>();
  //   filteredData.forEach(row => {
  //     if (row.open_balance > 0) {
  //       if (selectedGroup === 'receivables' && row.customer_full_name) {
  //         customers.add(row.customer_full_name);
  //       } else if (selectedGroup === 'payables' && row.vendor_display_name) {
  //         customers.add(row.vendor_display_name);
  //       }
  //     }
  //   });
  //   return Array.from(customers).sort();
  // }, [filteredData, selectedGroup]);



  return (
    <>
      <div className='px-4 py-2 d-flex justify-content-between align-items-center' style={{ borderBottom: '1px solid var(--color-border-divider)'  }}>
        <h4 className='m-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          {chartType === 'line' 
            ? (separateAging ? 'Balances by Aging Interval Over Time' : 
              selectedGroup === 'all' ? 'Balances Over Time' : 
              selectedGroup === 'receivables' ? 'Receivables Trend' : 
              'Payables Trend')
            : 'Category Distribution Analysis'
          }
        </h4>

        {/* Select para seleção do tipo de gráfico */}
        <div className='d-flex justify-content-end'>
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

      </div>
      
      {chartType === 'line' ? (
        hasData ? (
          <AccountingLineChart chartData={chartData} chartOptions={chartOptions} />
        ) : (
          <NoDataMessage 
            title="Nenhum dado disponível"
            message="Não foram encontrados dados para os filtros selecionados. Tente ajustar os filtros de ano, mês, grupo ou aging intervals."
            icon="bi-graph-up"
          />
        )
      ) : (
        <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
          <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 0 }}>
            {/* Filtros */}
            <div style={{ width: 340, minWidth: 260, maxWidth: 400, display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100%', padding: 10, borderRight: '1px solid var(--color-border-divider)' }}>
              {/* Título dos controles */}
              <div style={{ marginBottom: 20 }}>
                <h5 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  Controls
                </h5>
              </div>

              {/* Dropdown de dias disponíveis - sempre visível, mas botão desabilitado quando não há mês */}
              <div style={{ marginBottom: 16 }}>
                <div className="input-group" style={{ 
                  width: '100%', 
                  background: 'var(--color-background-primary)', 
                  borderRadius: 8, 
                  border: '1.5px solid var(--color-border-divider)', 
                  overflow: 'hidden', 
                  height: 38, 
                  zIndex: 20, 
                  display: 'flex'
                }}>
                  <span className="input-group-text d-flex align-items-center justify-content-center" style={{ 
                    background: 'var(--color-background-secondary)', 
                    border: 'none', 
                    borderRight: '1.5px solid var(--color-border-divider)', 
                    height: 38, 
                    width: 42, 
                    padding: 0, 
                    color: 'var(--color-accent-primary)', 
                    borderTopLeftRadius: 8, 
                    borderBottomLeftRadius: 8, 
                    borderTopRightRadius: 0, 
                    borderBottomRightRadius: 0
                  }}>
                    <i className="bi bi-calendar-day" style={{ fontSize: 17 }} />
                  </span>
                  <div style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    zIndex: 21, 
                    borderTopRightRadius: 8, 
                    borderBottomRightRadius: 8, 
                    borderTopLeftRadius: 0, 
                    borderBottomLeftRadius: 0, 
                    height: 38,
                    background: 'var(--color-background-primary)',
                    opacity: selectedYear && selectedMonth ? 1 : 0.5,
                    pointerEvents: selectedYear && selectedMonth ? 'auto' : 'none',
                    transition: 'opacity 0.2s ease'
                  }}>
                    <DayDropdown
                      selectedDay={selectedDay}
                      onDayChange={setSelectedDay}
                      availableDays={selectedYear && selectedMonth ? diasComDados : []}
                    />
                  </div>
                </div>
                {(!selectedYear || !selectedMonth) && (
                  <div style={{ 
                    color: 'var(--color-text-secondary)', 
                    fontSize: 12, 
                    marginTop: 6, 
                    lineHeight: 1.4,
                    fontStyle: 'italic'
                  }}>
                    Selecione um mês para filtrar por dia
                  </div>
                )}
              </div>

              {/* Texto informativo se selectedGroup === 'all' - movido para depois do filtro diário */}
              {selectedGroup === 'all' && (
                <div style={{ 
                  color: 'var(--color-text-secondary)', 
                  fontSize: 12, 
                  marginBottom: 16, 
                  lineHeight: 1.4,
                  fontStyle: 'italic'
                }}>
                  Para aumentar a granularidade da comparação, selecione Receivables ou Payables
                </div>
              )}

              {/* Group By - apenas se não for 'all' */}
              {selectedGroup !== 'all' && (
                <div style={{ marginBottom: 16 }}>
                  <div className="input-group" style={{ width: '100%', background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
                    <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                      <i className="bi bi-diagram-3" style={{ fontSize: 17 }} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
                      <GroupByDropdown
                        groupBy={groupBy}
                        onGroupByChange={setGroupBy}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Remover filtro de Customer/Vendor - não é mais necessário */}

              {/* Botão ON/OFF de comparação - apenas se não for 'all' */}
              {selectedGroup !== 'all' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1.5px solid var(--color-border-divider)', height: 38, width: '100%', marginBottom: 16 }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, flex: 1, textAlign: 'left'}}>Compare with total</span>
                  <button 
                    onClick={() => setCompareWithTotal(!compareWithTotal)} 
                    style={{ 
                      background: compareWithTotal ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', 
                      color: compareWithTotal ? '#fff' : 'var(--color-accent-primary)', 
                      border: '1.5px solid var(--color-border-divider)', 
                      borderRadius: 15, 
                      padding: '4px 16px', 
                      fontWeight: 500, 
                      fontSize: 14, 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 60
                    }}
                    onMouseEnter={e => {
                      if (!compareWithTotal) {
                        e.currentTarget.style.background = 'var(--color-background-primary)';
                        e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = compareWithTotal ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                    }}
                  >
                    {compareWithTotal ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>

            {/* Gráfico centralizado e legenda à direita */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0 }}>
              {hasPieData ? (
                <>
                  <div style={{ width: '100%', maxWidth: 500, minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{height: '100%', width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <AccountingPieChart
                        doughnutData={doughnutData}
                        doughnutOptions={{ ...doughnutOptions, plugins: { ...doughnutOptions.plugins, legend: { ...doughnutOptions.plugins.legend, display: false } } }}
                        onElementHover={handleElementHover}
                      />
                    </div>
                  </div>
                  <div style={{ width: 600, maxHeight: 350, display: 'flex', flexDirection: 'column' }}>
                    {/* Título fixo da legenda */}
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 10, flex: '0 0 auto' }}>
                      {selectedGroup === 'all' ? 'Receivables vs Payables' : 'Categories ordered by value'}
                    </div>
                    {/* Legenda customizada com overflowY */}
                    <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                      {doughnutData.labels && doughnutData.labels.length > 0 && (() => {
                        // Ordenar as categorias pelo valor (decrescente)
                        const legendItems = doughnutData.labels.map((label, idx) => ({
                          label: (compareWithTotal && label === 'Total') ? 'Remaining' : label,
                          value: doughnutData.datasets[0].data && doughnutData.datasets[0].data[idx] ? Number(doughnutData.datasets[0].data[idx]) : 0,
                          color: doughnutData.datasets[0].backgroundColor ? (Array.isArray(doughnutData.datasets[0].backgroundColor) ? doughnutData.datasets[0].backgroundColor[idx] : doughnutData.datasets[0].backgroundColor) : '#ccc',
                        }));
                        legendItems.sort((a, b) => b.value - a.value);

                        if (selectedGroup === 'all') {
                          // Separar recebíveis e pagáveis
                          const receivablesItems = legendItems.filter(item => 
                            (item.label as string).startsWith('Receivables') || 
                            (item.label as string) === 'Receivables'
                          );
                          const payablesItems = legendItems.filter(item => 
                            (item.label as string).startsWith('Payables') || 
                            (item.label as string) === 'Payables'
                          );

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {/* Lista Receivables */}
                              <ul style={{ listStyle: 'none', margin: '0 10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {receivablesItems.map((item) => (
                                  <li key={item.label as string} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: item.color, marginRight: 6 }} />
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'left' }}>{item.label}</span>
                                    <span style={{ color: 'var(--color-text-primary)', fontSize: 13, marginLeft: 4, textAlign: 'right' }}>
                                      {item.value ? `$${item.value.toLocaleString()}` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>

                              {/* Barra separadora */}
                              {receivablesItems.length > 0 && payablesItems.length > 0 && (
                                <div style={{ 
                                  height: 1, 
                                  background: 'var(--color-border-divider)', 
                                  width: '100%' 
                                }} />
                              )}

                              {/* Lista Payables */}
                              <ul style={{ listStyle: 'none', margin: '0 10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {payablesItems.map((item) => (
                                  <li key={item.label as string} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: item.color, marginRight: 6 }} />
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'left' }}>{item.label}</span>
                                    <span style={{ color: 'var(--color-text-primary)', fontSize: 13, marginLeft: 4, textAlign: 'right' }}>
                                      {item.value ? `$${item.value.toLocaleString()}` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        } else {
                          // Comportamento original para outros tipos
                          return (
                            <ul style={{ listStyle: 'none', margin: '0 10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {legendItems.map((item) => (
                                <li key={item.label as string} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                                  <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: item.color, marginRight: 6 }} />
                                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'left' }}>{item.label}</span>
                                  <span style={{ color: 'var(--color-text-primary)', fontSize: 13, marginLeft: 4, textAlign: 'right' }}>
                                    {item.value ? `$${item.value.toLocaleString()}` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
                  <NoDataMessage
                    title="Nenhum dado disponível"
                    message="Não foram encontrados dados para os filtros selecionados. Tente ajustar os filtros de ano, mês, grupo ou aging intervals."
                    icon="bi-pie-chart"
                  />
                </div>
              )}
            </div>
          </div>
          

        </div>
      )}

      {/* Tooltip externo */}
      {externalTooltip && (
        <AccountingTooltipExternal
          {...externalTooltip}
          tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
          chartLabels={externalTooltip.chartLabels || []}
          year={externalTooltip.year || ''}
          month={externalTooltip.month || ''}
          canvas={externalTooltip.canvas}
          data={externalTooltip.data || []}
          selectedGroup={externalTooltip.selectedGroup || 'all'}
          separateAging={externalTooltip.separateAging || false}
        />
      )}

      {/* Tooltip do Pie Chart */}
      {pieTooltip && (
        <PieChartTooltipExternal
          tooltip={(pieTooltip.tooltip as {
            opacity: number;
            caretX: number;
            caretY: number;
            labelColors: Array<{
              backgroundColor: string;
              borderColor: string;
            }>;
            dataPoints: Array<{
              dataIndex: number;
              datasetIndex: number;
              label: string;
              value: number;
              formattedValue: string;
            }>;
          }) || {
            opacity: 0,
            caretX: 0,
            caretY: 0,
            labelColors: [],
            dataPoints: []
          }}
          year={pieTooltip.year || ''}
          month={pieTooltip.month || ''}
          day={pieTooltip.day || ''}
          selectedGroup={pieTooltip.selectedGroup || 'all'}
          groupBy={pieTooltip.groupBy || 'category'}
          compareWithTotal={pieTooltip.compareWithTotal || false}
          separateAging={pieTooltip.separateAging || false}
          chartData={pieTooltip.chartData}
          chartCanvas={pieTooltip.chartCanvas}
        />
      )}
    </>
  );
}

// CustomerVendorDropdown removido - não é mais necessário

// Implementar DayDropdown antes do componente principal
function DayDropdown({ 
  selectedDay, 
  onDayChange,
  availableDays
}: {
  selectedDay: string;
  onDayChange: (day: string) => void;
  availableDays: string[];
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const getDisplayText = () => {
    if (!selectedDay) {
      return 'All';
    }
    return `Day ${selectedDay}`;
  };

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          background: !selectedDay ? 'var(--color-background-secondary)' : 'transparent',
          borderBottom: '1px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDayChange('');
          setOpen(false);
        }}
        onMouseEnter={(e) => {
          if (selectedDay) {
            e.currentTarget.style.background = 'var(--color-background-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = !selectedDay ? 'var(--color-background-secondary)' : 'transparent';
        }}
      >
        <i className="bi bi-calendar-check" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
        All
      </div>
      {availableDays.map(day => (
        <div
          key={day}
          style={{
            padding: '6px 12px',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            background: selectedDay === day ? 'var(--color-background-secondary)' : 'transparent',
            borderBottom: '1px solid var(--color-border-divider)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDayChange(day);
            setOpen(false);
          }}
          onMouseEnter={(e) => {
            if (selectedDay !== day) {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedDay === day ? 'var(--color-background-secondary)' : 'transparent';
          }}
        >
          <i className="bi bi-calendar-day" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          Day {day}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {getDisplayText()}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

// Implementar GroupByDropdown
function GroupByDropdown({ 
  groupBy, 
  onGroupByChange
}: {
  groupBy: 'category' | 'aging';
  onGroupByChange: (groupBy: 'category' | 'aging') => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const getDisplayText = () => {
    switch (groupBy) {
      case 'category':
        return 'Category';
      case 'aging':
        return 'Aging Interval';
      default:
        return 'Category';
    }
  };

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          background: groupBy === 'category' ? 'var(--color-background-secondary)' : 'transparent',
          borderBottom: '1px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onGroupByChange('category');
          setOpen(false);
        }}
        onMouseEnter={(e) => {
          if (groupBy !== 'category') {
            e.currentTarget.style.background = 'var(--color-background-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = groupBy === 'category' ? 'var(--color-background-secondary)' : 'transparent';
        }}
      >
        <i className="bi bi-tags" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
        Category
      </div>
      <div
        style={{
          padding: '6px 12px',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          background: groupBy === 'aging' ? 'var(--color-background-secondary)' : 'transparent',
          borderBottom: '1px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onGroupByChange('aging');
          setOpen(false);
        }}
        onMouseEnter={(e) => {
          if (groupBy !== 'aging') {
            e.currentTarget.style.background = 'var(--color-background-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = groupBy === 'aging' ? 'var(--color-background-secondary)' : 'transparent';
        }}
      >
        <i className="bi bi-clock-history" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
        Aging Interval
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {getDisplayText()}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

// Componente de mensagem amigável para ausência de dados
function NoDataMessage({ title, message, icon }: { title: string, message: string, icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
      {icon && <i className={`bi ${icon}`} style={{ fontSize: 48, marginBottom: 12, color: 'var(--color-accent-primary)' }} />}
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15 }}>{message}</div>
    </div>
  );
}

// Função utilitária para somar o menor open_balance por transação
function sumByMinTransaction(typeData: AccountingRow[], type: 'receivables' | 'payables' | 'all'): number {
  const map = new Map<string, number>();
  typeData.forEach((row: AccountingRow) => {
    const key = type === 'receivables' ? row.inv_num : row.bill_num;
    if (!key) return;
    if (!map.has(key)) map.set(key, row.open_balance);
    else map.set(key, Math.min(map.get(key)!, row.open_balance));
  });
  return Array.from(map.values()).reduce((sum, v) => sum + v, 0);
}