import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ServiceRequestRow } from '../../../types/service';
import CloseButton from '../../../utils/CloseButton';
import { formatDateUS, formatDateUSShort, calculateDaysDifference } from '../../../utils/dateUtils';

interface ServiceCarouselProps {
  filteredData: ServiceRequestRow[];
  modalWidth?: number; // Largura do modal em vw (ex: 80 = 80vw)
}

// Cores customizáveis por status
const STATUS = {
  'Open': { color: '#dc3545', icon: 'bi-circle-fill' },
  'In Progress': { color: '#ffc107', icon: 'bi-circle-fill' },
  'Completed': { color: '#1bbf5c', icon: 'bi-circle-fill' },
};

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// Função para calcular tempo de resolução considerando todas as condições
const calculateResolutionTimeAdvanced = (service: ServiceRequestRow): { days: number; isOnTime: boolean; startDate: string; endDate: string; reason: string } => {
  if (!service.date_received) return { days: 0, isOnTime: false, startDate: '', endDate: '', reason: 'No start date' };
  
  let startDate: string;
  let endDate: string;
  let reason: string;
  
  // Determinar data de início
  if (service.resident_available_date && service.resident_available_date !== '') {
    // Se morador não estava disponível, conta a partir da disponibilidade do morador
    startDate = service.resident_available_date;
    reason = 'From resident availability';
  } else {
    // Conta a partir da data de recebimento
    startDate = service.date_received;
    reason = 'From request date';
  }
  
  // Determinar data de fim
  if (service.date_completed) {
    // Se há visitas adicionais, usar a data da última visita
    if (Array.isArray(service.additional_visits) && service.additional_visits.length > 0) {
      // Pegar a data mais recente das visitas adicionais
      const validVisitDates = service.additional_visits
        .filter(date => date && date !== '')
        .sort()
        .reverse();
      
      if (validVisitDates.length > 0) {
        endDate = validVisitDates[0];
      } else {
        endDate = service.date_completed;
      }
    } else {
      // Se não há visitas adicionais, usar a data de completude
      endDate = service.date_completed;
    }
  } else {
    // Para requests em andamento: usar data atual no formato YYYY-MM-DD
    const today = new Date();
    endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  
  const days = calculateDaysDifference(startDate, endDate);
  const isOnTime = days <= 14;
  
  return {
    days,
    isOnTime,
    startDate: formatDateUS(startDate),
    endDate: formatDateUS(endDate),
    reason
  };
};

// Função para determinar status do service request
const getServiceStatus = (service: ServiceRequestRow): string => {
  if (service.date_completed) return 'Completed';
  if (service.date_received) return 'In Progress';
  return 'Open';
};

export default function ServiceCarousel({ filteredData, modalWidth = 600 }: ServiceCarouselProps) {
  const [selected, setSelected] = useState<ServiceRequestRow | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [warrantyOrder, setWarrantyOrder] = useState<string[]>(['Warranty', 'Non-Warranty']);
  const [resolutionOrder, setResolutionOrder] = useState<string[]>(['On Time', 'Exceeded']);
  const [draggedWarranty, setDraggedWarranty] = useState<string | null>(null);
  const [dragOverWarranty, setDragOverWarranty] = useState<string | null>(null);
  const [draggedResolution, setDraggedResolution] = useState<string | null>(null);
  const [dragOverResolution, setDragOverResolution] = useState<string | null>(null);
  const [showWarranty, setShowWarranty] = useState(true);
  const [showNonWarranty, setShowNonWarranty] = useState(true);
  const [showOnTime, setShowOnTime] = useState(true);
  const [showExceeded, setShowExceeded] = useState(true);
  const [sortByResolutionTime, setSortByResolutionTime] = useState<'asc' | 'desc' | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0, dragging: false });
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Função para reordenar warranty
  const handleWarrantyDragStart = (e: React.DragEvent, warranty: string) => {
    setDraggedWarranty(warranty);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleWarrantyDragOver = (e: React.DragEvent, targetWarranty: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverWarranty(targetWarranty);
  };

  const handleWarrantyDrop = (e: React.DragEvent, targetWarranty: string) => {
    e.preventDefault();
    setDragOverWarranty(null);
    if (draggedWarranty && draggedWarranty !== targetWarranty) {
      const newOrder = [...warrantyOrder];
      const draggedIndex = newOrder.indexOf(draggedWarranty);
      const targetIndex = newOrder.indexOf(targetWarranty);
      
      // Trocar posições
      newOrder[draggedIndex] = targetWarranty;
      newOrder[targetIndex] = draggedWarranty;
      
      setWarrantyOrder(newOrder);
    }
    setDraggedWarranty(null);
  };

  const handleWarrantyDragEnd = () => {
    setDraggedWarranty(null);
    setDragOverWarranty(null);
  };

  // Função para reordenar resolution
  const handleResolutionDragStart = (e: React.DragEvent, resolution: string) => {
    setDraggedResolution(resolution);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleResolutionDragOver = (e: React.DragEvent, targetResolution: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverResolution(targetResolution);
  };

  const handleResolutionDrop = (e: React.DragEvent, targetResolution: string) => {
    e.preventDefault();
    setDragOverResolution(null);
    if (draggedResolution && draggedResolution !== targetResolution) {
      const newOrder = [...resolutionOrder];
      const draggedIndex = newOrder.indexOf(draggedResolution);
      const targetIndex = newOrder.indexOf(targetResolution);
      
      // Trocar posições
      newOrder[draggedIndex] = targetResolution;
      newOrder[targetIndex] = draggedResolution;
      
      setResolutionOrder(newOrder);
    }
    setDraggedResolution(null);
  };

  const handleResolutionDragEnd = () => {
    setDraggedResolution(null);
    setDragOverResolution(null);
  };

  // Função para abrir o campo de busca e focar
  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Função para fechar o campo de busca
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  // Filtrar dados conforme texto digitado em address
  const filteredDataRaw = React.useMemo(() => {
    if (!searchText.trim()) return filteredData;
    const lower = searchText.toLowerCase();
    return filteredData.filter(row => 
      (row.address || '').toLowerCase().includes(lower)
    );
  }, [filteredData, searchText]);

  // Filtrar dados baseado nos controles de warranty e resolution time
  const displayData = React.useMemo(() => {
    // Primeiro filtrar os dados baseado nos toggles
    const filteredData = filteredDataRaw.filter(service => {
      // Filtro de warranty
      const warrantyMatch = (service.warranty && showWarranty) || (!service.warranty && showNonWarranty);
      
      // Filtro de resolution time
      const resolutionTime = calculateResolutionTimeAdvanced(service);
      const resolutionMatch = (resolutionTime.isOnTime && showOnTime) || (!resolutionTime.isOnTime && showExceeded);
      
      return warrantyMatch && resolutionMatch;
    });

    // Agrupar por warranty conforme ordem definida
    const groupedByWarranty = warrantyOrder.map(warranty => {
      const isWarranty = warranty === 'Warranty';
      const warrantyGroup = filteredData.filter(service => 
        (service.warranty && isWarranty) || (!service.warranty && !isWarranty)
      );

      // Dentro de cada grupo de warranty, agrupar por resolution time
      const groupedByResolution = resolutionOrder.map(resolution => {
        const isOnTime = resolution === 'On Time';
        const resolutionGroup = warrantyGroup.filter(service => {
          const resolutionTime = calculateResolutionTimeAdvanced(service);
          return (resolutionTime.isOnTime && isOnTime) || (!resolutionTime.isOnTime && !isOnTime);
        });

        // Se ordenação por tempo de resolução estiver ativada, ordenar o grupo
        if (sortByResolutionTime) {
          return resolutionGroup.sort((a, b) => {
            const timeA = calculateResolutionTimeAdvanced(a).days;
            const timeB = calculateResolutionTimeAdvanced(b).days;
            return sortByResolutionTime === 'desc' ? timeB - timeA : timeA - timeB;
          });
        }

        return resolutionGroup;
      });

      // Concatenar os grupos de resolution dentro do grupo de warranty
      return groupedByResolution.flat();
    });

    // Concatenar todos os grupos de warranty mantendo a ordem
    return groupedByWarranty.flat();
  }, [filteredDataRaw, showWarranty, showNonWarranty, showOnTime, showExceeded, warrantyOrder, resolutionOrder, sortByResolutionTime]);

  if (displayData.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
              Service Request Cards
            </h4>
          </div>
                  <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Filtro de texto */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: searchOpen ? 'space-between' : 'center',
              position: 'relative',
              width: searchOpen ? 220 : 42,
              height: 42,
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              background: searchOpen ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: searchOpen ? 25 : 21,
              padding: searchOpen ? '2px 8px 2px 8px' : '4px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              className="btn-tertiary-custom d-flex align-items-center justify-content-center"
              style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, transition: 'all 0.2s', color: 'var(--color-accent-primary)', flexShrink: 0, background: 'transparent', border: 'none' }}
              onClick={handleOpenSearch}
              aria-label="Abrir busca"
              title="Buscar"
              tabIndex={searchOpen ? -1 : 0}
              disabled={searchOpen}
            >
              <i className="bi bi-search" />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={'Buscar endereço...'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 15,
                height: 32,
                marginLeft: 4,
                display: searchOpen ? 'block' : 'none',
                padding: searchOpen ? '0 8px 0 4px' : '0',
                width: searchOpen ? '100%' : 0,
                minWidth: 0,
                opacity: searchOpen ? 1 : 0,
                pointerEvents: searchOpen ? 'auto' : 'none',
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onBlur={() => { if (!searchText) handleCloseSearch(); }}
              tabIndex={searchOpen ? 0 : -1}
            />
          </div>
          
          {/* Controles de Filtro */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            {/* Filtro de Warranty */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Warranty</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {warrantyOrder.map((warranty) => {
                  const isWarranty = warranty === 'Warranty';
                  const toggleFunction = isWarranty ? () => setShowWarranty(!showWarranty) : () => setShowNonWarranty(!showNonWarranty);
                  
                  return (
                    <div
                      key={warranty}
                      draggable
                      onDragStart={(e) => handleWarrantyDragStart(e, warranty)}
                      onDragOver={(e) => handleWarrantyDragOver(e, warranty)}
                      onDrop={(e) => handleWarrantyDrop(e, warranty)}
                      onDragEnd={handleWarrantyDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedWarranty === warranty
                          ? 'var(--color-accent-primary)'
                          : dragOverWarranty === warranty && draggedWarranty
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: draggedWarranty === warranty
                          ? '#fff'
                          : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: draggedWarranty && draggedWarranty !== warranty ? 0.6 : 1,
                        boxShadow: dragOverWarranty === warranty && draggedWarranty ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      }}
                      onClick={toggleFunction}
                    >
                      {isWarranty && (
                        <span style={{ color: '#fd7e14', fontSize: 16 }}>
                          <i className="bi bi-shield-check" />
                        </span>
                      )}
                      {isWarranty ? 'Yes' : 'No'}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Divisor Vertical */}
            <div style={{ 
              width: 1, 
              height: 30, 
              background: 'var(--color-border-divider)', 
              margin: '0 8px' 
            }} />
            
            {/* Filtro de Resolution Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Resolution</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {resolutionOrder.map((resolution) => {
                  const isOnTime = resolution === 'On Time';
                  const toggleFunction = isOnTime ? () => setShowOnTime(!showOnTime) : () => setShowExceeded(!showExceeded);
                  
                  return (
                    <div
                      key={resolution}
                      draggable
                      onDragStart={(e) => handleResolutionDragStart(e, resolution)}
                      onDragOver={(e) => handleResolutionDragOver(e, resolution)}
                      onDrop={(e) => handleResolutionDrop(e, resolution)}
                      onDragEnd={handleResolutionDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedResolution === resolution
                          ? 'var(--color-accent-primary)'
                          : dragOverResolution === resolution && draggedResolution
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: draggedResolution === resolution
                          ? '#fff'
                          : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: draggedResolution && draggedResolution !== resolution ? 0.6 : 1,
                        boxShadow: dragOverResolution === resolution && draggedResolution ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      }}
                      onClick={toggleFunction}
                    >
                      <span style={{ color: isOnTime ? '#28a745' : '#dc3545', fontSize: 7 }}>
                        <i className="bi bi-circle-fill" />
                      </span>
                      {isOnTime ? 'On Time' : 'Exceeded'}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Ordenação por Tempo de Resolução */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Time</span>
            <button 
              onClick={() => setSortByResolutionTime(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              style={{ 
                background: sortByResolutionTime ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: sortByResolutionTime ? '#fff' : 'var(--color-text-secondary)', 
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
              {sortByResolutionTime === 'asc' ? 'ASC' : sortByResolutionTime === 'desc' ? 'DESC' : 'OFF'}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
            Service Request Cards
          </h4>
        </div>
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Filtro de texto */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: searchOpen ? 'space-between' : 'center',
              position: 'relative',
              width: searchOpen ? 220 : 42,
              height: 42,
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              background: searchOpen ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: searchOpen ? 25 : 21,
              padding: searchOpen ? '2px 8px 2px 8px' : '4px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              className="btn-tertiary-custom d-flex align-items-center justify-content-center"
              style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, transition: 'all 0.2s', color: 'var(--color-accent-primary)', flexShrink: 0, background: 'transparent', border: 'none' }}
              onClick={handleOpenSearch}
              aria-label="Abrir busca"
              title="Buscar"
              tabIndex={searchOpen ? -1 : 0}
              disabled={searchOpen}
            >
              <i className="bi bi-search" />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={'Buscar endereço...'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 15,
                height: 32,
                marginLeft: 4,
                display: searchOpen ? 'block' : 'none',
                padding: searchOpen ? '0 8px 0 4px' : '0',
                width: searchOpen ? '100%' : 0,
                minWidth: 0,
                opacity: searchOpen ? 1 : 0,
                pointerEvents: searchOpen ? 'auto' : 'none',
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onBlur={() => { if (!searchText) handleCloseSearch(); }}
              tabIndex={searchOpen ? 0 : -1}
            />
          </div>
          
          {/* Controles de Filtro */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            {/* Filtro de Warranty */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Warranty</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {warrantyOrder.map((warranty) => {
                  const isWarranty = warranty === 'Warranty';
                  const toggleFunction = isWarranty ? () => setShowWarranty(!showWarranty) : () => setShowNonWarranty(!showNonWarranty);
                  
                  return (
                    <div
                      key={warranty}
                      draggable
                      onDragStart={(e) => handleWarrantyDragStart(e, warranty)}
                      onDragOver={(e) => handleWarrantyDragOver(e, warranty)}
                      onDrop={(e) => handleWarrantyDrop(e, warranty)}
                      onDragEnd={handleWarrantyDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedWarranty === warranty
                          ? 'var(--color-accent-primary)'
                          : dragOverWarranty === warranty && draggedWarranty
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: draggedWarranty === warranty
                          ? '#fff'
                          : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: draggedWarranty && draggedWarranty !== warranty ? 0.6 : 1,
                        boxShadow: dragOverWarranty === warranty && draggedWarranty ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      }}
                      onClick={toggleFunction}
                    >
                      {isWarranty && (
                        <span style={{ color: '#fd7e14', fontSize: 12 }}>
                          <i className="bi bi-shield-check" />
                        </span>
                      )}
                      {isWarranty ? 'Yes' : 'No'}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Divisor Vertical */}
            <div style={{ 
              width: 1, 
              height: 30, 
              background: 'var(--color-border-divider)', 
              margin: '0 8px' 
            }} />
            
            {/* Filtro de Resolution Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Resolution</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {resolutionOrder.map((resolution) => {
                  const isOnTime = resolution === 'On Time';
                  const toggleFunction = isOnTime ? () => setShowOnTime(!showOnTime) : () => setShowExceeded(!showExceeded);
                  
                  return (
                    <div
                      key={resolution}
                      draggable
                      onDragStart={(e) => handleResolutionDragStart(e, resolution)}
                      onDragOver={(e) => handleResolutionDragOver(e, resolution)}
                      onDrop={(e) => handleResolutionDrop(e, resolution)}
                      onDragEnd={handleResolutionDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedResolution === resolution
                          ? 'var(--color-accent-primary)'
                          : dragOverResolution === resolution && draggedResolution
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: draggedResolution === resolution
                          ? '#fff'
                          : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: draggedResolution && draggedResolution !== resolution ? 0.6 : 1,
                        boxShadow: dragOverResolution === resolution && draggedResolution ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      }}
                      onClick={toggleFunction}
                    >
                      <span style={{ color: isOnTime ? '#28a745' : '#dc3545', fontSize: 7 }}>
                        <i className="bi bi-circle-fill" />
                      </span>
                      {isOnTime ? 'On Time' : 'Exceeded'}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Ordenação por Tempo de Resolução */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Time</span>
            <button 
              onClick={() => setSortByResolutionTime(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              style={{ 
                background: sortByResolutionTime ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: sortByResolutionTime ? '#fff' : 'var(--color-text-secondary)', 
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
              {sortByResolutionTime === 'asc' ? 'ASC' : sortByResolutionTime === 'desc' ? 'DESC' : 'OFF'}
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
            maxHeight: '100%',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--color-border-divider) transparent',
          }}
          onMouseDown={onMouseDown}
        >
          {displayData.map((service) => {
            const status = getServiceStatus(service);
            const resolutionTime = calculateResolutionTimeAdvanced(service);
            
            return (
              <div
                key={service.id}
                style={{
                  minWidth: 220,
                  maxWidth: 250,
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: 10,
                  boxShadow: hovered === service.id ? '0 4px 16px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'box-shadow 0.2s, border 0.2s',
                  maxHeight: 'calc(100vh - 200px)',
                  overflow: 'auto',
                }}
                onMouseEnter={() => setHovered(service.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(service)}
                title={`Status: ${status}\nIssue: ${service.issue || '-'}\nTech: ${service.tech || '-'}`}
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
                    <span style={{ fontSize: 11, color: STATUS[status as keyof typeof STATUS]?.color || 'var(--color-text-secondary)' }}>
                      <i className={STATUS[status as keyof typeof STATUS]?.icon || 'bi-circle'} />
                    </span>
                    <span style={{ 
                      color: 'var(--color-text-primary)', 
                      fontWeight: 600, 
                      fontSize: 15 
                    }}>
                      {status}
                    </span>
                  </div>
                  {service.warranty && (
                    <span style={{ color: '#fd7e14', fontSize: 18 }} title="Warranty">
                      <i className="bi bi-shield-check" />
                    </span>
                  )}
                </div>
                
                {/* Body do Card */}
                <div style={{ padding: '8px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 16, textAlign: 'center' }}>
                    {service.address || 'N/A'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'center' }}>
                    {service.city || 'N/A'} • {service.job_site || 'N/A'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                    <span title="Received Date">Rec: {formatDateUSShort(service.date_received)}</span>
                    <span title="Completed Date">Com: {formatDateUSShort(service.date_completed)}</span>
                  </div>
                  {/* Tempo de Resolução */}
                  {service.date_received && (
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      gap: 4,
                      fontSize: 12,
                      color: resolutionTime.isOnTime ? 'var(--positive-color)' : '#dc3545',
                      fontWeight: 500
                    }}>
                      <i className="bi bi-clock" style={{ fontSize: 10 }} />
                      <span>
                        {status === 'Completed' ? 'Resolvido em' : 'Em andamento há'} {resolutionTime.days}d
                      </span>
                    </div>
                  )}
                  {/* Issue */}
                  {service.issue && (
                    <div style={{ 
                      color: 'var(--color-text-secondary)', 
                      fontSize: 12, 
                      fontStyle: 'italic',
                      textAlign: 'center',
                      lineHeight: 1.3
                    }}>
                      {service.issue}
                    </div>
                  )}
                  {/* Tech */}
                  {service.tech && (
                    <div style={{ 
                      color: 'var(--color-accent-primary)', 
                      fontSize: 12, 
                      fontWeight: 500,
                      textAlign: 'center'
                    }}>
                      Tech: {service.tech}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
              maxWidth: `${modalWidth}px`,
              width: `${modalWidth}px`,
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
                <span>Service Request</span>
                {selected.warranty && (
                  <span style={{ color: '#fd7e14', fontSize: 20 }} title="Warranty">
                    <i className="bi bi-shield-check" />
                  </span>
                )}
              </h5>
              <CloseButton onClick={() => setSelected(null)} size="md" />
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
                  <span>City • Job Site: {selected.city || 'N/A'} • {selected.job_site || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-geo-alt" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                  <span>Address: {selected.address || 'N/A'}</span>
                </div>
              </div>
            </div>
            {/* Body */}
            <div 
              className="custom-scrollbar"
              style={{ 
                padding: '24px', 
                background: 'var(--color-background-primary)',
                flex: 1,
                overflowY: 'auto'
              }}
            >
              {(() => {
                const resolutionTime = calculateResolutionTimeAdvanced(selected);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Contractor:</span>
                          <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{selected.contractor || 'N/A'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>City:</span>
                          <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{selected.city || 'N/A'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Lot:</span>
                          <span style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500 }}>{selected.lot || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Issue e Tech lado a lado */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      {/* Issue */}
                      {selected.issue && (
                        <div style={{ flex: 1 }}>
                          <h6 style={{ 
                            color: 'var(--color-text-primary)', 
                            fontWeight: 600, 
                            fontSize: 16, 
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}>
                            <i className="bi bi-exclamation-triangle" /> Issue
                          </h6>
                          <div style={{ 
                            background: 'var(--color-background-secondary)', 
                            borderRadius: 8, 
                            padding: '4px 16px',
                            height: 60,
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            <span style={{ 
                              color: 'var(--color-text-primary)', 
                              fontSize: 14,
                              fontWeight: 500,
                              lineHeight: 1.4
                            }}>
                              {selected.issue}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Tech */}
                      {selected.tech && (
                        <div style={{ flex: 1 }}>
                          <h6 style={{ 
                            color: 'var(--color-text-primary)', 
                            fontWeight: 600, 
                            fontSize: 16, 
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}>
                            <i className="bi bi-person" /> Technician
                          </h6>
                          <div style={{ 
                            background: 'var(--color-background-secondary)', 
                            borderRadius: 8, 
                            padding: '4px 16px',
                            height: 60,
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            <span style={{ 
                              color: 'var(--color-accent-primary)', 
                              fontSize: 14, 
                              fontWeight: 500
                            }}>
                              {selected.tech}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Fluxograma Temporal */}
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
                        <i className="bi bi-diagram-3" /> Timeline Flow
                      </h6>
                      <div style={{ 
                        background: 'var(--color-background-secondary)', 
                        borderRadius: 8, 
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                      }}>
                        {/* Data de Recebimento */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 12,
                          padding: '8px 12px',
                          background: 'var(--color-background-primary)',
                          borderRadius: 6,
                          border: '1px solid var(--color-border-divider)'
                        }}>
                          <div style={{ 
                            width: 28, 
                            height: 28, 
                            borderRadius: '50%', 
                            background: 'linear-gradient(135deg, #007bff, #0056b3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: 12,
                            fontWeight: 'bold',
                            boxShadow: '0 2px 8px rgba(0, 123, 255, 0.3)'
                          }}>
                            1
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                              Request Received
                            </div>
                            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                              {formatDateUS(selected.date_received)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Linha conectora */}
                        <div style={{ 
                          height: 20, 
                          width: 2, 
                          background: 'var(--color-border-divider)', 
                          marginLeft: 13,
                          alignSelf: 'center'
                        }} />
                        
                        {/* Disponibilidade do Material */}
                        {selected.material_available_date && selected.material_available_date !== '' && (
                          <>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12,
                              padding: '8px 12px',
                              background: 'var(--color-background-primary)',
                              borderRadius: 6,
                              border: '1px solid var(--color-border-divider)'
                            }}>
                              <div style={{ 
                                width: 28, 
                                height: 28, 
                                borderRadius: '50%', 
                                background: 'linear-gradient(135deg, #ffc107, #e0a800)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 'bold',
                                boxShadow: '0 2px 8px rgba(255, 193, 7, 0.3)'
                              }}>
                                2
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                                  Material Available
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                  {formatDateUS(selected.material_available_date)}
                                </div>
                              </div>
                            </div>
                            <div style={{ 
                              height: 20, 
                              width: 2, 
                              background: 'var(--color-border-divider)', 
                              marginLeft: 13,
                              alignSelf: 'center'
                            }} />
                          </>
                        )}
                        
                        {/* Disponibilidade do Morador */}
                        {selected.resident_available_date && selected.resident_available_date !== '' && (
                          <>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12,
                              padding: '8px 12px',
                              background: 'var(--color-background-primary)',
                              borderRadius: 6,
                              border: '1px solid var(--color-border-divider)'
                            }}>
                              <div style={{ 
                                width: 28, 
                                height: 28, 
                                borderRadius: '50%', 
                                background: 'linear-gradient(135deg, #17a2b8, #138496)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 'bold',
                                boxShadow: '0 2px 8px rgba(23, 162, 184, 0.3)'
                              }}>
                                {selected.material_available_date && selected.material_available_date !== '' ? '3' : '2'}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                                  Resident Available
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                  {formatDateUS(selected.resident_available_date)}
                                </div>
                              </div>
                            </div>
                            <div style={{ 
                              height: 20, 
                              width: 2, 
                              background: 'var(--color-border-divider)', 
                              marginLeft: 13,
                              alignSelf: 'center'
                            }} />
                          </>
                        )}
                        
                        {/* Data de Completude */}
                        {selected.date_completed && (
                          <>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12,
                              padding: '8px 12px',
                              background: 'var(--color-background-primary)',
                              borderRadius: 6,
                              border: '1px solid var(--color-border-divider)'
                            }}>
                              <div style={{ 
                                width: 28, 
                                height: 28, 
                                borderRadius: '50%', 
                                background: 'linear-gradient(135deg, #28a745, #1e7e34)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 'bold',
                                boxShadow: '0 2px 8px rgba(40, 167, 69, 0.3)'
                              }}>
                                {(() => {
                                  let step = 2;
                                  if (selected.material_available_date && selected.material_available_date !== '') step++;
                                  if (selected.resident_available_date && selected.resident_available_date !== '') step++;
                                  return step;
                                })()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                                  Service Completed
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                  {formatDateUS(selected.date_completed)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Visitas Adicionais */}
                            {Array.isArray(selected.additional_visits) && selected.additional_visits.length > 0 && (
                              <>
                                {selected.additional_visits.map((visitDate, index) => {
                                  const visitDateObj = new Date(visitDate);
                                  const isValidDate = !isNaN(visitDateObj.getTime());
                                  
                                  if (!isValidDate) return null;
                                  
                                  return (
                                    <React.Fragment key={index}>
                                      <div style={{ 
                                        height: 20, 
                                        width: 2, 
                                        background: 'var(--color-border-divider)', 
                                        marginLeft: 13,
                                        alignSelf: 'center'
                                      }} />
                                      <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 12,
                                        padding: '8px 12px',
                                        background: 'var(--color-background-primary)',
                                        borderRadius: 6,
                                        border: '1px solid var(--color-border-divider)'
                                      }}>
                                        <div style={{ 
                                          width: 28, 
                                          height: 28, 
                                          borderRadius: '50%', 
                                          background: 'linear-gradient(135deg, #dc3545, #c82333)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: 'white',
                                          fontSize: 12,
                                          fontWeight: 'bold',
                                          boxShadow: '0 2px 8px rgba(220, 53, 69, 0.3)'
                                        }}>
                                          {(() => {
                                            let step = 3;
                                            if (selected.material_available_date && selected.material_available_date !== '') step++;
                                            if (selected.resident_available_date && selected.resident_available_date !== '') step++;
                                            return step + index + 1;
                                          })()}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                                            Additional Visit {index + 1}
                                          </div>
                                          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                            {visitDateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                                          </div>
                                        </div>
                                      </div>
                                    </React.Fragment>
                                  );
                                })}
                              </>
                            )}
                          </>
                        )}
                        
                        {/* Resumo de Eficiência */}
                        <div style={{ 
                          marginTop: 16,
                          padding: '12px 16px',
                          background: resolutionTime.isOnTime ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                          borderRadius: 6,
                          border: `1px solid ${resolutionTime.isOnTime ? '#28a745' : '#dc3545'}`
                        }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: 4
                          }}>
                            <span style={{ 
                              color: 'var(--color-text-primary)', 
                              fontWeight: 500, 
                              fontSize: 14 
                            }}>
                              Resolution Time
                            </span>
                            <span style={{ 
                              color: resolutionTime.isOnTime ? '#28a745' : '#dc3545', 
                              fontWeight: 600, 
                              fontSize: 16 
                            }}>
                              {resolutionTime.days} days
                            </span>
                          </div>
                          <div style={{ 
                            color: 'var(--color-text-secondary)', 
                            fontSize: 11,
                            fontStyle: 'italic',
                            marginTop: 4
                          }}>
                            {resolutionTime.reason === 'From resident availability' 
                              ? 'Counted from resident availability date' 
                              : 'Counted from request date'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
