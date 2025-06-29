import React, { useState, useCallback } from 'react';

interface MetricTooltipProps {
  children: React.ReactNode;
  title: string;
  content: string;
  agingDetails?: { interval: string; value: number; percentage: number }[];
}

const MetricTooltip: React.FC<MetricTooltipProps> = ({ children, title, content, agingDetails }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ cursor: 'help' }}>
        {children}
      </div>
      {showTooltip && (
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 8,
            padding: '12px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            maxWidth: 350,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-accent-primary)' }}>{title}</div>
          <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.4, marginBottom: agingDetails && agingDetails.length > 0 ? 8 : 0 }}>{content}</div>
          
          {agingDetails && agingDetails.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-divider)', paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-accent-primary)', marginBottom: 6 }}>Aging Detail:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {agingDetails.map((detail, index) => (
                  <div key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                      <span style={{ color: 'var(--color-text-secondary)', minWidth: 80 }}>{detail.interval}</span>
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, margin: '0 8px' }}>
                        {detail.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </span>
                      <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
                        {detail.percentage.toFixed(1)}%
                      </span>
                    </div>
                    {index < agingDetails.length - 1 && (
                      <div style={{ 
                        height: '1px', 
                        background: 'var(--color-border-divider)', 
                        margin: '4px 0',
                        opacity: 0.6 
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MetricTooltip; 