import { formatDateUS } from '../../../utils/formatters';
import type { WorkforceProject } from './types';
import {
  isProjectStartedByStatus,
  getOverdueType,
  isFieldwireComplete,
  getFieldwireProgress,
  getMachinesProgress,
  hasCompleteContract,
  getContractProgress,
  hasActiveFieldwire
} from './helpers';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';

interface ForecastProjectCardProps {
  project: WorkforceProject;
  filterNotStarted: boolean;
  onCardClick: (project: WorkforceProject) => void;
}

export default function ForecastProjectCard({
  project,
  filterNotStarted,
  onCardClick
}: ForecastProjectCardProps) {
  const projectStarted = isProjectStartedByStatus(project);
  const overdue = !!getOverdueType(project);
  // Três condições mutuamente exclusivas:
  // 1. Vermelho: status = "Not Started" E StartDate ultrapassada (atrasada)
  // 2. Verde: status ≠ "Not Started" (iniciada)
  // 3. Cinza: status = "Not Started" E StartDate não ultrapassada (normal)
  const borderColor = overdue ? '#e04b4b' : (projectStarted ? '#28a745' : '#6c757d');
  const shadowColor = overdue ? 'rgba(224, 75, 75, 0.2)' : (projectStarted ? 'rgba(40, 167, 69, 0.15)' : 'rgba(108, 117, 125, 0.15)');
  
  const fieldwireProgress = getFieldwireProgress(project);
  const fieldwireComplete = isFieldwireComplete(project);
  const machinesProgress = getMachinesProgress(project);
  const machinesComplete = project.machines && project.machines.length > 0 && project.machines.every(m => m.status === true);
  const contractProgress = getContractProgress(project);
  const contractComplete = hasCompleteContract(project);

  const formatDate = (dateString: string) => {
    return formatDateUS(dateString);
  };

  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: `0 2px 8px ${shadowColor}`,
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        color: 'var(--color-text-primary)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={() => onCardClick(project)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 4px 12px ${shadowColor}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = `0 2px 8px ${shadowColor}`;
      }}
    >
      {/* Parte Superior - Dividida em Esquerda e Direita */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px'
      }}>
        {/* Lado Esquerdo - Informações principais */}
        <div style={{ 
          flex: 1, 
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Cliente e Job Site - Alinhados à esquerda */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flex: 1
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'space-between'
            }}>
              <h4 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                lineHeight: 1.3,
                textAlign: 'left',
                flex: 1
              }}>
                {project.cliente}
              </h4>
              {/* Indicadores de status - à direita do Cliente */}
              {/* Três condições mutuamente exclusivas: Started (verde), Overdue (vermelho), ou nenhum (cinza) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {projectStarted ? (
                  // Condição 1: Obra iniciada (status ≠ "Not Started") → mostra "Started" verde
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#28a745',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0
                  }}>
                    <i className="bi bi-play-circle-fill" style={{ fontSize: 14 }} />
                    <span>Started</span>
                  </div>
                ) : overdue ? (
                  // Condição 2: Obra atrasada (status = "Not Started" E StartDate ultrapassada) → mostra "Overdue" vermelho
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#e04b4b',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0
                  }}>
                    <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14 }} />
                    <span>Overdue</span>
                  </div>
                ) : null}
                {/* Condição 3: Obra normal (status = "Not Started" E StartDate não ultrapassada) → não mostra nada */}
              </div>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.3,
              textAlign: 'left'
            }}>
              {project.job_site}
            </p>
          </div>
          
          {/* Address - Com quebra de linha, alinhado à esquerda */}
          {project.address && project.address.trim() && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              textAlign: 'left'
            }}>
              <i className="bi bi-geo-alt-fill" style={{ fontSize: 12, marginTop: '2px', flexShrink: 0 }} />
              <span style={{
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                textAlign: 'left'
              }}>
                {project.address}
              </span>
            </div>
          )}
          
          {/* Lot */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--color-text-primary)'
          }}>
            <i className="bi bi-geo-alt" style={{ fontSize: 12 }} />
            <span>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</span>
          </div>
          
          {/* Equipe */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: project.workforce ? 'var(--color-text-primary)' : '#ffcc00',
            fontWeight: project.workforce ? 400 : 600
          }}>
            {hasCompleteContract(project) && (
              <i className="bi bi-file-earmark-check" style={{ fontSize: 14, color: '#20c997' }} />
            )}
            <i className="bi bi-people" style={{ fontSize: 12 }} />
            <span>{project.workforce || 'No team assigned'}</span>
          </div>
          
          {/* Machine Provider */}
          {project.machine_provider && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: 'var(--color-text-secondary)'
            }}>
              <i className="bi bi-truck" style={{ fontSize: 12 }} />
              <span>{project.machine_provider}</span>
            </div>
          )}
        </div>
        
        {/* Lado Direito - Ícones em quadrados */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
          flexShrink: 0
        }}>
          {/* HVAC - Sempre no topo, borda cinza (presença, não conclusão) */}
          {project.hvac === true && (
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: '1px solid #6c757d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)'
            }}>
              <img 
                src={iconForecastHvac} 
                alt="HVAC" 
                style={{ width: 18, height: 18, objectFit: 'contain' }}
              />
            </div>
          )}
          
          {/* Fieldwire - Borda progressiva */}
          {hasActiveFieldwire(project) && (
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* SVG para borda externa com progresso */}
              <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                <rect
                  x="0.5"
                  y="0.5"
                  width="29"
                  height="29"
                  rx="5.5"
                  fill="none"
                  stroke={fieldwireComplete ? '#4ade80' : (fieldwireProgress > 0 ? '#fbbf24' : '#6c757d')}
                  strokeWidth="1"
                  strokeDasharray={fieldwireComplete 
                    ? '105 0' 
                    : fieldwireProgress > 0
                    ? `${(fieldwireProgress / 100) * 105} 105`
                    : '0 105'}
                  strokeDashoffset="0"
                />
              </svg>
              <img 
                src={iconFieldwire} 
                alt="Fieldwire" 
                style={{ width: 18, height: 18, objectFit: 'contain', zIndex: 1, position: 'relative' }}
              />
            </div>
          )}
          
          {/* BuilderTrend */}
          {project.buildertrend === true && (
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: `1px solid ${project.buildertrend ? '#4ade80' : '#6c757d'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)'
            }}>
              <img 
                src={iconBuildertrend} 
                alt="BuilderTrend" 
                style={{ width: 18, height: 18, objectFit: 'contain' }}
              />
            </div>
          )}
          
          {/* Machines and Attachments - Borda progressiva baseada no total de máquinas */}
          {project.machines && project.machines.length > 0 && (
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* SVG para borda externa com progresso */}
              <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                <rect
                  x="0.5"
                  y="0.5"
                  width="29"
                  height="29"
                  rx="5.5"
                  fill="none"
                  stroke={machinesComplete ? '#4ade80' : (machinesProgress > 0 ? '#fbbf24' : '#6c757d')}
                  strokeWidth="1"
                  strokeDasharray={machinesComplete 
                    ? '105 0' 
                    : machinesProgress > 0
                    ? `${(machinesProgress / 100) * 105} 105`
                    : '0 105'}
                  strokeDashoffset="0"
                />
              </svg>
              <i className="bi bi-truck" style={{ 
                fontSize: 16, 
                color: 'var(--color-text-primary)',
                zIndex: 1,
                position: 'relative'
              }} />
            </div>
          )}
          
          {/* Contrato - Borda externa quadrada mostra progresso das etapas */}
          {project.contract_steps && project.contract_steps.length > 0 && (
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* SVG para borda externa com progresso (retangular arredondado) */}
              <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                <rect
                  x="0.5"
                  y="0.5"
                  width="29"
                  height="29"
                  rx="5.5"
                  fill="none"
                  stroke={contractComplete ? '#4ade80' : (contractProgress > 0 ? '#fbbf24' : '#6c757d')}
                  strokeWidth="1"
                  strokeDasharray={contractComplete 
                    ? '105 0' 
                    : contractProgress > 0
                    ? `${(contractProgress / 100) * 105} 105`
                    : '0 105'}
                  strokeDashoffset="0"
                />
              </svg>
              <i className={`bi ${contractComplete ? 'bi-file-earmark-check' : 'bi-file-earmark'}`} style={{ 
                fontSize: 14, 
                color: contractComplete ? '#4ade80' : 'var(--color-text-secondary)',
                zIndex: 1 
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Componente de Datas - Compacto, dividido em 3 partes (acima das observações) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        marginBottom: '12px',
        paddingTop: '12px',
        borderTop: '1px solid var(--color-border-divider)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Beams Date */}
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 8,
          padding: '8px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          <i className="bi bi-flag-fill" style={{ 
            fontSize: 12, 
            color: 'var(--color-text-secondary)',
            flexShrink: 0
          }} />
          <div style={{
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            textAlign: 'center',
            lineHeight: 1.2,
            minWidth: 0,
            flex: 1
          }}>
            {project.previous_beams_date ? formatDate(project.previous_beams_date) : 'N/A'}
          </div>
        </div>
        
        {/* Start Date */}
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 8,
          padding: '8px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          <i className="bi bi-calendar" style={{ 
            fontSize: 12, 
            color: 'var(--color-text-secondary)',
            flexShrink: 0
          }} />
          <div style={{
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            textAlign: 'center',
            lineHeight: 1.2,
            minWidth: 0,
            flex: 1
          }}>
            {project.previous_start_date ? formatDate(project.previous_start_date) : 'N/A'}
          </div>
        </div>
        
        {/* End Date */}
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 8,
          padding: '8px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          <i className="bi bi-calendar-check" style={{ 
            fontSize: 12, 
            color: 'var(--color-text-secondary)',
            flexShrink: 0
          }} />
          <div style={{
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            textAlign: 'center',
            lineHeight: 1.2,
            minWidth: 0,
            flex: 1
          }}>
            {project.previous_end_date ? formatDate(project.previous_end_date) : 'N/A'}
          </div>
        </div>
      </div>
      
      {/* Parte Inferior - Observações */}
      {project.obs && project.obs.trim() && (
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid var(--color-border-divider)'
        }}>
          <div style={{
            padding: '14px',
            background: 'var(--color-background-secondary)',
            borderRadius: 10,
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            lineHeight: 1.6
          }}>
            {project.obs}
          </div>
        </div>
      )}
    </div>
  );
}

