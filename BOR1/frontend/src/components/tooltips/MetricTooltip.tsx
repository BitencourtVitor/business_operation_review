import React, { useState, useCallback } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  title: string;
  content: string;
  placement?: 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
  style?: React.CSSProperties;
  agingDetails?: { interval: string; value: number; percentage: number }[];
}

const Tooltip: React.FC<TooltipProps> = ({ children, title, content, placement = 'bottom-right', style, agingDetails }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.right, y: rect.bottom, width: rect.width, height: rect.height });
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  // Cálculo de posicionamento customizado
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '12px',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    maxWidth: 350,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    pointerEvents: 'none',
    ...style,
  };
  if (showTooltip) {
    if (placement === 'bottom-right') {
      tooltipStyle.left = position.x;
      tooltipStyle.top = position.y;
      tooltipStyle.transform = 'translate(-100%, 0)'; // Alinha canto inferior direito do alvo ao canto superior direito da tooltip
    } else if (placement === 'top') {
      tooltipStyle.left = position.x - position.width / 2;
      tooltipStyle.top = position.y - position.height;
      tooltipStyle.transform = 'translate(-50%, -100%)';
    } // outros placements podem ser adicionados conforme necessário
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ cursor: 'help' }}>
        {children}
      </div>
      {showTooltip && (
        <div style={tooltipStyle}>
          <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', marginBottom: 8 }}>{title}</div>
          <div style={{ borderTop: '1px solid var(--color-border-divider)', margin: '0 -12px', width: 'calc(100% + 24px)' }} />
          <div style={{ paddingTop: 10, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{content}</div>
          {agingDetails && agingDetails.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border-divider)', paddingTop: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, fontWeight: 600 }}>Aging Detail</div>
              {agingDetails.map((detail, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12 }}>{detail.interval}</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>${detail.value.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-accent-primary)', minWidth: 40, textAlign: 'right' }}>{detail.percentage.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Tooltip; 