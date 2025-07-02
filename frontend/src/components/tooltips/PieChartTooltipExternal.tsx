import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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

export function PieChartTooltipExternal({
  tooltip,
  year,
  month,
  day,
  selectedGroup,
  groupBy,
  compareWithTotal,
  separateAging,
  chartData
}: PieChartTooltipExternalProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Detectar tema em tempo real usando a classe .dark
  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    detectTheme();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          detectTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || tooltip.dataPoints.length === 0) return null;

  const dataPoint = tooltip.dataPoints[0];
  const labelColor = tooltip.labelColors[0];
  
  // Calcular posição do tooltip
  const tooltipWidth = 320;
  const tooltipHeight = 180;
  const margin = 20;
  const offset = 15;
  let x = tooltip.caretX + offset;
  let y = tooltip.caretY - offset;
  
  if (x + tooltipWidth > window.innerWidth - margin) {
    x = tooltip.caretX - tooltipWidth - offset;
  }
  if (x < margin) {
    x = margin;
  }
  if (y + tooltipHeight > window.innerHeight - margin) {
    y = tooltip.caretY - tooltipHeight - offset;
  }
  if (y < margin) {
    y = margin;
  }
  
  x = Math.max(margin, Math.min(x, window.innerWidth - tooltipWidth - margin));
  y = Math.max(margin, Math.min(y, window.innerHeight - tooltipHeight - margin));
  
  // Cores baseadas no tema
  const colors = theme === 'dark' ? {
    backgroundColor: '#1c1c1c',
    borderColor: '#495057',
    textColor: '#F8F9FA',
    secondaryTextColor: '#ADB5BD',
    accentColor: '#0d6efd'
  } : {
    backgroundColor: '#fcfcfc',
    borderColor: '#DEE2E6',
    textColor: '#343A40',
    secondaryTextColor: '#6C757D',
    accentColor: '#0d6efd'
  };

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    left: x,
    top: y,
    backgroundColor: colors.backgroundColor,
    border: `1px solid ${colors.borderColor}`,
    borderRadius: '12px',
    padding: '16px',
    boxShadow: theme === 'dark' 
      ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)'
      : '0 8px 32px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    pointerEvents: 'none',
    width: tooltipWidth,
    minHeight: tooltipHeight,
    transition: 'opacity 0.15s ease-in-out'
  };

  const getDateDisplay = () => {
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    } else if (year && month) {
      return `${month}/${year}`;
    } else if (year) {
      return year;
    }
    return 'All Time';
  };

  const getGroupDisplay = () => {
    if (selectedGroup === 'all') {
      return separateAging ? 'All (by Aging)' : 'All';
    } else if (selectedGroup === 'receivables') {
      return `Receivables (by ${groupBy === 'category' ? 'Category' : 'Aging'})`;
    } else {
      return `Payables (by ${groupBy === 'category' ? 'Category' : 'Aging'})`;
    }
  };

  // Calcular porcentagem do total
  const calculatePercentage = () => {
    if (!chartData || !chartData.datasets || chartData.datasets.length === 0) return 0;
    const total = chartData.datasets[0].data.reduce((sum, val) => sum + val, 0);
    return total > 0 ? (dataPoint.value / total) * 100 : 0;
  };

  const percentage = calculatePercentage();

  // Substituir label 'Total' por 'Restante' quando em modo de comparação
  const displayLabel = (compareWithTotal && dataPoint.label === 'Total') ? 'Remaining' : dataPoint.label;

  const getComparisonInfo = () => {
    if (!compareWithTotal || selectedGroup === 'all') return null;
    
    if (dataPoint.label === 'Total') {
      return (
        <div style={{ 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: `1px solid ${colors.borderColor}`,
          background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
          borderRadius: '8px',
          padding: '8px 12px'
        }}>
          <div style={{ color: colors.secondaryTextColor, fontSize: '12px', fontWeight: '500' }}>
            <i className="bi bi-info-circle" style={{ marginRight: '4px' }} />
            Remaining value not shown in main categories
          </div>
        </div>
      );
    }
    
    return (
      <div style={{ 
        marginTop: '12px', 
        paddingTop: '12px', 
        borderTop: `1px solid ${colors.borderColor}`,
        background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
        borderRadius: '8px',
        padding: '8px 12px'
      }}>
        <div style={{ color: colors.secondaryTextColor, fontSize: '12px', fontWeight: '500' }}>
          <i className="bi bi-funnel" style={{ marginRight: '4px' }} />
          Filtered data compared to total
        </div>
      </div>
    );
  };

  return createPortal(
    <div style={tooltipStyle}>
      {/* Header com data e grupo */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ color: colors.secondaryTextColor, fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {getDateDisplay()} • {getGroupDisplay()}
        </div>
      </div>

      {/* Item principal */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div 
          style={{ 
            width: '16px', 
            height: '16px', 
            borderRadius: '50%', 
            backgroundColor: labelColor.backgroundColor,
            flexShrink: 0,
            border: `2px solid ${colors.borderColor}`,
            marginTop: '2px'
          }} 
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            color: colors.textColor, 
            fontWeight: '700', 
            fontSize: '16px',
            marginBottom: '4px',
            lineHeight: '1.2'
          }}>
            {displayLabel}
          </div>
          <div style={{ 
            color: colors.accentColor, 
            fontWeight: '600', 
            fontSize: '18px',
            marginBottom: '8px'
          }}>
            {dataPoint.formattedValue}
          </div>
          <div style={{ 
            color: colors.secondaryTextColor, 
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ 
              background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {percentage.toFixed(1)}% of total
            </span>
            <span>•</span>
            <span>Index: {dataPoint.dataIndex}</span>
          </div>
        </div>
      </div>

      {/* Informações de comparação */}
      {getComparisonInfo()}

      {/* Footer com informações adicionais */}
      <div style={{ 
        marginTop: '12px', 
        paddingTop: '12px', 
        borderTop: `1px solid ${colors.borderColor}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px',
        color: colors.secondaryTextColor
      }}>
        <span>
          <i className="bi bi-mouse" style={{ marginRight: '4px' }} />
          Hover for details
        </span>
        <span>
          <i className="bi bi-chart-pie" style={{ marginRight: '4px' }} />
          Pie Chart
        </span>
      </div>
    </div>,
    document.body
  );
} 