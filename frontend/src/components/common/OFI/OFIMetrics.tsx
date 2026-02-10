import type { OFIData } from '../../../hooks/useOFIData';

interface OFIMetricsProps {
  data: OFIData[];
}

export default function OFIMetrics({ data }: OFIMetricsProps) {
  const calculateAverage = (key: keyof Pick<OFIData, 'fieldwire_score' | 'machines_score' | 'contract_score' | 'systems_score' | 'total_score'>) => {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, curr) => acc + (curr[key] as number), 0);
    return parseFloat((sum / data.length).toFixed(1));
  };

  const ofiTotal = calculateAverage('total_score');

  const secondaryMetrics = [
    { label: 'Fieldwire', value: calculateAverage('fieldwire_score'), max: 2.0 },
    { label: 'Machines', value: calculateAverage('machines_score'), max: 2.0 },
    { label: 'Contract', value: calculateAverage('contract_score'), max: 2.0 },
    { label: 'Systems', value: calculateAverage('systems_score'), max: 1.0 },
  ];

  const getScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 85) return '#10b981'; // Verde (Ótimo)
    if (percentage >= 65) return '#f59e0b'; // Amarelo (Atenção)
    return '#ef4444'; // Vermelho (Crítico)
  };

  return (
    <div className="d-flex flex-row align-items-stretch" style={{ 
      borderBottom: '1px solid var(--color-border-divider)', 
      background: 'var(--color-background-primary)',
      height: '85px'
    }}>
      {/* OFI TOTAL - DESTAQUE PRINCIPAL */}
      <div className="d-flex flex-column justify-content-center align-items-center px-4" style={{ 
        minWidth: '240px',
        borderRight: '2px solid var(--color-border-divider)',
        background: 'rgba(46, 107, 230, 0.04)',
        position: 'relative'
      }}>
        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 4, background: 'var(--color-brand-blue)', borderRadius: '0 4px 4px 0' }} />
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2, letterSpacing: '0.5px' }}>
          OFI Total (Index)
        </span>
        <div className="d-flex align-items-baseline gap-2">
          <span style={{ 
            color: getScoreColor(ofiTotal, 7), 
            fontWeight: 800, 
            fontSize: 34, 
            lineHeight: 1 
          }}>
            {ofiTotal.toFixed(1)}
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 500, opacity: 0.8 }}>/ 7.0</span>
        </div>
      </div>

      {/* MÉTRICAS SECUNDÁRIAS */}
      <div className="d-flex flex-row align-items-stretch flex-grow-1">
        {secondaryMetrics.map((metric, index) => (
          <div key={index} className="d-flex flex-column justify-content-center align-items-center px-4" style={{ 
            flex: 1,
            borderRight: index === secondaryMetrics.length - 1 ? 'none' : '1px solid var(--color-border-divider)',
            transition: 'background 0.2s ease'
          }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.3px' }}>
              {metric.label}
            </span>
            <div className="d-flex align-items-center gap-3">
              <span style={{ 
                color: getScoreColor(metric.value, metric.max), 
                fontWeight: 700, 
                fontSize: 20,
                lineHeight: 1,
                minWidth: '35px'
              }}>
                {metric.value.toFixed(1)}
              </span>
              <div style={{ height: 6, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden', width: 80 }}>
                <div style={{ 
                  width: `${(metric.value / metric.max) * 100}%`, 
                  height: '100%', 
                  background: getScoreColor(metric.value, metric.max),
                  transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow: '0 0 4px rgba(0,0,0,0.1)'
                }} />
              </div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, opacity: 0.7 }}>
                / {metric.max.toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
