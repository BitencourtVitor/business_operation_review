import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { createPortal } from 'react-dom';
import type { ProjectMonitoringHvacData } from '../../../hooks/useProjectMonitoringHvacData';
import { ProjectMonitoringPieChart } from './ProjectMonitoringPieChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Tooltip customizado para o gráfico Project Monitoring
interface ProjectMonitoringTooltipExternalProps {
  tooltip: unknown;
  canvas?: HTMLCanvasElement | null;
  data: ProjectMonitoringHvacData[];
}

const ProjectMonitoringTooltipExternal = React.memo(function ProjectMonitoringTooltipExternal({ tooltip, canvas, data }: ProjectMonitoringTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let caretX: number = 0;
  let caretY: number = 0;
  let status = '';
  let count = 0;
  let percentage = 0;

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number; datasetIndex: number; label: string; value: number }>;
    caretX?: number;
    caretY?: number;
  };
  const opacity = safeTooltip.opacity;
  const dataPoints = safeTooltip.dataPoints;
  const caretXVal = safeTooltip.caretX;
  const caretYVal = safeTooltip.caretY;

  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [status, count, percentage]);

  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  status = dataPoints[0].label;
  count = dataPoints[0].value;
  
  // Calcular porcentagem
  const total = data.length;
  percentage = total > 0 ? (count / total) * 100 : 0;

  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 100;
  const padding = 12;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - realWidth - offsetX;
    }
    if (absTop < rect.top + padding) absTop = rect.top + padding;
    if (absTop + tooltipHeight > rect.bottom - padding) absTop = rect.bottom - tooltipHeight - padding;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: absLeft,
        top: absTop,
        transform: 'none',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: 16,
        minWidth: 200,
        maxWidth: 280,
        zIndex: 9999,
        opacity: 0.9,
        pointerEvents: 'none',
        fontSize: 14,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 16, textAlign: 'center' }}>
          {status}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Quantidade</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{count}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Porcentagem</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{percentage.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{total}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

interface ProjectMonitoringChartProps {
  filteredData: ProjectMonitoringHvacData[];
  selectedYear: string;
  selectedMonth: string;
}

export function ProjectMonitoringChart({ 
  filteredData, 
  selectedYear, 
  selectedMonth
}: ProjectMonitoringChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<ProjectMonitoringTooltipExternalProps>>(null);

  // Função para calcular o status baseado nos stages
  const calculateProjectStatus = (project: ProjectMonitoringHvacData): 'completed' | 'in_progress' | 'no_started' => {
    const stages = [
      project.s1_rough,
      project.s2_machines, 
      project.s3_condenser,
      project.s4_finish
    ];

    // Se não há stages definidos, considerar como no_started
    if (stages.every(stage => !stage)) {
      return 'no_started';
    }

    const completedCount = stages.filter(stage => stage === 'Completed').length;
    const noStartedCount = stages.filter(stage => stage === 'No started').length;

    // Se todas as 4 colunas são completed, o projeto está completo
    if (completedCount === 4) {
      return 'completed';
    } else if (noStartedCount === 4) {
      // Se todas as 4 colunas são no started, o projeto não foi iniciado
      return 'no_started';
    } else {
      // Qualquer outra combinação (anômala) = projeto em progresso
      return 'in_progress';
    }
  };

  // Função para gerar título do projeto
  const getProjectTitle = (project: ProjectMonitoringHvacData): string => {
    const lotNumber = project.lot_number || '';
    const jobSite = project.job_site || '';
    const city = project.city || '';
    
    const parts = [];
    if (lotNumber) parts.push(`Lot ${lotNumber}`);
    if (jobSite) parts.push(jobSite);
    if (city) parts.push(city);
    
    return parts.length > 0 ? parts.join(' - ') : 'Project';
  };

  // Preparar dados do gráfico de pizza
  const { chartData, chartOptions, hasData, statusAverages } = useMemo(() => {
    if (filteredData.length === 0) {
      return { chartData: null, chartOptions: null, hasData: false, statusAverages: {} };
    }

    // Calcular contagem por status
    const statusCounts = {
      'completed': 0,
      'in_progress': 0,
      'no_started': 0
    };

    // Calcular dias de processamento por status
    const statusDays = {
      'completed': [] as number[],
      'in_progress': [] as number[],
      'no_started': [] as number[]
    };

    const currentDate = new Date();

    filteredData.forEach(row => {
      const status = calculateProjectStatus(row);
      statusCounts[status]++;
      
      // Calcular dias de processamento baseado no status
      let days = 0;
      
      if (status === 'completed') {
        // Completed: finish_date - start_date
        if (row.finish_date && row.start_date) {
          const finishDate = new Date(row.finish_date);
          const startDate = new Date(row.start_date);
          days = Math.ceil((finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else if (status === 'in_progress') {
        // In Progress: data_atual - start_date
        if (row.start_date) {
          const startDate = new Date(row.start_date);
          days = Math.ceil((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else {
        // No Started: data_atual - start_date (se existir)
        if (row.start_date) {
          const startDate = new Date(row.start_date);
          days = Math.ceil((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      
      if (days > 0) {
        statusDays[status].push(days);
      }
    });

    // Calcular médias de dias por status
    const statusAverages: Record<string, number> = {};
    Object.keys(statusDays).forEach(status => {
      const days = statusDays[status as keyof typeof statusDays];
      if (days.length > 0) {
        statusAverages[status] = Math.round(days.reduce((sum, day) => sum + day, 0) / days.length);
      } else {
        statusAverages[status] = 0;
      }
    });

    // Filtrar apenas status com dados
    const labels: string[] = [];
    const data: number[] = [];

    if (statusCounts['completed'] > 0) {
      labels.push('Completed');
      data.push(statusCounts['completed']);
    }

    if (statusCounts['in_progress'] > 0) {
      labels.push('In Progress');
      data.push(statusCounts['in_progress']);
    }

    if (statusCounts['no_started'] > 0) {
      labels.push('No Started');
      data.push(statusCounts['no_started']);
    }

    // Cores para cada status
    const backgroundColor = labels.map(label => {
      switch (label) {
        case 'Completed': return '#28a745';
        case 'In Progress': return '#ffc107';
        case 'No Started': return '#dc3545';
        default: return '#6c757d';
      }
    });
    
    const borderColor = backgroundColor.map(color => color + '80');

    const chartData = {
      labels,
      datasets: [{
        data,
        backgroundColor,
        borderColor,
        borderWidth: 2,
        hoverBorderWidth: 3,
      }]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // Desabilitar legenda padrão para usar customizada
        },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setExternalTooltip(null);
              return;
            }
            if (chartData) {
              setExternalTooltip({
                tooltip: context.tooltip,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas: HTMLCanvasElement }).canvas : undefined,
                data: filteredData as ProjectMonitoringHvacData[],
              });
            }
          }
        },
      },
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 10,
          right: 10
        }
      }
    };

    const hasData = data.length > 0 && data.some(value => value > 0);

    return { chartData, chartOptions, hasData, statusAverages };
  }, [filteredData, selectedYear, selectedMonth]);

  return (
    <>
      {/* Header com título */}
      <div className='px-4 py-2 d-flex justify-content-between align-items-center' style={{ borderBottom: '1px solid var(--color-border-divider)', height: 56 }}>
        <h4 className='m-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          Distribuição de Status dos Projetos
        </h4>
      </div>
      
      {/* Layout principal em duas colunas */}
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
        <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 0 }}>
          {/* Filtros - Lado esquerdo */}
          <div style={{ width: 340, minWidth: 260, maxWidth: 400, display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100%', padding: 10, borderRight: '1px solid var(--color-border-divider)' }}>
            {/* Título dos projetos */}
            <div style={{ marginBottom: 20 }}>
              <h5 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Works
              </h5>
            </div>

            {/* Listagem dos projetos */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              borderRadius: 8,
              padding: '8px 12px'
            }} className="custom-scrollbar">
              {filteredData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(() => {
                    // Agrupar works por status
                    const groupedWorks: Record<string, ProjectMonitoringHvacData[]> = {
                      'completed': [],
                      'in_progress': [],
                      'no_started': []
                    };
                    
                    // Organizar works por status
                    filteredData.forEach(project => {
                      const status = calculateProjectStatus(project);
                      if (status in groupedWorks) {
                        groupedWorks[status].push(project);
                      }
                    });
                    
                    // Ordem dos status para exibição
                    const statusOrder = ['completed', 'in_progress', 'no_started'];
                    
                    return statusOrder.map(status => {
                      const works = groupedWorks[status];
                      if (works.length === 0) return null;
                      
                      const statusColor = (() => {
                        switch (status) {
                          case 'no_started': return '#dc3545';
                          case 'in_progress': return '#ffc107';
                          case 'completed': return '#28a745';
                          default: return '#6c757d';
                        }
                      })();
                      
                      const statusLabel = (() => {
                        switch (status) {
                          case 'completed': return 'Completed';
                          case 'in_progress': return 'In Progress';
                          case 'no_started': return 'No Started';
                          default: return status;
                        }
                      })();
                      
                      return (
                        <div key={status}>
                          {/* Header do grupo */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8,
                            padding: '8px 0',
                            borderBottom: '1px solid var(--color-border-divider)',
                            marginBottom: 4
                          }}>
                            <span style={{ 
                              display: 'inline-block', 
                              width: 12, 
                              height: 12, 
                              borderRadius: 6, 
                              background: statusColor,
                              flexShrink: 0
                            }} />
                            <span style={{ 
                              color: 'var(--color-text-primary)', 
                              fontSize: 14,
                              fontWeight: 600,
                              textTransform: 'uppercase'
                            }}>
                              {statusLabel} ({works.length})
                            </span>
                          </div>
                          
                          {/* Works do grupo */}
                          {works.map((project, index) => (
                            <div 
                              key={`${status}-${index}`}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 8,
                                padding: '4px 0 4px 18px',
                                borderBottom: index < works.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                              }}
                            >
                              <span style={{ 
                                display: 'inline-block', 
                                width: 8, 
                                height: 8, 
                                borderRadius: 4, 
                                background: statusColor,
                                opacity: 0.7,
                                flexShrink: 0
                              }} />
                              <span style={{ 
                                color: 'var(--color-text-primary)', 
                                fontSize: 13,
                                lineHeight: 1.3,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {getProjectTitle(project)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ 
                  color: 'var(--color-text-secondary)', 
                  fontSize: 12, 
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '12px 0'
                }}>
                  No projects found for selected filters
                </div>
              )}
            </div>
          </div>

          {/* Gráfico centralizado e legenda à direita */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0 }}>
            {hasData ? (
              <>
                <div style={{ width: '100%', maxWidth: 500, minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {chartData && chartOptions && (
                    <ProjectMonitoringPieChart
                      chartData={chartData}
                      chartOptions={chartOptions}
                    />
                  )}
                </div>
                <div style={{ width: 400, maxHeight: 350, display: 'flex', flexDirection: 'column' }}>
                  {/* Título fixo da legenda */}
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 10, flex: '0 0 auto' }}>
                    Distribution
                  </div>
                  {/* Cabeçalho da tabela */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '10px 1fr 40px 55px',
                    gap: 8,
                    marginBottom: 6,
                    padding: '0 10px',
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500
                  }}>
                    <span></span> {/* Coluna da cor */}
                    <span>Status</span>
                    <span style={{ textAlign: 'right' }}>Count</span>
                    <span 
                      style={{ 
                        textAlign: 'right',
                        cursor: 'help',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        const tooltip = document.createElement('div');
                        tooltip.id = 'custom-tooltip';
                        tooltip.style.cssText = `
                          position: fixed;
                          left: ${e.clientX + 10}px;
                          top: ${e.clientY - 10}px;
                          background: var(--color-background-secondary);
                          color: var(--color-text-primary);
                          border: 1.5px solid var(--color-border-divider);
                          border-radius: 8px;
                          padding: 12px;
                          font-size: 12px;
                          max-width: 250px;
                          z-index: 10000;
                          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                          pointer-events: none;
                        `;
                        tooltip.innerHTML = `
                          <div style="font-weight: 600; margin-bottom: 6px;">Average Processing Time</div>
                          <div style="line-height: 1.4;">
                            Shows the average number of days projects spend in each status.
                          </div>
                        `;
                        document.body.appendChild(tooltip);
                      }}
                      onMouseLeave={() => {
                        const tooltip = document.getElementById('custom-tooltip');
                        if (tooltip) {
                          tooltip.remove();
                        }
                      }}
                    >
                      Avg Days
                    </span>
                  </div>
                  {/* Legenda customizada com overflowY */}
                  <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                    {chartData?.labels && chartData.labels.length > 0 && (() => {
                      // Ordenar os status pelo valor (decrescente)
                      const legendItems = chartData.labels.map((label, idx) => ({
                        label: label,
                        value: chartData.datasets[0].data && chartData.datasets[0].data[idx] ? Number(chartData.datasets[0].data[idx]) : 0,
                        color: chartData.datasets[0].backgroundColor ? (Array.isArray(chartData.datasets[0].backgroundColor) ? chartData.datasets[0].backgroundColor[idx] : chartData.datasets[0].backgroundColor) : '#ccc',
                        averageDays: statusAverages[label.toLowerCase().replace(' ', '_')] || 0,
                      }));
                      legendItems.sort((a, b) => b.value - a.value);

                      return (
                        <div style={{ padding: '0 10px' }}>
                          {legendItems.map((item) => (
                            <div 
                              key={item.label as string} 
                              style={{ 
                                display: 'grid',
                                gridTemplateColumns: '10px 1fr 40px 55px',
                                gap: 8,
                                alignItems: 'center',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--color-border-divider)'
                              }}
                            >
                              <span style={{ 
                                display: 'inline-block', 
                                width: 14, 
                                height: 14, 
                                borderRadius: 7, 
                                background: item.color 
                              }} />
                              <span style={{ 
                                color: 'var(--color-text-secondary)', 
                                fontSize: 14 
                              }}>
                                {item.label}
                              </span>
                              <span style={{ 
                                color: 'var(--color-text-primary)', 
                                fontSize: 13, 
                                textAlign: 'right' 
                              }}>
                                {item.value ? item.value.toLocaleString() : ''}
                              </span>
                              <span 
                                style={{ 
                                  color: 'var(--color-accent-primary)', 
                                  fontSize: 12, 
                                  fontWeight: 500, 
                                  textAlign: 'right',
                                  cursor: 'help'
                                }}
                                onMouseEnter={(e) => {
                                  const tooltip = document.createElement('div');
                                  tooltip.id = 'custom-tooltip';
                                  tooltip.style.cssText = `
                                    position: fixed;
                                    left: ${e.clientX + 10}px;
                                    top: ${e.clientY - 10}px;
                                    background: var(--color-background-secondary);
                                    color: var(--color-text-primary);
                                    border: 1.5px solid var(--color-border-divider);
                                    border-radius: 8px;
                                    padding: 12px;
                                    font-size: 12px;
                                    max-width: 250px;
                                    z-index: 10000;
                                    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                                    pointer-events: none;
                                  `;
                                  const explanation = item.label === 'Completed' 
                                    ? 'Time from start to finish date.' 
                                    : item.label === 'In Progress' 
                                    ? 'Time from start to current date.' 
                                    : 'Time from start to current date.';
                                  tooltip.innerHTML = `
                                    <div style="font-weight: 600; margin-bottom: 6px;">Average Processing Time: ${item.averageDays} days</div>
                                    <div style="line-height: 1.4;">${explanation}</div>
                                  `;
                                  document.body.appendChild(tooltip);
                                }}
                                onMouseLeave={() => {
                                  const tooltip = document.getElementById('custom-tooltip');
                                  if (tooltip) {
                                    tooltip.remove();
                                  }
                                }}
                              >
                                {item.averageDays > 0 ? `${item.averageDays}d` : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 16,
                fontStyle: 'italic'
              }}>
                {filteredData.length === 0 ? 'Nenhum dado encontrado para os filtros selecionados' : 'Carregando gráfico...'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip externo */}
      {externalTooltip && (
        <ProjectMonitoringTooltipExternal
          {...externalTooltip}
          tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
          canvas={externalTooltip.canvas}
          data={externalTooltip.data || []}
        />
      )}
    </>
  );
}
