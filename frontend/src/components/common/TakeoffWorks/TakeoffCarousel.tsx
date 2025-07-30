import React, { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CloseButton from '../../../utils/CloseButton';
import { getTakeoffStatusColor } from '../../../utils/takeoffColors';

interface TakeoffRow {
  id: string;
  project: string;
  data_solicitacao: string;
  data_inicio: string;
  data_estimada_entrega: string;
  entrega_real: string;
  description: string;
  doc_links: string;
  modelo_da_casa: string;
  opcionais_da_casa: string;
  arquivo_dwg: string;
  plano_estrutural: string;
  adequacao_dwg: string;
  importacao_dwg_mitek: string;
  execucao_3d_mitek: string;
  lista_materiais_excel: string;
  dividir_3d_paineis: string;
  validacao_projeto_takeoff: string;
}

const ETAPAS: Record<string, string> = {
  modelo_da_casa: 'Modelo da Casa',
  opcionais_da_casa: 'Opcionais da Casa',
  arquivo_dwg: 'Arquivo DWG',
  plano_estrutural: 'Plano Estrutural',
  adequacao_dwg: 'Adequação DWG',
  importacao_dwg_mitek: 'Importação DWG MiTek',
  execucao_3d_mitek: 'Execução 3D MiTek',
  lista_materiais_excel: 'Lista de Materiais (Excel)',
  dividir_3d_paineis: 'Dividir 3D Painéis',
  validacao_projeto_takeoff: 'Validação Projeto Takeoff',
};

function getEtapaMaisAvancada(row: TakeoffRow): string | null {
  let etapa = null;
  const keys = Object.keys(ETAPAS);
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i] as keyof TakeoffRow;
    if (row[key] && row[key].toLowerCase() === 'ok') {
      etapa = key;
      break;
    }
  }
  return etapa;
}

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
};

// Mock de responsáveis por etapa (em produção, buscar do banco)
const RESPONSIBLES_MAP: Record<string, string> = {
  'modelo_da_casa': 'Pulte Holmes',
  'opcionais_da_casa': 'Pulte Holmes',
  'arquivo_dwg': 'Pulte Holmes',
  'plano_estrutural': 'Pulte Holmes',
  'adequacao_dwg': 'Premium Group (Victor)',
  'importacao_dwg_mitek': 'Premium Group (Victor)',
  'execucao_3d_mitek': 'Premium Group (Victor)',
  'lista_materiais_excel': 'Premium Group (Victor)',
  'dividir_3d_paineis': 'Premium Group (Victor)',
  'validacao_projeto_takeoff': 'Premium Group (Guilherme ou Clayton)',
};

