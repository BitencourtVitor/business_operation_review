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
import type { TakeoffRow } from '../../../types/takeoff';
import { generateTakeoffColors, generateTakeoffBorderColors } from '../../../utils/takeoffColors';
import { TakeoffPieChart } from './TakeoffPieChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

// Tooltip customizado para o gráfico Takeoff
interface TakeoffTooltipExternalProps {
  tooltip: unknown;
  canvas?: HTMLCanvasElement | null;
  data: TakeoffRow[];
}

const TakeoffTooltipExternal = React.memo(function TakeoffTooltipExternal({ tooltip, canvas, data }: TakeoffTooltipExternalProps) {
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

interface TakeoffChartProps {
  filteredData: TakeoffRow[];
  selectedYear: string;
  selectedMonth: string;
}

export function TakeoffChart({ filteredData, selectedYear, selectedMonth }: TakeoffChartProps) {
  // Estado para tooltip externo
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<TakeoffTooltipExternalProps>>(null);

  // Função para determinar o status baseado nas datas
  const getProjectStatus = (row: TakeoffRow): string => {
    const hasSolicitacao = !!row.data_solicitacao;
    const hasInicio = !!row.data_inicio;
    const hasEntrega = !!row.entrega_real;

    if (hasSolicitacao && hasInicio && hasEntrega) {
      return 'Completed';
    } else if (hasSolicitacao && hasInicio && !hasEntrega) {
      return 'In Progress';
    } else if (hasSolicitacao && !hasInicio && !hasEntrega) {
      return 'Not Started';
    } else {
      return 'Not Started'; // Se não tem data de solicitação, considera como Not Started
    }
  };

  // Preparar dados do gráfico de pizza
  const { chartData, chartOptions, hasData, statusAverages } = useMemo(() => {
    if (filteredData.length === 0) {
      return { chartData: null, chartOptions: null, hasData: false, statusAverages: {} };
    }

    // Calcular contagem por status
    const statusCounts = {
      'Not Started': 0,
      'In Progress': 0,
      'Completed': 0
    };

    // Calcular dias de processamento por status
    const statusDays = {
      'Not Started': [] as number[],
      'In Progress': [] as number[],
      'Completed': [] as number[]
    };

    const currentDate = new Date();

    filteredData.forEach(row => {
      const status = getProjectStatus(row);
      statusCounts[status as keyof typeof statusCounts]++;
      
      // Calcular dias de processamento baseado no status
      let days = 0;
      
      if (status === 'Completed') {
        // Completed: data_entrega - data_inicio
        if (row.entrega_real && row.data_inicio) {
          const entregaDate = new Date(row.entrega_real);
          const inicioDate = new Date(row.data_inicio);
          days = Math.ceil((entregaDate.getTime() - inicioDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else if (status === 'In Progress') {
        // In Progress: data_atual - data_inicio
        if (row.data_inicio) {
          const inicioDate = new Date(row.data_inicio);
          days = Math.ceil((currentDate.getTime() - inicioDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      } else {
        // Not Started: data_atual - data_solicitacao
        if (row.data_solicitacao) {
          const solicitacaoDate = new Date(row.data_solicitacao);
          days = Math.ceil((currentDate.getTime() - solicitacaoDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      
      if (days > 0) {
        statusDays[status as keyof typeof statusDays].push(days);
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

    if (statusCounts['Not Started'] > 0) {
      labels.push('Not Started');
      data.push(statusCounts['Not Started']);
    }

    if (statusCounts['In Progress'] > 0) {
      labels.push('In Progress');
      data.push(statusCounts['In Progress']);
    }

    if (statusCounts['Completed'] > 0) {
      labels.push('Completed');
      data.push(statusCounts['Completed']);
    }

    // Gerar cores usando as funções do takeoffColors
    const backgroundColor = generateTakeoffColors(labels);
    const borderColor = generateTakeoffBorderColors(labels);
    
    // Fallback para cores hardcoded se as funções não funcionarem
    const fallbackColors = labels.map(label => {
      switch (label) {
        case 'Not Started': return '#dc3545';
        case 'In Progress': return '#ffb300'; // Amarelo mais escuro - mais legível
        case 'Completed': return '#1bbf5c';
        default: return '#6c757d';
      }
    });
    
    const finalBackgroundColors = backgroundColor.length > 0 ? backgroundColor : fallbackColors;
    const finalBorderColors = borderColor.length > 0 ? borderColor : fallbackColors.map(color => color + '80');

    const chartData = {
      labels,
      datasets: [{
        data,
        backgroundColor: finalBackgroundColors,
        borderColor: finalBorderColors,
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
                data: filteredData as TakeoffRow[],
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
                Projects
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
                  {filteredData.map((project, index) => {
                    const status = getProjectStatus(project);
                    const statusColor = (() => {
                      switch (status) {
                        case 'Not Started': return '#dc3545';
                        case 'In Progress': return '#ffb300';
                        case 'Completed': return '#1bbf5c';
                        default: return '#6c757d';
                      }
                    })();
                    
                    return (
                      <div 
                        key={index}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 8,
                          padding: '4px 0',
                          borderBottom: index < filteredData.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                        }}
                      >
                        <span style={{ 
                          display: 'inline-block', 
                          width: 10, 
                          height: 10, 
                          borderRadius: 5, 
                          background: statusColor,
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
                          {project.project || `Project ${index + 1}`}
                        </span>
                      </div>
                    );
                  })}
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
                    <TakeoffPieChart
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
                        averageDays: statusAverages[label] || 0,
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
                                    ? 'Time from start to delivery.' 
                                    : item.label === 'In Progress' 
                                    ? 'Time from start to current date.' 
                                    : 'Time from request to current date.';
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
        <TakeoffTooltipExternal
          {...externalTooltip}
          tooltip={externalTooltip.tooltip ? externalTooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
          canvas={externalTooltip.canvas}
          data={externalTooltip.data || []}
        />
      )}
    </>
  );
} 