import React from 'react';
import MetricTooltip from '../../tooltips/MetricTooltip';

interface ServiceMetricsProps {
  allData: any[]; // Dados completos para calcular métricas atuais
}

export default function ServiceMetrics({ allData }: ServiceMetricsProps) {
  // Calcular métricas baseadas nos dados
  const totalRequests = allData.length;
  const materialWaitCount = allData.filter(item => item.material_available_date !== null && item.material_available_date !== '').length;
  const residentWaitCount = allData.filter(item => item.resident_available_date !== null && item.resident_available_date !== '').length;
  const additionalVisitsCount = allData.filter(item => 
    Array.isArray(item.additional_visits) && 
    item.additional_visits.length > 0
  ).length;
  
  // Calcular tempo médio de resolução (em dias)
  const completedRequests = allData.filter(item => item.date_received && item.date_completed);
  const avgResolutionTime = completedRequests.length > 0 
    ? completedRequests.reduce((total, item) => {
        const received = new Date(item.date_received);
        const completed = new Date(item.date_completed);
        return total + Math.ceil((completed.getTime() - received.getTime()) / (1000 * 60 * 60 * 24));
      }, 0) / completedRequests.length
    : 0;

  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Current Status</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Total */}
        <MetricTooltip title="Total de Service Requests" content="Quantidade total de service requests.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{totalRequests}</span>
          </div>
        </MetricTooltip>
        {/* Material Wait */}
        <MetricTooltip title="Espera por Material" content="Quantidade de service requests que tiveram que esperar material chegar.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Material Wait</span>
            <span style={{ color: '#FF8C00', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {materialWaitCount}
            </span>
          </div>
        </MetricTooltip>
        {/* Resident Wait */}
        <MetricTooltip title="Espera por Morador" content="Quantidade de service requests que tiveram que esperar morador estar disponível.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Resident Wait</span>
            <span style={{ color: '#FF8C00', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {residentWaitCount}
            </span>
          </div>
        </MetricTooltip>
        {/* Additional Visits */}
        <MetricTooltip title="Visitas Adicionais" content="Quantidade de service requests que precisaram de visitas adicionais.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Additional Visits</span>
            <span style={{ color: '#dc3545', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {additionalVisitsCount}
            </span>
          </div>
        </MetricTooltip>
        {/* Tempo Médio de Resolução */}
        <MetricTooltip title="Tempo Médio de Resolução" content="Tempo médio em dias para resolução dos service requests.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 140, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Avg Resolution Time</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
              {Math.round(avgResolutionTime)}d
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
}
