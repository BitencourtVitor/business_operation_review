import React, { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import dayjs from 'dayjs';
import { createPortal } from 'react-dom';
import type { SamsaraEvent, WexTransaction } from '../../../types/fuelControl';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Tooltip customizado para o gráfico de performance
interface PerformanceTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
  data: SamsaraEvent[];
}

// Tooltip customizado para o gráfico de Total Supply vs Consumed
interface SupplyConsumedTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
}

// Tooltip customizado para o gráfico de Cost Over Time
interface CostOverTimeTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
}

// Tooltip customizado para o gráfico de Idle Consumption
interface IdleConsumptionTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  year: string;
  month: string;
  canvas?: HTMLCanvasElement | null;
}

const PerformanceTooltipExternal = React.memo(function PerformanceTooltipExternal({ tooltip, chartLabels, chartDatasets, year, month, canvas }: PerformanceTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let mpg: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number }>;
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
  }, [periodo, mpg]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  
  // Validação adicional para garantir que os dados existam
  if (!chartLabels || !chartDatasets || dataIndex < 0 || dataIndex >= chartLabels.length) return null;
  
  mpg = chartDatasets[0]?.data[dataIndex] || 0;
  const label = chartLabels[dataIndex];
  
  if (year && month && label) {
    // Se tem mês selecionado, label é apenas o dia
    const dia = label;
    periodo = dayjs(`${year}-${month}-${dia.padStart(2, '0')}`).format('DD/MM/YYYY');
  } else if (year && label) {
    // Se tem apenas ano, label é "Jan 2025", "Feb 2025", etc.
    periodo = label;
  } else {
    periodo = label || '';
  }
  
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 120;
  
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - offsetX - realWidth;
    }
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Performance</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{mpg.toFixed(2)} mi/gal</span>
        </div>
      </div>
    </div>,
    document.body
     );
 });

const SupplyConsumedTooltipExternal = React.memo(function SupplyConsumedTooltipExternal({ tooltip, chartLabels, chartDatasets, year, month, canvas }: SupplyConsumedTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let supplied: number = 0;
  let consumed: number = 0;
  let distance: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

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
  }, [periodo, supplied, consumed, distance]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  
  dataIndex = dataPoints[0].dataIndex;
  
  // Validação adicional para garantir que os dados existam
  if (!chartLabels || !chartDatasets || dataIndex < 0 || dataIndex >= chartLabels.length) return null;
  
  // Para este gráfico, sempre mostrar todos os valores (supplied, consumed, distance)
  // Dataset 0: Total Supplied (WEX) - Azul
  // Dataset 1: Total Consumed (Samsara) - Verde
  // Dataset 2: Total Distance - Laranja
  supplied = chartDatasets[0]?.data[dataIndex] || 0;
  consumed = chartDatasets[1]?.data[dataIndex] || 0;
  distance = chartDatasets[2]?.data[dataIndex] || 0;
  
  const label = chartLabels[dataIndex];
  
  if (year && month && label) {
    // Se tem mês selecionado, label é apenas o dia
    const dia = label;
    periodo = dayjs(`${year}-${month}-${dia.padStart(2, '0')}`).format('DD/MM/YYYY');
  } else if (year && label) {
    // Se tem apenas ano, label é o número do mês
    periodo = dayjs(`${year}-${label.padStart(2, '0')}-01`).format('MM/YYYY');
  } else {
    periodo = label || '';
  }
  
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 140;
  
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - offsetX - realWidth;
    }
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
            <span style={{ color: 'var(--color-text-secondary)' }}>Supplied</span>
            <span style={{ color: '#2E6BE6', fontWeight: 600 }}>{supplied.toFixed(2)} gal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Consumed</span>
            <span style={{ color: '#1bbf5c', fontWeight: 600 }}>{consumed.toFixed(2)} gal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Distance</span>
            <span style={{ color: '#fd7e14', fontWeight: 600 }}>{distance.toFixed(2)} mi</span>
          </div>
        </div>
    </div>,
    document.body
  );
});

