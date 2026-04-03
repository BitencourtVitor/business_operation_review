interface ForecastMaintenanceProps {
  variant?: 'mobile' | 'desktop';
}

const CONTAINER_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
};

const CARD_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: 640,
  margin: '0 auto',
  padding: '32px',
  borderRadius: 16,
  border: '1px solid var(--color-border-divider)',
  background: 'var(--color-background-secondary)',
  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.08)',
  textAlign: 'center',
};

export default function ForecastMaintenance({ variant = 'desktop' }: ForecastMaintenanceProps) {
  const isMobile = variant === 'mobile';

  return (
    <div style={CONTAINER_STYLE}>
      <div style={CARD_STYLE}>
        <div
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 16px',
            borderRadius: '50%',
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-divider)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i
            className="bi bi-tools"
            style={{ fontSize: 32, color: 'var(--color-accent-primary)' }}
          />
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: isMobile ? 22 : 24, fontWeight: 700 }}>
          Forecast em manutenção
        </h2>
        <p
          style={{
            margin: '0 0 16px',
            color: 'var(--color-text-secondary)',
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          Estamos preparando uma nova experiência de Forecast. Voltamos em breve.
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--color-background-primary)',
            border: '1px dashed var(--color-border-divider)',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}
        >
          <i className="bi bi-info-circle" />
          <span>Dúvidas? Fale com o Vitor.</span>
        </div>
      </div>
    </div>
  );
}

