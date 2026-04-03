import React, { useRef, useLayoutEffect, useState } from 'react';
import type { TooltipModel } from 'chart.js';

interface ProjectChartTooltipExternalProps {
  tooltip: TooltipModel<'line'> | null;
  chartLabels: string[];
  chartDatasets: Array<{
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
  }>;
  canvas?: HTMLCanvasElement | null;
}

const ProjectChartTooltipExternal: React.FC<ProjectChartTooltipExternalProps> = ({ tooltip, chartLabels, chartDatasets, canvas }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = useState<number>(400);
  useLayoutEffect(() => {
    if (tooltip && tooltip.opacity !== 0 && tooltip.dataPoints && tooltip.dataPoints.length > 0 && tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [tooltip, chartLabels, chartDatasets]);
  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || tooltip.dataPoints.length === 0) return null;
  const dataIndex = tooltip.dataPoints[0].dataIndex;
  const datasetIndex = tooltip.dataPoints[0].datasetIndex;
  const label = chartLabels[dataIndex];

  // Montar lista de valores do ponto (Receivable e Payable)
  const values = chartDatasets.map((ds, idx) => ({
    label: ds.label,
    value: ds.data[dataIndex],
    color: ds.borderColor,
    focused: idx === datasetIndex
  }));

  // Separar em Receivable e Payable
  const receivableLabels = ['Receivable', 'Outstanding Receivable'];
  const payableLabels = ['Payable', 'Outstanding Payable'];
  const receivables = values.filter(v => receivableLabels.includes(v.label));
  const payables = values.filter(v => payableLabels.includes(v.label));

  // Posição absoluta igual ao AccountingTooltipExternal
  const offsetX = 16;
  const margin = 12;
  let x = tooltip.caretX;
  let y = tooltip.caretY;
  const tooltipHeight = 90 + values.length * 24;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + tooltip.caretX;
    const pointAbsY = rect.top + tooltip.caretY;
    const side = pointAbsX < canvasMidX ? 'right' : 'left';
    y = pointAbsY - tooltipHeight / 2;
    if (side === 'right') {
      x = pointAbsX + offsetX;
    } else {
      x = pointAbsX - realWidth - offsetX;
    }
    if (y < rect.top + margin) y = rect.top + margin;
    if (y + tooltipHeight > rect.bottom - margin) y = rect.bottom - tooltipHeight - margin;
    if (x < rect.left + margin) x = rect.left + margin;
    if (x + realWidth > rect.right - margin) x = rect.right - realWidth - margin;
  } else {
    // fallback para window
    if (x + realWidth + offsetX > window.innerWidth - margin) {
      x = x - realWidth - offsetX;
      if (x < margin) x = margin;
    } else {
      x = x + offsetX;
    }
    if (y + tooltipHeight > window.innerHeight - margin) {
      y = window.innerHeight - tooltipHeight - margin;
    }
    if (y < margin) y = margin;
  }

  // Visual igual ao AccountingTooltipExternal
  // label é o período (ex: 01/2024 ou 15/01/2024)

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: 16,
        minWidth: 400,
        maxWidth: 500,
        zIndex: 9999,
        opacity: 0.95,
        pointerEvents: 'none',
        fontSize: 14,
        fontFamily: 'inherit',
        userSelect: 'none',
        transition: 'opacity 0.15s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', marginBottom: 8, fontSize: 15 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Receivables section */}
        {receivables.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
              <span style={{ color: item.focused ? item.color : 'var(--color-text-secondary)', fontWeight: item.focused ? 700 : 400 }}>{item.label}</span>
            </div>
            <span style={{ color: item.focused ? item.color : 'var(--color-text-secondary)', fontWeight: item.focused ? 700 : 500 }}>{typeof item.value === 'number' ? item.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</span>
          </div>
        ))}
        {/* Divider if both sections exist */}
        {receivables.length > 0 && payables.length > 0 && <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '8px 0' }} />}
        {/* Payables section */}
        {payables.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
              <span style={{ color: item.focused ? item.color : 'var(--color-text-secondary)', fontWeight: item.focused ? 700 : 400 }}>{item.label}</span>
            </div>
            <span style={{ color: item.focused ? item.color : 'var(--color-text-secondary)', fontWeight: item.focused ? 700 : 500 }}>{typeof item.value === 'number' ? item.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectChartTooltipExternal; 