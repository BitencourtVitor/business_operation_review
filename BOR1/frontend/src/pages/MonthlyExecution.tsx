import { useState, useEffect } from 'react';
import MonthlyExecutionFilters from '../components/common/MonthlyExecution/MonthlyExecutionFilters';
import { supabase } from '../supabaseClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface MonthlyExecutionProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

interface ExecutionData {
  planned: any[];
  started: any[];
  finished: any[];
  all_history: any[]; // Todos os registros capturados no histórico
}

export default function MonthlyExecution({ telaId: _telaId, usuarioId: _usuarioId, role: _role, isResponsavelPelaTela: _isResponsavelPelaTela }: MonthlyExecutionProps) {
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [years] = useState<string[]>(['2026', '2025']);
  const [months] = useState<string[]>(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  const [loading, setLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [selectedProjectForNote, setSelectedProjectForNote] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  
  const [yearlyData, setYearlyData] = useState<{
    planned: number[];
    started: number[];
  }>({
    planned: Array(12).fill(0),
    started: Array(12).fill(0)
  });

  // State to manage expanded columns. By default, maybe all collapsed or specific ones?
  // User said "blocks of planned and started will become expandable".
  // Let's keep track of which are expanded.
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({
    'Planned Projects': true,
    'Started Projects': true,
    'Finished Projects': true
  });

  const [data, setData] = useState<ExecutionData>({
    planned: [],
    started: [],
    finished: [],
    all_history: []
  });

  useEffect(() => {
    if (selectedYear && selectedMonth) {
      fetchData();
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (selectedYear) {
      fetchYearlyData();
    }
  }, [selectedYear]);

  const fetchYearlyData = async () => {
    try {
      const yearNum = parseInt(selectedYear);
      
      const { data: plannedData } = await supabase
        .from('operational_forecast_index')
        .select('reference_month')
        .eq('reference_year', yearNum);

      const countsPlanned = Array(12).fill(0);
      if (plannedData) {
        plannedData.forEach((item: any) => {
          if (item.reference_month >= 1 && item.reference_month <= 12) {
            countsPlanned[item.reference_month - 1]++;
          }
        });
      }

      const { data: historyData } = await supabase
        .from('monthly_execution_history')
        .select('reference_month, actual_status')
        .eq('reference_year', yearNum);

      const countsStarted = Array(12).fill(0);
      if (historyData) {
        historyData.forEach((item: any) => {
          const status = item.actual_status ? item.actual_status.toLowerCase() : '';
          if (item.reference_month >= 1 && item.reference_month <= 12 && status !== 'not started' && status !== 'cancelled') {
            countsStarted[item.reference_month - 1]++;
          }
        });
      }

      // Hardcode: Em janeiro de 2026, definir 10 projetos iniciados
      if (yearNum === 2026) {
        countsStarted[0] = 10;
      }

      setYearlyData({
        planned: countsPlanned,
        started: countsStarted
      });
    } catch (error) {
      console.error('Error fetching yearly data:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthNum = parseInt(selectedMonth);
      const yearNum = parseInt(selectedYear);

      // 1. Buscar dados básicos de todas as fontes sem joins (evita erro 400 por falta de FK)
      const [plannedRes, historyRes, finishedRes] = await Promise.all([
        supabase
          .from('operational_forecast_index')
          .select('*')
          .eq('reference_month', monthNum)
          .eq('reference_year', yearNum),
        supabase
          .from('monthly_execution_history')
          .select('*')
          .eq('reference_month', monthNum)
          .eq('reference_year', yearNum),
        supabase
          .from('subcontractor_performance')
          .select('*')
          .eq('estimated_date_type', 'End')
          .gte('event_datetime', new Date(yearNum, monthNum - 1, 1).toISOString())
          .lte('event_datetime', new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString())
      ]);

      const plannedData = plannedRes.data || [];
      const historyRawData = historyRes.data || [];
      const finishedData = finishedRes.data || [];

      // Projetos que realmente iniciaram (status diferente de 'Not Started')
      const historyData = historyRawData.filter(h => 
        h.actual_status && 
        h.actual_status.toLowerCase() !== 'not started' &&
        h.actual_status.toLowerCase() !== 'cancelled'
      );

      // 2. Coletar todos os obra_ids únicos
      const allObraIds = Array.from(new Set([
        ...plannedData.map(p => p.obra_id),
        ...historyRawData.map(h => h.obra_id),
        ...finishedData.map(f => f.obra_id)
      ]));

      // 3. Buscar dados de detalhe da forecast_data para todos esses IDs
      let forecastMap = new Map();
      if (allObraIds.length > 0) {
        const { data: forecastData } = await supabase
          .from('forecast_data')
          .select('id, cliente, job_site, type, lote_bld, address')
          .in('id', allObraIds);
        
        if (forecastData) {
          forecastData.forEach(f => forecastMap.set(f.id, f));
        }
      }

      // 4. Acoplar os dados de forecast manualmente
      const started = historyData.map(h => ({ ...h, forecast_data: forecastMap.get(h.obra_id) }));
      
      setData({
        planned: plannedData.map(p => {
          // Encontrar no histórico se existe uma reason para esta obra neste mês
          const historyItem = historyRawData.find(h => h.obra_id === p.obra_id);
          return { 
            ...p, 
            forecast_data: forecastMap.get(p.obra_id),
            reason: historyItem?.reason || '' 
          };
        }),
        started: started,
        finished: finishedData.map(f => ({ ...f, forecast_data: forecastMap.get(f.obra_id) })),
        all_history: historyRawData.map(h => ({ ...h, forecast_data: forecastMap.get(h.obra_id) }))
      });
    } catch (error) {
      console.error('Error fetching monthly execution data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obter lista única de todas as obras envolvidas no mês
  const getAllObras = () => {
    const obraMap = new Map<string, any>();

    // 1. Adicionar obras planejadas (OFI)
    if (data?.planned) {
      data.planned.forEach(p => {
        if (p.obra_id && !obraMap.has(p.obra_id)) {
          obraMap.set(p.obra_id, {
            id: p.id,
            id_obra_real: p.obra_id, // Guardar o ID original da obra
            obra_id: p.obra_id,
            forecast_data: p.forecast_data,
            reason: p.reason,
            isPlanned: true,
            isStarted: false,
            isFinished: false
          });
        }
      });
    }

    // 2. Adicionar obras que estão no histórico (mesmo que não estejam no OFI atual)
    if (data?.all_history) {
      data.all_history.forEach(h => {
        if (h.obra_id) {
          if (!obraMap.has(h.obra_id)) {
            obraMap.set(h.obra_id, {
              obra_id: h.obra_id,
              forecast_data: h.forecast_data,
              reason: h.reason,
              isPlanned: false, // Só é planejado se estiver no data.planned (snapshot do OFI)
              isStarted: false,
              isFinished: false
            });
          } else {
            // Se já existe (veio do planejado), garantir que a reason do histórico seja a principal
            obraMap.get(h.obra_id).reason = h.reason;
          }
        }
      });
    }

    // 3. Marcar quais realmente iniciaram
    if (data?.started) {
      data.started.forEach(s => {
        if (s.obra_id) {
          if (obraMap.has(s.obra_id)) {
            const obra = obraMap.get(s.obra_id);
            obra.isStarted = true;
            // Se iniciou, removemos a flag isPlanned para que saia da primeira coluna
            obra.isPlanned = false;
          } else {
            obraMap.set(s.obra_id, {
              obra_id: s.obra_id,
              forecast_data: s.forecast_data,
              reason: s.reason,
              isPlanned: false, // Iniciou mas não estava no planejamento original do mês
              isStarted: true,
              isFinished: false
            });
          }
        }
      });
    }

    // 4. Marcar quais terminaram
    if (data?.finished) {
      data.finished.forEach(f => {
        if (f.obra_id) {
          if (obraMap.has(f.obra_id)) {
            const obra = obraMap.get(f.obra_id);
            obra.isFinished = true;
            // Se terminou, também não deve estar no Planned
            obra.isPlanned = false;
          } else {
            obraMap.set(f.obra_id, {
              obra_id: f.obra_id,
              forecast_data: f.forecast_data,
              isPlanned: false,
              isStarted: false,
              isFinished: true
            });
          }
        }
      });
    }

    return Array.from(obraMap.values());
  };

  const allProjects = getAllObras();

  const handleOpenNoteModal = (project: any) => {
    setSelectedProjectForNote(project);
    setNoteText(project.reason || '');
  };

  const handleSaveNote = async () => {
    if (!selectedProjectForNote) return;
    
    setSavingNote(true);
    try {
      // Verificar se o registro já existe no histórico
      const { data: existingHistory } = await supabase
        .from('monthly_execution_history')
        .select('id')
        .eq('obra_id', selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id)
        .eq('reference_month', parseInt(selectedMonth))
        .eq('reference_year', parseInt(selectedYear))
        .single();

      let error;
      if (existingHistory) {
        // Update
        const { error: updateError } = await supabase
          .from('monthly_execution_history')
          .update({ reason: noteText })
          .eq('id', existingHistory.id);
        error = updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('monthly_execution_history')
          .insert({
            obra_id: selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id,
            reference_month: parseInt(selectedMonth),
            reference_year: parseInt(selectedYear),
            reason: noteText,
            actual_status: 'Not Started'
          });
        error = insertError;
      }

      if (error) throw error;
      
      setData(prev => {
        const newData = { ...prev };
        
        // Update in planned
        newData.planned = prev.planned.map(p => 
          p.obra_id === (selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id)
            ? { ...p, reason: noteText } 
            : p
        );

        // Update in all_history
        const historyIndex = prev.all_history.findIndex(h => h.obra_id === (selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id));
        if (historyIndex >= 0) {
          newData.all_history = prev.all_history.map((h, i) => 
            i === historyIndex ? { ...h, reason: noteText } : h
          );
        } else {
          // If it wasn't in history, add it
          newData.all_history = [...prev.all_history, {
            obra_id: selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id,
            reference_month: parseInt(selectedMonth),
            reference_year: parseInt(selectedYear),
            reason: noteText,
            actual_status: 'Not Started', // Default for new notes
            forecast_data: selectedProjectForNote.forecast_data
          }];
        }

        // Update in started
        newData.started = prev.started.map(s => 
          s.obra_id === (selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id)
            ? { ...s, reason: noteText } 
            : s
        );

        // Update in finished
        newData.finished = prev.finished.map(f => 
          f.obra_id === (selectedProjectForNote.id_obra_real || selectedProjectForNote.obra_id)
            ? { ...f, reason: noteText } 
            : f
        );

        return newData;
      });

      setSelectedProjectForNote(null);
    } catch (error) {
      console.error('Error saving observation:', error);
      alert('Failed to save observation');
    } finally {
      setSavingNote(false);
    }
  };

  const renderProjectCard = (project: any) => {
    const obra = project.forecast_data;
    return (
      <div key={project.obra_id} className="card mb-3 shadow-sm" style={{ 
        background: 'rgba(255, 255, 255, 0.04)', 
        border: '1px solid var(--color-border-divider)',
        borderRadius: '10px',
        padding: '14px',
        transition: 'all 0.2s ease',
        cursor: 'default'
      }}>
        <div className="d-flex flex-column gap-2">
          {/* Main Info: Job Site and ID */}
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div style={{ 
              color: 'var(--color-text-primary)', 
              fontSize: '15px', 
              fontWeight: 500,
              opacity: 0.9,
              wordBreak: 'break-word',
              flex: 1,
              textAlign: 'left'
            }}>
              {obra?.job_site || 'N/A'}
            </div>
            <div className="d-flex flex-column align-items-end gap-1">
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, opacity: 0.6, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {project.obra_id}
              </div>
            </div>
          </div>

          {/* Details Line: Type, Lote/Bld and Client */}
          <div className="d-flex align-items-start gap-2 flex-wrap" style={{ color: 'var(--color-text-secondary)', fontSize: '12px', textAlign: 'left' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', opacity: 0.85 }}>
              {obra?.type || 'N/A'}
            </span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ opacity: 0.9 }}>{obra?.lote_bld || 'N/A'}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ fontStyle: 'italic', opacity: 0.8, wordBreak: 'break-word', textAlign: 'left' }}>{obra?.cliente || 'No Client'}</span>
          </div>

          {/* Separator Line - Visible in both themes */}
          <div style={{ 
            borderTop: '1px solid var(--color-border-divider)', 
            opacity: 0.4, 
            marginTop: '4px',
            marginBottom: '4px'
          }}></div>

          {/* Bottom Section: Address/Reason and Edit Button */}
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div className="d-flex flex-column gap-1 flex-1">
              {/* Address Section */}
              {obra?.address && (
                <div className="d-flex align-items-start gap-3 pt-1" style={{ textAlign: 'left' }}>
                  <div style={{ height: '15.4px', display: 'flex', alignItems: 'center' }}>
                    <i className="bi bi-geo-alt" style={{ 
                      fontSize: '12px', 
                      color: 'var(--color-text-secondary)', 
                      opacity: 0.6,
                      lineHeight: '1'
                    }}></i>
                  </div>
                  <div style={{ 
                    color: 'var(--color-text-secondary)', 
                    fontSize: '12px', 
                    opacity: 0.8, 
                    lineHeight: '1.4', 
                    textAlign: 'left',
                    flex: 1
                  }}>
                    {obra.address}
                  </div>
                </div>
              )}

              {/* Reason Section (Observation) */}
              {project.reason && (
                <div className="d-flex align-items-start gap-3 pt-1" style={{ textAlign: 'left' }}>
                  <div style={{ height: '16px', display: 'flex', alignItems: 'center' }}>
                    <i className="bi bi-info-circle" style={{ 
                      fontSize: '11px', 
                      color: 'var(--color-text-secondary)', 
                      opacity: 0.6
                    }}></i>
                  </div>
                  <div style={{ 
                    color: 'var(--color-text-secondary)', 
                    fontSize: '12px', 
                    fontStyle: 'italic',
                    opacity: 0.7, 
                    lineHeight: '1.4', 
                    textAlign: 'left',
                    flex: 1
                  }}>
                    {project.reason}
                  </div>
                </div>
              )}
            </div>

            {(project.isPlanned || project.reason) && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenNoteModal(project);
                }}
                className="btn btn-link p-0 observation-btn" 
                style={{ 
                  color: project.reason ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', 
                  opacity: project.reason ? 1 : 0.3,
                  fontSize: '15px',
                  lineHeight: 1,
                  marginTop: '6px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingLeft: '12px'
                }}
                title={project.reason ? 'Edit Reason' : 'Add Reason'}
              >
                <i className="bi bi-pencil"></i>
              </button>
            )}
          </div>
        </div>



      {/* Modal removed from here */}
    </div>
  );
};

  const toggleColumn = (title: string) => {
    setExpandedColumns(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const renderChart = () => {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const allDatasets = [
      {
        label: 'Planned',
        data: yearlyData.planned.map(v => v === 0 ? null : v),
        borderColor: '#3B82F6',
        backgroundColor: '#3B82F6',
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      },
      {
        label: 'Started',
        data: yearlyData.started.map(v => v === 0 ? null : v),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B',
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      },
    ];

    const chartData = {
      labels,
      datasets: allDatasets.filter(dataset => dataset.data.some((val: number | null) => val !== null)),
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: false, // Removing internal title as we are using external header
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            stepSize: 1
          },
          beginAtZero: true
        }
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

    return (
      <div style={{ padding: '10px 20px', height: '40%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
        <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
          Monthly Execution Overview - {selectedYear}
        </h4>
        <div style={{ background: 'var(--color-background-primary)', flex: 1, minHeight: 0, minWidth: 0 }}>
          <div style={{ width: '100%', height: '100%', minHeight: 200 }}>
            <Line data={chartData} options={options as any} />
          </div>
        </div>
      </div>
    );
  };

  const renderColumn = (title: string, count: number, projects: any[], color: string, icon: string, extraContent?: React.ReactNode, metrics?: React.ReactNode) => {
    const isFinishedColumn = title === 'Finished Projects';
    const isExpanded = expandedColumns[title];
    const hasProjects = projects.length > 0 || (extraContent && isFinishedColumn && isExpanded);

    return (
      <div className="col-md-4 h-100" style={{ 
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'block'
      }}>
        <div className="d-flex flex-column h-100" style={{ 
          borderRight: title !== 'Finished Projects' ? '1px solid var(--color-border-divider)' : 'none',
          padding: '0 15px',
          background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
          transition: 'all 0.4s ease'
        }}>
          {/* Header Section */}
          <div 
            className="d-flex flex-column gap-1" 
            style={{ 
              paddingTop: '12px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--color-border-divider)',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={() => toggleColumn(title)}
          >
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ 
                  color: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', 
                  fontSize: '14px',
                  transition: 'transform 0.3s ease'
                }}></i>
                <i className={`bi ${icon}`} style={{ color: color, fontSize: '14px' }}></i>
                <h4 className="mb-0" style={{ 
                  color: isExpanded ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', 
                  fontSize: '15px', 
                  fontWeight: isExpanded ? 600 : 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>{title}</h4>
              </div>
              <div className="d-flex align-items-center gap-3">
                {isExpanded && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', opacity: 0.6, textTransform: 'uppercase' }}>
                    Click to collapse
                  </span>
                )}
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '15px' }}>{count}</span>
              </div>
            </div>
            {metrics && (
              <div className="mt-1">
                {metrics}
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className={`overflow-y-auto custom-scrollbar ${isExpanded ? 'expanded-content' : ''}`} style={{ 
            flex: 1, 
            maxHeight: isExpanded ? '2000px' : '0',
            opacity: isExpanded ? 1 : 0,
            paddingTop: isExpanded ? '16px' : '0',
            paddingRight: '6px',
            paddingBottom: isExpanded ? '16px' : '0',
            transition: 'all 0.4s ease',
            visibility: isExpanded ? 'visible' : 'hidden'
          }}>
            {!hasProjects && !isFinishedColumn ? (
              <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center py-5">
                <div className="small" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                  No projects in this category.
                </div>
              </div>
            ) : (
              <div className="row g-2">
                {isFinishedColumn && projects.length === 0 && (
                  <div className="col-12">
                    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-center mb-3" style={{ 
                      border: '1px dashed var(--color-border-divider)',
                      borderRadius: '8px'
                    }}>
                      <div className="mb-2" style={{ opacity: 0.2 }}>
                        <i className="bi bi-clipboard-x" style={{ fontSize: '32px', color: 'var(--color-text-secondary)' }}></i>
                      </div>
                      <div className="small px-4" style={{ color: 'var(--color-text-secondary)', opacity: 0.7, maxWidth: '280px', lineHeight: '1.4' }}>
                        Among the projects started in the observed month, none have been finished yet.
                      </div>
                    </div>
                  </div>
                )}
                {projects.map(p => (
                  <div key={p.obra_id} className="col-12">
                    {renderProjectCard(p)}
                  </div>
                ))}
                {extraContent && (
                  <div className="col-12">
                    {extraContent}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getFinishedProjects = () => {
    // Obras que terminaram e também iniciaram no mês
    const finishedAndStarted = allProjects.filter(p => p.isFinished && p.isStarted);
    // Obras que terminaram mas NÃO iniciaram no mês (iniciaram em meses anteriores)
    // Precisamos verificar se a obra está no data.started filtrada por status, ou se ela simplesmente não tem o flag isStarted
    // que foi atribuído na lógica de getAllObras.
    const finishedNotStartedInMonth = allProjects.filter(p => p.isFinished && !p.isStarted);
    
    return { finishedAndStarted, finishedNotStartedInMonth };
  };

  const getPlannedMetrics = () => {
    const totalCaptured = data.planned.length;
    const stillPlanned = allProjects.filter(p => p.isPlanned && !p.isStarted && !p.isFinished).length;
    return { totalCaptured, stillPlanned };
  };

  const { totalCaptured, stillPlanned } = getPlannedMetrics();
  const { finishedAndStarted, finishedNotStartedInMonth } = getFinishedProjects();

  return (
    <div id="content" style={{ height: 'calc(100vh - 65px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)' }}>
      <style>
        {`
          .observation-btn:hover {
            color: var(--color-accent-primary) !important;
            opacity: 1 !important;
            transform: scale(1.1);
          }
          .modal-backdrop {
            z-index: 1040 !important;
          }
          .modal {
            z-index: 1050 !important;
          }
        `}
      </style>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', flex: '0 0 auto' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Monthly Execution</h1>
        <MonthlyExecutionFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          years={years}
          months={months}
        />
      </div>

      {/* Conteúdo principal - Sistema de Colunas */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="d-flex justify-content-center align-items-center h-100">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <>
            {renderChart()}
            <div className="row g-0" style={{ flex: 1, overflow: 'hidden' }}>
              {renderColumn(
              'Planned Projects', 
              totalCaptured, 
              allProjects.filter(p => p.isPlanned), 
              '#3B82F6', 
              'bi-calendar-event',
              null,
              <div className="d-flex align-items-center gap-2">
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>Remaining:</span>
                <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: '14px' }}>{stillPlanned}</span>
              </div>
            )}
            
            {renderColumn(
              'Started Projects', 
              allProjects.filter(p => p.isStarted).length, 
              allProjects.filter(p => p.isStarted), 
              '#F59E0B', 
              'bi-play-circle'
            )}
            
            {renderColumn(
              'Finished Projects', 
              allProjects.filter(p => p.isFinished).length, 
              finishedAndStarted, 
              '#10B981', 
              'bi-check-circle',
              finishedNotStartedInMonth.length > 0 && (
                <div className="mt-4">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <hr className="flex-grow-1" style={{ borderColor: 'var(--color-border-divider)', opacity: 0.3 }} />
                    <span style={{ 
                      color: 'var(--color-text-secondary)', 
                      fontSize: '10px', 
                      whiteSpace: 'nowrap', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.5px', 
                      fontWeight: 600 
                    }}>
                      Finished but not started in month
                    </span>
                    <hr className="flex-grow-1" style={{ borderColor: 'var(--color-border-divider)', opacity: 0.3 }} />
                  </div>
                  {finishedNotStartedInMonth.map(p => renderProjectCard(p))}
                </div>
              )
            )}
            </div>
          </>
        )}
      </div>

      {/* Modal para Observação */}
      {selectedProjectForNote && (
        <div 
          className="modal fade show" 
          style={{ 
            display: 'block', 
            backgroundColor: 'rgba(0, 0, 0, 0.4)', // Reduced opacity for less blur effect
            zIndex: 1060, // Higher z-index to be above header
            backdropFilter: 'none' // Ensure no blur effect is applied
          }}
          tabIndex={-1}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ zIndex: 10000 }}>
            <div className="modal-content" style={{ 
              background: 'var(--color-background-secondary)', 
              border: '1px solid var(--color-border-divider)',
              borderRadius: '12px',
              color: 'var(--color-text-primary)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                <h5 className="modal-title" style={{ fontSize: '16px', fontWeight: 500 }}>
                  Observation: {selectedProjectForNote?.forecast_data?.job_site}
                </h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setSelectedProjectForNote(null)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <textarea 
                  className="form-control" 
                  rows={5}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type your observation here..."
                  autoFocus
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    border: '1px solid var(--color-border-divider)',
                    color: 'var(--color-text-primary)',
                    fontSize: '14px',
                    borderRadius: '8px',
                    resize: 'none'
                  }}
                ></textarea>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border-divider)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setSelectedProjectForNote(null)}
                  style={{ fontSize: '14px' }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleSaveNote}
                  disabled={savingNote}
                  style={{ fontSize: '14px', background: 'var(--color-accent-primary)', border: 'none' }}
                >
                  {savingNote ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

