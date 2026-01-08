import { useState, useRef } from 'react';
import { formatDateUS } from '../../../utils/formatters';
import type { WorkforceProject } from './types';
import { isProjectStartedByStatus, getOverdueType } from './helpers';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconBoomlift from '../../../assets/boomlift.png';
import iconForklift from '../../../assets/forklift.png';
// TODO: Adicionar ícone storage.png na pasta assets quando disponível
// import iconStorage from '../../../assets/storage.png';

interface ForecastProjectModalProps {
  project: WorkforceProject;
  filterNotStarted: boolean;
  onClose: () => void;
}

export default function ForecastProjectModal({
  project,
  filterNotStarted,
  onClose
}: ForecastProjectModalProps) {
  const [activeSection, setActiveSection] = useState<string>('overview');
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    return formatDateUS(dateString);
  };

  const sections = [
    { id: 'overview', icon: 'bi-info-circle', label: 'Overview', image: null },
    ...(project.fieldwire && project.fieldwire.length > 0 ? [{ id: 'fieldwire', icon: null, label: 'Fieldwire', image: iconFieldwire }] : []),
    { id: 'buildertrend', icon: null, label: 'BuilderTrend', image: iconBuildertrend },
    // TODO: Quando iconStorage estiver disponível, atualizar para: { id: 'storage', icon: null, label: 'Storage', image: iconStorage },
    { id: 'storage', icon: 'bi-box', label: 'Storage', image: null },
    ...(project.machines && project.machines.length > 0 ? [{ id: 'machines', icon: 'bi-truck', label: 'Machines', image: null }] : []),
    ...(project.contract_steps && project.contract_steps.length > 0 ? [{ id: 'contract', icon: 'bi-file-check', label: 'Contract', image: null }] : [])
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
    const viewportMiddle = scrollTop + container.clientHeight / 2;
    
    const sectionIds = [
      'overview',
      ...(project.fieldwire && project.fieldwire.length > 0 ? ['fieldwire'] : []),
      'buildertrend',
      'storage',
      ...(project.machines && project.machines.length > 0 ? ['machines'] : []),
      ...(project.contract_steps && project.contract_steps.length > 0 ? ['contract'] : [])
    ];
    
    let activeId = sectionIds[0];
    let minDistance = Infinity;
    
    sectionIds.forEach((sectionId) => {
      const element = document.getElementById(`modal-section-${sectionId}`);
      if (element) {
        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const elementMiddle = elementTop + (elementBottom - elementTop) / 2;
        const distance = Math.abs(viewportMiddle - elementMiddle);
        
        if (elementTop <= scrollTop + container.clientHeight && 
            elementBottom >= scrollTop && 
            distance < minDistance) {
          minDistance = distance;
          activeId = sectionId;
        }
      }
    });
    
    setActiveSection(activeId);
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
              border: 'none',
              background: activeSection === section.id 
                ? 'var(--color-accent-primary)' 
                : 'var(--color-background-secondary)',
              color: activeSection === section.id 
                ? '#fff' 
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
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: 4 
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {project.cliente}
              </div>
              {/* Indicadores de status - três condições mutuamente exclusivas */}
              {(() => {
                const projectStarted = isProjectStartedByStatus(project);
                const overdue = !!getOverdueType(project);
                
                if (projectStarted) {
                  // Condição 1: Obra iniciada (status ≠ "Not Started") → mostra "Started" verde
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#28a745',
                      flexShrink: 0
                    }}>
                      <i className="bi bi-play-circle-fill" style={{ fontSize: 14 }} />
                      <span>Started</span>
                    </div>
                  );
                } else if (overdue) {
                  // Condição 2: Obra atrasada (status = "Not Started" E StartDate ultrapassada) → mostra "Overdue" vermelho
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#e04b4b',
                      flexShrink: 0
                    }}>
                      <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14 }} />
                      <span>Overdue</span>
                    </div>
                  );
                }
                // Condição 3: Obra normal (status = "Not Started" E StartDate não ultrapassada) → não mostra nada
                return null;
              })()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{project.job_site}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</div>
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
            {/* Address */}
            {project.address && project.address.trim() && (
              <div style={{ marginBottom: 12, textAlign: 'left' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600 }}>Address</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, textAlign: 'left' }}>{project.address}</div>
              </div>
            )}

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
          {project.buildertrend === true && (
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

          {/* Linha separadora */}
          {(project.fieldwire && project.fieldwire.length > 0) && (
            <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
          )}

          {/* Buildertrend - Sempre presente */}
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
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Criação da obra dentro BuilderTrend</div>
              {project.buildertrend ? (
                <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
              ) : (
                <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
              )}
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}

