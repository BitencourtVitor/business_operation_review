import { useEffect, useState } from 'react';

interface ServiceChartTooltipExternalProps {
  tooltip: {
    opacity: number;
    caretX: number;
    caretY: number;
    dataPoints: Array<{
      dataIndex: number;
      datasetIndex: number;
      label: string;
      value: number;
      formattedValue: string;
    }>;
  };
  chartLabels: string[];
  selectedMonth: string;
  filteredData: Array<{
    date_received?: string;
    date_completed?: string;
    cost?: number;
    warranty?: boolean;
  }>;
  chartCanvas?: HTMLCanvasElement | null;
}

export function ServiceChartTooltipExternal({ 
  tooltip, 
  chartLabels, 
  selectedMonth, 
  filteredData,
  chartCanvas 
}: ServiceChartTooltipExternalProps) {
  const [tooltipElement, setTooltipElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tooltipElement) {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.pointerEvents = 'none';
      element.style.zIndex = '1000';
      setTooltipElement(element);
      document.body.appendChild(element);
    }

    return () => {
      if (tooltipElement) {
        document.body.removeChild(tooltipElement);
      }
    };
  }, [tooltipElement]);

  useEffect(() => {
    if (!tooltipElement || !tooltip.opacity || tooltip.dataPoints.length === 0) {
      if (tooltipElement) {
        tooltipElement.style.display = 'none';
      }
      return;
    }

    const dataPoint = tooltip.dataPoints[0];
    const label = chartLabels[dataPoint.dataIndex];
    const period = selectedMonth && selectedMonth !== 'Todos' ? `Day ${label}` : `Period ${label}`;
    
    // Calcular dados para o período específico
    const periodData = filteredData.filter(item => {
      if (!item.date_received) return false;
      
      const itemDate = new Date(item.date_received);
      let itemPeriod: string;
      
      if (selectedMonth && selectedMonth !== 'Todos') {
        itemPeriod = itemDate.getDate().toString().padStart(2, '0');
      } else {
        itemPeriod = (itemDate.getMonth() + 1).toString().padStart(2, '0');
      }
      
      return itemPeriod === label;
    });

    const totalCount = periodData.length;
    const warrantyCount = periodData.filter(item => item.warranty === true).length;
    const nonWarrantyCount = periodData.filter(item => item.warranty === false).length;
    const nonWarrantyCost = periodData
      .filter(item => item.warranty === false)
      .reduce((sum, item) => sum + (item.cost || 0), 0);

    // Calcular posição
    const rect = chartCanvas?.getBoundingClientRect();
    if (!rect) return;

    let left = tooltip.caretX + 10;
    let top = tooltip.caretY - 10;

    // Ajustar posição se sair da tela
    const tooltipWidth = 240;
    const tooltipHeight = 140;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + tooltipWidth > viewportWidth) {
      left = tooltip.caretX - tooltipWidth - 10;
    }

    if (top + tooltipHeight > viewportHeight) {
      top = tooltip.caretY - tooltipHeight - 10;
    }

    // Garantir que não saia pela esquerda ou topo
    left = Math.max(10, left);
    top = Math.max(10, top);

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.display = 'block';

    tooltipElement.innerHTML = `
      <div style="
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-divider);
        border-radius: 6px;
        padding: 12px;
        font-size: 12px;
        color: var(--color-text-primary);
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        min-width: 220px;
        max-width: 240px;
      ">
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">
          ${period}
        </div>
        <div style="margin-bottom: 6px;">
          <span style="color: var(--color-accent-primary); font-weight: 600;">Total Recebidos:</span>
          <span style="color: var(--color-text-secondary); margin-left: 4px;">${totalCount}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: #28a745; font-weight: 500;">Warranty:</span>
          <span style="color: var(--color-text-secondary); margin-left: 4px;">${warrantyCount}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #fd7e14; font-weight: 500;">Não-Warranty:</span>
          <span style="color: var(--color-text-secondary); margin-left: 4px;">${nonWarrantyCount}</span>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: var(--color-accent-primary); font-weight: 600;">Cost </span>
          <span style="color: var(--color-accent-primary); margin-left: 4px;">$${nonWarrantyCost.toFixed(2)}</span>
        </div>
        <div style="color: var(--color-text-secondary); font-size: 10px; font-style: italic; margin-top: 4px;">
          *Apenas serviços não-warranty possuem custo
        </div>
      </div>
    `;
  }, [tooltip, chartLabels, selectedMonth, filteredData, chartCanvas, tooltipElement]);

  return null;
} 