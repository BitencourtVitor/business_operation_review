import React, { useState } from 'react';
import ProjectFilters from '../components/common/Projects_/ProjectFilters';
import ProjectChart from '../components/common/Projects_/ProjectChart';
import AcceptedEstimatesCarousel from '../components/common/Projects_/AcceptedEstimatesCarousel';
import type { AcceptedEstimate } from '../components/common/Projects_/AcceptedEstimatesCarousel';

const Projects: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<string[]>(['Premium HVAC']);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'receivable' | 'payable'>('all');

  // Mock de estimates aceitos
  const acceptedEstimates: AcceptedEstimate[] = [
    {
      id: '1',
      customer: 'Cliente A',
      docNumber: 'EST-001',
      total: 15000,
      date: '2024-07-01',
      status: 'Accepted',
      description: 'Instalação de sistema HVAC',
    },
    {
      id: '2',
      customer: 'Cliente B',
      docNumber: 'EST-002',
      total: 8000,
      date: '2024-06-15',
      status: 'Accepted',
      description: 'Manutenção preventiva',
    },
    {
      id: '3',
      customer: 'Cliente C',
      docNumber: 'EST-003',
      total: 12000,
      date: '2024-05-20',
      status: 'Accepted',
      description: 'Upgrade de equipamentos',
    },
  ];

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Projects</h1>
        <ProjectFilters
          selectedCompany={selectedCompany}
          setSelectedCompany={setSelectedCompany}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedGroup={selectedGroup}
          setSelectedGroup={setSelectedGroup}
        />
      </div>
      {/* Gráfico principal */}
      <ProjectChart selectedYear={selectedYear} selectedMonth={selectedMonth} selectedGroup={selectedGroup} />
      {/* Carrossel de Estimates Aceitos */}
      <AcceptedEstimatesCarousel estimates={acceptedEstimates} />
      {/* Conteúdo principal futuro */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        {/* Conteúdo futuro aqui */}
      </div>
    </div>
  );
};

export default Projects; 