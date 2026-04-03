interface EmptyMessageProps {
  text: string;
  showEdit?: boolean;
  onEdit?: () => void;
  icon?: string;
}

export default function EmptyMessage({ 
  text, 
  icon = 'bi-inbox', 
  showEdit,
  onEdit
}: EmptyMessageProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-secondary)',
        textAlign: 'center'
      }}
    >
      <i 
        className={`bi ${icon}`} 
        style={{ 
          fontSize: '48px', 
          marginBottom: '16px',
          opacity: 0.6
        }} 
      />
      <p style={{ 
        margin: 0, 
        fontSize: '16px',
        fontWeight: 500
      }}>
        {text}
      </p>
      {showEdit && (
        <button onClick={onEdit} style={{ marginTop: 8, border: 'none', background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 14px', color: 'var(--color-accent-primary)', fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)', cursor: 'pointer' }}>
          <i className="bi bi-pencil" /> Editar
        </button>
      )}
    </div>
  );
} 