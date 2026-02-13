import { useState } from 'react';
import SubcontractorPerformanceFilters from '../components/common/SubcontractorPerformance/SubcontractorPerformanceFilters';

interface SubcontractorPerformanceProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function SubcontractorPerformance({ telaId: _telaId, usuarioId: _usuarioId, role: _role, isResponsavelPelaTela: _isResponsavelPelaTela }: SubcontractorPerformanceProps) {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [years] = useState<string[]>(['2026', '2025']);
  const [months] = useState<string[]>(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);

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

      {/* Conteúdo principal: estrutura vazia para gráficos */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '20px' }}>
        <div className="row g-4">
          <div className="col-12 text-center" style={{ padding: '100px', color: 'var(--color-text-secondary)' }}>
            <i className="bi bi-clipboard-check" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
            <p>Subcontractor Performance data and charts will be displayed here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
