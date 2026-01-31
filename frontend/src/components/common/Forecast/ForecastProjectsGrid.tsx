import type { WorkforceProject } from './types';
import ForecastProjectCard from './ForecastProjectCard';

interface ForecastProjectsGridProps {
  theme?: 'light' | 'dark';
  groupedProjects: [string, WorkforceProject[]][];
  onProjectClick: (project: WorkforceProject) => void;
}

export default function ForecastProjectsGrid({
  theme,
  groupedProjects,
  onProjectClick
}: ForecastProjectsGridProps) {
  return (
    <>
      {groupedProjects.map(([month, projects]) => (
        <div key={month} style={{ marginBottom: '12px' }}>
          {/* Container do mês */}
          <div style={{
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '12px',
            padding: '12px 0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}>
            {/* Cabeçalho do mês */}
            <div style={{
              marginBottom: '16px',
              padding: '0 12px 12px 12px',
              borderBottom: '1px solid var(--color-border-divider)'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                textTransform: 'capitalize'
              }}>
                {month}
              </h3>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '14px',
                color: 'var(--color-text-secondary)'
              }}>
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Grid de cards dos projetos */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
              gap: '12px',
              padding: '0 12px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              alignContent: 'start',
              alignItems: 'start'
            }}>
              {projects.map((project) => (
                <ForecastProjectCard
                  key={project.id}
                  theme={theme}
                  project={project}
                  onCardClick={onProjectClick}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

