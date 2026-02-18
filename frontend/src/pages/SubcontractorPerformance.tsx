import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import SubcontractorPerformanceFilters from '../components/common/SubcontractorPerformance/SubcontractorPerformanceFilters';

interface SubcontractorPerformanceProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

interface RawEvent {
  id: string;
  obra_id: string;
  event: string;
  estimated_date_type: string;
  subcontractor: string;
  event_datetime: string;
}

interface ProjectData {
  id: string;
  job_site: string;
  type: string;
  lote_bld: string;
}

interface WorkDetail {
  id: string;
  start: string;
  end: string;
  jobsite: string;
  type: string;
  building: string;
  duration: number;
  contractCompletion: number;
}

interface SubcontractorStat {
  subcontractor: string;
  completedWorks: number;
  avgDuration: number;
  avgContractCompletion: number;
  works: WorkDetail[];
}

export default function SubcontractorPerformance({ telaId: _telaId, usuarioId: _usuarioId, role: _role, isResponsavelPelaTela: _isResponsavelPelaTela }: SubcontractorPerformanceProps) {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [years] = useState<string[]>(['2026', '2025']);
  const [months] = useState<string[]>(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [contractData, setContractData] = useState<Record<string, { total: number; completed: number }>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: WorkDetail[] }>({
    visible: false,
    x: 0,
    y: 0,
    content: []
  });
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sorting state
  type SortConfig = {
    key: keyof SubcontractorStat | 'rank';
    direction: 'asc' | 'desc';
  } | null;

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'avgDuration', direction: 'asc' });

  const handleSort = (key: keyof SubcontractorStat | 'rank') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <i className="bi bi-arrow-down-up ms-2" style={{ fontSize: '10px', opacity: 0.3 }} />;
    }
    return sortConfig.direction === 'asc' 
      ? <i className="bi bi-arrow-up ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />
      : <i className="bi bi-arrow-down ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />;
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    borderBottom: '1.5px solid var(--color-border-divider)',
    background: 'var(--color-background-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Fetch raw events
      const { data: eventsData, error: eventsError } = await supabase
        .from('subcontractor_performance')
        .select('*')
        .order('event_datetime', { ascending: true });

      if (eventsError) throw eventsError;

      // 2. Fetch project details
      // Get unique obra_ids from eventsData to filter (optional, but good practice if list is huge)
      // For now fetch all or just rely on client-side join if dataset is manageable.
      // Given we need details for ALL events, let's fetch all relevant projects.
      // Or simply fetch all from forecast_data if not too large.
      // Let's optimize: extract unique obra_ids first.
      const uniqueObraIds = Array.from(new Set((eventsData || []).map(e => e.obra_id)));
      
      let projectsMap: Record<string, ProjectData> = {};
      
      if (uniqueObraIds.length > 0) {
        const { data: projectsData, error: projectsError } = await supabase
          .from('forecast_data')
          .select('id, job_site, type, lote_bld')
          .in('id', uniqueObraIds);
          
        if (projectsError) {
            console.error('Error fetching project data:', projectsError);
            // Non-blocking error, we can proceed without details
        } else {
            projectsData?.forEach(p => {
                projectsMap[p.id] = {
                    id: p.id,
                    job_site: p.job_site,
                    type: p.type,
                    lote_bld: p.lote_bld
                };
            });
        }
      }
      // 3. Fetch contract steps data
      let contractsMap: Record<string, { total: number; completed: number }> = {};
      
      if (uniqueObraIds.length > 0) {
        const { data: contractsData, error: contractsError } = await supabase
          .from('forecast_contract_steps')
          .select('obra_id, status')
          .in('obra_id', uniqueObraIds);
          
        if (contractsError) {
          console.error('Error fetching contract steps data:', contractsError);
        } else {
          contractsData?.forEach(c => {
            if (!contractsMap[c.obra_id]) {
              contractsMap[c.obra_id] = { total: 0, completed: 0 };
            }
            contractsMap[c.obra_id].total++;
            if (c.status === true) { // Explicitly check for true
              contractsMap[c.obra_id].completed++;
            }
          });
        }
      }
      
      setRawEvents(eventsData || []);
      setProjectData(projectsMap);
      setContractData(contractsMap);
    } catch (err: any) {
      console.error('Error fetching subcontractor performance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const rankingData = useMemo(() => {
    if (!rawEvents.length) return [];

    // 1. Group events by obra_id
    const works: Record<string, { start?: string; end?: string; subcontractor?: string }> = {};

    rawEvents.forEach(event => {
      if (!works[event.obra_id]) {
        works[event.obra_id] = {};
      }
      
      // Assume subcontractor is consistent across events for the same obra_id
      // If not, we might need logic to handle it, but for now take the first non-null
      if (event.subcontractor && !works[event.obra_id].subcontractor) {
        works[event.obra_id].subcontractor = event.subcontractor;
      }

      if (event.estimated_date_type === 'Start') {
        works[event.obra_id].start = event.event_datetime;
      } else if (event.estimated_date_type === 'End') {
        works[event.obra_id].end = event.event_datetime;
      }
    });

    // 2. Calculate duration for completed works and filter by date
    const completedWorks: { subcontractor: string; duration: number; obra_id: string; start: string; end: string }[] = [];

    Object.entries(works).forEach(([obra_id, work]) => {
      if (work.start && work.end && work.subcontractor) {
        const startDate = new Date(work.start);
        const endDate = new Date(work.end);
        
        // Filter by selected Year/Month based on End Date
        if (selectedYear && endDate.getFullYear().toString() !== selectedYear) return;
        if (selectedMonth && (endDate.getMonth() + 1).toString().padStart(2, '0') !== selectedMonth) return;

        // Calculate duration in days
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        completedWorks.push({
          subcontractor: work.subcontractor,
          duration: diffDays,
          obra_id: obra_id,
          start: work.start,
          end: work.end
        });
      }
    });

    // 3. Aggregate by subcontractor
    const stats: Record<string, { totalDuration: number; count: number; totalContractPct: number; works: WorkDetail[] }> = {};

    completedWorks.forEach(work => {
      if (!stats[work.subcontractor]) {
        stats[work.subcontractor] = { totalDuration: 0, count: 0, totalContractPct: 0, works: [] };
      }
      stats[work.subcontractor].totalDuration += work.duration;
      stats[work.subcontractor].count += 1;
      
      const pData = projectData[work.obra_id];
      const cData = contractData[work.obra_id];
      const contractPct = cData && cData.total > 0 ? (cData.completed / cData.total) * 100 : 0;
      
      stats[work.subcontractor].totalContractPct += contractPct;

      stats[work.subcontractor].works.push({
        id: work.obra_id,
        start: work.start,
        end: work.end,
        jobsite: pData?.job_site || 'Unknown',
        type: pData?.type || 'Unknown',
        building: pData?.lote_bld || 'Unknown',
        duration: work.duration,
        contractCompletion: contractPct
      });
    });

    // 4. Format for display and sort
    const formattedData = Object.entries(stats).map(([subcontractor, data]) => ({
      subcontractor,
      completedWorks: data.count,
      avgDuration: data.totalDuration / data.count,
      avgContractCompletion: data.totalContractPct / data.count,
      works: data.works
    }));

    // Default sort by avgDuration ascending (ranking logic)
    if (!sortConfig) {
      return formattedData.sort((a, b) => a.avgDuration - b.avgDuration);
    }

    return formattedData.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof SubcontractorStat];
      let bValue: any = b[sortConfig.key as keyof SubcontractorStat];

      // Special case for Rank (which is based on avgDuration ascending)
      if (sortConfig.key === 'rank') {
        aValue = a.avgDuration;
        bValue = b.avgDuration;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  }, [rawEvents, projectData, contractData, selectedYear, selectedMonth, sortConfig]);

  const handleMouseEnter = (e: React.MouseEvent, works: WorkDetail[]) => {
    // Clear any pending hide timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320; // Increased width for better layout
    
    // Check if tooltip fits on the right
    // Align left edge of tooltip with right edge of cell + spacing
    let x = rect.right + 4; // Closer to the number
    
    // If it doesn't fit on the right, flip to left
    if (x + tooltipWidth > window.innerWidth) {
        x = rect.left - tooltipWidth - 4; 
    }
    
    // Adjust Y to align top or center? User said "próxima do número".
    // Align top of tooltip with top of cell
    let y = rect.top;
    
    // Ensure it doesn't go off bottom of screen
    const tooltipHeight = Math.min(300, works.length * 80 + 50); // Estimativa
    if (y + tooltipHeight > window.innerHeight) {
        y = window.innerHeight - tooltipHeight - 10;
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: works
    });
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow moving mouse into tooltip
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(prev => ({ ...prev, visible: false }));
    }, 300);
  };

  const handleTooltipMouseEnter = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
     tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(prev => ({ ...prev, visible: false }));
    }, 300);
  };

  return (
    <div id="content" style={{ height: 'calc(100vh - 65px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', flex: '0 0 auto' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Subcontractor Performance</h1>
        <SubcontractorPerformanceFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          years={years}
          months={months}
        />
      </div>

      {/* Conteúdo principal */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '20px' }}>
        {loading ? (
           <div className="d-flex justify-content-center align-items-center" style={{ height: '200px', color: 'var(--color-text-secondary)' }}>
             <div className="spinner-border" role="status">
               <span className="visually-hidden">Loading...</span>
             </div>
           </div>
        ) : error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : rankingData.length === 0 ? (
          <div className="col-12 text-center" style={{ padding: '100px', color: 'var(--color-text-secondary)' }}>
            <i className="bi bi-clipboard-check" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
            <p>No completed works found for the selected period.</p>
          </div>
        ) : (
          <>
            <div className="mx-4 mb-4" style={{ 
              background: 'var(--color-background-primary)', 
              border: '1px solid var(--color-border-divider)', 
              borderRadius: '8px',
              padding: '16px 20px'
            }}>
              <div className="d-flex align-items-center mb-2">
                <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-accent-primary)', fontSize: '1rem' }}></i>
                <h6 style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px' }}>
                  Performance Evaluation Criteria
                </h6>
              </div>
              
              <div className="d-flex flex-wrap gap-2" style={{ fontSize: '12px' }}>
                {/* Active Metrics */}
                <div className="d-flex align-items-center px-2 py-1" style={{ background: 'rgba(16, 185, 129, 0.08)', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <i className="bi bi-clock-history me-2" style={{ color: '#10b981' }}></i>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Avg Execution Time</span>
                </div>

                <div className="d-flex align-items-center px-2 py-1" style={{ background: 'rgba(16, 185, 129, 0.08)', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <i className="bi bi-file-text-fill me-2" style={{ color: '#10b981' }}></i>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Contract Completion</span>
                </div>

                {/* Pending Metrics */}
                <div className="d-flex align-items-center px-2 py-1" style={{ opacity: 0.6, border: '1px dashed var(--color-border-divider)', borderRadius: '4px', background: 'var(--color-background-tertiary)' }}>
                  <i className="bi bi-shield-check me-2"></i>
                  <span>Safety Level</span>
                </div>

                <div className="d-flex align-items-center px-2 py-1" style={{ opacity: 0.6, border: '1px dashed var(--color-border-divider)', borderRadius: '4px', background: 'var(--color-background-tertiary)' }}>
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  <span>Back Charges</span>
                </div>

                <div className="d-flex align-items-center px-2 py-1" style={{ opacity: 0.6, border: '1px dashed var(--color-border-divider)', borderRadius: '4px', background: 'var(--color-background-tertiary)' }}>
                  <i className="bi bi-box-seam me-2"></i>
                  <span>Material Usage</span>
                </div>

                <div className="d-flex align-items-center px-2 py-1" style={{ opacity: 0.6, border: '1px dashed var(--color-border-divider)', borderRadius: '4px', background: 'var(--color-background-tertiary)' }}>
                  <i className="bi bi-cart-x-fill me-2"></i>
                  <span>Excessive Withdrawals</span>
                </div>
              </div>
            </div>

            <div className="mx-4 mb-4">
            <div className="border-0 p-0" style={{ background: 'var(--color-background-primary)' }}>
              <h4 className='my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
                RANKING
              </h4>
            </div>
            <div style={{ 
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 0,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div className="table-responsive custom-scrollbar" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                    <tr>
                      <th style={headerStyle} onClick={() => handleSort('rank')}>
                        RANK <SortIcon columnKey="rank" />
                      </th>
                      <th style={headerStyle} onClick={() => handleSort('subcontractor')}>
                        SUBCONTRACTOR <SortIcon columnKey="subcontractor" />
                      </th>
                      <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('completedWorks')}>
                        COMPLETED WORKS <SortIcon columnKey="completedWorks" />
                      </th>
                      <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgDuration')}>
                        AVG DURATION (DAYS) <SortIcon columnKey="avgDuration" />
                      </th>
                      <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgContractCompletion')}>
                        CONTRACT COMPLETION <SortIcon columnKey="avgContractCompletion" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingData.map((item, index) => {
                       // Recalculate rank based on current sorted position if we were just sorting by default logic, 
                       // but actually "Rank" is usually fixed to the performance metric. 
                       // However, if the user sorts by Name, the Rank number usually stays with the row or becomes sequential 1..N based on view?
                       // Typically in a ranking table, Rank is 1..N based on the metric. If I sort by name, the Rank column should probably show their actual rank?
                       // Let's assume Rank is always 1..N based on the current view order for simplicity in this UI pattern, OR we calculate rank before sorting.
                       // For now, let's keep Rank as the index in the current sorted view, unless we want to persist "True Rank".
                       // Given the prompt asks for "design standard", usually 1..N is fine for the table row.
                       
                       return (
                        <tr key={item.subcontractor} style={{ transition: 'background-color 0.2s ease' }}>
                          <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                              {index + 1}
                              {index === 0 && <i className="bi bi-trophy-fill ms-2 text-warning"></i>}
                              {index === 1 && <i className="bi bi-trophy-fill ms-2 text-secondary"></i>}
                              {index === 2 && <i className="bi bi-trophy-fill ms-2" style={{ color: '#CD7F32' }}></i>}
                            </div>
                          </td>
                          <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.subcontractor}</div>
                          </td>
                          <td 
                            style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}
                          >
                            <span 
                              style={{ color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer', display: 'inline-block', padding: '4px' }}
                              onMouseEnter={(e) => handleMouseEnter(e, item.works)}
                              onMouseLeave={handleMouseLeave}
                            >
                              {item.completedWorks}
                            </span>
                          </td>
                          <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: 4, 
                              fontSize: 13, 
                              fontWeight: 600,
                              background: 'var(--color-background-secondary)',
                              color: 'var(--color-accent-primary)',
                              border: '1px solid var(--color-border-divider)'
                            }}>
                              {item.avgDuration.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: 4, 
                              fontSize: 13, 
                              fontWeight: 600,
                              background: 'var(--color-background-secondary)',
                              color: item.avgContractCompletion >= 100 ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                              border: '1px solid var(--color-border-divider)'
                            }}>
                              {item.avgContractCompletion.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div 
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: tooltip.x,
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '8px',
            padding: '0',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            width: '320px',
            maxHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid var(--color-border-divider)', 
            background: 'var(--color-background-tertiary)',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px'
          }}>
            <h6 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Completed Works Details
            </h6>
          </div>
          <div className="custom-scrollbar" style={{ 
            padding: '12px', 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px' 
          }}>
            {tooltip.content.map((work, idx) => (
              <div key={idx} style={{ 
                fontSize: '12px', 
                color: 'var(--color-text-secondary)', 
                padding: '10px', 
                background: 'var(--color-background-primary)', 
                borderRadius: '6px', 
                border: '1px solid var(--color-border-divider)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'border-color 0.2s',
                cursor: 'default'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center' }}>
                   <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                     {work.jobsite}
                   </div>
                   <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                     {work.type}
                   </div>
                   <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                     {work.building}
                   </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border-divider)', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                    <span title="Start Date"><i className="bi bi-calendar-event me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                      {new Date(work.start).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </span>
                    <span title="End Date"><i className="bi bi-calendar-check me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                      {new Date(work.end).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <span title="Duration" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      <i className="bi bi-clock me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                      {work.duration} days
                    </span>
                    <span title="Contract Completion" style={{ 
                      fontWeight: 600, 
                      color: work.contractCompletion >= 100 ? 'var(--positive-color, #10b981)' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <i className="bi bi-file-text" style={{ fontSize: '10px' }}></i>
                      {work.contractCompletion.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
