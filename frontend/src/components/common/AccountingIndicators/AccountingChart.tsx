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
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import type { AccountingRow } from '../../../types/accounting';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Tooltip customizado para o gráfico
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

const AccountingTooltipExternal = React.memo(function AccountingTooltipExternal({ 
  tooltip, 
  chartLabels, 
  year, 
  month, 
  canvas, 
  data,
  selectedGroup,
  separateAging
}: AccountingTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;
  let receivablesValue: number = 0;
  let payablesValue: number = 0;
  let agingValues: Array<{ label: string; value: number; color: string }> = [];

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
  }, [periodo, receivablesValue, payablesValue, agingValues]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  const label = chartLabels[dataIndex];

  // Calcular valores baseado nos dados do gráfico
  if (year && month) {
    const dia = label.padStart(2, '0');
    const rows = data.filter(row => row.date_field && row.date_field.split('-')[2] === dia);
    
    if (separateAging && selectedGroup !== 'payables') {
      // Separar por aging interval
      const agingIntervals = [...new Set(rows.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655'];
      
      agingValues = agingIntervals.map((aging, index) => {
        const value = rows
          .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        return {
          label: `Receivables - ${aging}`,
          value,
          color: colors[index % colors.length]
        };
      });
    } else {
      receivablesValue = rows
        .filter(d => d.type === 'receivables' && d.open_balance > 0)
        .reduce((sum, d) => sum + d.open_balance, 0);
    }
    
    if (selectedGroup !== 'receivables') {
      payablesValue = rows
        .filter(d => d.type === 'payables' && d.open_balance > 0)
        .reduce((sum, d) => sum + d.open_balance, 0);
    }
    
    periodo = dayjs(`${year}-${month}-${dia}`).format('DD/MM/YYYY');
  } else if (year) {
    const mes = label.padStart(2, '0');
    const rows = data.filter(row => row.date_field && row.date_field.split('-')[1] === mes);
    
    if (separateAging && selectedGroup !== 'payables') {
      // Separar por aging interval
      const agingIntervals = [...new Set(rows.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655'];
      
      agingValues = agingIntervals.map((aging, index) => {
        const value = rows
          .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        return {
          label: `Receivables - ${aging}`,
          value,
          color: colors[index % colors.length]
        };
      });
    } else {
      receivablesValue = rows
        .filter(d => d.type === 'receivables' && d.open_balance > 0)
        .reduce((sum, d) => sum + d.open_balance, 0);
    }
    
    if (selectedGroup !== 'receivables') {
      payablesValue = rows
        .filter(d => d.type === 'payables' && d.open_balance > 0)
        .reduce((sum, d) => sum + d.open_balance, 0);
    }
    
    periodo = dayjs(`${year}-${mes}-01`).format('MM/YYYY');
  }

  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 120 + (agingValues.length > 0 ? agingValues.length * 20 : 0);
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
        minWidth: 350,
        maxWidth: 450,
        zIndex: 9999,
        opacity: 0.9,
        pointerEvents: 'none',
        fontSize: 14,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      {periodo && <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', marginBottom: 8, fontSize: 15 }}>{`Período: ${periodo}`}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {agingValues.length > 0 ? (
          <>
            {agingValues.map((item, index) => {
              // Se aging, o index do tooltip é o mesmo do ponto focado
              const isFocused = dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === index;
              return (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%', 
                      backgroundColor: item.color,
                      flexShrink: 0
                    }} />
                    <span style={{ color: isFocused ? item.color : 'var(--color-text-secondary)', fontWeight: isFocused ? 700 : 400 }}>{item.label}</span>
                  </div>
                  <span style={{ color: isFocused ? item.color : 'var(--color-text-secondary)', fontWeight: isFocused ? 700 : 500 }}>{item.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
              );
            })}
            {selectedGroup === 'all' && (
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '8px 0' }} />
            )}
            {selectedGroup === 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    backgroundColor: '#dc3545',
                    flexShrink: 0
                  }} />
                  <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === agingValues.length ? '#dc3545' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === agingValues.length ? 700 : 400 }}>Payables</span>
                </div>
                <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === agingValues.length ? '#dc3545' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === agingValues.length ? 700 : 500 }}>{payablesValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            )}
          </>
        ) : (
          <>
            {selectedGroup !== 'payables' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    backgroundColor: '#1bbf5c',
                    flexShrink: 0
                  }} />
                  <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? '#1bbf5c' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? 700 : 400 }}>Receivables</span>
                </div>
                <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? '#1bbf5c' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? 700 : 500 }}>{receivablesValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            )}
            {selectedGroup === 'all' && (
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '8px 0' }} />
            )}
            {selectedGroup !== 'receivables' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    backgroundColor: '#dc3545',
                    flexShrink: 0
                  }} />
                  <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? '#dc3545' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? 700 : 400 }}>Payables</span>
                </div>
                <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? '#dc3545' : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? 700 : 500 }}>{payablesValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
});

