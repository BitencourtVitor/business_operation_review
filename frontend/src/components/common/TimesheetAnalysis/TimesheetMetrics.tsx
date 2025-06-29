import type { TimesheetRow } from '../../../types/timesheet';
import MetricTooltip from '../../tooltips/MetricTooltip';

interface TimesheetMetricsProps {
  filteredData: TimesheetRow[];
}

export default function TimesheetMetrics({ filteredData }: TimesheetMetricsProps) {
  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Metric Summary</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Total */}
        <MetricTooltip title="Contagem de Erros" content="Quantidade total de erros no período filtrado.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Count</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{filteredData.length}</span>
          </div>
        </MetricTooltip>
        {/* Added Value */}
        <MetricTooltip title="Valor Adicionado" content="Soma dos valores adicionados (add_dollar) no período filtrado.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Added Value</span>
            <span style={{ color: '#1bbf5c', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {filteredData.reduce((sum: number, row: TimesheetRow) => sum + (parseFloat(row.add_dollar) || 0), 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>
        </MetricTooltip>
        {/* Removed Value */}
        <MetricTooltip title="Valor Removido" content="Soma dos valores removidos (remove_dollar) no período filtrado.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Removed Value</span>
            <span style={{ width: '100%', color: '#dc3545', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {filteredData.reduce((sum: number, row: TimesheetRow) => sum + (parseFloat(row.remove_dollar) || 0), 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>
        </MetricTooltip>
        {/* Total Value */}
        <MetricTooltip title="Valor Total" content="Soma do valor adicionado e removido no período filtrado.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Value</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {(() => {
                const add = filteredData.reduce((sum: number, row: TimesheetRow) => sum + (parseFloat(row.add_dollar) || 0), 0);
                const rem = filteredData.reduce((sum: number, row: TimesheetRow) => sum + (parseFloat(row.remove_dollar) || 0), 0);
                return (add + rem).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
              })()}
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
} 