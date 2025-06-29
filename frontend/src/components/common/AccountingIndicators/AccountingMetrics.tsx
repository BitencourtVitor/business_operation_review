import MetricTooltip from '../../tooltips/MetricTooltip';

interface AccountingMetricsProps {
  lastReceivable: number;
  lastPayable: number;
  receivablesAgingDetails: { interval: string; value: number; percentage: number }[];
  payablesAgingDetails: { interval: string; value: number; percentage: number }[];
  outstandingAgingDetails: { interval: string; value: number; percentage: number }[];
}

export default function AccountingMetrics({ 
  lastReceivable, 
  lastPayable, 
  receivablesAgingDetails, 
  payablesAgingDetails, 
  outstandingAgingDetails 
}: AccountingMetricsProps) {
  return (
    <div className="w-100 d-flex flex-row align-items-center justify-content-between">
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Metric Summary</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Total Receivable */}
        <MetricTooltip 
          title="Total Receivable" 
          content="Valor de recebíveis no último ponto do período visualizado."
          agingDetails={receivablesAgingDetails}
        >
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Receivable</span>
            <span style={{ color: '#1bbf5c', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {lastReceivable.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>
        </MetricTooltip>
        {/* Total Payable */}
        <MetricTooltip 
          title="Total Payable" 
          content="Valor de pagáveis no último ponto do período visualizado."
          agingDetails={payablesAgingDetails}
        >
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Payable</span>
            <span style={{ color: '#dc3545', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {lastPayable.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>
        </MetricTooltip>
        {/* Total Outstanding */}
        <MetricTooltip 
          title="Total Outstanding" 
          content="Soma do total a receber e total a pagar do último ponto do período visualizado."
          agingDetails={outstandingAgingDetails}
        >
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Outstanding</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {(lastReceivable + lastPayable).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
} 