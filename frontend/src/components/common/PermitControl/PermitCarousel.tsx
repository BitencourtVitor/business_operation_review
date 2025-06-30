import React, { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PermitRow } from '../../../types/permit';

interface PermitCarouselProps {
  filteredData: PermitRow[];
  selectedSituation?: string[];
}

// Cores customizáveis por status (usando as mesmas do gráfico)
const STATUS = {
  'Not Applied': { color: '#dc3545', icon: 'bi-circle-fill' },
  'Applied': { color: '#ffc107', icon: 'bi-circle-fill' },
  'Issued': { color: '#1bbf5c', icon: 'bi-circle-fill' },
};

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// Função para calcular tempo de processamento
const calculateProcessingTime = (permit: PermitRow): number => {
  if (!permit.solicitacao) return 0;
  
  const requestDate = new Date(permit.solicitacao);
  let endDate: Date;
  
  if (permit.situacao === 'Issued' && permit.emissao) {
    // Para permits emitidos: tempo entre emissão e solicitação
    endDate = new Date(permit.emissao);
  } else {
    // Para permits em andamento: tempo entre hoje e solicitação
    endDate = new Date();
  }
  
  const diffTime = endDate.getTime() - requestDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export default function PermitCarousel({ filteredData, selectedSituation }: PermitCarouselProps) {
  const [selected, setSelected] = useState<PermitRow | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showIssued, setShowIssued] = useState(true);
  const [situationOrder, setSituationOrder] = useState<string[]>(['Not Applied', 'Applied', 'Issued']);
  const [draggedSituation, setDraggedSituation] = useState<string | null>(null);
  const [dragOverSituation, setDragOverSituation] = useState<string | null>(null);
  const [sortByProcessingTime, setSortByProcessingTime] = useState<'asc' | 'desc' | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0, dragging: false });

  // Verificar se apenas um status está selecionado (controles devem ser desabilitados)
  const isSingleStatusSelected = selectedSituation && selectedSituation.length === 1;

  // Filtrar e ordenar dados baseado nos controles
  const displayData = useMemo(() => {
    const data = showIssued ? filteredData : filteredData.filter(permit => permit.situacao !== 'Issued');
    
    // Agrupar por situação conforme ordem definida
    const groupedData = situationOrder.map(situation => {
      const groupPermits = data.filter(permit => permit.situacao === situation);
      
      // Se ordenação por tempo de processamento estiver ativada, ordenar o grupo por tempo
      if (sortByProcessingTime) {
        return groupPermits.sort((a, b) => {
          const timeA = calculateProcessingTime(a);
          const timeB = calculateProcessingTime(b);
          return sortByProcessingTime === 'desc' ? timeB - timeA : timeA - timeB; // desc: maior tempo primeiro, asc: menor tempo primeiro
        });
      }
      
      return groupPermits;
    });

    // Concatenar todos os grupos mantendo a ordem das situações
    return groupedData.flat();
  }, [filteredData, showIssued, situationOrder, sortByProcessingTime]);

  // Função para reordenar situações
  const handleSituationDragStart = (e: React.DragEvent, situation: string) => {
    setDraggedSituation(situation);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSituationDragOver = (e: React.DragEvent, targetSituation: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSituation(targetSituation);
  };

  const handleSituationDrop = (e: React.DragEvent, targetSituation: string) => {
    e.preventDefault();
    setDragOverSituation(null);
    if (draggedSituation && draggedSituation !== targetSituation) {
      const newOrder = [...situationOrder];
      const draggedIndex = newOrder.indexOf(draggedSituation);
      const targetIndex = newOrder.indexOf(targetSituation);
      
      // Trocar posições
      newOrder[draggedIndex] = targetSituation;
      newOrder[targetIndex] = draggedSituation;
      
      setSituationOrder(newOrder);
    }
    setDraggedSituation(null);
  };

  const handleSituationDragEnd = () => {
    setDraggedSituation(null);
    setDragOverSituation(null);
  };

  // Drag horizontal com mouse para carrossel
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current.dragging = true;
    drag.current.x = e.clientX;
    drag.current.scroll = carouselRef.current?.scrollLeft || 0;
    document.body.style.cursor = 'grabbing';
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!drag.current.dragging) return;
    if (carouselRef.current) {
      const dx = drag.current.x - e.clientX;
      carouselRef.current.scrollLeft = drag.current.scroll + dx;
    }
  };
  const onMouseUp = () => {
    drag.current.dragging = false;
    document.body.style.cursor = '';
  };
  React.useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  if (displayData.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
          <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
            Permit Cards
          </h4>
          <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
            {/* Controle de ordenação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', opacity: isSingleStatusSelected ? 0.5 : 1 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {situationOrder.map((situation) => {
                  const isIssued = situation === 'Issued';
                  const isDisabled = (isIssued && !showIssued) || isSingleStatusSelected;
                  return (
                    <div
                      key={situation}
                      draggable={!isDisabled}
                      onDragStart={isDisabled ? undefined : (e) => handleSituationDragStart(e, situation)}
                      onDragOver={isDisabled ? undefined : (e) => handleSituationDragOver(e, situation)}
                      onDrop={isDisabled ? undefined : (e) => handleSituationDrop(e, situation)}
                      onDragEnd={isDisabled ? undefined : handleSituationDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedSituation === situation
                          ? 'var(--color-accent-primary)'
                          : dragOverSituation === situation && draggedSituation
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: isDisabled
                          ? 'var(--color-text-secondary)'
                          : draggedSituation === situation
                            ? '#fff'
                            : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: isDisabled ? 'not-allowed' : 'grab',
                        transition: 'all 0.2s',
                        opacity: isDisabled
                          ? 0.5
                          : draggedSituation && draggedSituation !== situation
                            ? 0.6
                            : 1,
                        boxShadow: dragOverSituation === situation && draggedSituation ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                        pointerEvents: isDisabled ? 'none' : undefined,
                      }}
                    >
                      <span style={{ color: STATUS[situation as keyof typeof STATUS]?.color, fontSize: 7 }}>
                        <i className={STATUS[situation as keyof typeof STATUS]?.icon} />
                      </span>
                      {situation === 'Not Applied' ? 'Not Applied' : situation}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Ordenação por Tempo de Processamento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Time</span>
              <button 
                onClick={() => setSortByProcessingTime(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                style={{ 
                  background: sortByProcessingTime ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                  color: sortByProcessingTime ? '#fff' : 'var(--color-text-secondary)', 
                  border: '1px solid var(--color-border-divider)', 
                  borderRadius: 15, 
                  padding: '4px 10px', 
                  fontSize: 15, 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
              >
                {sortByProcessingTime === 'asc' ? 'ASC' : sortByProcessingTime === 'desc' ? 'DESC' : 'OFF'}
              </button>
            </div>
            {/* Toggle Show Issued */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', opacity: isSingleStatusSelected ? 0.5 : 1 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Show Issued</span>
              <button 
                onClick={isSingleStatusSelected ? undefined : () => setShowIssued(!showIssued)}
                style={{ 
                  background: showIssued ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                  color: showIssued ? '#fff' : 'var(--color-text-secondary)', 
                  border: '1px solid var(--color-border-divider)', 
                  borderRadius: 15, 
                  padding: '4px 10px', 
                  fontSize: 15, 
                  cursor: isSingleStatusSelected ? 'not-allowed' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  opacity: isSingleStatusSelected ? 0.5 : 1
                }}
              >
                {showIssued ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
        <div style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20, 
          color: 'var(--color-text-secondary)', 
          textAlign: 'center',
          fontStyle: 'italic',
          background: 'var(--color-background-primary)',
          borderRadius: 10,
          border: '1px solid var(--color-border-divider)',
          margin: '0 10px 10px 10px'
        }}>
          Nenhum dado encontrado para os filtros selecionados
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          Permit Cards
        </h4>
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Controle de ordenação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', opacity: isSingleStatusSelected ? 0.5 : 1 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {situationOrder.map((situation) => {
                const isIssued = situation === 'Issued';
                const isDisabled = (isIssued && !showIssued) || isSingleStatusSelected;
                return (
                  <div
                    key={situation}
                    draggable={!isDisabled}
                    onDragStart={isDisabled ? undefined : (e) => handleSituationDragStart(e, situation)}
                    onDragOver={isDisabled ? undefined : (e) => handleSituationDragOver(e, situation)}
                    onDrop={isDisabled ? undefined : (e) => handleSituationDrop(e, situation)}
                    onDragEnd={isDisabled ? undefined : handleSituationDragEnd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 12px',
                      background: draggedSituation === situation
                        ? 'var(--color-accent-primary)'
                        : dragOverSituation === situation && draggedSituation
                          ? 'var(--color-background-secondary)'
                          : 'var(--color-background-primary)',
                      color: isDisabled
                        ? 'var(--color-text-secondary)'
                        : draggedSituation === situation
                          ? '#fff'
                          : 'var(--color-text-primary)',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: isDisabled ? 'not-allowed' : 'grab',
                      transition: 'all 0.2s',
                      opacity: isDisabled
                        ? 0.5
                        : draggedSituation && draggedSituation !== situation
                          ? 0.6
                          : 1,
                      boxShadow: dragOverSituation === situation && draggedSituation ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      pointerEvents: isDisabled ? 'none' : undefined,
                    }}
                  >
                    <span style={{ color: STATUS[situation as keyof typeof STATUS]?.color, fontSize: 7 }}>
                      <i className={STATUS[situation as keyof typeof STATUS]?.icon} />
                    </span>
                    {situation === 'Not Applied' ? 'Not Applied' : situation}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Ordenação por Tempo de Processamento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Time</span>
            <button 
              onClick={() => setSortByProcessingTime(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              style={{ 
                background: sortByProcessingTime ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: sortByProcessingTime ? '#fff' : 'var(--color-text-secondary)', 
                border: '1px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 10px', 
                fontSize: 15, 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                transition: 'all 0.2s'
              }}
            >
              {sortByProcessingTime === 'asc' ? 'ASC' : sortByProcessingTime === 'desc' ? 'DESC' : 'OFF'}
            </button>
          </div>
          {/* Toggle Show Issued */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', opacity: isSingleStatusSelected ? 0.5 : 1 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Show Issued</span>
            <button 
              onClick={isSingleStatusSelected ? undefined : () => setShowIssued(!showIssued)}
              style={{ 
                background: showIssued ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: showIssued ? '#fff' : 'var(--color-text-secondary)', 
                border: '1px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 10px', 
                fontSize: 15, 
                cursor: isSingleStatusSelected ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                transition: 'all 0.2s',
                opacity: isSingleStatusSelected ? 0.5 : 1
              }}
            >
              {showIssued ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '40vh', padding: '0 10px 10px 10px' }}>
        <div
          ref={carouselRef}
          className="custom-scrollbar"
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            overflowX: 'auto',
            padding: '8px 0 8px 8px',
            cursor: drag.current.dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            WebkitOverflowScrolling: 'touch',
            flex: '1 1 0%',
            minHeight: 0,
          }}
          onMouseDown={onMouseDown}
        >
          {displayData.map((permit) => (
            <div
              key={permit.id}
              style={{
                minWidth: 220,
                maxWidth: 250,
                background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 10,
                boxShadow: hovered === permit.id ? '0 4px 16px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                position: 'relative',
                transition: 'box-shadow 0.2s, border 0.2s',
              }}
              onMouseEnter={() => setHovered(permit.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(permit)}
              title={hovered === permit.id ? `Model: ${permit.model || '-'}\nObs: ${permit.observacao || '-'}` : ''}
            >
              {/* Cabeçalho do Card */}
              <div style={{ 
                padding: '12px 16px 8px 16px', 
                borderBottom: '1px solid var(--color-border-divider)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: STATUS[permit.situacao as keyof typeof STATUS]?.color || 'var(--color-text-secondary)' }}>
                    <i className={STATUS[permit.situacao as keyof typeof STATUS]?.icon || 'bi-circle'} />
                  </span>
                  <span style={{ 
                    color: 'var(--color-text-primary)', 
                    fontWeight: 600, 
                    fontSize: 15 
                  }}>
                    {permit.situacao || 'N/A'}
                  </span>
                </div>
                {permit.arquivo && (
                  <a
                    href={permit.arquivo}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-accent-primary)', fontSize: 18 }}
                    title="Abrir arquivo"
                    onClick={e => e.stopPropagation()}
                  >
                    <i className="bi bi-file-earmark-pdf" />
                  </a>
                )}
              </div>
              
              {/* Body do Card */}
              <div style={{ padding: '8px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 16, textAlign: 'center' }}>
                  {permit.jobsite || 'N/A'}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'center' }}>
                  {permit.lot_address || 'N/A'}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                  <span title="Request Date">Req: {formatDate(permit.solicitacao)}</span>
                  <span title="Application Date">App: {formatDate(permit.aplicacao)}</span>
                  <span title="Emission Date">Emi: {formatDate(permit.emissao)}</span>
                </div>
                {/* Tempo de Processamento */}
                {permit.solicitacao && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    gap: 4,
                    fontSize: 12,
                    color: permit.situacao === 'Issued' ? 'var(--positive-color)' : 'var(--challenges-color)',
                    fontWeight: 500
                  }}>
                    <i className="bi bi-clock" style={{ fontSize: 10 }} />
                    <span>
                      {permit.situacao === 'Issued' ? 'Processado em' : 'Em processamento há'} {calculateProcessingTime(permit)}d
                    </span>
                  </div>
                )}
                {permit.observacao && (
                  <div style={{ 
                    color: 'var(--color-text-secondary)', 
                    fontSize: 12, 
                    fontStyle: 'italic',
                    textAlign: 'center',
                    lineHeight: 1.3
                  }}>
                    {permit.observacao}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Modal simples */}
      {selected && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.25)',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            transform: 'translateZ(0)',
            willChange: 'z-index',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: 'var(--color-background-primary)',
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              minWidth: 320,
              maxWidth: 600,
              color: 'var(--color-text-primary)',
              position: 'relative',
              border: '1px solid var(--color-border-divider)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              pointerEvents: 'auto',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid var(--color-border-divider)', 
              background: 'var(--color-background-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h5 style={{ 
                color: 'var(--color-text-primary)', 
                fontSize: 24, 
                fontWeight: 400, 
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Visualizar</span>
                <span>Permit</span>
              </h5>
              <button
                onClick={() => setSelected(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  fontSize: 22, 
                  color: 'var(--color-text-secondary)', 
                  cursor: 'pointer',
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Fechar"
              >
                ×
              </button>
            </div>

            {/* Sub-header */}
            <div style={{ 
              padding: '10px 20px', 
              borderBottom: '1px solid var(--color-border-divider)', 
              background: 'var(--color-background-secondary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-building" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                  <span>Jobsite: {selected.jobsite || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-geo-alt" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                  <span>Endereço: {selected.lot_address || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ 
              padding: '24px', 
              background: 'var(--color-background-primary)',
              flex: 1,
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Status */}
                <div>
                  <h6 style={{ 
                    color: 'var(--color-text-primary)', 
                    fontWeight: 600, 
                    fontSize: 16, 
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <i className="bi bi-info-circle" /> Status
                  </h6>
                  <div style={{ 
                    background: 'var(--color-background-secondary)', 
                    borderRadius: 8, 
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span style={{ 
                      fontSize: 10, 
                      color: STATUS[selected.situacao as keyof typeof STATUS]?.color || 'var(--color-text-secondary)' 
                    }}>
                      <i className={STATUS[selected.situacao as keyof typeof STATUS]?.icon || 'bi-circle'} />
                    </span>
                    <span style={{ 
                      color: 'var(--color-text-primary)', 
                      fontWeight: 500, 
                      fontSize: 15 
                    }}>
                      {selected.situacao || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Informações Gerais */}
                <div>
                  <h6 style={{ 
                    color: 'var(--color-text-primary)', 
                    fontWeight: 600, 
                    fontSize: 16, 
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <i className="bi bi-card-text" /> Informações Gerais
                  </h6>
                  <div style={{ 
                    background: 'var(--color-background-secondary)', 
                    borderRadius: 8, 
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Modelo:</span>
                      <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{selected.model || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Data de Solicitação:</span>
                      <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{formatDate(selected.solicitacao)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Data de Aplicação:</span>
                      <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{formatDate(selected.aplicacao)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Data de Emissão:</span>
                      <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{formatDate(selected.emissao)}</span>
                    </div>
                    {/* Tempo de Processamento */}
                    {selected.solicitacao && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Tempo de Processamento:</span>
                        <span style={{ 
                          color: selected.situacao === 'Issued' ? 'var(--positive-color)' : 'var(--challenges-color)', 
                          fontSize: 14, 
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <i className="bi bi-clock" style={{ fontSize: 10 }} />
                          {calculateProcessingTime(selected)}d
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Observação */}
                {selected.observacao && (
                  <div>
                    <h6 style={{ 
                      color: 'var(--color-text-primary)', 
                      fontWeight: 600, 
                      fontSize: 16, 
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <i className="bi bi-chat-text" /> Observação
                    </h6>
                    <div style={{ 
                      background: 'var(--color-background-secondary)', 
                      borderRadius: 8, 
                      padding: 16,
                      minHeight: 60
                    }}>
                      <span style={{ 
                        color: 'var(--color-text-primary)', 
                        fontSize: 14, 
                        lineHeight: 1.4,
                        fontStyle: 'italic'
                      }}>
                        {selected.observacao}
                      </span>
                    </div>
                  </div>
                )}

                {/* Arquivo */}
                {selected.arquivo && (
                  <div>
                    <h6 style={{ 
                      color: 'var(--color-text-primary)', 
                      fontWeight: 600, 
                      fontSize: 16, 
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <i className="bi bi-file-earmark" /> Documento
                    </h6>
                    <div style={{ 
                      background: 'var(--color-background-secondary)', 
                      borderRadius: 8, 
                      padding: 16
                    }}>
                      <a 
                        href={selected.arquivo} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ 
                          color: 'var(--color-accent-primary)', 
                          fontWeight: 500, 
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          textDecoration: 'none'
                        }}
                      >
                        <i className="bi bi-file-earmark-pdf" />
                        Abrir arquivo
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              borderTop: '1px solid var(--color-border-divider)', 
              background: 'var(--color-background-primary)', 
              display: 'flex', 
              justifyContent: 'flex-end', 
              alignItems: 'center', 
              gap: 10,
              padding: '16px 24px'
            }}>
              <button 
                type="button" 
                onClick={() => setSelected(null)}
                style={{ 
                  borderRadius: 6, 
                  fontWeight: 500, 
                  minWidth: 90,
                  padding: '8px 16px',
                  background: 'var(--color-background-secondary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-divider)',
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 