import React, { useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import type { AccountingRow } from '../../types/accounting';
import {
  generateCoolColors,
  generateWarmColors,
  RECEIVABLES_COLOR,
  PAYABLES_COLOR
} from '../../utils/accountingColors';

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

export const AccountingTooltipExternal = React.memo(function AccountingTooltipExternal({ 
  tooltip, 
  chartLabels, 
  year, 
  month, 
  canvas, 
  data,
  selectedGroup,
  separateAging
}: AccountingTooltipExternalProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = useState<number>(320);

  let dataIndex: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;
  let receivablesValue: number = 0;
  let payablesValue: number = 0;
  const agingValues: Array<{ label: string; value: number; color: string }> = [];

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
  useLayoutEffect(() => {
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
    
    if (separateAging && selectedGroup === 'receivables') {
      // Receivables por aging
      const agingIntervals = [...new Set(rows.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = generateCoolColors(agingIntervals.length);
      agingIntervals.forEach((aging, index) => {
        const value = rows
          .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        agingValues.push({
          label: `Receivables - ${aging}`,
          value,
          color: colors[index]
        });
      });
    } else if (separateAging && selectedGroup === 'payables') {
      // Payables por aging
      const agingIntervals = [...new Set(rows.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = generateWarmColors(agingIntervals.length);
      agingIntervals.forEach((aging, index) => {
        const value = rows
          .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        agingValues.push({
          label: `Payables - ${aging}`,
          value,
          color: colors[index]
        });
      });
    } else if (separateAging && selectedGroup === 'all') {
      // Ambos
      const receivablesAgingIntervals = [...new Set(rows.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const payablesAgingIntervals = [...new Set(rows.filter(d => d.type === 'payables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const receivablesColors = generateCoolColors(receivablesAgingIntervals.length);
      const payablesColors = generateWarmColors(payablesAgingIntervals.length);
      receivablesAgingIntervals.forEach((aging, index) => {
        const value = rows
          .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        agingValues.push({
          label: `Receivables - ${aging}`,
          value,
          color: receivablesColors[index]
        });
      });
      payablesAgingIntervals.forEach((aging, index) => {
        const value = rows
          .filter(d => d.type === 'payables' && d.aging_intervals === aging && d.open_balance > 0)
          .reduce((sum, d) => sum + d.open_balance, 0);
        agingValues.push({
          label: `Payables - ${aging}`,
          value,
          color: payablesColors[index]
        });
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
    
    // Para cada tipo, encontrar o último dia registrado no mês
    const dadosRecebiveis = data.filter(row => 
      row.type === 'receivables' && 
      row.date_field && 
      String(Number(row.date_field.split('-')[1])).padStart(2, '0') === mes &&
      row.open_balance > 0
    );
    
    const dadosPagaveis = data.filter(row => 
      row.type === 'payables' && 
      row.date_field && 
      String(Number(row.date_field.split('-')[1])).padStart(2, '0') === mes &&
      row.open_balance > 0
    );
    
    if (separateAging && selectedGroup !== 'payables') {
      // Receivables por aging - usar último dia de recebíveis
      if (dadosRecebiveis.length > 0) {
        const ultimoDiaRecebiveis = Math.max(...dadosRecebiveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaRecebiveis = dadosRecebiveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaRecebiveis);
        
        const agingIntervals = [...new Set(dadosUltimoDiaRecebiveis.map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateCoolColors(agingIntervals.length);
      
        agingIntervals.forEach((aging, index) => {
          const receivablesByTransaction: Record<string, { value: number; date: string }> = {};
          dadosUltimoDiaRecebiveis
            .filter(d => d.aging_intervals === aging)
            .forEach(d => {
              const transaction = d.inv_num;
              const currentDate = d.date_field!;
              if (transaction && (!receivablesByTransaction[transaction] || currentDate > receivablesByTransaction[transaction].date)) {
                receivablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
              }
            });
          
          const value = Object.values(receivablesByTransaction).reduce((sum, val) => sum + val.value, 0);
          agingValues.push({
            label: `Receivables - ${aging}`,
            value,
            color: colors[index]
          });
        });
      }
    } else if (separateAging && selectedGroup !== 'receivables') {
      // Payables por aging - usar último dia de pagáveis
      if (dadosPagaveis.length > 0) {
        const ultimoDiaPagaveis = Math.max(...dadosPagaveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaPagaveis = dadosPagaveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaPagaveis);
        
        const agingIntervals = [...new Set(dadosUltimoDiaPagaveis.map(d => d.aging_intervals).filter(Boolean))];
        const colors = generateWarmColors(agingIntervals.length);
      
        agingIntervals.forEach((aging, index) => {
          const payablesByTransaction: Record<string, { value: number; date: string }> = {};
          dadosUltimoDiaPagaveis
            .filter(d => d.aging_intervals === aging)
            .forEach(d => {
              const transaction = d.bill_num;
              const currentDate = d.date_field!;
              if (transaction && (!payablesByTransaction[transaction] || currentDate > payablesByTransaction[transaction].date)) {
                payablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
              }
            });
          
          const value = Object.values(payablesByTransaction).reduce((sum, val) => sum + val.value, 0);
          agingValues.push({
            label: `Payables - ${aging}`,
            value,
            color: colors[index]
          });
        });
      }
    } else if (separateAging && selectedGroup === 'all') {
      // Ambos por aging - usar último dia de cada tipo
      const receivablesAgingIntervals = [...new Set(dadosRecebiveis.map(d => d.aging_intervals).filter(Boolean))];
      const payablesAgingIntervals = [...new Set(dadosPagaveis.map(d => d.aging_intervals).filter(Boolean))];
      
      const receivablesColors = generateCoolColors(receivablesAgingIntervals.length);
      const payablesColors = generateWarmColors(payablesAgingIntervals.length);
      
      // Receivables por aging
      if (dadosRecebiveis.length > 0) {
        const ultimoDiaRecebiveis = Math.max(...dadosRecebiveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaRecebiveis = dadosRecebiveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaRecebiveis);
        
        receivablesAgingIntervals.forEach((aging, index) => {
          const receivablesByTransaction: Record<string, { value: number; date: string }> = {};
          dadosUltimoDiaRecebiveis
            .filter(d => d.aging_intervals === aging)
            .forEach(d => {
              const transaction = d.inv_num;
              const currentDate = d.date_field!;
              if (transaction && (!receivablesByTransaction[transaction] || currentDate > receivablesByTransaction[transaction].date)) {
                receivablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
              }
            });
          
          const value = Object.values(receivablesByTransaction).reduce((sum, val) => sum + val.value, 0);
          agingValues.push({
            label: `Receivables - ${aging}`,
            value,
            color: receivablesColors[index % receivablesColors.length]
          });
        });
      }
      
      // Payables por aging
      if (dadosPagaveis.length > 0) {
        const ultimoDiaPagaveis = Math.max(...dadosPagaveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaPagaveis = dadosPagaveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaPagaveis);
        
        payablesAgingIntervals.forEach((aging, index) => {
          const payablesByTransaction: Record<string, { value: number; date: string }> = {};
          dadosUltimoDiaPagaveis
            .filter(d => d.aging_intervals === aging)
            .forEach(d => {
              const transaction = d.bill_num;
              const currentDate = d.date_field!;
              if (transaction && (!payablesByTransaction[transaction] || currentDate > payablesByTransaction[transaction].date)) {
                payablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
              }
            });
          
          const value = Object.values(payablesByTransaction).reduce((sum, val) => sum + val.value, 0);
          agingValues.push({
            label: `Payables - ${aging}`,
            value,
            color: payablesColors[index % payablesColors.length]
          });
        });
      }
    } else {
      // Gráfico normal - usar último dia de cada tipo
      if (dadosRecebiveis.length > 0) {
        const ultimoDiaRecebiveis = Math.max(...dadosRecebiveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaRecebiveis = dadosRecebiveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaRecebiveis);
        
        const receivablesByTransaction: Record<string, { value: number; date: string }> = {};
        dadosUltimoDiaRecebiveis.forEach(d => {
          const transaction = d.inv_num;
          const currentDate = d.date_field!;
          if (transaction && (!receivablesByTransaction[transaction] || currentDate > receivablesByTransaction[transaction].date)) {
            receivablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
          }
        });
        
        receivablesValue = Object.values(receivablesByTransaction).reduce((sum, val) => sum + val.value, 0);
      }
    }
    
    if (selectedGroup !== 'receivables') {
      if (dadosPagaveis.length > 0) {
        const ultimoDiaPagaveis = Math.max(...dadosPagaveis.map(d => Number(d.date_field!.split('-')[2])));
        const dadosUltimoDiaPagaveis = dadosPagaveis.filter(d => Number(d.date_field!.split('-')[2]) === ultimoDiaPagaveis);
        
        const payablesByTransaction: Record<string, { value: number; date: string }> = {};
        dadosUltimoDiaPagaveis.forEach(d => {
          const transaction = d.bill_num;
          const currentDate = d.date_field!;
          if (transaction && (!payablesByTransaction[transaction] || currentDate > payablesByTransaction[transaction].date)) {
            payablesByTransaction[transaction] = { value: d.open_balance, date: currentDate };
          }
        });
        
        payablesValue = Object.values(payablesByTransaction).reduce((sum, val) => sum + val.value, 0);
      }
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

  // Separar agingValues em dois arrays: receivablesAgingValues e payablesAgingValues
  const receivablesAgingValues = agingValues.filter(item => item.label.startsWith('Receivables'));
  const payablesAgingValues = agingValues.filter(item => item.label.startsWith('Payables'));



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
        minWidth: 400,
        maxWidth: 500,
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
            {/* Receivables aging */}
            {receivablesAgingValues.map((item, index) => {
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
            {/* Linha separadora se houver payables */}
            {payablesAgingValues.length > 0 && receivablesAgingValues.length > 0 && (
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '8px 0' }} />
            )}
            {/* Payables aging */}
            {payablesAgingValues.map((item, index) => {
              // O index do dataset para payables começa após os de receivables
              const datasetIndex = receivablesAgingValues.length > 0 ? receivablesAgingValues.length + index : index;
              const isFocused = dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === datasetIndex;
              return (
                <div key={datasetIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 0 }}>
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
                    backgroundColor: RECEIVABLES_COLOR,
                    flexShrink: 0
                  }} />
                  <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? RECEIVABLES_COLOR : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? 700 : 400 }}>Receivables</span>
                </div>
                <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? RECEIVABLES_COLOR : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 0 ? 700 : 500 }}>{receivablesValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            )}
            {selectedGroup === 'all' && receivablesValue > 0 && payablesValue > 0 && (
              <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '8px 0' }} />
            )}
            {selectedGroup !== 'receivables' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    backgroundColor: PAYABLES_COLOR,
                    flexShrink: 0
                  }} />
                  <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? PAYABLES_COLOR : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? 700 : 400 }}>Payables</span>
                </div>
                <span style={{ color: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? PAYABLES_COLOR : 'var(--color-text-secondary)', fontWeight: dataPoints && dataPoints[0] && dataPoints[0].datasetIndex === 1 ? 700 : 500 }}>{payablesValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}); 