import React from 'react';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconFieldwire from '../../../assets/fieldwire.png';
import { formatDateUS } from '../../../utils/formatters';

const POSITIVE_STRINGS = ['yes', 'sim', 'true', '1', 'y'];

const isTruthyFlag = (value?: string | boolean | null): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = value.toString().toLowerCase().trim();
  if (!normalized) return false;
  return POSITIVE_STRINGS.includes(normalized);
};

interface TimelineTooltipProps {
  isVisible: boolean;
  position: { x: number; y: number };
  data: {
    groupName: string;
    period: string;
    count: number;
    projects: Array<{
      cliente: string;
      job_site: string;
      lote_building: number;
      workforce: string;
      previous_start_date: string;
      previous_end_date: string;
      observacoes: string;
      hvac?: string | null;
      fieldwire?: boolean | string | null;
      tem_contrato?: boolean | string | null;
    }>;
  };
  onClose: () => void;
}

export default function TimelineTooltip({ 
  isVisible, 
  position, 
  data, 
  onClose 
}: TimelineTooltipProps) {
  if (!isVisible) return null;

  return (
    <>
      {/* Overlay para fechar o tooltip */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.1)'
        }}
        onClick={onClose}
      />
      
      {/* Tooltip */}
      <div
        style={{
          position: 'fixed',
          left: Math.min(position.x, window.innerWidth - 400),
          top: Math.min(position.y, window.innerHeight - 300),
          zIndex: 1001,
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          minWidth: 350,
          maxWidth: 400,
          maxHeight: 400,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          background: 'var(--color-background-secondary)',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border-divider)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h6 style={{ 
              margin: 0, 
              color: 'var(--color-text-primary)', 
              fontSize: 16, 
              fontWeight: 600 
            }}>
              {data.groupName}
            </h6>
            <p style={{ 
              margin: '4px 0 0 0', 
              color: 'var(--color-text-secondary)', 
              fontSize: 13 
            }}>
              Works: {data.count}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 20,
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <i className="bi bi-x" />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '16px 20px',
          maxHeight: 300,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--color-border-divider) transparent'
        }}>
          <style>
            {`
              div::-webkit-scrollbar {
                width: 6px;
              }
              div::-webkit-scrollbar-track {
                background: transparent;
              }
              div::-webkit-scrollbar-thumb {
                background: var(--color-border-divider);
                border-radius: 3px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background: var(--color-text-secondary);
              }
            `}
          </style>
          {data.projects.map((project, index) => (
            <div
              key={index}
              style={{
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 8,
                padding: '12px',
                marginBottom: index < data.projects.length - 1 ? 12 : 0
              }}
            >
              {/* Project Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 4
                  }}>
                    {project.cliente || 'Cliente não informado'}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 2
                  }}>
                    <strong>Job Site:</strong> {project.job_site || 'Not informed'}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)'
                  }}>
                    <strong>Lot:</strong> {project.lote_building || 'Not informed'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 8 }}>
                  {project.workforce && (
                    <div style={{
                      background: '#28a745',
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '6px 10px',
                      borderRadius: 12,
                      minWidth: 30,
                      textAlign: 'center'
                    }}>
                      {project.workforce}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {project.hvac && project.hvac.toUpperCase() === 'YES' && (
                      <div style={{
                        background: '#17a2b8',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 8px',
                        borderRadius: 12,
                        minWidth: 30,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img 
                          src={iconForecastHvac} 
                          alt="HVAC" 
                          style={{ 
                            width: '16px', 
                            height: '16px',
                            objectFit: 'contain'
                          }} 
                        />
                      </div>
                    )}
                    {isTruthyFlag(project.fieldwire) && (
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        minWidth: 30,
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img 
                          src={iconFieldwire} 
                          alt="Fieldwire" 
                          style={{ width: 16, height: 16, objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    {isTruthyFlag(project.tem_contrato) && (
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        color: 'var(--color-text-primary)',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 10px',
                        borderRadius: 12,
                        minWidth: 30,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}>
                        <i className="bi bi-file-earmark-check" />
                        Contrato
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Project Details */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                marginBottom: project.observacoes ? 12 : 0
              }}>
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: 4, 
                    color: 'var(--color-text-primary)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}>
                    Start Date
                  </div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: project.previous_start_date ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
                  }}>
                    {project.previous_start_date 
                      ? formatDateUS(project.previous_start_date)
                      : 'Not defined'
                    }
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: 4, 
                    color: 'var(--color-text-primary)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}>
                    End Date
                  </div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: project.previous_end_date ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
                  }}>
                    {project.previous_end_date 
                      ? formatDateUS(project.previous_end_date)
                      : 'Not defined'
                    }
                  </div>
                </div>
              </div>

              {/* Observations (expand spacing as requested) */}
              {project.observacoes && project.observacoes.trim() && (
                <div style={{
                  padding: '12px',
                  background: 'var(--color-background-primary)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-divider)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary)'
                }}>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: 8, 
                    color: 'var(--color-text-primary)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}>
                    Observations
                  </div>
                  <div style={{ lineHeight: 1.5 }}>
                    {project.observacoes}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
