import { useRef, useEffect, useCallback } from 'react';
import { Pie } from 'react-chartjs-2';
import type { ChartData, ChartOptions, Chart } from 'chart.js';

interface PermitPieChartProps {
  chartData: ChartData<'pie'>;
  chartOptions: ChartOptions<'pie'>;
  onChartInstance?: (instance: Chart<'pie'> | null) => void;
  onElementHover?: (element: {
    index: number;
    datasetIndex: number;
    label: string;
    value: number;
    color: string;
    percentage: number;
    position: { x: number; y: number };
  } | null) => void;
}

export function PermitPieChart({ 
  chartData, 
  chartOptions, 
  onChartInstance,
  onElementHover 
}: PermitPieChartProps) {
  const chartRef = useRef<Chart<'pie'>>(null);

  useEffect(() => {
    if (onChartInstance) {
      onChartInstance(chartRef.current);
    }
  }, [onChartInstance]);

  // Função para detectar elemento hover usando API do Chart.js
  const handleChartHover = useCallback((event: MouseEvent) => {
    if (!chartRef.current || !onElementHover) return;

    const chart = chartRef.current;
    
    // Usar a API do Chart.js para detectar elementos no ponto do mouse
    const elements = chart.getElementsAtEventForMode(
      event,
      'nearest',
      { intersect: true },
      false
    );

    if (elements.length > 0) {
      const element = elements[0];
      const index = element.index;
      const datasetIndex = element.datasetIndex;
      
      if (index >= 0 && chartData.labels && index < chartData.labels.length) {
        const label = chartData.labels[index] as string;
        const value = chartData.datasets[datasetIndex].data[index];
        const color = Array.isArray(chartData.datasets[datasetIndex].backgroundColor) 
          ? chartData.datasets[datasetIndex].backgroundColor[index] as string
          : chartData.datasets[datasetIndex].backgroundColor as string;
        
        // Calcular porcentagem
        const total = chartData.datasets[datasetIndex].data.reduce((sum, val) => sum + val, 0);
        const percentage = total > 0 ? (value / total) * 100 : 0;

        onElementHover({
          index,
          datasetIndex,
          label,
          value,
          color,
          percentage,
          position: { x: event.clientX, y: event.clientY }
        });
      }
    } else {
      onElementHover(null);
    }
  }, [chartData, onElementHover]);

  // Função para lidar com mouse leave
  const handleChartLeave = useCallback(() => {
    if (onElementHover) {
      onElementHover(null);
    }
  }, [onElementHover]);

  // Adicionar event listeners quando o chart estiver disponível
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onElementHover) return;

    const canvas = chart.canvas;
    
    canvas.addEventListener('mousemove', handleChartHover);
    canvas.addEventListener('mouseleave', handleChartLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleChartHover);
      canvas.removeEventListener('mouseleave', handleChartLeave);
    };
  }, [handleChartHover, handleChartLeave, onElementHover]);

  return (
    <div style={{ height: 350, width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {chartData && chartOptions ? (
        <div style={{ height: '75%', width: 'auto', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Pie 
            ref={chartRef} 
            data={chartData} 
            options={{ 
              ...chartOptions, 
              maintainAspectRatio: false,
              // Desabilitar tooltip padrão para usar o personalizado
              plugins: {
                ...chartOptions.plugins,
                tooltip: {
                  enabled: false
                }
              }
            }} 
            height={0} 
            width={0} 
          />
        </div>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Loading chart...</span>
        </div>
      )}
    </div>
  );
} 