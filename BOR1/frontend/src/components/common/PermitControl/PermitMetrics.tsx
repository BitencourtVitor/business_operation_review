import type { PermitRow } from '../../../types/permit';
import MetricTooltip from '../../tooltips/MetricTooltip';

interface PermitMetricsProps {
  allData: PermitRow[]; // Dados completos para calcular métricas atuais
}

export default function PermitMetrics({ allData }: PermitMetricsProps) {
  // Função para obter a data relevante baseada na situação
  const getRelevantDate = (row: PermitRow): string | null => {
    if (row.situacao === 'Not Applied') {
      return row.solicitacao;
    } else if (row.situacao === 'Applied') {
      return row.aplicacao;
    } else if (row.situacao === 'Issued') {
      return row.emissao;
    }
    return null;
  };

  // Calcular métricas atuais (até presente data)
  const currentDate = new Date();
  const currentMetrics = {
    notApplied: allData.filter(row => {
      const relevantDate = getRelevantDate(row);
      return row.situacao === 'Not Applied' && 
             relevantDate && 
             new Date(relevantDate) <= currentDate;
    }).length,
    applied: allData.filter(row => {
      const relevantDate = getRelevantDate(row);
      return row.situacao === 'Applied' && 
             relevantDate && 
             new Date(relevantDate) <= currentDate;
    }).length,
    issued: allData.filter(row => {
      const relevantDate = getRelevantDate(row);
      return row.situacao === 'Issued' && 
             relevantDate && 
             new Date(relevantDate) <= currentDate;
    }).length,
  };

  // Calcular tempo médio de emissão (em dias)
  const issuedPermits = allData.filter(row => row.situacao === 'Issued' && row.emissao && row.solicitacao);
  const averageEmissionTime = issuedPermits.length > 0 
    ? issuedPermits.reduce((total, row) => {
        const requestDate = new Date(row.solicitacao);
        const emissionDate = new Date(row.emissao);
        const diffTime = emissionDate.getTime() - requestDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return total + diffDays;
      }, 0) / issuedPermits.length
    : 0;

  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Current Status</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Total */}
        <MetricTooltip title="Total de Permits Atual" content="Quantidade total de permits até a data atual.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Current Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{currentMetrics.notApplied + currentMetrics.applied + currentMetrics.issued}</span>
          </div>
        </MetricTooltip>
        {/* Not Applied */}
        <MetricTooltip title="Permits Não Aplicados Atual" content="Quantidade de permits não aplicados até a data atual.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Not Applied</span>
            <span style={{ color: 'var(--negative-color)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {currentMetrics.notApplied}
            </span>
          </div>
        </MetricTooltip>
        {/* Applied */}
        <MetricTooltip title="Permits Aplicados Atual" content="Quantidade de permits aplicados até a data atual.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Applied</span>
            <span style={{ width: '100%', color: 'var(--challenges-color)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {currentMetrics.applied}
            </span>
          </div>
        </MetricTooltip>
        {/* Issued */}
        <MetricTooltip title="Permits Emitidos Atual" content="Quantidade de permits emitidos até a data atual.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Issued</span>
            <span style={{ color: 'var(--positive-color)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {currentMetrics.issued}
            </span>
          </div>
        </MetricTooltip>
        {/* Tempo Médio de Emissão */}
        <MetricTooltip title="Tempo Médio de Emissão" content="Tempo médio em dias entre solicitação e emissão dos permits.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 140, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Avg Emission Time</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {Math.round(averageEmissionTime)}d
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
} 