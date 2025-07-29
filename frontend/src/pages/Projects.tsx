import React, { useState, useEffect } from 'react';
import ProjectFilters from '../components/common/Projects_/ProjectFilters';
import ProjectChart from '../components/common/Projects_/ProjectChart';
import AcceptedEstimatesCarousel from '../components/common/Projects_/AcceptedEstimatesCarousel';

interface ProjectsProps {
  onNavigateToTela?: (telaId: string) => void;
  telas?: Array<{ id: string; descricao: string }>;
  onShowAccountingContent?: () => void;
}

export default function Projects({ onNavigateToTela, telas, onShowAccountingContent }: ProjectsProps) {
  // Estados para filtros
  const [selectedCompany, setSelectedCompany] = useState<string[]>(['Premium HVAC']);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'receivable' | 'payable'>('all');

  useEffect(() => {
    const anoAtual = new Date().getFullYear().toString();
    setSelectedYear(anoAtual);
    setSelectedMonth('');
  }, []);

  const handleNavigateToAccounting = () => {
    if (onShowAccountingContent) {
      // Mostrar o conteúdo de AccountingIndicators sem alterar o telaId
      onShowAccountingContent();
    }
  };

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
      <ProjectChart 
        selectedYear={selectedYear} 
        selectedMonth={selectedMonth} 
        selectedGroup={selectedGroup} 
        onNavigateToAccounting={handleNavigateToAccounting}
      />
      {/* Carrossel de Accepted Estimates */}
      <AcceptedEstimatesCarousel />
      {/* Conteúdo principal futuro */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        {/* Conteúdo futuro aqui */}
      </div>
    </div>
  );
} 