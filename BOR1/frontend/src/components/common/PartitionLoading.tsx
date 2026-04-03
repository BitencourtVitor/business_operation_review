export default function PartitionLoading() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-secondary)',
        background: 'var(--color-background-primary)',
        minHeight: '120px'
      }}
    >
      <div className="spinner-border" role="status" style={{ 
        width: 40, 
        height: 40, 
        color: 'var(--color-accent-primary)',
        marginBottom: '16px'
      }}>
        <span className="visually-hidden">Carregando...</span>
      </div>
      <p style={{ 
        margin: 0, 
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--color-text-secondary)'
      }}>
        Carregando...
      </p>
    </div>
  );
} 