interface AccountingChartProps {
  filteredData: AccountingRow[];
  selectedYear: string;
  selectedMonth: string;
  selectedGroup: 'all' | 'receivables' | 'payables';
  separateAging: boolean;
}

export function AccountingChart({ 
  filteredData, 
  selectedYear, 
  selectedMonth, 
  selectedGroup, 
  separateAging 
}: AccountingChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<AccountingTooltipExternalProps>>(null);

  // Preparar dados do gráfico
  const { chartData, chartOptions } = useMemo(() => {
    // Cores do tema
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textSecondary = isDark ? '#adb5bd' : '#6c757d';

    const chartLabels: string[] = [];
    const chartDatasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      pointBackgroundColor: string;
      pointBorderColor: string;
      pointRadius: number;
      pointHoverRadius: number;
      borderWidth: number;
      fill: boolean;
      tension: number;
    }> = [];

    if (selectedYear && selectedMonth) {
      // Gráfico dia a dia do mês selecionado
      const receivablesByDay: Record<string, number> = {};
      const payablesByDay: Record<string, number> = {};
      
      // Receivables: para cada dia, somar o menor open_balance de cada transação (inv_num)
      filteredData.filter(row => row.type === 'receivables' && !!row.date_field && row.date_field.split('-').length === 3 && row.open_balance > 0).forEach(row => {
        const dia = String(Number(row.date_field!.split('-')[2])).padStart(2, '0');
        const transaction = row.inv_num; // Código da transação
        const key = `${dia}-${transaction}`;
        if (!receivablesByDay[key] || row.open_balance < receivablesByDay[key]) {
          receivablesByDay[key] = row.open_balance;
        }
      });
      
      // Payables: para cada dia, somar o menor open_balance de cada transação (bill_num)
      filteredData.filter(row => row.type === 'payables' && !!row.date_field && row.date_field.split('-').length === 3 && row.open_balance > 0).forEach(row => {
        const dia = String(Number(row.date_field!.split('-')[2])).padStart(2, '0');
        const transaction = row.bill_num; // Código da transação
        const key = `${dia}-${transaction}`;
        if (!payablesByDay[key] || row.open_balance < payablesByDay[key]) {
          payablesByDay[key] = row.open_balance;
        }
      });
      
      // Agrupar por dia - somar todas as transações distintas
      const receivablesSumByDay: Record<string, number> = {};
      Object.keys(receivablesByDay).forEach(key => {
        const dia = key.split('-')[0];
        receivablesSumByDay[dia] = (receivablesSumByDay[dia] || 0) + receivablesByDay[key];
      });
      
      const payablesSumByDay: Record<string, number> = {};
      Object.keys(payablesByDay).forEach(key => {
        const dia = key.split('-')[0];
        payablesSumByDay[dia] = (payablesSumByDay[dia] || 0) + payablesByDay[key];
      });
      
      // Coletar todos os dias válidos presentes nos dados (com open_balance > 0)
      const diasValidosSet = new Set<string>();
      filteredData.forEach(row => {
        if (!!row.date_field && row.date_field.split('-').length === 3 && row.open_balance > 0) {
          const dia = String(Number(row.date_field.split('-')[2])).padStart(2, '0');
          diasValidosSet.add(dia);
        }
      });
      const diasComDados = Array.from(diasValidosSet).sort((a, b) => Number(a) - Number(b));
      chartLabels.push(...diasComDados);

      if (separateAging && selectedGroup !== 'payables') {
        // Separar receivables por aging interval
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
        
        agingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(dia => {
            // Para cada dia, pegar o menor open_balance de cada transação (inv_num) por aging
            const receivablesByDayAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${dia}-${transaction}`;
                if (!receivablesByDayAndAging[key] || d.open_balance < receivablesByDayAndAging[key]) {
                  receivablesByDayAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(receivablesByDayAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            pointBackgroundColor: colors[index % colors.length],
            pointBorderColor: colors[index % colors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (separateAging && selectedGroup !== 'receivables') {
        // Separar payables por aging interval
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = ['#dc3545', '#c82333', '#bd2130', '#a71e2a', '#721c24']; // Gradação de vermelho
        
        agingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(dia => {
            // Para cada dia, pegar o menor open_balance de cada transação (bill_num) por aging
            const payablesByDayAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${dia}-${transaction}`;
                if (!payablesByDayAndAging[key] || d.open_balance < payablesByDayAndAging[key]) {
                  payablesByDayAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(payablesByDayAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            pointBackgroundColor: colors[index % colors.length],
            pointBorderColor: colors[index % colors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (separateAging && selectedGroup === 'all') {
        // Separar ambos por aging interval quando "All" está selecionado
        const receivablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const payablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        
        const receivablesColors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
        const payablesColors = ['#dc3545', '#c82333', '#bd2130', '#a71e2a', '#721c24']; // Gradação de vermelho
        
        // Adicionar receivables por aging
        receivablesAgingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(dia => {
            // Para cada dia, pegar o menor open_balance de cada transação (inv_num) por aging
            const receivablesByDayAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${dia}-${transaction}`;
                if (!receivablesByDayAndAging[key] || d.open_balance < receivablesByDayAndAging[key]) {
                  receivablesByDayAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(receivablesByDayAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
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
          });
        });
        
        // Adicionar payables por aging
        payablesAgingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(dia => {
            // Para cada dia, pegar o menor open_balance de cada transação (bill_num) por aging
            const payablesByDayAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${dia}-${transaction}`;
                if (!payablesByDayAndAging[key] || d.open_balance < payablesByDayAndAging[key]) {
                  payablesByDayAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(payablesByDayAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: payablesColors[index % payablesColors.length],
            backgroundColor: payablesColors[index % payablesColors.length],
            pointBackgroundColor: payablesColors[index % payablesColors.length],
            pointBorderColor: payablesColors[index % payablesColors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (selectedGroup !== 'payables') {
        // Gráfico normal (receivables como linha única)
        const receivablesData: number[] = [];
        chartLabels.forEach(dia => {
          receivablesData.push(receivablesSumByDay[dia] || 0);
        });
        
        chartDatasets.push({
          label: 'Receivables',
          data: receivablesData,
          borderColor: '#1bbf5c',
          backgroundColor: '#1bbf5c',
          pointBackgroundColor: '#1bbf5c',
          pointBorderColor: '#1bbf5c',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        });
      }
      
      // Adicionar payables apenas se não estiver filtrando por receivables e não estiver separando por aging
      if (selectedGroup !== 'receivables' && !separateAging) {
        const payablesData: number[] = [];
        chartLabels.forEach(dia => {
          payablesData.push(payablesSumByDay[dia] || 0);
        });
        
        chartDatasets.push({
          label: 'Payables',
          data: payablesData,
          borderColor: '#dc3545',
          backgroundColor: '#dc3545',
          pointBackgroundColor: '#dc3545',
          pointBorderColor: '#dc3545',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        });
      }
    } else if (selectedYear) {
      // Gráfico mês a mês do ano selecionado
      const receivablesByMonth: Record<string, number> = {};
      const payablesByMonth: Record<string, number> = {};
      
      // Receivables: para cada mês, somar o menor open_balance de cada transação (inv_num)
      filteredData.filter(row => row.type === 'receivables' && !!row.date_field && row.date_field.split('-').length >= 2 && row.open_balance > 0).forEach(row => {
        const mes = String(Number(row.date_field!.split('-')[1])).padStart(2, '0');
        const transaction = row.inv_num; // Código da transação
        const key = `${mes}-${transaction}`;
        if (!receivablesByMonth[key] || row.open_balance < receivablesByMonth[key]) {
          receivablesByMonth[key] = row.open_balance;
        }
      });
      
      // Payables: para cada mês, somar o menor open_balance de cada transação (bill_num)
      filteredData.filter(row => row.type === 'payables' && !!row.date_field && row.date_field.split('-').length >= 2 && row.open_balance > 0).forEach(row => {
        const mes = String(Number(row.date_field!.split('-')[1])).padStart(2, '0');
        const transaction = row.bill_num; // Código da transação
        const key = `${mes}-${transaction}`;
        if (!payablesByMonth[key] || row.open_balance < payablesByMonth[key]) {
          payablesByMonth[key] = row.open_balance;
        }
      });
      
      // Agrupar por mês - somar todas as transações distintas
      const receivablesSumByMonth: Record<string, number> = {};
      Object.keys(receivablesByMonth).forEach(key => {
        const mes = key.split('-')[0];
        receivablesSumByMonth[mes] = (receivablesSumByMonth[mes] || 0) + receivablesByMonth[key];
      });
      
      const payablesSumByMonth: Record<string, number> = {};
      Object.keys(payablesByMonth).forEach(key => {
        const mes = key.split('-')[0];
        payablesSumByMonth[mes] = (payablesSumByMonth[mes] || 0) + payablesByMonth[key];
      });

      // Coletar todos os meses válidos presentes nos dados (com open_balance > 0)
      const mesesValidosSet = new Set<string>();
      filteredData.forEach(row => {
        if (!!row.date_field && row.date_field.split('-').length >= 2 && row.open_balance > 0) {
          const mes = String(Number(row.date_field.split('-')[1])).padStart(2, '0');
          mesesValidosSet.add(mes);
        }
      });
      const mesesComDados = Array.from(mesesValidosSet).sort((a, b) => Number(a) - Number(b));
      chartLabels.push(...mesesComDados);

      if (separateAging && selectedGroup !== 'payables') {
        // Separar receivables por aging interval
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
        
        agingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(mes => {
            // Para cada mês, pegar o menor open_balance de cada transação (inv_num) por aging
            const receivablesByMonthAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${mes}-${transaction}`;
                if (!receivablesByMonthAndAging[key] || d.open_balance < receivablesByMonthAndAging[key]) {
                  receivablesByMonthAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(receivablesByMonthAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Receivables - ${aging}`,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            pointBackgroundColor: colors[index % colors.length],
            pointBorderColor: colors[index % colors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (separateAging && selectedGroup !== 'receivables') {
        // Separar payables por aging interval
        const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const colors = ['#dc3545', '#c82333', '#bd2130', '#a71e2a', '#721c24']; // Gradação de vermelho
        
        agingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(mes => {
            // Para cada mês, pegar o menor open_balance de cada transação (bill_num) por aging
            const payablesByMonthAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${mes}-${transaction}`;
                if (!payablesByMonthAndAging[key] || d.open_balance < payablesByMonthAndAging[key]) {
                  payablesByMonthAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(payablesByMonthAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            pointBackgroundColor: colors[index % colors.length],
            pointBorderColor: colors[index % colors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (separateAging && selectedGroup === 'all') {
        // Separar ambos por aging interval quando "All" está selecionado
        const receivablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        const payablesAgingIntervals = [...new Set(filteredData.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
        
        const receivablesColors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
        const payablesColors = ['#dc3545', '#c82333', '#bd2130', '#a71e2a', '#721c24']; // Gradação de vermelho
        
        // Adicionar receivables por aging
        receivablesAgingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(mes => {
            // Para cada mês, pegar o menor open_balance de cada transação (inv_num) por aging
            const receivablesByMonthAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.inv_num;
                const key = `${mes}-${transaction}`;
                if (!receivablesByMonthAndAging[key] || d.open_balance < receivablesByMonthAndAging[key]) {
                  receivablesByMonthAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(receivablesByMonthAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
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
          });
        });
        
        // Adicionar payables por aging
        payablesAgingIntervals.forEach((aging, index) => {
          const data: number[] = [];
          chartLabels.forEach(mes => {
            // Para cada mês, pegar o menor open_balance de cada transação (bill_num) por aging
            const payablesByMonthAndAging: Record<string, number> = {};
            filteredData
              .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.date_field && String(Number(d.date_field.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
              .forEach(d => {
                const transaction = d.bill_num;
                const key = `${mes}-${transaction}`;
                if (!payablesByMonthAndAging[key] || d.open_balance < payablesByMonthAndAging[key]) {
                  payablesByMonthAndAging[key] = d.open_balance;
                }
              });
            const value = Object.values(payablesByMonthAndAging).reduce((sum, val) => sum + val, 0);
            data.push(value);
          });
          
          chartDatasets.push({
            label: `Payables - ${aging}`,
            data: data,
            borderColor: payablesColors[index % payablesColors.length],
            backgroundColor: payablesColors[index % payablesColors.length],
            pointBackgroundColor: payablesColors[index % payablesColors.length],
            pointBorderColor: payablesColors[index % payablesColors.length],
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          });
        });
      } else if (selectedGroup !== 'payables') {
        // Gráfico normal (receivables como linha única)
        const receivablesData: number[] = [];
        chartLabels.forEach(mes => {
          receivablesData.push(receivablesSumByMonth[mes] || 0);
        });
        
        chartDatasets.push({
          label: 'Receivables',
          data: receivablesData,
          borderColor: '#1bbf5c',
          backgroundColor: '#1bbf5c',
          pointBackgroundColor: '#1bbf5c',
          pointBorderColor: '#1bbf5c',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        });
      }
      
      // Adicionar payables apenas se não estiver filtrando por receivables e não estiver separando por aging
      if (selectedGroup !== 'receivables' && !separateAging) {
        const payablesData: number[] = [];
        chartLabels.forEach(mes => {
          payablesData.push(payablesSumByMonth[mes] || 0);
        });
        
        chartDatasets.push({
          label: 'Payables',
          data: payablesData,
          borderColor: '#dc3545',
          backgroundColor: '#dc3545',
          pointBackgroundColor: '#dc3545',
          pointBorderColor: '#dc3545',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
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

    return { chartData, chartOptions };
  }, [filteredData, selectedYear, selectedMonth, selectedGroup, separateAging]);

  return (
    <>
      <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
        {separateAging ? 'Outstanding Balances by Aging Interval Over Time' : 
         selectedGroup === 'all' ? 'Outstanding Balances Over Time' : 
         selectedGroup === 'receivables' ? 'Receivables Outstanding Trend' : 
         'Payables Outstanding Trend'}
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
    </>
  );
} 