export default function PartitionLoading() {
  return (
    <div style={{ height: '100%', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div className="spinner-border" role="status" style={{ width: 24, height: 24, color: 'var(--color-accent-primary)' }}>
        <span className="visually-hidden">Carregando...</span>
      </div>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>Carregando...</span>
    </div>
  );
} 