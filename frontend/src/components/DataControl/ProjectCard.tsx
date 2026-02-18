import React, { useState } from 'react';
import type { ForecastData } from '../../types/dataControl';
import ProjectForm from './ProjectForm';
import FieldwireList from './FieldwireList';
import MachinesList from './MachinesList';
import ContractStepsList from './ContractStepsList';
import SubcontractorPerformanceList from './SubcontractorPerformanceList';

interface ProjectCardProps {
  project: ForecastData;
  role: string;
  onUpdate: (data: Partial<ForecastData>) => Promise<void>;
  onDelete: () => Promise<void>;
  loading?: boolean;
  existingJobSites?: string[];
  existingTypes?: string[];
}

const tabButtonStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  backgroundColor: isActive ? 'var(--color-background-secondary)' : 'transparent',
  border: 'none',
  borderBottom: isActive ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
  color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontSize: '14px'
});

export default function ProjectCard({ project, role, onUpdate, onDelete, loading, existingJobSites, existingTypes }: ProjectCardProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'fieldwire' | 'machines' | 'contracts' | 'performance'>('info');

  // Se quisermos que o card seja expansível/colapsável para economizar performance
  // O usuário disse "lista de containeres com todos os dados", não especificou se colapsável.
  // Vou deixar sempre expandido ou usar um detalhe visual simples. 
  // Para performance e UX, talvez seja bom ter um header que colapsa/expande, mas o usuário disse "esquece isso de escolher uma obra".
  // Vou assumir que ele quer ver o formulário já aberto ou facilmente acessível.
  // Vou implementar com abas visíveis direto.

  return (
    <div className="card mb-4" style={{ border: '1px solid var(--color-border-divider)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Card Header */}
      <div 
        className="card-header d-flex justify-content-between align-items-center"
        style={{ 
          padding: '12px 20px', 
          borderBottom: '1px solid var(--color-border-divider)',
          backgroundColor: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)'
        }}
      >
        <div>
          <h5 style={{ margin: 0, fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>{project.job_site}</h5>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {project.cliente} • <span className={`badge bg-${project.status === 'open' ? 'success' : project.status === 'closed' ? 'secondary' : 'warning'}`}>{project.status}</span>
          </span>
        </div>
        
        {role === 'dev' && (
          <button 
            style={{
              height: '30px',
              width: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: '1px solid var(--negative-color)',
              backgroundColor: 'var(--negative-background)',
              color: 'var(--negative-color)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Are you sure you want to delete this project?')) {
                onDelete();
              }
            }}
            disabled={loading}
          >
            <i className="bi bi-trash"></i>
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div style={{ padding: '0 16px', borderBottom: '1px solid var(--color-border-divider)', backgroundColor: 'var(--color-background-primary)', overflowX: 'auto', display: 'flex', gap: '4px' }}>
        <button style={tabButtonStyle(activeTab === 'info')} onClick={() => setActiveTab('info')}>Basic Info</button>
        <button style={tabButtonStyle(activeTab === 'fieldwire')} onClick={() => setActiveTab('fieldwire')}>Fieldwire</button>
        <button style={tabButtonStyle(activeTab === 'machines')} onClick={() => setActiveTab('machines')}>Machines</button>
        <button style={tabButtonStyle(activeTab === 'contracts')} onClick={() => setActiveTab('contracts')}>Contract Steps</button>
        <button style={tabButtonStyle(activeTab === 'performance')} onClick={() => setActiveTab('performance')}>Performance</button>
      </div>

      {/* Card Body (Tab Content) */}
      <div className="card-body" style={{ padding: '20px', backgroundColor: 'var(--color-background-secondary)' }}>
        {activeTab === 'info' && (
          <ProjectForm 
            initialData={project}
            loading={!!loading}
            onSubmit={onUpdate}
            existingJobSites={existingJobSites}
            existingTypes={existingTypes}
            // Não passamos onCancel aqui pois não há botão "Voltar" ou "Cancelar" no contexto de lista
          />
        )}
        {activeTab === 'fieldwire' && <FieldwireList obraId={project.id} />}
        {activeTab === 'machines' && <MachinesList obraId={project.id} />}
        {activeTab === 'contracts' && <ContractStepsList obraId={project.id} />}
        {activeTab === 'performance' && <SubcontractorPerformanceList obraId={project.id} />}
      </div>
    </div>
  );
}
