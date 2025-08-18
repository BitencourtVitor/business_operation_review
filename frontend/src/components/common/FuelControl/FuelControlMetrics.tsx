
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import type { SamsaraEvent, WexTransaction } from '../../../types/fuelControl';

interface FuelControlMetricsProps {
  filteredSamsara: SamsaraEvent[];
  filteredWex: WexTransaction[];
}

const FuelControlMetrics: React.FC<FuelControlMetricsProps> = ({
  filteredSamsara,
  filteredWex
}) => {
  const totalSamsaraUnits = filteredSamsara.reduce((sum, event) => sum + event.units, 0);
  const totalWexUnits = filteredWex.reduce((sum, transaction) => sum + transaction.units, 0);
  const totalWexValue = filteredWex.reduce((sum, transaction) => sum + transaction.valor, 0);
  const totalEvents = filteredSamsara.length + filteredWex.length;
  const avgConsumptionPerEvent = totalEvents > 0 ? (totalSamsaraUnits + totalWexUnits) / totalEvents : 0;

  const metrics = [
    {
      title: 'Total Samsara',
      value: formatNumber(totalSamsaraUnits),
      subtitle: `${filteredSamsara.length} eventos`,
      icon: 'bi-speedometer2',
      color: 'text-primary',
      bgColor: 'rgba(13, 110, 253, 0.1)',
      borderColor: '#0d6efd'
    },
    {
      title: 'Total WEX',
      value: formatNumber(totalWexUnits),
      subtitle: formatCurrency(totalWexValue),
      icon: 'bi-credit-card',
      color: 'text-success',
      bgColor: 'rgba(25, 135, 84, 0.1)',
      borderColor: '#198754'
    },
    {
      title: 'Total Geral',
      value: formatNumber(totalSamsaraUnits + totalWexUnits),
      subtitle: `${totalEvents} registros`,
      icon: 'bi-graph-up',
      color: 'text-info',
      bgColor: 'rgba(13, 202, 240, 0.1)',
      borderColor: '#0dcaf0'
    },
    {
      title: 'Média/Evento',
      value: formatNumber(avgConsumptionPerEvent),
      subtitle: 'galões por evento',
      icon: 'bi-calculator',
      color: 'text-warning',
      bgColor: 'rgba(255, 193, 7, 0.1)',
      borderColor: '#ffc107'
    }
  ];

  return (
    <div className="card" style={{
      background: 'var(--color-background-primary)',
      border: '1.5px solid var(--color-border-divider)',
      borderRadius: 10,
      marginBottom: '1rem'
    }}>
      <div className="card-header" style={{
        background: 'var(--color-background-secondary)',
        borderBottom: '1px solid var(--color-border-divider)',
        borderRadius: '10px 10px 0 0'
      }}>
        <h6 className="mb-0 fw-semibold" style={{ color: 'var(--color-text-primary)' }}>
          <i className="bi bi-bar-chart me-2"></i>Métricas de Consumo
        </h6>
      </div>
      <div className="card-body">
        <div className="row">
          {metrics.map((metric, index) => (
            <div key={index} className="col-md-3 mb-3">
              <div className="card h-100" style={{
                background: 'var(--color-background-secondary)',
                border: `1px solid ${metric.borderColor}`,
                borderRadius: 8
              }}>
                <div className="card-body text-center">
                  <div className="mb-2" style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: metric.bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto'
                  }}>
                    <i className={`bi ${metric.icon} ${metric.color}`} style={{ fontSize: '1.2rem' }}></i>
                  </div>
                  <h6 className="card-title fw-semibold mb-2" style={{ 
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.9rem'
                  }}>
                    {metric.title}
                  </h6>
                  <h4 className="fw-bold mb-1" style={{ color: metric.color }}>
                    {metric.value}
                  </h4>
                  <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {metric.subtitle}
                  </small>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Resumo Executivo */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="alert" style={{
              background: 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 8
            }}>
              <div className="d-flex align-items-center">
                <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-accent-primary)' }}></i>
                <div>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Resumo Executivo:</strong>
                  <span style={{ color: 'var(--color-text-secondary)' }} className="ms-2">
                    Total de {formatNumber(totalSamsaraUnits + totalWexUnits)} galões consumidos em {totalEvents} eventos.
                    {totalWexValue > 0 && ` Valor total: ${formatCurrency(totalWexValue)}.`}
                    {avgConsumptionPerEvent > 0 && ` Média de ${formatNumber(avgConsumptionPerEvent)} galões por evento.`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuelControlMetrics;
