import React from 'react';

interface CloseButtonProps {
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

const CloseButton: React.FC<CloseButtonProps> = ({ 
  onClick, 
  size = 'md', 
  className = '', 
  title = 'Fechar',
  style = {}
}) => {
  const sizeStyles = {
    sm: { width: 24, height: 24, fontSize: 16 },
    md: { width: 32, height: 32, fontSize: 20 },
    lg: { width: 40, height: 40, fontSize: 24 }
  };

  return (
    <button
      onClick={onClick}
      title={title}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'all 0.2s ease',
        lineHeight: 1,
        ...sizeStyles[size],
        ...style
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-background-secondary)';
        e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}><i className="bi bi-x"></i></span>
    </button>
  );
};

export default CloseButton; 