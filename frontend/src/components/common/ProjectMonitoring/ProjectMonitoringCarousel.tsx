import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectMonitoringHvacData } from '../../../hooks/useProjectMonitoringHvacData';
import CloseButton from '../../../utils/CloseButton';

interface ProjectMonitoringCarouselProps {
  filteredData: ProjectMonitoringHvacData[];
}

// Cores customizáveis por status de progresso
const PROGRESS_STATUS = {
  'Completed': { color: '#28a745', icon: 'bi-check-circle-fill' },
  'In Progress': { color: '#ffc107', icon: 'bi-clock-fill' },
  'Not Started': { color: '#dc3545', icon: 'bi-x-circle-fill' },
};

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
};

// Função para determinar status do projeto baseado no percentual
const getProjectStatus = (project: ProjectMonitoringHvacData): string => {
  if (project.percent_completed === 100) return 'Completed';
  if (project.percent_completed && project.percent_completed > 0) return 'In Progress';
  return 'Not Started';
};

export default function ProjectMonitoringCarousel({ filteredData }: ProjectMonitoringCarouselProps) {
  const [selected, setSelected] = useState<ProjectMonitoringHvacData | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [statusOrder, setStatusOrder] = useState<string[]>(['Completed', 'In Progress', 'Not Started']);
  const [draggedStatus, setDraggedStatus] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showInProgress, setShowInProgress] = useState(true);
  const [showNotStarted, setShowNotStarted] = useState(true);
  const [sortByProgress, setSortByProgress] = useState<'asc' | 'desc' | null>(null);
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

  // Função para reordenar status
  const handleStatusDragStart = (e: React.DragEvent, status: string) => {
    setDraggedStatus(status);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleStatusDragOver = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(targetStatus);
  };

  const handleStatusDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    if (draggedStatus && draggedStatus !== targetStatus) {
      const newOrder = [...statusOrder];
      const draggedIndex = newOrder.indexOf(draggedStatus);
      const targetIndex = newOrder.indexOf(targetStatus);
      
      // Trocar posições
      newOrder[draggedIndex] = targetStatus;
      newOrder[targetIndex] = draggedStatus;
      
      setStatusOrder(newOrder);
    }
    setDraggedStatus(null);
  };

  const handleStatusDragEnd = () => {
    setDraggedStatus(null);
    setDragOverStatus(null);
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

  // Filtrar dados conforme texto digitado em job_site, city e lot_number
  const filteredDataRaw = React.useMemo(() => {
    if (!searchText.trim()) return filteredData;
    const lower = searchText.toLowerCase();
    return filteredData.filter(row => 
      (row.job_site || '').toLowerCase().includes(lower) ||
      (row.city || '').toLowerCase().includes(lower) ||
      (row.lot_number || '').toLowerCase().includes(lower) ||
      `lot ${row.lot_number || ''}`.toLowerCase().includes(lower)
    );
  }, [filteredData, searchText]);

  // Filtrar dados baseado nos controles de status
  const displayData = React.useMemo(() => {
    // Primeiro filtrar os dados baseado nos toggles
    const filteredData = filteredDataRaw.filter(project => {
      const status = getProjectStatus(project);
      return (status === 'Completed' && showCompleted) || 
             (status === 'In Progress' && showInProgress) || 
             (status === 'Not Started' && showNotStarted);
    });

    // Agrupar por status conforme ordem definida
    const groupedByStatus = statusOrder.map(status => {
      const statusGroup = filteredData.filter(project => getProjectStatus(project) === status);

      // Se ordenação por progresso estiver ativada, ordenar o grupo
      if (sortByProgress) {
        return statusGroup.sort((a, b) => {
          const progressA = a.percent_completed || 0;
          const progressB = b.percent_completed || 0;
          return sortByProgress === 'desc' ? progressB - progressA : progressA - progressB;
        });
      }

      return statusGroup;
    });

    // Concatenar todos os grupos de status mantendo a ordem
    return groupedByStatus.flat();
  }, [filteredDataRaw, showCompleted, showInProgress, showNotStarted, statusOrder, sortByProgress]);

  if (displayData.length === 0) {
  return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
              Project Monitoring Cards
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
                placeholder={'Buscar projeto...'}
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
              {/* Filtro de Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Status</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {statusOrder.map((status) => {
                    const toggleFunction = status === 'Completed' ? () => setShowCompleted(!showCompleted) : 
                                         status === 'In Progress' ? () => setShowInProgress(!showInProgress) : 
                                         () => setShowNotStarted(!showNotStarted);
                    
                    return (
                      <div
                        key={status}
                        draggable
                        onDragStart={(e) => handleStatusDragStart(e, status)}
                        onDragOver={(e) => handleStatusDragOver(e, status)}
                        onDrop={(e) => handleStatusDrop(e, status)}
                        onDragEnd={handleStatusDragEnd}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 12px',
                          background: draggedStatus === status
                            ? 'var(--color-accent-primary)'
                            : dragOverStatus === status && draggedStatus
                              ? 'var(--color-background-secondary)'
                              : 'var(--color-background-primary)',
                          color: draggedStatus === status
                            ? '#fff'
                            : 'var(--color-text-primary)',
                          border: '1px solid var(--color-border-divider)',
                          borderRadius: 20,
                          fontSize: 12,
        fontWeight: 500, 
                          cursor: 'grab',
                          transition: 'all 0.2s',
                          opacity: draggedStatus && draggedStatus !== status ? 0.6 : 1,
                          boxShadow: dragOverStatus === status && draggedStatus ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                        }}
                        onClick={toggleFunction}
                      >
                        <span style={{ color: PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.color || 'var(--color-text-secondary)', fontSize: 7 }}>
                          <i className={PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.icon || 'bi-circle'} />
                        </span>
                        {status}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Ordenação por Progresso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Progress</span>
              <button 
                onClick={() => setSortByProgress(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                style={{ 
                  background: sortByProgress ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                  color: sortByProgress ? '#fff' : 'var(--color-text-secondary)', 
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
                {sortByProgress === 'asc' ? 'ASC' : sortByProgress === 'desc' ? 'DESC' : 'OFF'}
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
          Nenhum projeto encontrado para os filtros selecionados
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
            Project Monitoring Cards
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
              placeholder={'Buscar projeto...'}
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
            {/* Filtro de Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Status</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {statusOrder.map((status) => {
                  const toggleFunction = status === 'Completed' ? () => setShowCompleted(!showCompleted) : 
                                       status === 'In Progress' ? () => setShowInProgress(!showInProgress) : 
                                       () => setShowNotStarted(!showNotStarted);
                  
                  return (
                    <div
                      key={status}
                      draggable
                      onDragStart={(e) => handleStatusDragStart(e, status)}
                      onDragOver={(e) => handleStatusDragOver(e, status)}
                      onDrop={(e) => handleStatusDrop(e, status)}
                      onDragEnd={handleStatusDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: draggedStatus === status
                          ? 'var(--color-accent-primary)'
                          : dragOverStatus === status && draggedStatus
                            ? 'var(--color-background-secondary)'
                            : 'var(--color-background-primary)',
                        color: draggedStatus === status
                          ? '#fff'
                          : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: draggedStatus && draggedStatus !== status ? 0.6 : 1,
                        boxShadow: dragOverStatus === status && draggedStatus ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      }}
                      onClick={toggleFunction}
                    >
                      <span style={{ color: PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.color || 'var(--color-text-secondary)', fontSize: 7 }}>
                        <i className={PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.icon || 'bi-circle'} />
                      </span>
                      {status}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Ordenação por Progresso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Progress</span>
            <button 
              onClick={() => setSortByProgress(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              style={{ 
                background: sortByProgress ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: sortByProgress ? '#fff' : 'var(--color-text-secondary)', 
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
              {sortByProgress === 'asc' ? 'ASC' : sortByProgress === 'desc' ? 'DESC' : 'OFF'}
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
          {displayData.map((project) => {
            const status = getProjectStatus(project);
            
            return (
            <div
              key={project.id}
              style={{
                  minWidth: 220,
                  maxWidth: 250,
                  background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-divider)',
                  borderRadius: 10,
                  boxShadow: hovered === project.id ? '0 4px 16px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                cursor: 'pointer',
                  position: 'relative',
                  transition: 'box-shadow 0.2s, border 0.2s',
                  maxHeight: 'calc(100vh - 200px)',
                  overflow: 'auto',
                }}
                onMouseEnter={() => setHovered(project.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(project)}
                title={`Status: ${status}\nProgress: ${project.percent_completed}%\nSite: ${project.job_site || '-'}`}
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
                    <span style={{ fontSize: 11, color: PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.color || 'var(--color-text-secondary)' }}>
                      <i className={PROGRESS_STATUS[status as keyof typeof PROGRESS_STATUS]?.icon || 'bi-circle'} />
                    </span>
                    <span style={{ 
                    color: 'var(--color-text-primary)', 
                    fontWeight: 600, 
                      fontSize: 15 
                  }}>
                      {status}
                    </span>
                  </div>
                  {project.notes ? (
                    <span style={{
                      color: 'var(--color-accent-primary)', 
                      fontSize: 16, 
                      fontWeight: 600 
                    }}>
                      <i className="bi bi-sticky" />
                    </span>
                  ) : null}
                </div>
                
                {/* Body do Card */}
                <div style={{ padding: '8px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 16, textAlign: 'center' }}>
                    Lot {project.lot_number || 'N/A'} - {project.job_site || 'N/A'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'center' }}>
                    {project.city || 'N/A'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                    <span title="Start Date">Start: {formatDate(project.start_date)}</span>
                    <span title="Finish Date">End: {formatDate(project.finish_date)}</span>
                  </div>
                  {/* Team e Progress */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 8,
                    fontSize: 12, 
                    fontWeight: 500
                  }}>
                    {project.team ? (
                      <>
                        <span style={{ color: 'var(--color-accent-primary)' }}>
                          Team {project.team}
                        </span>
                        <span style={{ 
                          width: 4, 
                          height: 4, 
                          borderRadius: '50%', 
                          background: 'var(--color-border-divider)',
                          display: 'inline-block'
                        }} />
                        <span style={{ color: 'var(--color-accent-primary)' }}>
                          {project.percent_completed}%
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-accent-primary)' }}>
                        {project.percent_completed}%
                      </span>
                    )}
                  </div>
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
              maxWidth: '600px',
              width: '600px',
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
                <span>Project Monitoring</span>
              </h5>
              <CloseButton onClick={() => setSelected(null)} size="md" />
            </div>
                                                   {/* Sub-header */}
              <div style={{ 
                padding: '10px 20px', 
                borderBottom: '1px solid var(--color-border-divider)', 
                background: 'var(--color-background-secondary)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    <i className="bi bi-geo-alt" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                    <span>Lot {selected.lot_number || 'N/A'} • {selected.job_site || 'N/A'} • {selected.city || 'N/A'}</span>
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
                const status = getProjectStatus(selected);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                         {/* Team */}
                     {selected.team && (
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
                           <i className="bi bi-people" /> Team
                         </h6>
                         <div style={{ 
                           background: 'var(--color-background-secondary)', 
                           borderRadius: 8, 
                           padding: 16,
                           display: 'flex',
                           alignItems: 'center'
                         }}>
                           <span style={{ color: 'var(--color-accent-primary)', fontSize: 14, fontWeight: 500 }}>
                             Team {selected.team}
                           </span>
                         </div>
                       </div>
                     )}
                    
                    {/* Datas */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      {/* Start Date */}
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
                          <i className="bi bi-calendar-event" /> Start Date
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
                            fontWeight: 500
                          }}>
                            {selected.start_date ? new Date(selected.start_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : 'N/A'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Finish Date */}
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
                          <i className="bi bi-calendar-check" /> Finish Date
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
                            fontWeight: 500
                          }}>
                            {selected.finish_date ? new Date(selected.finish_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Timeline Flow */}
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
                        {/* Stage 1 */}
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
                            background: 'var(--color-background-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-primary)',
                            fontSize: 12,
                            fontWeight: 'bold',
                            border: '1px solid var(--color-border-divider)'
                          }}>
                            1
                          </div>
                                                      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                                Stage 1 - Rough
                              </div>
                              <div style={{ 
                                color: selected.s1_rough && selected.s1_rough.trim() !== '' ? 
                                  (selected.s1_rough.toLowerCase().includes('completed') ? '#28a745' : 
                                   selected.s1_rough.toLowerCase().includes('progress') ? '#ffc107' : '#dc3545') : '#dc3545', 
                                fontSize: 13,
                                fontWeight: 500
                              }}>
                                {selected.s1_rough || 'Not Started'}
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
                        
                        {/* Stage 2 */}
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
                            background: 'var(--color-background-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-primary)',
                            fontSize: 12,
                            fontWeight: 'bold',
                            border: '1px solid var(--color-border-divider)'
                          }}>
                            2
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                              Stage 2 - Machines
                            </div>
                            <div style={{ 
                              color: selected.s2_machines && selected.s2_machines.trim() !== '' ? 
                                (selected.s2_machines.toLowerCase().includes('completed') ? '#28a745' : 
                                 selected.s2_machines.toLowerCase().includes('progress') ? '#ffc107' : '#dc3545') : '#dc3545', 
                              fontSize: 13,
                              fontWeight: 500
                            }}>
                              {selected.s2_machines || 'Not Started'}
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
                        
                        {/* Stage 3 */}
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
                            background: 'var(--color-background-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-primary)',
                            fontSize: 12,
                            fontWeight: 'bold',
                            border: '1px solid var(--color-border-divider)'
                          }}>
                            3
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                              Stage 3 - Condenser
                            </div>
                            <div style={{ 
                              color: selected.s3_condenser && selected.s3_condenser.trim() !== '' ? 
                                (selected.s3_condenser.toLowerCase().includes('completed') ? '#28a745' : 
                                 selected.s3_condenser.toLowerCase().includes('progress') ? '#ffc107' : '#dc3545') : '#dc3545', 
                              fontSize: 13,
                              fontWeight: 500
                            }}>
                              {selected.s3_condenser || 'Not Started'}
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
                        
                        {/* Stage 4 */}
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
                            background: 'var(--color-background-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-primary)',
                            fontSize: 12,
                            fontWeight: 'bold',
                            border: '1px solid var(--color-border-divider)'
                          }}>
                            4
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 14 }}>
                              Stage 4 - Finish
                            </div>
                            <div style={{ 
                              color: selected.s4_finish && selected.s4_finish.trim() !== '' ? 
                                (selected.s4_finish.toLowerCase().includes('completed') ? '#28a745' : 
                                 selected.s4_finish.toLowerCase().includes('progress') ? '#ffc107' : '#dc3545') : '#dc3545', 
                              fontSize: 13,
                              fontWeight: 500
                            }}>
                              {selected.s4_finish || 'Not Started'}
                            </div>
                          </div>
                </div>
                
                        {/* Resumo de Progresso */}
                        <div style={{ 
                          marginTop: 16,
                          padding: '12px 16px',
                          background: status === 'Completed' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                          borderRadius: 6,
                          border: `1px solid ${status === 'Completed' ? '#28a745' : '#ffc107'}`
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
                              Overall Progress
                            </span>
                            <span style={{ 
                              color: status === 'Completed' ? '#28a745' : '#ffc107', 
                              fontWeight: 600, 
                              fontSize: 16 
                            }}>
                              {selected.percent_completed}%
                            </span>
                          </div>
                          <div style={{ 
                            color: 'var(--color-text-secondary)', 
                            fontSize: 11,
                            fontStyle: 'italic',
                            marginTop: 4
                          }}>
                            {status === 'Completed' ? 'Projeto concluído com sucesso' : 
                             status === 'In Progress' ? 'Projeto em andamento' : 'Projeto não iniciado'}
                          </div>
                </div>
              </div>
            </div>
                    
                    {/* Last Update */}
                    {selected.last_update && (
                      <div style={{ 
                        marginTop: 16,
                        padding: '12px 16px',
                        background: 'rgba(0, 123, 255, 0.1)',
                        borderRadius: 6,
                        border: '1px solid #007bff'
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
                            Last Update
                          </span>
                          <span style={{ 
                            color: '#007bff', 
                            fontWeight: 600, 
                            fontSize: 14 
                          }}>
                            {new Date(selected.last_update).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ 
                          color: 'var(--color-text-secondary)', 
                          fontSize: 11,
                          fontStyle: 'italic',
                          marginTop: 4
                        }}>
                          Última atualização do projeto
                        </div>
                      </div>
                    )}
                    
                    {/* Notes - Movido para o final */}
                    {selected.notes && (
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
                          <i className="bi bi-sticky" /> Notes
                        </h6>
                        <div style={{ 
                          background: 'var(--color-background-secondary)', 
                          borderRadius: 8, 
                          padding: '16px',
                          minHeight: 80
                        }}>
                          <span style={{ 
                            color: 'var(--color-text-primary)', 
                            fontSize: 14,
                            lineHeight: 1.4
                          }}>
                            {selected.notes}
                          </span>
                        </div>
        </div>
                    )}
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
