import React from 'react';

export default function PartitionLoading() {
  return (
    <div style={{
      minHeight: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      background: 'transparent',
    }}>
      <div className="spinner-border" style={{ width: 40, height: 40, color: 'var(--color-accent-primary)' }} role="status">
        <span className="visually-hidden">Carregando...</span>
      </div>
    </div>
  );
} 