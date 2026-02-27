import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';
import type { SubcontractorPerformance, ForecastData } from '../../types/dataControl';

interface PerformanceGroup {
  obra_id: string;
  subcontractor: string;
  job_site: string;
  lote_bld: string;
  start_event_id: string | null;
  start_date: string | null;
  end_event_id: string | null;
  end_date: string | null;
}

const DateInput = ({ 
  initialValue, 
  onSave, 
  onDelete,
  style 
}: { 
  initialValue: string | null, 
  onSave: (val: string) => void, 
  onDelete: () => void,
  style: React.CSSProperties 
}) => {
  const [localValue, setLocalValue] = useState(initialValue || '');

  useEffect(() => {
    setLocalValue(initialValue || '');
  }, [initialValue]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <input 
        type="date" 
        style={{ ...style, flex: 1 }}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== initialValue) {
            onSave(localValue);
          }
        }}
      />
      {initialValue && (
        <button 
          onClick={onDelete}
          className="btn btn-link p-0 text-danger"
          style={{ fontSize: '14px', border: 'none', background: 'none' }}
          title="Clear date"
        >
          <i className="bi bi-x-circle"></i>
        </button>
      )}
    </div>
  );
};

export default function SubcontractorPerformanceManager() {
  const { startLoading: globalStartLoading, stopLoading: globalStopLoading, showSuccess: globalShowSuccess } = useGlobalFeedback();
  const [performanceData, setPerformanceData] = useState<SubcontractorPerformance[]>([]);
  const [projects, setProjects] = useState<Record<string, ForecastData>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Local feedback states for inline updates
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const startLocalUpdate = () => {
    setIsUpdating(true);
    setIsSuccess(false);
  };

  const stopLocalUpdate = () => {
    setIsUpdating(false);
  };

  const showLocalSuccess = () => {
    setIsUpdating(false);
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 2000);
  };

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    globalStartLoading();
    try {
      // 1. Fetch all performance events
      const { data: perf, error: perfError } = await supabase
        .from('subcontractor_performance')
        .select('*')
        .order('event_datetime', { ascending: false });

      if (perfError) throw perfError;

      // 2. Fetch all projects to map job site names
      // We need status to filter out closed projects in groupedData
      const { data: proj, error: projError } = await supabase
        .from('forecast_data')
        .select('id, job_site, lote_bld, cliente, status');

      if (projError) throw projError;

      const projectsMap: Record<string, ForecastData> = {};
      proj?.forEach(p => {
        projectsMap[p.id] = p as ForecastData;
      });

      setPerformanceData(perf || []);
      setProjects(projectsMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Error fetching data');
    } finally {
      setLoading(false);
      globalStopLoading();
    }
  }, [globalStartLoading, globalStopLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groupedData = useMemo(() => {
    const groups: Record<string, PerformanceGroup> = {};

    // 1. Initialize groups with all performance records
    performanceData.forEach(item => {
      const key = `${item.obra_id}-${item.subcontractor || 'unknown'}`;
      if (!groups[key]) {
        const project = projects[item.obra_id];
        groups[key] = {
          obra_id: item.obra_id,
          subcontractor: item.subcontractor || 'Unknown',
          job_site: project?.job_site || 'Unknown Job Site',
          lote_bld: project?.lote_bld || '',
          start_event_id: null,
          start_date: null,
          end_event_id: null,
          end_date: null,
        };
      }

      if (item.estimated_date_type === 'Start') {
        groups[key].start_event_id = item.id;
        groups[key].start_date = item.event_datetime ? item.event_datetime.split('T')[0] : null;
      } else if (item.estimated_date_type === 'End') {
        groups[key].end_event_id = item.id;
        groups[key].end_date = item.event_datetime ? item.event_datetime.split('T')[0] : null;
      }
    });

    // 2. Add projects that don't have performance records yet (optional, but makes "see each job" more complete)
    // We only do this if they are not closed to avoid cluttering with old data
    Object.values(projects).forEach(project => {
      const hasPerformance = performanceData.some(p => p.obra_id === project.id);
      if (!hasPerformance && project.status !== 'closed') {
        const key = `${project.id}-unassigned`;
        groups[key] = {
          obra_id: project.id,
          subcontractor: 'Unassigned',
          job_site: project.job_site || 'Unknown',
          lote_bld: project.lote_bld || '',
          start_event_id: null,
          start_date: null,
          end_event_id: null,
          end_date: null,
        };
      }
    });

    return Object.values(groups).filter(g => 
      g.job_site.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.subcontractor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.lote_bld.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => {
        // Sort by Job Site then Lote/Bld
        const jsComp = a.job_site.localeCompare(b.job_site);
        if (jsComp !== 0) return jsComp;
        return a.lote_bld.localeCompare(b.lote_bld, undefined, { numeric: true });
    });
  }, [performanceData, projects, searchTerm]);

  const handleUpdateDate = async (eventId: string | null, newDate: string, type: 'Start' | 'End', group: PerformanceGroup) => {
    // We allow clearing the date now, but handleUpdateDate is only called when there is a value
    if (!newDate) return; 
    
    try {
      const dateObj = new Date(`${newDate}T12:00:00`);
      
      // Check if date is valid before calling toISOString()
      if (isNaN(dateObj.getTime())) {
        console.warn('Invalid date ignored:', newDate);
        return;
      }

      startLocalUpdate();
      const isoDate = dateObj.toISOString();
      
      if (eventId) {
        // Update existing record
        const { error } = await supabase
          .from('subcontractor_performance')
          .update({ event_datetime: isoDate })
          .eq('id', eventId);

        if (error) throw error;
      } else {
        // Create new record
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('subcontractor_performance')
          .insert([{
            obra_id: group.obra_id,
            event: type === 'Start' ? 'Manual Start' : 'Manual End',
            estimated_date_type: type,
            subcontractor: group.subcontractor !== 'Unassigned' ? group.subcontractor : null,
            event_datetime: isoDate,
            user_email: user?.email || 'unknown'
          }]);

        if (error) throw error;
      }
      
      showLocalSuccess();
      fetchData();
    } catch (error) {
      console.error('Error updating date:', error);
      alert('Error updating date');
    } finally {
      stopLocalUpdate();
    }
  };

  const handleDeleteDate = async (eventId: string | null) => {
    if (!eventId) return;
    if (!confirm('Are you sure you want to delete this date?')) return;

    try {
      startLocalUpdate();
      const { error } = await supabase
        .from('subcontractor_performance')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      showLocalSuccess();
      fetchData();
    } catch (error) {
      console.error('Error deleting date:', error);
      alert('Error deleting date');
    } finally {
      stopLocalUpdate();
    }
  };

  const handleDeleteGroup = async (group: PerformanceGroup) => {
    if (!confirm(`Delete all performance records for ${group.subcontractor} at ${group.job_site} ${group.lote_bld}?`)) return;
    
    try {
      globalStartLoading();
      const idsToDelete = [group.start_event_id, group.end_event_id].filter(Boolean) as string[];
      
      const { error } = await supabase
        .from('subcontractor_performance')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;
      
      globalShowSuccess();
      fetchData();
    } catch (error) {
      console.error('Error deleting records:', error);
      alert('Error deleting records');
    } finally {
      globalStopLoading();
    }
  };

  const tableHeaderStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background-secondary)',
    color: 'var(--color-text-secondary)',
    borderBottom: '2px solid var(--color-border-divider)',
    padding: '16px 20px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px'
  };

  const tableCellStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border-divider)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-background-primary)',
    verticalAlign: 'middle'
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    outline: 'none'
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .spin {
            display: inline-block;
            animation: spin 1s linear infinite;
          }
        `}
      </style>
      {/* Header Bar */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', position: 'relative', flex: '0 0 auto' }}>
        <div className="d-flex align-items-center" style={{ gap: '24px' }}>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Performance Control</h1>
          
          {/* Loading/Success Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
            {isUpdating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--color-background-secondary)', padding: '6px 16px', borderRadius: '20px', border: '1px solid var(--color-border-divider)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div className="spinner-border spinner-border-sm" role="status" style={{ width: '14px', height: '14px', color: 'var(--color-accent-primary)' }}>
                  <span className="visually-hidden">Loading...</span>
                </div>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Saving changes...</span>
              </div>
            )}
            {!isUpdating && isSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--color-background-secondary)', padding: '6px 16px', borderRadius: '20px', border: '1px solid var(--color-border-divider)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <i className="bi bi-check-circle-fill" style={{ fontSize: '14px', color: '#10B981' }}></i>
                <span style={{ fontSize: '13px', color: '#10B981', fontWeight: 500 }}>Successfully saved</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="d-flex align-items-center" style={{ gap: '16px' }}>
          <div className="input-group" style={{ width: '320px' }}>
            <span className="input-group-text" style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', paddingLeft: '15px' }}>
              <i className="bi bi-search"></i>
            </span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Search by job or subcontractor..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', padding: '10px 15px', fontSize: '14px' }}
            />
          </div>
          <button 
            className="btn btn-outline-secondary d-flex align-items-center justify-content-center" 
            onClick={() => {
              console.log('Refresh triggered');
              fetchData();
            }} 
            title="Refresh data"
            disabled={loading}
            style={{ width: '42px', height: '42px', borderRadius: '8px' }}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`} style={{ fontSize: '20px' }}></i>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px' }}>
        <div className="flex-grow-1 custom-scrollbar" style={{ overflowY: 'auto', backgroundColor: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: '8px' }}>
          <table className="table table-hover mb-0" style={{ borderCollapse: 'separate', borderSpacing: 0, color: 'var(--color-text-primary)' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={tableHeaderStyle}>Job Site</th>
                <th style={tableHeaderStyle}>Lote/Bld</th>
                <th style={tableHeaderStyle}>Subcontractor</th>
                <th style={tableHeaderStyle}>Start Date</th>
                <th style={tableHeaderStyle}>End Date</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedData.map((group, idx) => (
                <tr key={`${group.obra_id}-${group.subcontractor}-${idx}`}>
                  <td style={tableCellStyle}>{group.job_site}</td>
                  <td style={tableCellStyle}>{group.lote_bld}</td>
                  <td style={tableCellStyle}>
                    <span className="badge" style={{ backgroundColor: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-divider)', fontWeight: 500, fontSize: '13px' }}>
                      {group.subcontractor}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    <DateInput 
                      initialValue={group.start_date}
                      onSave={(val) => handleUpdateDate(group.start_event_id, val, 'Start', group)}
                      onDelete={() => handleDeleteDate(group.start_event_id)}
                      style={inputStyle}
                    />
                  </td>
                  <td style={tableCellStyle}>
                    <DateInput 
                      initialValue={group.end_date}
                      onSave={(val) => handleUpdateDate(group.end_event_id, val, 'End', group)}
                      onDelete={() => handleDeleteDate(group.end_event_id)}
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                    <button 
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDeleteGroup(group)}
                      title="Delete these records"
                      style={{ padding: '4px 10px' }}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {groupedData.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-5" style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
                    No performance data found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
