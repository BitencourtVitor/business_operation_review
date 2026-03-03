import { formatDate } from '../../../utils/formatters';

interface ForecastData {
  cliente: string;
  job_site: string;
  month: string;
  year: number;
  projectCount: number;
  startDate: string;
  endDate: string;
}

interface ForecastTableProps {
  forecastData: ForecastData[];
}

export default function ForecastTable({ forecastData }: ForecastTableProps) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="card" style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)' }}>
        <div className="card-header" style={{ background: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-divider)' }}>
          <h5 className="card-title mb-0" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
            <i className="bi bi-calendar3 me-2" style={{ color: 'var(--color-accent-primary)' }} />
            Timeline de Obras por Mês
          </h5>
        </div>
        <div className="card-body p-0">
          {forecastData.length === 0 ? (
            <div className="text-center p-4" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <p className="mb-0">Nenhuma obra encontrada para os filtros selecionados</p>
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              <table className="table table-hover mb-0">
                <thead style={{ background: 'var(--color-background-secondary)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--color-border-divider)', padding: '12px' }}>
                      Cliente
                    </th>
                    <th style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--color-border-divider)', padding: '12px' }}>
                      Job Site
                    </th>
                    <th style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--color-border-divider)', padding: '12px' }}>
                      Mês/Ano
                    </th>
                    <th style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--color-border-divider)', padding: '12px' }}>
                      Qtd Obras
                    </th>
                    <th style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--color-border-divider)', padding: '12px' }}>
                      Período
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.map((item) => (
                    <tr key={`${item.cliente}-${item.job_site}-${item.month}-${item.year}`} style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                      <td style={{ color: 'var(--color-text-primary)', fontSize: 14, padding: '12px', fontWeight: 500 }}>
                        {item.cliente}
                      </td>
                      <td style={{ color: 'var(--color-text-primary)', fontSize: 14, padding: '12px' }}>
                        {item.job_site}
                      </td>
                      <td style={{ color: 'var(--color-text-primary)', fontSize: 14, padding: '12px', fontWeight: 500 }}>
                        {item.month.charAt(0).toUpperCase() + item.month.slice(1)} {item.year}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span 
                          className="badge" 
                          style={{ 
                            background: 'var(--color-accent-primary)', 
                            color: 'white', 
                            fontSize: 12, 
                            fontWeight: 600,
                            padding: '6px 12px',
                            borderRadius: 6
                          }}
                        >
                          {item.projectCount} obra{item.projectCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: 13, padding: '12px' }}>
                        {formatDate(item.startDate)} - {formatDate(item.endDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}