import React from 'react';

interface PartitionCardProps {
  children: React.ReactNode;
}

export default function PartitionCard({ children }: PartitionCardProps) {
  return (
    <div style={{ background: 'var(--color-background-primary)', minHeight: 120, position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0%', borderRadius: 10 }}>
      <div style={{ flex: 1, minHeight: 60, width: '100%' }}>{children}</div>
    </div>
  );
} 