const CostOverTimeTooltipExternal = React.memo(function CostOverTimeTooltipExternal({ tooltip, chartLabels, chartDatasets, year, month, canvas }: CostOverTimeTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let totalCost: number = 0;
  let totalSupplied: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

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
  }, [periodo, totalCost, totalSupplied]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  
  dataIndex = dataPoints[0].dataIndex;
  
  // Validação adicional para garantir que os dados existam
  if (!chartLabels || !chartDatasets || dataIndex < 0 || dataIndex >= chartLabels.length) return null;
  
  // Para este gráfico, sempre mostrar ambos os valores (Total Cost e Total Supplied)
  // Dataset 0: Total Cost ($) - Amarelo
  // Dataset 1: Total Supplied (gal) - Verde
  totalCost = chartDatasets[0]?.data[dataIndex] || 0;
  totalSupplied = chartDatasets[1]?.data[dataIndex] || 0;
  
  const label = chartLabels[dataIndex];
  
  if (year && month && label) {
    // Se tem mês selecionado, label é apenas o dia
    const dia = label;
    periodo = dayjs(`${year}-${month}-${dia.padStart(2, '0')}`).format('DD/MM/YYYY');
  } else if (year && label) {
    // Se tem apenas ano, label é o número do mês
    periodo = dayjs(`${year}-${label.padStart(2, '0')}-01`).format('MM/YYYY');
  } else {
    periodo = label || '';
  }
  
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 140;
  
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - offsetX - realWidth;
    }
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
          <span style={{ color: 'var(--color-text-secondary)' }}>Total Cost</span>
          <span style={{ color: '#ffc107', fontWeight: 600 }}>${totalCost.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Total Supplied</span>
          <span style={{ color: '#28a745', fontWeight: 600 }}>{totalSupplied.toFixed(2)} gal</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

const IdleConsumptionTooltipExternal = React.memo(function IdleConsumptionTooltipExternal({ tooltip, chartLabels, chartDatasets, year, month, canvas }: IdleConsumptionTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let idleConsumption: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number }>;
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
  }, [periodo, idleConsumption]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  
  // Validação adicional para garantir que os dados existam
  if (!chartLabels || !chartDatasets || dataIndex < 0 || dataIndex >= chartLabels.length) return null;
  
  // Dataset 0: Idle Consumption (gal) - Vermelho
  idleConsumption = chartDatasets[0]?.data[dataIndex] || 0;
  
  const label = chartLabels[dataIndex];
  
  if (year && month && label) {
    // Se tem mês selecionado, label é apenas o dia
    const dia = label;
    periodo = dayjs(`${year}-${month}-${dia.padStart(2, '0')}`).format('DD/MM/YYYY');
  } else if (year && label) {
    // Se tem apenas ano, label é o número do mês
    periodo = dayjs(`${year}-${label.padStart(2, '0')}-01`).format('MM/YYYY');
  } else {
    periodo = label || '';
  }
  
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 120;
  
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - offsetX - realWidth;
    }
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Idle Consumption</span>
                     <span style={{ color: '#ff6b35', fontWeight: 600 }}>{idleConsumption.toFixed(2)} gal</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

interface FuelControlChartProps {
  filteredSamsara: SamsaraEvent[];
  filteredWex: WexTransaction[];
  selectedYear: string;
  selectedMonth: string;
  driverNames: Array<{ id: number; normalized_name: string; wex_name: string | null; samsara_name: string | null }>;
}

