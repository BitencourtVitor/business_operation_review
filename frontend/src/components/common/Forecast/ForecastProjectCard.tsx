import { formatDateUS } from '../../../utils/formatters';
import type { WorkforceProject } from './types';
import {
  isFieldwireComplete,
  isMachinesComplete,
  getFieldwireProgress,
  getMachinesProgress,
  hasCompleteContract,
  getContractProgress,
  getProjectCompletionMetrics,
  getForecastProjectStatus,
  getProjectTeams,
  type ForecastProjectStatus
} from './helpers';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconForecastHvacDark from '../../../assets/icon_forecast_hvac_darkmode.png';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconBuildertrendDark from '../../../assets/buildertrend_darkmode.png';
import iconQBTime from '../../../assets/qbtime_logo.png';
import iconQBTimeDark from '../../../assets/qbtime_darkmode.png';
// TODO: Adicionar ícone storage.png na pasta assets quando disponível
// import iconStorage from '../../../assets/storage.png';

interface ForecastProjectCardProps {
  theme?: 'light' | 'dark';
  project: WorkforceProject;
  onCardClick: (project: WorkforceProject) => void;
}

export default function ForecastProjectCard({
  theme,
  project,
  onCardClick
}: ForecastProjectCardProps) {
  const isDarkMode = theme !== undefined ? theme === 'dark' : document.documentElement.classList.contains('dark');
  const projectStatus = getForecastProjectStatus(project);
  
  // Lógica de cores baseada no novo status centralizado
  const getStatusVisuals = (status: ForecastProjectStatus) => {
    switch (status) {
      case 'overdue':
        return { color: '#e04b4b', shadow: 'rgba(224, 75, 75, 0.4)', icon: 'bi-exclamation-triangle-fill', label: 'Overdue' };
      case 'open':
        return { color: '#28a745', shadow: 'rgba(40, 167, 69, 0.3)', icon: 'bi-play-circle-fill', label: 'Open' };
      case 'not started':
        return { color: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.3)', icon: 'bi-clock', label: 'Not Started' };
      case 'closed':
        return { color: '#6c757d', shadow: 'rgba(108, 117, 125, 0.25)', icon: 'bi-check-circle-fill', label: 'Closed' };
      default:
        return { color: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.3)', icon: 'bi-clock', label: 'Not Started' };
    }
  };

  const visuals = getStatusVisuals(projectStatus);
  const borderColor = visuals.color;
  const shadowColor = visuals.shadow;
  
  const fieldwireProgress = getFieldwireProgress(project);
  const fieldwireComplete = isFieldwireComplete(project);
  const machinesProgress = getMachinesProgress(project);
  const machinesComplete = isMachinesComplete(project);
  const contractProgress = getContractProgress(project);
  const contractComplete = hasCompleteContract(project);

  const metrics = getProjectCompletionMetrics(project);

  // Lógica de cores para a barra de progresso baseada no status e completude
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
        transition: 'all 0.25s ease-in-out',
        boxShadow: 'none',
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
        // Simula o engrossamento da borda usando um anel de box-shadow (spread)
        // Isso evita que o layout interno "pule" pois a box-shadow não ocupa espaço no box model
        e.currentTarget.style.boxShadow = `0 0 0 1px ${borderColor}, 0 2px 8px ${shadowColor}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Barra de Progresso de Completude - Topo do Card */}
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
          transition: 'width 0.25s ease-in-out, background-color 0.25s ease',
          borderRadius: '2px'
        }} />
      </div>

      {/* Parte Superior - Dividida em Esquerda e Direita */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '12px'
      }}>
        {/* Lado Esquerdo - Informações principais */}
        <div style={{ 
          flex: 1, 
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
                {/* Cliente e Job Site - Alinhados à esquerda */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  flex: 1,
                  minWidth: 0 // Importante para permitir o truncamento no flex child
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    justifyContent: 'flex-start',
                    minWidth: 0
                  }}>
                    <h4 style={{
                      margin: 0,
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      lineHeight: 1.3,
                      textAlign: 'left',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {project.cliente}
                    </h4>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.3,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {project.job_site}
                  </p>

            {/* Status Stickers - Abaixo do Job Site */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: `${visuals.color}15`, color: visuals.color,
                padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700,
                border: `1px solid ${visuals.color}40`, textTransform: 'uppercase'
              }}>
                <i className={`bi ${visuals.icon}`} style={{ fontSize: 9 }} />
                <span>{visuals.label}</span>
              </div>
            </div>
          </div>
          
          {/* Address - Com quebra de linha, alinhado à esquerda */}
          {project.address && project.address.trim() && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              textAlign: 'left'
            }}>
              <i className="bi bi-geo-alt-fill" style={{ fontSize: 11, marginTop: '2px', flexShrink: 0 }} />
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
            gap: '4px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text-primary)'
          }}>
            <i className="bi bi-geo-alt" style={{ fontSize: 11 }} />
            <span>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</span>
          </div>
          
          {/* Equipe */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: getProjectTeams(project).length > 0 ? 'var(--color-text-primary)' : '#ffcc00',
            fontWeight: getProjectTeams(project).length > 0 ? 400 : 600
          }}>
            {hasCompleteContract(project) && (
              <i className="bi bi-file-earmark-check" style={{ fontSize: 13, color: '#20c997' }} />
            )}
            <i className="bi bi-people" style={{ fontSize: 11 }} />
            <span style={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            {(() => {
              const teams = getProjectTeams(project);
              if (teams.length === 0) return 'No team assigned';
              if (teams.length === 1) return teams[0];
              return `${teams.length} teams involved`;
            })()}
          </span>
          </div>
          
          {/* Machine Provider */}
          {project.machine_provider && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)'
            }}>
              <i className="bi bi-truck" style={{ fontSize: 11 }} />
              <span style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>{project.machine_provider}</span>
            </div>
          )}
        </div>
        
        {/* Lado Direito - Ícones em Grid 2x3 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0
        }}>
          {/* Grid 2x3 para os stickers obrigatórios */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 28px)',
            gap: '6px',
            alignContent: 'start'
          }}>
            {/* Fieldwire - Borda progressiva */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden',
              opacity: (fieldwireComplete || fieldwireProgress > 0) ? 1 : 0.5,
              filter: (fieldwireComplete || fieldwireProgress > 0) ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              {/* SVG para borda externa com progresso */}
              {(fieldwireComplete || fieldwireProgress > 0) && (
                <svg width="28" height="28" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <rect
                    x="0.5"
                    y="0.5"
                    width="27"
                    height="27"
                    rx="5.5"
                    fill="none"
                    stroke={fieldwireComplete ? '#4ade80' : '#fbbf24'}
                    strokeWidth="1"
                    strokeDasharray={fieldwireComplete 
                      ? '100 0' 
                      : `${(fieldwireProgress / 100) * 100} 100`}
                    strokeDashoffset="0"
                  />
                </svg>
              )}
              <img 
                src={iconFieldwire} 
                alt="Fieldwire" 
                style={{ width: 16, height: 16, objectFit: 'contain', zIndex: 1, position: 'relative' }}
              />
            </div>
            
            {/* BuilderTrend - Sempre borda verde se true */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: project.buildertrend ? '1px solid #4ade80' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              opacity: project.buildertrend ? 1 : 0.5,
              filter: project.buildertrend ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              <img 
                src={isDarkMode ? iconBuildertrendDark : iconBuildertrend} 
                alt="BuilderTrend" 
                style={{ width: 16, height: 16, objectFit: 'contain' }}
              />
            </div>

            {/* Quickbooks Time - Sempre borda verde se true */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: project.qbtime ? '1px solid #4ade80' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              opacity: project.qbtime ? 1 : 0.5,
              filter: project.qbtime ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              <img 
                src={isDarkMode ? iconQBTimeDark : iconQBTime} 
                alt="Quickbooks Time" 
                style={{ width: 16, height: 16, objectFit: 'contain' }}
              />
            </div>
            
            {/* Storage */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: project.storage ? '1px solid #4ade80' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              opacity: project.storage ? 1 : 0.5,
              filter: project.storage ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              <i className="bi bi-box-seam" style={{ 
                fontSize: 14,
                color: project.storage ? 'inherit' : 'var(--color-text-secondary)'
              }} />
            </div>
            
            {/* Machines and Attachments - Borda progressiva baseada no total de máquinas */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden',
              opacity: (machinesComplete || machinesProgress > 0) ? 1 : 0.5,
              filter: (machinesComplete || machinesProgress > 0) ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              {/* SVG para borda externa com progresso */}
              {(machinesComplete || machinesProgress > 0) && (
                <svg width="28" height="28" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <rect
                    x="0.5"
                    y="0.5"
                    width="27"
                    height="27"
                    rx="5.5"
                    fill="none"
                    stroke={machinesComplete ? '#4ade80' : '#fbbf24'}
                    strokeWidth="1"
                    strokeDasharray={machinesComplete 
                      ? '100 0' 
                      : `${(machinesProgress / 100) * 100} 100`}
                    strokeDashoffset="0"
                  />
                </svg>
              )}
              <i className="bi bi-truck" style={{ 
                fontSize: 14, 
                color: (machinesComplete || machinesProgress > 0) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                zIndex: 1,
                position: 'relative'
              }} />
            </div>
            
            {/* Contrato - Borda externa quadrada mostra progresso das etapas */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-background-secondary)',
              position: 'relative',
              overflow: 'hidden',
              opacity: (contractComplete || contractProgress > 0) ? 1 : 0.5,
              filter: (contractComplete || contractProgress > 0) ? 'none' : 'grayscale(100%)',
              transition: 'all 0.2s ease'
            }}>
              {/* SVG para borda externa com progresso (retangular arredondado) */}
              {(contractComplete || contractProgress > 0) && (
                <svg width="28" height="28" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <rect
                    x="0.5"
                    y="0.5"
                    width="27"
                    height="27"
                    rx="5.5"
                    fill="none"
                    stroke={contractComplete ? '#4ade80' : '#fbbf24'}
                    strokeWidth="1"
                    strokeDasharray={contractComplete 
                      ? '100 0' 
                      : `${(contractProgress / 100) * 100} 100`}
                    strokeDashoffset="0"
                  />
                </svg>
              )}
              <i className={`bi ${contractComplete ? 'bi-file-earmark-check' : 'bi-file-earmark'}`} style={{ 
                fontSize: 12, 
                color: (contractComplete || contractProgress > 0) ? (contractComplete ? '#4ade80' : 'var(--color-text-primary)') : 'var(--color-text-secondary)',
                zIndex: 1 
              }} />
            </div>
          </div>

          {/* HVAC - Abaixo do grid com linha separadora quando presente */}
          {project.hvac === true && (
            <>
              {/* Linha Horizontal Separadora */}
              <div style={{
                width: '100%',
                height: '1px',
                background: 'var(--color-border-divider)',
                opacity: 0.6,
                margin: '2px 0'
              }} />
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid #6c757d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-background-secondary)',
                transition: 'all 0.2s ease'
              }}>
                <img 
                  src={isDarkMode ? iconForecastHvacDark : iconForecastHvac} 
                  alt="HVAC" 
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Componente de Datas - Compacto, dividido em 3 partes (acima das observações) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '4px',
        marginBottom: '10px',
        paddingTop: '10px',
        borderTop: '1px solid var(--color-border-divider)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Beams Date */}
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 8,
          padding: '6px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
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
            fontSize: '11px',
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
          padding: '6px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
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
            fontSize: '11px',
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
          padding: '6px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
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
            fontSize: '11px',
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

