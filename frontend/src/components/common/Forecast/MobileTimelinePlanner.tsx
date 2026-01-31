import { useState, useMemo, useCallback } from 'react';
import type { WorkforceProject, ForecastData } from './types';
import ForecastDateControls from './ForecastDateControls';
import ForecastProjectsGrid from './ForecastProjectsGrid';
import ForecastProjectModal from './ForecastProjectModal';

interface MobileTimelinePlannerProps {
  theme?: 'light' | 'dark';
  forecastData: ForecastData[];
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onSortByDateChange: (sortBy: 'off' | 'asc' | 'desc' | null) => void;
  dateMode: 'start' | 'beams';
  onDateModeChange: (mode: 'start' | 'beams') => void;
  filterNotStarted: boolean;
}

export default function MobileTimelinePlanner({
  theme,
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  sortByDate,
  onSortByDateChange,
  dateMode,
  onDateModeChange,
  filterNotStarted
}: MobileTimelinePlannerProps) {
  const [selectedProject, setSelectedProject] = useState<WorkforceProject | null>(null);

  const resolveReferenceDate = useCallback((project: WorkforceProject) => {
    const ref = dateMode === 'beams'
      ? (project.previous_beams_date || project.previous_start_date)
      : project.previous_start_date;
    return ref || '';
  }, [dateMode]);

  // Agrupar projetos por período
  const groupedProjects = useMemo(() => {
    if (!workforceProjects.length) return [];

    const filteredProjects = workforceProjects.filter(project => {
      // Excluir cards quando as datas forem nulas/indefinidas/inválidas
      if (!project.previous_start_date || !project.previous_end_date) return false;
      const start = new Date(project.previous_start_date);
      const end = new Date(project.previous_end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      const referenceDate = resolveReferenceDate(project);
      if (!referenceDate) return false;

      // Parse date string directly to avoid timezone issues
      const dateParts = referenceDate.split('-');
      if (dateParts.length !== 3) return false;
      
      const projectYear = dateParts[0];
      const projectMonthNum = parseInt(dateParts[1], 10);
      const projectMonth = new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;

      return yearMatch && monthMatch;
    });

    // Agrupar por mês
    const grouped: { [key: string]: WorkforceProject[] } = {};
    
    filteredProjects.forEach(project => {
      const referenceDate = resolveReferenceDate(project);
      if (!referenceDate) {
        return;
      }
      const baseDate = new Date(referenceDate);
      if (isNaN(baseDate.getTime())) {
        return;
      }
      const monthName = baseDate.toLocaleString('en-US', { month: 'long' }) + ' / ' + baseDate.getFullYear();
      
      if (!grouped[monthName]) {
        grouped[monthName] = [];
      }
      grouped[monthName].push(project);
    });

    // Ordenar por data
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => {
        const dateA = new Date(resolveReferenceDate(a) || '1900-01-01').getTime();
        const dateB = new Date(resolveReferenceDate(b) || '1900-01-01').getTime();
        if (sortByDate === 'desc') {
          return dateB - dateA;
        }
        if (sortByDate === 'asc') {
          return dateA - dateB;
        }
        return dateA - dateB;
      });
    });

    return Object.entries(grouped).sort(([a], [b]) => {
      const dateA = new Date(a.split(' / ')[1] + ' ' + a.split(' / ')[0]);
      const dateB = new Date(b.split(' / ')[1] + ' ' + b.split(' / ')[0]);
      return dateA.getTime() - dateB.getTime();
    });
  }, [workforceProjects, selectedYear, selectedMonth, sortByDate, resolveReferenceDate]);

  if (groupedProjects.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-secondary)'
      }}>
        <i className="bi bi-calendar-x" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ margin: 0, fontSize: '16px' }}>
          No projects found for the selected filters
        </p>
      </div>
    );
  }

  return (
    <>
    <div style={{ 
      padding: '0 5px',
      width: '100%',
        maxWidth: '100%',
      boxSizing: 'border-box',
        overflowX: 'hidden',
        overflowY: 'visible'
      }}>
        <ForecastDateControls
          dateMode={dateMode}
          onDateModeChange={onDateModeChange}
          sortByDate={sortByDate}
          onSortByDateChange={onSortByDateChange}
        />
        <ForecastProjectsGrid
          theme={theme}
          groupedProjects={groupedProjects}
          filterNotStarted={filterNotStarted}
          onProjectClick={setSelectedProject}
        />
                    </div>

      {/* Modal de detalhes do projeto */}
      {selectedProject && (
        <ForecastProjectModal
          theme={theme}
          project={selectedProject}
          filterNotStarted={filterNotStarted}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </>
  );
}