export function FuelControlChart({
  filteredSamsara = [],
  filteredWex = [],
  selectedYear = '',
  selectedMonth = '',
  driverNames = []
}: FuelControlChartProps) {
  // Estado para controlar a visibilidade das linhas do gráfico principal
  const [visibleLines, setVisibleLines] = useState({
    supplied: true,
    consumed: true,
    distance: true
  });

  const [externalTooltip, setExternalTooltip] = useState<{
    tooltip: unknown;
    chartLabels: string[];
    chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
    year: string;
    month: string;
    canvas?: HTMLCanvasElement | null;
    data: SamsaraEvent[];
  } | null>(null);

  const [supplyConsumedTooltip, setSupplyConsumedTooltip] = useState<{
    tooltip: unknown;
    chartLabels: string[];
    chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
    year: string;
    month: string;
    canvas?: HTMLCanvasElement | null;
  } | null>(null);

  const [costOverTimeTooltip, setCostOverTimeTooltip] = useState<{
    tooltip: unknown;
    chartLabels: string[];
    chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
    year: string;
    month: string;
    canvas?: HTMLCanvasElement | null;
  } | null>(null);

  const [idleConsumptionTooltip, setIdleConsumptionTooltip] = useState<{
    tooltip: unknown;
    chartLabels: string[];
    chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
    year: string;
    month: string;
    canvas?: HTMLCanvasElement | null;
  } | null>(null);

     

  // Dados para o gráfico de performance MPG
  const performanceChartData = useMemo(() => {
    if (!filteredSamsara.length) return null;

    // Obter cor accent para usar nos dados do gráfico
    let accent = '#2E6BE6'; // fallback
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-primary').trim() || '#2E6BE6';
      }
    } catch (error) {
      console.warn('Erro ao obter cor accent:', error);
    }

    // Decidir se agrupar por mês ou por dia baseado nos filtros
    const shouldGroupByMonth = !selectedMonth; // Se não tem mês selecionado, agrupa por mês
    
    if (shouldGroupByMonth) {
      // Agrupar por MÊS
      const monthlyData = new Map<string, { distance: number; fuel: number; mpg: number; days: number }>();
      
             filteredSamsara.forEach(event => {
         // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
         const dateOnly = event.event_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
         const dateParts = dateOnly.split('-');
         const year = dateParts[0];
         const month = dateParts[1];
         
         // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
         if (selectedYear && year !== selectedYear) {
           return; // Pular eventos que não são do ano selecionado
         }
         const monthKey = `${year}-${month}`;
        
        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, { distance: 0, fuel: 0, mpg: 0, days: 0 });
        }
        
                 const monthData = monthlyData.get(monthKey)!;
         monthData.fuel += event.units;
         monthData.days = Math.max(monthData.days, parseInt(dateParts[2]));
        
        monthData.distance += event.distancia;
      });

      // Calcular MPG para cada mês
      monthlyData.forEach(monthData => {
        if (monthData.fuel > 0) {
          monthData.mpg = monthData.distance / monthData.fuel;
        }
      });

      // Ordenar por mês
      const sortedMonths = Array.from(monthlyData.keys()).sort();
      // Quando não há ano selecionado, garantir faixa contínua mês a mês
      let fullMonths = sortedMonths;
      if (!selectedYear && sortedMonths.length > 0) {
        const start = dayjs(`${sortedMonths[0]}-01`);
        const end = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`);
        const range: string[] = [];
        for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
          range.push(d.format('YYYY-MM'));
        }
        fullMonths = range;
      }
      
      return {
        labels: fullMonths.map(monthKey => {
          const [, month] = monthKey.split('-');
          // Usar apenas o número do mês (01, 02, 03, etc.) como no Timesheet Analysis
          return selectedYear ? month : monthKey;
        }),
        datasets: [
          {
            label: 'MPG Performance (Monthly)',
            data: fullMonths.map(monthKey => {
              const monthData = monthlyData.get(monthKey) || { mpg: 0 } as { mpg: number };
              return Math.round((monthData.mpg || 0) * 100) / 100;
            }),
            borderColor: accent,
            backgroundColor: accent,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          }
        ]
      };
    } else {
      // Agrupar por DIA (quando mês específico selecionado)
      const dailyData = new Map<string, { distance: number; fuel: number; mpg: number }>();
      
                                                                               filteredSamsara.forEach(event => {
          // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
          const dateOnly = event.event_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
          const dateParts = dateOnly.split('-');
          const year = dateParts[0];
          const month = dateParts[1];
          const day = dateParts[2];
          
          // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
          if (selectedYear && year !== selectedYear) {
            return; // Pular eventos que não são do ano selecionado
          }
           const dateKey = `${year}-${month}-${day}`;
         
         if (!dailyData.has(dateKey)) {
           dailyData.set(dateKey, { distance: 0, fuel: 0, mpg: 0 });
         }
         
         const dayData = dailyData.get(dateKey)!;
         dayData.fuel += event.units;
         
                 dayData.distance += event.distancia;
       });

      // Calcular MPG para cada dia
      dailyData.forEach(dayData => {
        if (dayData.fuel > 0) {
          dayData.mpg = dayData.distance / dayData.fuel;
        }
      });

             // Ordenar por data cronologicamente
       const sortedDates = Array.from(dailyData.keys()).sort((a, b) => {
         // Ordenar strings de data diretamente (YYYY-MM-DD)
         return a.localeCompare(b);
       });
      
      return {
        labels: sortedDates.map(date => {
          const [, , day] = date.split('-');
          return day; // Apenas o dia
        }),
        datasets: [
          {
            label: 'MPG Performance (Daily)',
            data: sortedDates.map(date => {
              const dayData = dailyData.get(date)!;
              return Math.round(dayData.mpg * 100) / 100;
            }),
            borderColor: accent,
            backgroundColor: accent,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: false,
            tension: 0.25,
          }
        ]
      };
    }
     }, [filteredSamsara, selectedMonth, selectedYear]);

  // Opções do gráfico seguindo o padrão Timesheet Analysis
  const performanceChartOptions = useMemo(() => {
    let borderDivider = '#e0e0e0'; // fallback
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
      }
    } catch (error) {
      console.warn('Erro ao obter cor border divider:', error);
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false, position: 'top' as const },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setExternalTooltip(null);
              return;
            }
            if (performanceChartData) {
              setExternalTooltip({
                tooltip: context.tooltip,
                chartLabels: performanceChartData.labels,
                chartDatasets: performanceChartData.datasets,
                year: selectedYear,
                month: selectedMonth,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas: HTMLCanvasElement }).canvas : undefined,
                data: filteredSamsara,
              });
            }
          }
        },
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: { 
            display: false
          },
                     title: {
             display: false
           },
        },
        y: {
          grid: { color: borderDivider },
          ticks: { color: '#6c757d' },
          beginAtZero: true,
                    title: {
             display: false
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
  }, [performanceChartData, selectedYear, selectedMonth, filteredSamsara]);

     // ===== Gráfico 2: Consumo (Samsara) vs Abastecimento (WEX) por motorista ao longo do tempo =====
   const normalizeName = React.useCallback((name: string): string => {
     if (!name || !driverNames || driverNames.length === 0) return name || '';
     const found = driverNames.find(d => d.wex_name === name || d.samsara_name === name);
     if (found) return found.normalized_name;
     const already = driverNames.some(d => d.normalized_name === name);
     return already ? name : name;
   }, [driverNames]);

   // ===== Gráfico 3: Custo Total ao Longo do Tempo =====
   const costOverTimeData = useMemo(() => {
     if (!filteredWex.length) return null;

     // Decidir se agrupar por mês ou por dia baseado nos filtros
     const shouldGroupByMonth = !selectedMonth;
     
     if (shouldGroupByMonth) {
       // Agrupar por MÊS
       const monthlyCostData = new Map<string, { cost: number; fuel: number; avgCost: number }>();
       
                               filteredWex.forEach(transaction => {
           // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
           const dateOnly = transaction.transaction_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
           const dateParts = dateOnly.split('-');
           const year = dateParts[0];
           const month = dateParts[1];
           
           // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
           if (selectedYear && year !== selectedYear) {
             return; // Pular transações que não são do ano selecionado
           }
           const monthKey = `${year}-${month}`;
         
         if (!monthlyCostData.has(monthKey)) {
           monthlyCostData.set(monthKey, { cost: 0, fuel: 0, avgCost: 0 });
         }
         
         const monthData = monthlyCostData.get(monthKey)!;
         monthData.cost += transaction.valor;
         monthData.fuel += transaction.units;
       });

       // Calcular custo médio para cada mês
       monthlyCostData.forEach(monthData => {
         if (monthData.fuel > 0) {
           monthData.avgCost = monthData.cost / monthData.fuel;
         }
       });

       // Ordenar por mês
       const sortedMonths = Array.from(monthlyCostData.keys()).sort();
       // Garantir faixa contínua quando não há ano selecionado
       let fullMonths = sortedMonths;
       if (!selectedYear && sortedMonths.length > 0) {
         const start = dayjs(`${sortedMonths[0]}-01`);
         const end = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`);
         const range: string[] = [];
         for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
           range.push(d.format('YYYY-MM'));
         }
         fullMonths = range;
       }
       
       return {
         labels: fullMonths.map(monthKey => {
           const [, month] = monthKey.split('-');
           // Usar apenas o número do mês (01, 02, 03, etc.) como no Timesheet Analysis
           return selectedYear ? month : monthKey;
         }),
         datasets: [
           {
             label: 'Total Cost ($)',
             data: fullMonths.map(monthKey => {
               const monthData = monthlyCostData.get(monthKey) || { cost: 0 } as { cost: number };
               return Math.round((monthData.cost || 0) * 100) / 100;
             }),
             borderColor: '#ffc107',
             backgroundColor: '#ffc107',
             pointRadius: 4,
             pointHoverRadius: 6,
             borderWidth: 3,
             fill: false,
             tension: 0.25,
             yAxisID: 'y',
           },
           {
             label: 'Total Supplied (gal)',
             data: fullMonths.map(monthKey => {
               const monthData = monthlyCostData.get(monthKey) || { cost: 0, fuel: 0, avgCost: 0 } as { cost: number; fuel: number; avgCost: number };
               return Math.round((monthData.fuel || 0) * 100) / 100;
             }),
             borderColor: '#28a745',
             backgroundColor: '#28a745',
             pointRadius: 3,
             pointHoverRadius: 5,
             borderWidth: 2,
             fill: false,
             tension: 0.25,
             yAxisID: 'y1',
           }
         ]
       };
     } else {
       // Agrupar por DIA (quando mês específico selecionado)
       const dailyCostData = new Map<string, { cost: number; fuel: number; avgCost: number }>();
       
                               filteredWex.forEach(transaction => {
           // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
           const dateOnly = transaction.transaction_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
           const dateParts = dateOnly.split('-');
           const year = dateParts[0];
           const month = dateParts[1];
           const day = dateParts[2];
           
           // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
           if (selectedYear && year !== selectedYear) {
             return; // Pular transações que não são do ano selecionado
           }
           const dateKey = `${year}-${month}-${day}`;
         
         if (!dailyCostData.has(dateKey)) {
           dailyCostData.set(dateKey, { cost: 0, fuel: 0, avgCost: 0 });
         }
         
         const dayData = dailyCostData.get(dateKey)!;
         dayData.cost += transaction.valor;
         dayData.fuel += transaction.units;
       });

       // Calcular custo médio para cada dia
       dailyCostData.forEach(dayData => {
         if (dayData.fuel > 0) {
           dayData.avgCost = dayData.cost / dayData.fuel;
         }
       });

               // Ordenar por data cronologicamente
        const sortedDates = Array.from(dailyCostData.keys()).sort((a, b) => {
          // Ordenar strings de data diretamente (YYYY-MM-DD)
          return a.localeCompare(b);
        });
       
       return {
         labels: sortedDates.map(date => {
           const [, , day] = date.split('-');
           return day; // Apenas o dia
         }),
         datasets: [
           {
             label: 'Total Cost ($)',
             data: sortedDates.map(date => {
               const dayData = dailyCostData.get(date)!;
               return Math.round(dayData.cost * 100) / 100;
             }),
             borderColor: '#ffc107',
             backgroundColor: '#ffc107',
             pointRadius: 4,
             pointHoverRadius: 6,
             borderWidth: 3,
             fill: false,
             tension: 0.25,
             yAxisID: 'y',
           },
           {
             label: 'Total Supplied (gal)',
             data: sortedDates.map(date => {
               const dayData = dailyCostData.get(date)!;
               return Math.round(dayData.fuel * 100) / 100;
             }),
             borderColor: '#28a745',
             backgroundColor: '#28a745',
             pointRadius: 3,
             pointHoverRadius: 5,
             borderWidth: 2,
             fill: false,
             tension: 0.25,
             yAxisID: 'y1',
           }
         ]
       };
     }
   }, [filteredWex, selectedMonth, selectedYear]);

   const costOverTimeOptions = useMemo(() => {
     let borderDivider = '#e0e0e0';
     try {
       if (typeof document !== 'undefined' && document.documentElement) {
         borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
       }
     } catch {
       // noop
     }

     return {
       responsive: true,
       maintainAspectRatio: false,
       plugins: {
         legend: { display: false },
         tooltip: {
           enabled: false,
           external: (context: Record<string, unknown>) => {
             if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
               setCostOverTimeTooltip(null);
               return;
             }
             if (costOverTimeData) {
               // Ao ativar este tooltip, esconder os demais
               setExternalTooltip(null);
               setSupplyConsumedTooltip(null);
               setCostOverTimeTooltip({
                 tooltip: context.tooltip,
                 chartLabels: costOverTimeData.labels,
                 chartDatasets: costOverTimeData.datasets,
                 year: selectedYear,
                 month: selectedMonth,
                 canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas?: HTMLCanvasElement }).canvas : undefined,
               });
             }
           }
         },
       },
       scales: {
         x: {
           grid: { color: borderDivider },
           ticks: {
             display: false
           },
                       title: {
              display: false
            },
         },
         y: {
           type: 'linear' as const,
           display: true,
           position: 'left' as const,
           grid: { color: borderDivider },
           ticks: { color: '#6c757d' },
           beginAtZero: true,
                       title: {
              display: true,
              text: 'Fuel (gal)',
              color: '#6c757d',
              font: { weight: 600, size: 12 },
              padding: { top: 10, bottom: 10 },
            },
         },
         y1: {
           type: 'linear' as const,
           display: true,
           position: 'right' as const,
           grid: { drawOnChartArea: false },
           ticks: { color: '#6c757d' },
           beginAtZero: true,
                       title: {
              display: false
            },
         },
       },
       layout: { padding: { top: 20, bottom: 20, left: 10, right: 10 } },
     };
   }, [selectedYear, selectedMonth]);

  // Dados para o gráfico de consumo idle ao longo do tempo
  const idleConsumptionData = useMemo(() => {
    if (!filteredSamsara || filteredSamsara.length === 0) return null;

    const dailyIdleData = new Map<string, { idle_consumption: number; event_count: number }>();

    filteredSamsara.forEach(event => {
      if (event.type === 'idle' && event.units) {
        const dateOnly = event.event_date.split('T')[0];
        const dateParts = dateOnly.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        if (selectedYear && year !== selectedYear) {
          return;
        }
        
        const dateKey = selectedMonth 
          ? `${year}-${month}-${day}`
          : `${year}-${month}`;
        
        if (!dailyIdleData.has(dateKey)) {
          dailyIdleData.set(dateKey, { idle_consumption: 0, event_count: 0 });
        }
        
        const dayData = dailyIdleData.get(dateKey)!;
        dayData.idle_consumption += Number(event.units) || 0;
        dayData.event_count += 1;
      }
    });

    if (dailyIdleData.size === 0) return null;

    const sortedDates = Array.from(dailyIdleData.keys()).sort((a, b) => a.localeCompare(b));
    
    return {
      labels: sortedDates.map(date => {
        if (selectedMonth) {
          const [, , day] = date.split('-');
          return day;
        } else {
          const [, month] = date.split('-');
          return month;
        }
      }),
      datasets: [
                 {
           label: 'Idle Consumption (gal)',
           data: sortedDates.map(date => {
             const dayData = dailyIdleData.get(date)!;
             return Math.round(dayData.idle_consumption * 100) / 100;
           }),
           borderColor: '#ff6b35',
           backgroundColor: '#ff6b35',
           pointRadius: 4,
           pointHoverRadius: 6,
           borderWidth: 3,
           fill: false,
           tension: 0.25,
         }
      ]
    };
  }, [filteredSamsara, selectedMonth, selectedYear]);

  const idleConsumptionOptions = useMemo(() => {
    let borderDivider = '#e0e0e0';
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
      }
    } catch {
      // noop
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setIdleConsumptionTooltip(null);
              return;
            }
            if (idleConsumptionData) {
              // Ao ativar este tooltip, esconder os demais
              setExternalTooltip(null);
              setSupplyConsumedTooltip(null);
              setCostOverTimeTooltip(null);
              setIdleConsumptionTooltip({
                tooltip: context.tooltip,
                chartLabels: idleConsumptionData.labels,
                chartDatasets: idleConsumptionData.datasets,
                year: selectedYear,
                month: selectedMonth,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas?: HTMLCanvasElement }).canvas : undefined,
              });
            }
          }
        },
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: {
            display: false
          },
          title: {
            display: false
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: { color: borderDivider },
          ticks: { color: '#6c757d' },
          beginAtZero: true,
          title: {
            display: false
          },
        }
      },
      layout: { padding: { top: 20, bottom: 20, left: 10, right: 10 } },
    };
  }, [selectedYear, selectedMonth]);

  const suppliedVsConsumedData = useMemo(() => {
    // Decidir agrupamento
    const groupByMonth = !selectedMonth;

    // Coletar chaves de tempo e mapas por motorista
    const timeKeySet = new Set<string>();
    const driverToSeries: Record<string, { supplied: Record<string, number>; consumed: Record<string, number>; distance: Record<string, number> }> = {};

    const addPoint = (driver: string, key: string, kind: 'supplied' | 'consumed' | 'distance', value: number) => {
      if (!driver) return;
      if (!driverToSeries[driver]) {
        driverToSeries[driver] = { supplied: {}, consumed: {}, distance: {} };
      }
      const bucket = driverToSeries[driver][kind];
      bucket[key] = (bucket[key] || 0) + value;
      timeKeySet.add(key);
    };

               // Processar Samsara (consumed e distance)
      filteredSamsara.forEach(event => {
        const normalized = normalizeName(event.nome as unknown as string);
        // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
        const dateOnly = event.event_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
        const dateParts = dateOnly.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
        if (selectedYear && year !== selectedYear) {
          return; // Pular eventos que não são do ano selecionado
        }
        
        const key = groupByMonth
          ? `${year}-${month}`
          : `${year}-${month}-${day}`; // YYYY-MM-DD
       

       
       const val = Number(event.units) || 0;
       addPoint(normalized, key, 'consumed', val);
       
               // Adicionar distância para todos os eventos
        const distanceVal = Number(event.distancia) || 0;
        addPoint(normalized, key, 'distance', distanceVal);
     });

                   // Processar WEX (supplied)
      filteredWex.forEach(tx => {
        const normalized = normalizeName(tx.nome as unknown as string);
        // Extrair apenas a parte da data (YYYY-MM-DD) do timestamp completo
        const dateOnly = tx.transaction_date.split('T')[0]; // Pega apenas "2025-01-01" de "2025-01-01T00:32:00+00:00"
        const dateParts = dateOnly.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        // Verificar se a data está no ano selecionado apenas se um ano específico estiver selecionado
        if (selectedYear && year !== selectedYear) {
          return; // Pular transações que não são do ano selecionado
        }
        
        const key = groupByMonth
          ? `${year}-${month}`
          : `${year}-${month}-${day}`;
       

       
       const val = Number(tx.units) || 0;
       addPoint(normalized, key, 'supplied', val);
     });

    // Ordenar chaves de tempo
    let sortedKeys: string[];
    if (groupByMonth) {
      // Para dados mensais, ordenar como strings
      const rawKeys = Array.from(timeKeySet.values()).sort();
      // Garantir faixa contínua mês a mês quando agrupando por mês e sem ano selecionado
      if (!selectedYear && rawKeys.length > 0) {
        const start = dayjs(`${rawKeys[0]}-01`);
        const end = dayjs(`${rawKeys[rawKeys.length - 1]}-01`);
        const range: string[] = [];
        for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
          range.push(d.format('YYYY-MM'));
        }
        sortedKeys = range;
      } else {
        sortedKeys = rawKeys;
      }
    } else {
      // Para dados diários, ordenar cronologicamente por data
      const rawKeys = Array.from(timeKeySet.values());
      
             sortedKeys = rawKeys.sort((a, b) => {
         // Ordenar strings de data diretamente (YYYY-MM-DD)
         return a.localeCompare(b);
       });
    }
    
    const labels = groupByMonth
      ? sortedKeys.map(monthKey => {
          const [, month] = monthKey.split('-');
          // Usar apenas o número do mês quando há ano; caso contrário, YYYY-MM
          return selectedYear ? month : monthKey;
        })
      : sortedKeys.map(date => {
          // Para dados diários, extrair o dia mantendo a correspondência exata com sortedKeys
          const [, , day] = date.split('-');
          return day;
        });

         // Agrupar por tipo (Supplied vs Consumed vs Distance) em vez de por motorista
     const aggregatedData = {
       supplied: sortedKeys.map(k => 
         Object.values(driverToSeries).reduce((sum, driver) => 
           sum + (driver.supplied[k] || 0), 0
         )
       ),
       consumed: sortedKeys.map(k => 
         Object.values(driverToSeries).reduce((sum, driver) => 
           sum + (driver.consumed[k] || 0), 0
         )
       ),
       distance: sortedKeys.map(k => 
         Object.values(driverToSeries).reduce((sum, driver) => 
           sum + (driver.distance[k] || 0), 0
         )
       )
     };

     // Usar valores específicos de cada período (não acumulativos)
     const periodData = {
       supplied: aggregatedData.supplied,
       consumed: aggregatedData.consumed,
       distance: aggregatedData.distance
     };

     // Calcular linha de tendência baseada na média de consumo por distância
     // const trendLine = periodData.consumed.map((totalConsumed, index) => {
     //   if (index === 0) return 0;
     //   const avgConsumptionPerDistance = totalConsumed / (periodData.distance[index] || 1);
     //   const expectedConsumption = periodData.distance[index] * avgConsumptionPerDistance;
     //   return expectedConsumption;
     // });

         const datasets = [
               {
          label: 'Total Supplied (WEX)',
          data: periodData.supplied.map(v => Math.round((v + Number.EPSILON) * 100) / 100),
          borderColor: '#2E6BE6',
          backgroundColor: '#2E6BE6',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          yAxisID: 'y',
          hidden: !visibleLines.supplied,
        },
        {
          label: 'Total Consumed (Samsara)',
          data: periodData.consumed.map(v => Math.round((v + Number.EPSILON) * 100) / 100),
          borderColor: '#1bbf5c',
          backgroundColor: '#1bbf5c',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          yAxisID: 'y',
          hidden: !visibleLines.consumed,
        },
        {
          label: 'Total Distance (mi)',
          data: periodData.distance.map(v => Math.round((v + Number.EPSILON) * 100) / 100),
          borderColor: '#fd7e14',
          backgroundColor: '#fd7e14',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
          yAxisID: 'y1',
          hidden: !visibleLines.distance,
        },
       
     ];


    
    return {
      labels,
      datasets,
    };
     }, [filteredSamsara, filteredWex, selectedMonth, normalizeName, selectedYear, visibleLines]);

  const suppliedVsConsumedOptions = useMemo(() => {
    let borderDivider = '#e0e0e0';
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
      }
    } catch {
      // noop
    }

         return {
       responsive: true,
       maintainAspectRatio: false,
       plugins: {
         legend: { display: false },
         tooltip: {
           enabled: false,
           external: (context: Record<string, unknown>) => {
             if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
               setSupplyConsumedTooltip(null);
               return;
             }
             if (suppliedVsConsumedData) {
               // Ao ativar este tooltip, esconder os demais
               setExternalTooltip(null);
               setCostOverTimeTooltip(null);
               setSupplyConsumedTooltip({
                 tooltip: context.tooltip,
                 chartLabels: suppliedVsConsumedData.labels,
                 chartDatasets: suppliedVsConsumedData.datasets,
                 year: selectedYear,
                 month: selectedMonth,
                 canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas?: HTMLCanvasElement }).canvas : undefined,
               });
             }
           }
         },
       },
             scales: {
         x: {
           grid: { color: borderDivider },
           ticks: {
             color: '#6c757d',
             maxRotation: 45,
             minRotation: 0,
             autoSkip: true,
             maxTicksLimit: selectedMonth ? 15 : 12,
           },
                      title: {
              display: false
            },
         },
         y: {
           type: 'linear' as const,
           display: true,
           position: 'left' as const,
           grid: { color: borderDivider },
           ticks: { color: '#6c757d' },
           beginAtZero: true,
           title: {
             display: true,
             text: 'Fuel (gal)',
             color: '#6c757d',
             font: { weight: 600, size: 12 },
             padding: { top: 10, bottom: 10 },
           },
         },
         y1: {
           type: 'linear' as const,
           display: true,
           position: 'right' as const,
           grid: { drawOnChartArea: false },
           ticks: { color: '#6c757d' },
           beginAtZero: true,
           title: {
             display: true,
             text: 'Distance (mi)',
             color: '#6c757d',
             font: { weight: 600, size: 12 },
             padding: { top: 10, bottom: 10 },
           },
         },
       },
      layout: { padding: { top: 20, bottom: 20, left: 10, right: 10 } },
    };
     }, [selectedYear, selectedMonth]);

  return (
    <>
             <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
         {/* Container principal - gráfico principal (2/3) + coluna direita (1/3) */}
         <div style={{ 
           display: 'flex', 
           flexDirection: 'row', 
           width: '100%', 
           height: '100%', 
           minHeight: 0,
           borderBottom: '1px solid var(--color-border-divider)'
         }}>
           {/* Gráfico Principal: Consumo vs Abastecimento vs Distância + Média Acumulativa - 2/3 da largura */}
           <div style={{ 
             flex: 2, 
             minWidth: 0,
             background: 'var(--color-background-primary)',
             padding: '6px',
             display: 'flex',
             flexDirection: 'column'
           }}>
              {/* Título e controle de exibição na mesma linha */}
              <div className='ms-4 my-0 d-flex justify-content-between align-items-center' style={{ minHeight: 30, marginRight: '16px' }}>
                <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, margin: 0 }}>
                  Fuel Consumption Analysis
                </h4>
                
                {/* Controle de exibição das linhas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Botão Supplied */}
                  <button
                    onClick={() => setVisibleLines(prev => ({ ...prev, supplied: !prev.supplied }))}
                    style={{ 
                      background: visibleLines.supplied ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                      color: visibleLines.supplied ? '#2E6BE6' : 'var(--color-text-primary)', 
                      border: visibleLines.supplied ? '1.5px solid #2E6BE6' : '1.5px solid var(--color-border-divider)', 
                      borderRadius: 15, 
                      padding: '4px 12px', 
                      fontWeight: 500, 
                      fontSize: 12, 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Supplied
                  </button>

                  {/* Botão Consumed */}
                  <button
                    onClick={() => setVisibleLines(prev => ({ ...prev, consumed: !prev.consumed }))}
                    style={{ 
                      background: visibleLines.consumed ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                      color: visibleLines.consumed ? '#1bbf5c' : 'var(--color-text-primary)', 
                      border: visibleLines.consumed ? '1.5px solid #1bbf5c' : '1.5px solid var(--color-border-divider)', 
                      borderRadius: 15, 
                      padding: '4px 12px', 
                      fontWeight: 500, 
                      fontSize: 12, 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Consumed
                  </button>

                  {/* Botão Distance */}
                  <button
                    onClick={() => setVisibleLines(prev => ({ ...prev, distance: !prev.distance }))}
                    style={{ 
                      background: visibleLines.distance ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                      color: visibleLines.distance ? '#fd7e14' : 'var(--color-text-primary)', 
                      border: visibleLines.distance ? '1.5px solid #fd7e14' : '1.5px solid var(--color-border-divider)', 
                      borderRadius: 15, 
                      padding: '4px 12px', 
                      fontWeight: 500, 
                      fontSize: 12, 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Distance
                  </button>
                </div>
              </div>
             <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
               <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
                                                     {suppliedVsConsumedData && suppliedVsConsumedOptions ? (
                    <Line data={suppliedVsConsumedData} options={suppliedVsConsumedOptions} />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center',
                        padding: '20px'
                      }}>
                         <div style={{ 
                           fontSize: 48, 
                           color: 'var(--color-text-secondary)',
                           opacity: 0.5,
                           marginBottom: 16
                         }}>
                           <i className="bi bi-graph-up"></i>
                         </div>
                        <div style={{ 
                          fontSize: 18, 
                          fontWeight: 500, 
                          color: 'var(--color-text-secondary)',
                          marginBottom: 8
                        }}>
                          Sem dados para exibir
                        </div>
                        <div style={{ 
                          fontSize: 14, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                          maxWidth: 300
                        }}>
                          Não há dados de combustível para o período e filtros selecionados
                        </div>
                      </div>
                    </div>
                  )}
               </div>
             </div>
           </div>

                       {/* Coluna Direita: Performance e Custo - 1/3 da largura */}
            <div style={{ 
              flex: 1, 
              minWidth: 0,
              background: 'var(--color-background-primary)',
              borderLeft: '1px solid var(--color-border-divider)',
              display: 'flex',
              flexDirection: 'column'
            }}>
                           {/* Gráfico Superior: Performance MPG - metade da altura */}
              <div style={{ 
                flex: 1, 
                minHeight: 0,
                background: 'var(--color-background-primary)',
                borderRadius: 10,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <h5 className='ms-3 my-0 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 25 }}>
                  Performance Over Time
                </h5>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                     {performanceChartData && performanceChartOptions ? (
                     <Line data={performanceChartData} options={performanceChartOptions} />
                   ) : (
                     <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                             <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center',
                        padding: '16px'
                      }}>
                         <div style={{ 
                           fontSize: 36, 
                           color: 'var(--color-text-secondary)',
                           opacity: 0.5,
                           marginBottom: 12
                         }}>
                           <i className="bi bi-speedometer2"></i>
                         </div>
                        <div style={{ 
                          fontSize: 16, 
                          fontWeight: 500, 
                          color: 'var(--color-text-secondary)',
                          marginBottom: 4
                        }}>
                          Sem dados de performance
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                          maxWidth: 200
                        }}>
                          Nenhum evento de viagem encontrado
                        </div>
                      </div>
                     </div>
                   )}
                </div>
              </div>

                             {/* Linha separadora entre os gráficos */}
               <div style={{ 
                 height: '1px', 
                 background: 'var(--color-border-divider)'
               }} />

              {/* Gráfico do Meio: Consumo Idle ao Longo do Tempo - metade da altura */}
              <div style={{ 
                flex: 1, 
                minHeight: 0,
                background: 'var(--color-background-primary)',
                borderRadius: 10,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <h5 className='ms-3 my-0 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 25 }}>
                  Idle Consumption Over Time
                </h5>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  {idleConsumptionData && idleConsumptionOptions ? (
                    <Line data={idleConsumptionData} options={idleConsumptionOptions} />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center',
                        padding: '16px'
                      }}>
                        <div style={{ 
                          fontSize: 36, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.5,
                          marginBottom: 12
                        }}>
                          <i className="bi bi-stopwatch"></i>
                        </div>
                        <div style={{ 
                          fontSize: 16, 
                          fontWeight: 500, 
                          color: 'var(--color-text-secondary)',
                          marginBottom: 4
                        }}>
                          Sem dados de idle
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                          maxWidth: 200
                        }}>
                          Nenhum evento de idle encontrado
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Linha separadora entre os gráficos */}
              <div style={{ 
                height: '1px', 
                background: 'var(--color-border-divider)'
              }} />

              {/* Gráfico Inferior: Custo ao Longo do Tempo - metade da altura */}
              <div style={{ 
                flex: 1, 
                minHeight: 0,
                background: 'var(--color-background-primary)',
                borderRadius: 10,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <h5 className='ms-3 my-0 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 25 }}>
                  Cost Over Time
                </h5>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                     {costOverTimeData && costOverTimeOptions ? (
                     <Line data={costOverTimeData} options={costOverTimeOptions} />
                   ) : (
                     <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                             <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center',
                        padding: '16px'
                      }}>
                         <div style={{ 
                           fontSize: 36, 
                           color: 'var(--color-text-secondary)',
                           opacity: 0.5,
                           marginBottom: 12
                         }}>
                           <i className="bi bi-currency-dollar"></i>
                         </div>
                        <div style={{ 
                          fontSize: 16, 
                          fontWeight: 500, 
                          color: 'var(--color-text-secondary)',
                          marginBottom: 4
                        }}>
                          Sem dados de custo
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          opacity: 0.8,
                          maxWidth: 200
                        }}>
                          Nenhuma transação WEX encontrada
                        </div>
                      </div>
                     </div>
                   )}
                </div>
              </div>
           </div>
         </div>
       </div>

             {/* Tooltips externos */}
       {externalTooltip && (
         <PerformanceTooltipExternal
           {...externalTooltip}
           tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
           chartLabels={externalTooltip.chartLabels || []}
           chartDatasets={externalTooltip.chartDatasets || []}
           year={externalTooltip.year || ''}
           month={externalTooltip.month || ''}
           canvas={externalTooltip.canvas}
           data={externalTooltip.data || []}
         />
       )}

       {supplyConsumedTooltip && (
         <SupplyConsumedTooltipExternal
           {...supplyConsumedTooltip}
           tooltip={supplyConsumedTooltip.tooltip ? supplyConsumedTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
           chartLabels={supplyConsumedTooltip.chartLabels || []}
           chartDatasets={supplyConsumedTooltip.chartDatasets || []}
           year={supplyConsumedTooltip.year || ''}
           month={supplyConsumedTooltip.month || ''}
           canvas={supplyConsumedTooltip.canvas}
         />
       )}

       {costOverTimeTooltip && (
         <CostOverTimeTooltipExternal
           {...costOverTimeTooltip}
           tooltip={costOverTimeTooltip.tooltip ? costOverTimeTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
           chartLabels={costOverTimeTooltip.chartLabels || []}
           chartDatasets={costOverTimeTooltip.chartDatasets || []}
           year={costOverTimeTooltip.year || ''}
           month={costOverTimeTooltip.month || ''}
           canvas={costOverTimeTooltip.canvas}
         />
       )}

       {idleConsumptionTooltip && (
         <IdleConsumptionTooltipExternal
           {...idleConsumptionTooltip}
           tooltip={idleConsumptionTooltip.tooltip ? idleConsumptionTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
           chartLabels={idleConsumptionTooltip.chartLabels || []}
           chartDatasets={idleConsumptionTooltip.chartDatasets || []}
           year={idleConsumptionTooltip.year || ''}
           month={idleConsumptionTooltip.month || ''}
           canvas={idleConsumptionTooltip.canvas}
         />
       )}
    </>
  );
}
