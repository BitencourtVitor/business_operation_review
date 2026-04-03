import MetricTooltip from '../../tooltips/MetricTooltip';

interface AccountingMetricsProps {
  lastReceivable: number;
  lastPayable: number;
  receivablesAgingDetails: { interval: string; value: number; percentage: number }[];
  payablesAgingDetails: { interval: string; value: number; percentage: number }[];
  selectedGroup: 'all' | 'receivables' | 'payables';
  comparisonMetrics?: {
    filteredValue: number;
    totalValue: number;
    percentage: number;
  } | null;
}

export default function AccountingMetrics({ 
  lastReceivable, 
  lastPayable, 
  receivablesAgingDetails, 
  payablesAgingDetails, 
  selectedGroup,
  comparisonMetrics
}: AccountingMetricsProps) {
  // Função para formatar valor ou mostrar " - "
  const formatValue = (value: number, shouldShow: boolean) => {
    if (!shouldShow) return " - ";
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  return (
    <div className="w-100 d-flex flex-row align-items-center justify-content-between">
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Metric Summary</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Métricas de comparação - apenas se compareWithTotal estiver ON e não for 'all' */}
        {selectedGroup !== 'all' && comparisonMetrics && (
          <>
            <MetricTooltip 
              title="Filtered Value" 
              content="Valor total dos itens filtrados selecionados."
            >
              <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Filtered Value</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                  ${comparisonMetrics.filteredValue.toLocaleString()}
                </span>
              </div>
            </MetricTooltip>
            <MetricTooltip 
              title="Total Value" 
              content="Valor total de todos os itens disponíveis."
            >
              <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Value</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                  ${comparisonMetrics.totalValue.toLocaleString()}
                </span>
              </div>
            </MetricTooltip>
            <MetricTooltip 
              title="Impact" 
              content="Percentual que os itens filtrados representam do total."
            >
              <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Impact</span>
                <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                  {comparisonMetrics.percentage.toFixed(1)}%
                </span>
              </div>
            </MetricTooltip>
          </>
        )}

        {/* Total Receivable */}
        <MetricTooltip 
          title="Total Receivable" 
          content="Valor de recebíveis no último ponto do período visualizado."
          agingDetails={receivablesAgingDetails}
        >
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Receivable</span>
            <span style={{ color: '#1bbf5c', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {formatValue(lastReceivable, selectedGroup !== 'payables')}
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
              {formatValue(lastPayable, selectedGroup !== 'receivables')}
            </span>
          </div>
        </MetricTooltip>

      </div>
    </div>
  );
} 