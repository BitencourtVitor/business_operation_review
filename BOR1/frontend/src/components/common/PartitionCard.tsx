import React from 'react';

interface PartitionCardProps {
  title: string;
  children: React.ReactNode;
  onExpand?: () => void;
  onExpandModal?: () => void;
  onEdit?: () => void;
  showEditButton?: boolean;
  loading?: boolean;
}

export default function PartitionCard({
  title,
  children,
  onExpand,
  onExpandModal,
  onEdit,
  showEditButton = false,
  loading = false
}: PartitionCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-text-primary)'
          }}
        >
          {title}
        </h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="btn-secondary-custom"
              style={{ 
                width: '32px', 
                height: '32px', 
                fontSize: '14px',
                padding: 0
              }}
              title="Expandir"
            >
              <i className="bi bi-arrows-expand" />
            </button>
          )}
          
          {onExpandModal && (
            <button
              type="button"
              onClick={onExpandModal}
              className="btn-secondary-custom"
              style={{ 
                width: '32px', 
                height: '32px', 
                fontSize: '14px',
                padding: 0
              }}
              title="Expandir como modal"
            >
              <i className="bi bi-window" />
            </button>
          )}
          
          {showEditButton && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="btn-secondary-custom"
              style={{ 
                width: '32px', 
                height: '32px', 
                fontSize: '14px',
                padding: 0
              }}
              title="Editar"
            >
              <i className="bi bi-pencil" />
            </button>
          )}
        </div>
      </div>
      
      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '40px 20px'
          }}
        >
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
} 