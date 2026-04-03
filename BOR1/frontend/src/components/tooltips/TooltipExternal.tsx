import type { TooltipExternalProps } from '../../types/accounting';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function TooltipExternal({
  tooltip,
  chartLabels,
  chartDatasets,
}: TooltipExternalProps) {
  if (!tooltip || !tooltip.opacity || (tooltip.opacity as number) === 0) {
    return null;
  }

  const tooltipData = tooltip.dataPoints as Array<{
    datasetIndex: number;
    index: number;
    value: number;
  }>;

  if (!tooltipData || tooltipData.length === 0) {
    return null;
  }

  const position = tooltip.caretX as number;
  const top = (tooltip.caretY as number) - 10;

  return (
    <div
      style={{
        position: 'absolute',
        left: position,
        top: top,
        transform: 'translate(-50%, -100%)',
        background: 'var(--color-background-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        pointerEvents: 'none',
        minWidth: '200px'
      }}
    >
      <div style={{ marginBottom: '8px' }}>
        <span style={{ 
          color: 'var(--color-text-secondary)', 
          fontSize: '12px', 
          fontWeight: 500 
        }}>
          {formatDate(chartLabels[tooltipData[0].index] || '')}
        </span>
      </div>
      
      {tooltipData.map((dataPoint, index) => {
        const dataset = chartDatasets[dataPoint.datasetIndex];
        const value = dataPoint.value;
        
        return (
          <div key={index} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: index < tooltipData.length - 1 ? '4px' : 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px',
                  backgroundColor: dataset.borderColor
                }}
              />
              <span style={{ 
                color: 'var(--color-text-primary)', 
                fontSize: '14px',
                fontWeight: 500
              }}>
                {dataset.label}:
              </span>
            </div>
            <span style={{ 
              color: dataset.borderColor, 
              fontSize: '14px',
              fontWeight: 600
            }}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
} 