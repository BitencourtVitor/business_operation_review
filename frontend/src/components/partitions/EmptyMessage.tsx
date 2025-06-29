import React from 'react';

interface EmptyMessageProps {
  text: string;
  showEdit?: boolean;
  onEdit?: () => void;
  icon?: string;
}

export default function EmptyMessage({ text, showEdit, onEdit, icon }: EmptyMessageProps) {
  return (
    <div style={{ height: '100%', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {icon && (
        <i className={`bi ${icon}`} style={{ fontSize: 24, color: 'var(--color-text-secondary)', opacity: 0.6 }} />
      )}
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 15, textAlign: 'center' }}>{text}</span>
      {showEdit && (
        <button onClick={onEdit} style={{ marginTop: 8, border: 'none', background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 14px', color: 'var(--color-accent-primary)', fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)', cursor: 'pointer' }}>
          <i className="bi bi-pencil" /> Editar
        </button>
      )}
    </div>
  );
} 