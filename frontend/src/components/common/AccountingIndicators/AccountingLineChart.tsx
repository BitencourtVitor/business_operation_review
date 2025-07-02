import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';

interface AccountingLineChartProps {
  chartData: ChartData<'line'>;
  chartOptions: ChartOptions<'line'>;
}

export function AccountingLineChart({ chartData, chartOptions }: AccountingLineChartProps) {
  return (
    <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500 }}>
        {chartData && chartOptions ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Loading chart...</span>
          </div>
        )}
      </div>
    </div>
  );
} 