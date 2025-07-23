import MetricTooltip from '../../tooltips/MetricTooltip';
import dayjs from 'dayjs';
import type { TakeoffRow } from '../../../types/takeoff';

export default function TakeoffMetrics({ allData }: { allData: TakeoffRow[] }) {
  const total = allData.length;
  const entregues = allData.filter((row) => row.entrega_real && row.entrega_real !== '').length;
  const emAndamento = allData.filter((row) => !row.entrega_real || row.entrega_real === '').length;
  const entreguesComDatas = allData.filter((row) => row.entrega_real && row.data_solicitacao);
  const tempoMedio = entreguesComDatas.length > 0
    ? Math.round(entreguesComDatas.reduce((acc, row) => {
        const inicio = dayjs(row.data_solicitacao);
        const fim = dayjs(row.entrega_real);
        return acc + fim.diff(inicio, 'day');
      }, 0) / entreguesComDatas.length)
    : 0;

  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Status Atual</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        <MetricTooltip title="Total de Projetos" content="Quantidade total de projetos de takeoff.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{total}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Projetos Entregues" content="Projetos com entrega real registrada.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Entregues</span>
            <span style={{ color: '#1bbf5c', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{entregues}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Em Andamento" content="Projetos ainda não entregues.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Em andamento</span>
            <span style={{ color: '#e67e22', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{emAndamento}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Tempo Médio de Entrega" content="Tempo médio em dias entre solicitação e entrega real dos projetos.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 140, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Tempo Médio</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{tempoMedio}d</span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
} 