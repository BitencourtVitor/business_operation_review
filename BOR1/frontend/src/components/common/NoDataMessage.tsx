interface NoDataMessageProps {
  title: string;
  message: string;
  icon?: string;
}

/**
 * Componente de mensagem amigável para ausência de dados
 */
export function NoDataMessage({ title, message, icon }: NoDataMessageProps) {
  return (
    <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
      {icon && <i className={`bi ${icon}`} style={{ fontSize: 48, marginBottom: 12, color: 'var(--color-accent-primary)' }} />}
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15 }}>{message}</div>
    </div>
  );
} 