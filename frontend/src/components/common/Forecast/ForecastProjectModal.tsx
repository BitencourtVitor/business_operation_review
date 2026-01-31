import { useState, useRef } from 'react';
import { formatDateUS } from '../../../utils/formatters';
import type { WorkforceProject } from './types';
import { 
  isProjectStartedByStatus, 
  getOverdueType,
  getProjectCompletionMetrics,
  getForecastProjectStatus,
  type ForecastProjectStatus
} from './helpers';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconBuildertrendDark from '../../../assets/buildertrend_darkmode.png';
import iconQBTime from '../../../assets/qbtime_logo.png';
import iconQBTimeDark from '../../../assets/qbtime_darkmode.png';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconForecastHvacDark from '../../../assets/icon_forecast_hvac_darkmode.png';
import iconBoomlift from '../../../assets/boomlift.png';
import iconForklift from '../../../assets/forklift.png';
// TODO: Adicionar ícone storage.png na pasta assets quando disponível
// import iconStorage from '../../../assets/storage.png';

interface ForecastProjectModalProps {
  theme?: 'light' | 'dark';
  project: WorkforceProject;
  onClose: () => void;
}

export default function ForecastProjectModal({
  theme,
  project,
  onClose
}: ForecastProjectModalProps) {
  const isDarkMode = theme !== undefined ? theme === 'dark' : document.documentElement.classList.contains('dark');
  const projectStatus = getForecastProjectStatus(project);
  const metrics = getProjectCompletionMetrics(project);
  const overdue = !!getOverdueType(project);

  const getProgressBarColor = () => {
    if (projectStatus === 'overdue') return '#e04b4b'; // Overdue: Sempre Vermelho
    if (projectStatus === 'closed') return '#495057'; // Closed: Cinza Escuro
    if (projectStatus === 'not started') return '#3b82f6'; // Not Started: Azul (cor do status)
    
    // Para obras "Started" ou status ativos (Open, etc)
    if (metrics.percentage === 100) {
      return '#3b82f6'; // 100% Completo: Azul
    } else {
      return '#f59e0b'; // Incompleto: Laranja/Amarelo
    }
  };
  const [activeSection, setActiveSection] = useState<string>('overview');
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    return formatDateUS(dateString);
  };

  const sections = [
    { id: 'overview', icon: 'bi-info-circle', label: 'Overview', image: null },
    ...(project.fieldwire && project.fieldwire.length > 0 ? [{ id: 'fieldwire', icon: null, label: 'Fieldwire', image: iconFieldwire }] : []),
    { id: 'buildertrend', icon: null, label: 'BuilderTrend', image: isDarkMode ? iconBuildertrendDark : iconBuildertrend },
    { id: 'qbtime', icon: null, label: 'Quickbooks Time', image: isDarkMode ? iconQBTimeDark : iconQBTime },
    // TODO: Quando iconStorage estiver disponível, atualizar para: { id: 'storage', icon: null, label: 'Storage', image: iconStorage },
    { id: 'storage', icon: 'bi-box', label: 'Storage', image: null },
    ...(project.contract_steps && project.contract_steps.length > 0 ? [{ id: 'contract', icon: 'bi-file-check', label: 'Contract', image: null }] : []),
    ...(project.machines && project.machines.length > 0 ? [{ id: 'machines', icon: 'bi-truck', label: 'Machines', image: null }] : [])
  ];

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(`modal-section-${sectionId}`);
    const scrollContainer = modalScrollContainerRef.current;
    if (element && scrollContainer) {
      const elementTop = element.offsetTop;
      scrollContainer.scrollTo({
        top: Math.max(0, elementTop - 20),
        behavior: 'smooth'
      });
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    
    // Lista de IDs das seções ativas no momento
    const activeSectionIds = sections.map(s => s.id);
    
    let currentActiveId = activeSectionIds[0];
    
    // Threshold para considerar uma seção ativa (se o topo dela estiver nos primeiros 100px do container)
    const threshold = 100;

    for (const sectionId of activeSectionIds) {
      const element = document.getElementById(`modal-section-${sectionId}`);
      if (element) {
        const elementTop = element.offsetTop;
        // Se o topo da seção passou do threshold ou se estamos perto do topo do container
        if (elementTop <= scrollTop + threshold) {
          currentActiveId = sectionId;
        } else {
          // Como as seções estão em ordem, se esta seção ainda não chegou no topo, as próximas também não
          break;
        }
      }
    }
    
    // Caso especial: se chegamos no final do scroll, ativa a última seção
    if (scrollTop + containerHeight >= container.scrollHeight - 20) {
      currentActiveId = activeSectionIds[activeSectionIds.length - 1];
    }
    
    if (currentActiveId !== activeSection) {
      setActiveSection(currentActiveId);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1000,
        overflow: 'hidden'
      }}
      onClick={onClose}
    >
      {/* Scroll Spy Navigation - Fora do modal, ao lado */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginRight: '12px',
        background: 'var(--color-background-primary)',
        padding: '8px 4px',
        borderRadius: '12px',
        border: '1px solid var(--color-border-divider)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        alignSelf: 'center'
      }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleSectionClick(section.id);
            }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: activeSection === section.id 
                ? '2px solid var(--color-accent-primary)' 
                : '1px solid var(--color-border-divider)',
              background: 'transparent',
              color: activeSection === section.id 
                ? 'var(--color-accent-primary)' 
                : 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontSize: section.image ? '0' : '18px',
              padding: section.image ? '4px' : '0'
            }}
            title={section.label}
          >
            {section.image ? (
              <img src={section.image} alt={section.label} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
            ) : (
              <i className={`bi ${section.icon}`} />
            )}
          </button>
        ))}
      </div>

      <div 
        ref={modalScrollRef}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: '16px',
          maxWidth: '420px',
          width: '100%',
          maxHeight: '82vh',
          overflow: 'hidden',
          border: '1px solid var(--color-border-divider)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixo do modal */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--color-border-divider)',
          background: 'var(--color-background-primary)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
          {/* Barra de Progresso de Completude - Dentro do Header para consistência com o Card */}
          <div style={{
            width: '100%',
            height: '4px',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '2px',
            marginBottom: '12px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${metrics.percentage}%`,
              background: getProgressBarColor(),
              transition: 'width 0.5s ease-in-out, background-color 0.3s ease',
              borderRadius: '2px'
            }} />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            width: '100%'
          }}>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'flex-start',
                gap: '12px',
                marginBottom: 4,
                flexWrap: 'wrap'
              }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {project.cliente}
              </div>
              {/* Indicadores de status - quatro condições mutuamente exclusivas */}
              {(() => {
                const getStatusVisuals = (status: ForecastProjectStatus) => {
                  switch (status) {
                    case 'overdue':
                      return { color: '#e04b4b', icon: 'bi-exclamation-triangle-fill', label: 'Overdue' };
                    case 'open':
                      return { color: '#28a745', icon: 'bi-play-circle-fill', label: 'Open' };
                    case 'not started':
                      return { color: '#3b82f6', icon: 'bi-clock', label: 'Not Started' };
                    case 'closed':
                      return { color: '#6c757d', icon: 'bi-check-circle-fill', label: 'Closed' };
                    default:
                      return { color: '#6c757d', icon: 'bi-clock', label: 'Open' };
                  }
                };

                const visuals = getStatusVisuals(projectStatus);
                
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: `${visuals.color}15`, color: visuals.color,
                    padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                    border: `1px solid ${visuals.color}30`, flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    <i className={`bi ${visuals.icon}`} style={{ fontSize: 10 }} />
                    <span>{visuals.label}</span>
                  </div>
                );
              })()}
            </div>
            <div style={{ 
              fontSize: 13, 
              color: 'var(--color-text-secondary)', 
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{project.job_site}</span>
              <span style={{ color: 'var(--color-border-divider)' }}>|</span>
              <span style={{ fontWeight: 600 }}>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</span>
            </div>
            <div style={{ 
              fontSize: 12, 
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px'
            }}>
              <i className="bi bi-geo-alt-fill" style={{ fontSize: 10, marginTop: 2 }} />
              <span style={{ textAlign: 'left' }}>{project.address}</span>
            </div>
          </div>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: 4,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <i className="bi bi-x" style={{ fontSize: 18 }} />
          </button>
        </div>
      </div>

      {/* Conteúdo scrollável */}
        <div 
          ref={modalScrollContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '18px'
          }}
          className="modal-scroll-container"
          onScroll={handleScroll}
        >
          {/* Overview Section */}
          <div id="modal-section-overview" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
            {/* Datas */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8, fontWeight: 600, textAlign: 'left' }}>Datas</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Beams</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{project.previous_beams_date ? formatDate(project.previous_beams_date) : 'N/A'}</div>
                </div>
                <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Start</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{project.previous_start_date ? formatDate(project.previous_start_date) : 'N/A'}</div>
                </div>
                <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>End</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{project.previous_end_date ? formatDate(project.previous_end_date) : 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Observations */}
            {project.obs && project.obs.trim() && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600, textAlign: 'left' }}>Observations</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, background: 'var(--color-background-secondary)', padding: '12px', borderRadius: 8 }}>
                  {project.obs}
                </div>
              </div>
            )}

            {/* Linha separadora */}
            {project.fieldwire && project.fieldwire.length > 0 && (
              <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
            )}
          </div>

          {/* Fieldwire Documents */}
          {project.fieldwire && project.fieldwire.length > 0 && (
            <div id="modal-section-fieldwire" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>Fieldwire Documents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {project.fieldwire.map((fw) => (
                  <div key={fw.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-divider)'
                  }}>
                    <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {fw.document || 'N/A'}
                    </div>
                    {fw.status ? (
                      <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80' }} />
                    ) : (
                      <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linha separadora */}
          <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />

          {/* BuilderTrend Section */}
          <div id="modal-section-buildertrend" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>BuilderTrend</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 8,
              border: '1px solid var(--color-border-divider)'
            }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Configuração da obra no BuilderTrend</div>
              {project.buildertrend ? (
                <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
              ) : (
                <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
              )}
            </div>
          </div>

          {/* Linha separadora */}
          <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />

          {/* Quickbooks Time Section */}
          <div id="modal-section-qbtime" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>Quickbooks Time</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 8,
              border: '1px solid var(--color-border-divider)'
            }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Cadastro da obra no Quickbooks Time</div>
              {project.qbtime ? (
                <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
              ) : (
                <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
              )}
            </div>
          </div>

          {/* Linha separadora */}
          <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />

          {/* Storage - Sempre presente */}
          <div id="modal-section-storage" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>Storage</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 8,
              border: '1px solid var(--color-border-divider)'
            }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Obra adicionada ao sistema de estoque</div>
              {project.storage ? (
                <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
              ) : (
                <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
              )}
            </div>
          </div>

          {/* Linha separadora */}
          <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />

          {/* Contract Steps */}
          {project.contract_steps && project.contract_steps.length > 0 && (
            <div id="modal-section-contract" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'left' }}>Contract Steps</div>
              {project.workforce && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, opacity: 0.7, textAlign: 'left' }}>
                  Workforce: {project.workforce}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {project.contract_steps.map((cs) => (
                  <div key={cs.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-divider)'
                  }}>
                    <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {cs.step || 'N/A'}
                    </div>
                    {cs.status ? (
                      <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80' }} />
                    ) : (
                      <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linha separadora */}
          {project.machines && project.machines.length > 0 && (
            <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
          )}

          {/* Machines and Attachments */}
          {project.machines && project.machines.length > 0 && (
            <div id="modal-section-machines" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'left' }}>Machines and Attachments</div>
              {project.machine_provider && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, opacity: 0.7, textAlign: 'left' }}>
                  Provided by {project.machine_provider}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {project.machines.map((m) => {
                  const isBoomlift = m.title?.toLowerCase().includes('boomlift');
                  const isForklift = m.title?.toLowerCase().includes('forklift');
                  return (
                    <div key={m.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px',
                      background: 'rgba(0,0,0,0.05)',
                      borderRadius: 8,
                      border: '1px solid var(--color-border-divider)'
                    }}>
                      {/* Imagem no início */}
                      {(isBoomlift || isForklift) && (
                        <img 
                          src={isBoomlift ? iconBoomlift : iconForklift} 
                          alt={isBoomlift ? 'Boomlift' : 'Forklift'} 
                          style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} 
                        />
                      )}
                      {/* Informações alinhadas à esquerda */}
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                          {m.title || 'N/A'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', opacity: 0.5, marginBottom: m.status && m.unit ? 4 : 0 }}>
                          {m.equipment_category || ''}
                        </div>
                        {m.status && m.unit && (
                          <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                            Unit: {m.unit}
                          </div>
                        )}
                      </div>
                      {/* Status alinhado à direita */}
                      {m.status ? (
                        <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
                      ) : (
                        <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

