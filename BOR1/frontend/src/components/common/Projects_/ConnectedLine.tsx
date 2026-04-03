import React, { useEffect, useRef, useState } from 'react';

interface ConnectedLineProps {
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
  parentRef?: React.RefObject<HTMLDivElement | null>;
  color?: string;
  strokeWidth?: number;
  zIndex?: number;
}

const ConnectedLine: React.FC<ConnectedLineProps> = ({ fromRef, toRef, parentRef, color = '#ccc', strokeWidth = 2, zIndex = 10 }) => {
  const [coords, setCoords] = useState<[number, number, number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    function updateCoords() {
      if (!fromRef.current || !toRef.current) return;
      const fromRect = fromRef.current.getBoundingClientRect();
      const toRect = toRef.current.getBoundingClientRect();
      const parentRect = parentRef?.current?.getBoundingClientRect() || (fromRef.current.offsetParent as HTMLElement | null)?.getBoundingClientRect() || { left: 0, top: 0 };
      // Centro inferior do container superior
      const x1 = fromRect.left + fromRect.width / 2 - parentRect.left;
      const y1 = fromRect.bottom - parentRect.top;
      // Centro superior do container inferior
      const x2 = toRect.left + toRect.width / 2 - parentRect.left;
      const y2 = toRect.top - parentRect.top;
      setCoords([x1, y1, x2, y2]);
    }
    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [fromRef, toRef, parentRef]);

  if (!coords) return null;
  const [x1, y1, x2, y2] = coords;
  const width = Math.max(x1, x2) + 20;
  const height = Math.max(y1, y2) + 20;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        zIndex,
      }}
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
};

export default ConnectedLine; 