export default function TakeoffCarousel({ filteredData }: { filteredData: TakeoffRow[] }) {
  const [selected, setSelected] = useState<TakeoffRow | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0, dragging: false });
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Adicionar estados para os controles
  const [showEntregues, setShowEntregues] = useState(true);
  const [statusOrder, setStatusOrder] = useState<string[]>(['Not Started', 'In Progress', 'Completed']);
  const [sortByProcessingTime, setSortByProcessingTime] = useState<'asc' | 'desc' | null>(null);

  // Estados para drag & drop e busca
  const [draggedStatus, setDraggedStatus] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchDebounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Função para calcular tempo de processamento (atualizada para usar data_inicio)
  const calculateProcessingTime = (row: TakeoffRow): number => {
    if (!row.data_inicio) return 0;
    const startDate = new Date(row.data_inicio);
    let endDate: Date;
    if (row.entrega_real) {
      endDate = new Date(row.entrega_real);
    } else {
      endDate = new Date();
    }
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Função para determinar o status baseado nas datas
  const getProjectStatus = (row: TakeoffRow): { status: string; color: string; label: string } => {
    const hasSolicitacao = !!row.data_solicitacao;
    const hasInicio = !!row.data_inicio;
    const hasEntrega = !!row.entrega_real;

    if (hasSolicitacao && hasInicio && hasEntrega) {
      return { status: 'Completed', color: getTakeoffStatusColor('Completed'), label: 'Completed' };
    } else if (hasSolicitacao && hasInicio && !hasEntrega) {
      return { status: 'In Progress', color: getTakeoffStatusColor('In Progress'), label: 'In Progress' };
    } else if (hasSolicitacao && !hasInicio && !hasEntrega) {
      return { status: 'Not Started', color: getTakeoffStatusColor('Not Started'), label: 'Not Started' };
    } else {
      return { status: 'Pending', color: getTakeoffStatusColor('Pending'), label: 'Pending' };
    }
  };

  // Debounce para busca
  React.useEffect(() => {
    if (searchDebounceTimeout.current) clearTimeout(searchDebounceTimeout.current);
    searchDebounceTimeout.current = setTimeout(() => {
      setSearchDebounced(searchText);
    }, 200);
    return () => {
      if (searchDebounceTimeout.current) clearTimeout(searchDebounceTimeout.current);
    };
  }, [searchText]);

  // Filtrar dados conforme texto digitado em project
  const filteredDataRaw = useMemo(() => {
    if (!searchDebounced.trim()) return filteredData;
    const lower = searchDebounced.toLowerCase();
    return filteredData.filter(row => (row.project || '').toLowerCase().includes(lower));
  }, [filteredData, searchDebounced]);

  // Função para drag & drop de status
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

  // Desabilitar controles se só um status está selecionado
  const isSingleStatusSelected = statusOrder.length === 1;

  // Filtrar e ordenar dados baseado nos controles
  const displayData = useMemo(() => {
    const data = showEntregues ? filteredDataRaw : filteredDataRaw.filter(row => {
      const status = getProjectStatus(row);
      return status.status !== 'Completed';
    });
    // Agrupar por status conforme ordem definida
    const groupedData = statusOrder.map(status => {
      const group = data.filter(row => {
        const projectStatus = getProjectStatus(row);
        return projectStatus.status === status;
      });
      if (sortByProcessingTime) {
        return group.sort((a, b) => {
          const timeA = calculateProcessingTime(a);
          const timeB = calculateProcessingTime(b);
          return sortByProcessingTime === 'desc' ? timeB - timeA : timeA - timeB;
        });
      }
      return group;
    });
    return groupedData.flat();
  }, [filteredDataRaw, showEntregues, statusOrder, sortByProcessingTime]);

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

  if (displayData.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
              Takeoff Cards
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
            {/* Controles de ordenação e agrupamento (placeholders) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {/* Placeholders para status/etapas do Takeoff */}
                <div style={{ padding: '4px 12px', border: '1px solid var(--color-border-divider)', borderRadius: 20, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)' }}>&nbsp;</div>
                <div style={{ padding: '4px 12px', border: '1px solid var(--color-border-divider)', borderRadius: 20, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)' }}>&nbsp;</div>
                <div style={{ padding: '4px 12px', border: '1px solid var(--color-border-divider)', borderRadius: 20, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)' }}>&nbsp;</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Time</span>
              <button style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'not-allowed', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }} disabled>OFF</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Show Issued</span>
              <button style={{ background: 'var(--color-accent-primary)', color: '#fff', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'not-allowed', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }} disabled>ON</button>
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
            Takeoff Cards
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
          {/* Sort by: Not Started/In Progress/Completed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', opacity: isSingleStatusSelected ? 0.5 : 1, height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {statusOrder.map((status) => {
                const isDisabled = isSingleStatusSelected;
                return (
                  <div
                    key={status}
                    draggable={!isDisabled}
                    onDragStart={isDisabled ? undefined : (e) => handleStatusDragStart(e, status)}
                    onDragOver={isDisabled ? undefined : (e) => handleStatusDragOver(e, status)}
                    onDrop={isDisabled ? undefined : (e) => handleStatusDrop(e, status)}
                    onDragEnd={isDisabled ? undefined : handleStatusDragEnd}
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
                      color: isDisabled
                        ? 'var(--color-text-secondary)'
                        : draggedStatus === status
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
                        : draggedStatus && draggedStatus !== status
                          ? 0.6
                          : 1,
                      boxShadow: dragOverStatus === status && draggedStatus ? '0 0 0 2px var(--color-accent-primary)' : undefined,
                      pointerEvents: isDisabled ? 'none' : undefined,
                    }}
                  >
                    <span style={{ fontSize: 7, color: getTakeoffStatusColor(status as 'Not Started' | 'In Progress' | 'Completed' | 'Pending') }}>
                      <i className="bi bi-circle-fill" />
                    </span>
                    {status}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Sort by Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
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
          {/* Show Entregues */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Show Entregues</span>
            <button 
              onClick={() => setShowEntregues(v => !v)}
              style={{ 
                background: showEntregues ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                color: showEntregues ? '#fff' : 'var(--color-text-secondary)', 
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
              {showEntregues ? 'ON' : 'OFF'}
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
          }}
          onMouseDown={onMouseDown}
        >
          {displayData.map((row) => {
            return (
              <div
                key={row.id}
                style={{
                  minWidth: 220,
                  maxWidth: 250,
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: 10,
                  boxShadow: hovered === row.id ? '0 4px 16px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'box-shadow 0.2s, border 0.2s',
                  maxHeight: 'calc(100vh - 200px)',
                  overflow: 'auto',
                }}
                onMouseEnter={() => setHovered(row.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(row)}
                title={hovered === row.id ? `Modelo: ${row.modelo_da_casa || '-'}\nDescrição: ${row.description || '-'}` : ''}
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
                    {(() => {
                      const statusInfo = getProjectStatus(row);
                      return (
                        <>
                          <span style={{ fontSize: 11, color: statusInfo.color }}>
                            <i className="bi bi-circle-fill" />
                          </span>
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15 }}>
                            {statusInfo.label}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {/* Body do Card */}
                <div style={{ padding: '8px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 16, textAlign: 'center' }}>
                    {row.project || 'N/A'}
                  </div>
                  {/* Nome da etapa mais avançada */}
                  {(() => {
                    const etapa = getEtapaMaisAvancada(row);
                    return etapa ? (
                      <div style={{ color: 'var(--color-accent-primary)', fontSize: 14, textAlign: 'center', fontWeight: 500 }}>
                        {ETAPAS[etapa]}
                      </div>
                    ) : null;
                  })()}
                  <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                    <span title="Solicitação">Solic: {formatDate(row.data_solicitacao)}</span>
                    <span title="Início">Início: {formatDate(row.data_inicio)}</span>
                    <span title="Estimada">Estimada: {formatDate(row.data_estimada_entrega)}</span>
                    <span title="Entrega">Entrega: {formatDate(row.entrega_real)}</span>
                  </div>
                  {/* Tempo de Processamento */}
                  {row.data_inicio && (
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      gap: 4,
                      fontSize: 12,
                      color: row.entrega_real ? 'var(--positive-color)' : 'var(--challenges-color)',
                      fontWeight: 500
                    }}>
                      <i className="bi bi-clock" style={{ fontSize: 10 }} />
                      <span>
                        {row.entrega_real ? 'Processed in' : 'Processing for'} {calculateProcessingTime(row)}d
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Modal simples - pode ser adaptado depois */}
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
              width: '50vw',
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
                gap: 8
              }}>
                {selected.project || 'Takeoff Work'}
              </h5>
              <CloseButton onClick={() => setSelected(null)} size="md" />
            </div>
            {/* Body */}
            <div className="custom-scrollbar" style={{ 
              padding: '24px', 
              background: 'var(--color-background-primary)',
              flex: 1,
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Bloco de Datas */}
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
                    <i className="bi bi-calendar-event" /> Datas
                  </h6>
                  <div style={{ 
                    background: 'var(--color-background-secondary)', 
                    borderRadius: 8, 
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, flex: 1, textAlign: 'center' }}>
                      <strong>Solicitação:</strong> {formatDate(selected.data_solicitacao)}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, flex: 1, textAlign: 'center' }}>
                      <strong>Início:</strong> {formatDate(selected.data_inicio)}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, flex: 1, textAlign: 'center' }}>
                      <strong>Estimada:</strong> {formatDate(selected.data_estimada_entrega)}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, flex: 1, textAlign: 'center' }}>
                      <strong>Entrega:</strong> {formatDate(selected.entrega_real)}
                    </div>
                  </div>
                </div>
                {/* Bloco de Descrição */}
                {selected.description && (
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
                      <i className="bi bi-card-text" /> Descrição
                    </h6>
                    <div style={{ 
                      background: 'var(--color-background-secondary)', 
                      borderRadius: 8, 
                      padding: 16,
                      color: 'var(--color-text-primary)',
                      fontSize: 14,
                      lineHeight: 1.4,
                      fontStyle: 'italic'
                    }}>
                      {selected.description}
                    </div>
                  </div>
                )}
                {/* Envolver os blocos de etapas concluídas e pendentes em um container flex row */}
                <div style={{ display: 'flex', flexDirection: 'row', gap: 24, width: '100%' }}>
                  {/* Bloco de Etapas OK */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h6 style={{
                      color: 'var(--color-text-primary)',
                      fontWeight: 600,
                      fontSize: 16,
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <i className="bi bi-check-circle" style={{ color: getTakeoffStatusColor('Completed') }} /> Etapas Concluídas
                    </h6>
                    <div style={{
                      background: 'var(--color-background-secondary)',
                      borderRadius: 8,
                      padding: '4px 12px',
                      color: 'var(--color-text-primary)',
                      fontSize: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {Object.keys(ETAPAS).filter(key => selected[key as keyof typeof selected] && String(selected[key as keyof typeof selected]).toLowerCase() === 'ok').length === 0 ? (
                        <span style={{ color: 'var(--color-text-secondary)' }}>Nenhuma etapa concluída</span>
                      ) : (
                        Object.keys(ETAPAS)
                          .filter(key => selected[key as keyof typeof selected] && String(selected[key as keyof typeof selected]).toLowerCase() === 'ok')
                          .map((key, i, arr) => (
                            <div key={key} style={{ color: 'var(--color-text-primary)', fontWeight: 500, padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border-divider)' : 'none', width: '100%', display: 'block', textAlign: 'center' }}>
                              {ETAPAS[key]}
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                  {/* Bloco de Etapas Pendentes */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h6 style={{
                      color: 'var(--color-text-primary)',
                      fontWeight: 600,
                      fontSize: 16,
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <i className="bi bi-hourglass-split" style={{ color: getTakeoffStatusColor('Not Started') }} /> Etapas Pendentes
                    </h6>
                    <div style={{
                      background: 'var(--color-background-secondary)',
                      borderRadius: 8,
                      padding: '4px 12px',
                      color: 'var(--color-text-primary)',
                      fontSize: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {Object.keys(ETAPAS).filter(key => !selected[key as keyof typeof selected] || String(selected[key as keyof typeof selected]).toLowerCase() !== 'ok').length === 0 ? (
                        <span style={{ color: 'var(--color-text-secondary)' }}>Nenhuma etapa pendente</span>
                      ) : (
                        Object.keys(ETAPAS)
                          .filter(key => !selected[key as keyof typeof selected] || String(selected[key as keyof typeof selected]).toLowerCase() !== 'ok')
                          .map((key, i, arr) => (
                            <div key={key} style={{ color: 'var(--color-text-primary)', fontWeight: 500, padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border-divider)' : 'none', width: '100%', display: 'block', textAlign: 'center' }}>
                              {ETAPAS[key]}
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
                {/* Bloco de próxima etapa pendente */}
                {(() => {
                  const nextStep = Object.keys(ETAPAS).find(key => !selected[key as keyof typeof selected] || String(selected[key as keyof typeof selected]).toLowerCase() !== 'ok');
                  if (!nextStep) return null;
                  const responsible = RESPONSIBLES_MAP[nextStep] || 'Não definido';
                  return (
                    <div style={{ marginTop: 24 }}>
                      <h6 style={{
                        color: 'var(--color-text-primary)',
                        fontWeight: 600,
                        fontSize: 16,
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <i className="bi bi-person-badge" style={{ color: 'var(--color-accent-primary)' }} /> Próxima Etapa
                      </h6>
                      <div style={{
                        background: 'var(--color-background-secondary)',
                        borderRadius: 8,
                        padding: '8px 16px',
                        color: 'var(--color-text-primary)',
                        fontSize: 15,
                        fontWeight: 500,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span>{ETAPAS[nextStep]}</span>
                        <span style={{ color: 'var(--color-accent-primary)' }}>{responsible}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Footer */}
            <div style={{ 
              borderTop: '1px solid var(--color-border-divider)', 
              background: 'var(--color-background-primary)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              gap: 10,
              padding: '16px 24px'
            }}>
              {/* Doc_Links Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button 
                  type="button" 
                  onClick={() => {
                    if (selected.doc_links) {
                      window.open(selected.doc_links, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  disabled={!selected.doc_links}
                  style={{ 
                    borderRadius: 6, 
                    fontWeight: 500, 
                    minWidth: 120,
                    padding: '8px 16px',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-divider)',
                    cursor: selected.doc_links ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                    opacity: selected.doc_links ? 1 : 0.6
                  }}
                  title={selected.doc_links ? 'Open project documents' : 'No documents available'}
                >
                  <i className={`bi ${selected.doc_links ? 'bi-folder2-open' : 'bi-folder2'}`} />
                  {selected.doc_links ? 'Documents' : 'No Documents'}
                </button>
              </div>
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
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 