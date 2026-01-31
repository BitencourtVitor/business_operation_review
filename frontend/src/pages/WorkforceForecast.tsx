import { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import { formatDateUS } from '../utils/formatters';
import type { WorkforceProject, ForecastData, ForecastFieldwire, ForecastMachine, ForecastContractStep } from '../components/common/Forecast/types';
import { isFieldwireComplete, isMachinesComplete, hasCompleteContract, getReferenceDate, hasWorkforce, getForecastProjectStatus, type ForecastProjectStatus } from '../components/common/Forecast/helpers';

import sublogoFraming from '../assets/submenu/sublogo_framing.png';

import iconFieldwire from '../assets/fieldwire.png';
import iconBuildertrend from '../assets/buildertrend.png';
import iconBuildertrendDark from '../assets/buildertrend_darkmode.png';
import iconQBTime from '../assets/qbtime_logo.png';
import iconQBTimeDark from '../assets/qbtime_darkmode.png';

// Estilos para botões segmentados (copiados do mobile para manter consistência)
const segmentedButtonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  background: 'rgba(var(--color-text-primary-rgb, 0, 0, 0), 0.05)',
  padding: '2px',
  borderRadius: 8,
  border: '1px solid var(--color-border-divider)'
};

const segmentedButtonStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '6px 12px',
  fontSize: '11px',
  fontWeight: isActive ? 600 : 500,
  color: isActive ? '#fff' : 'var(--color-text-secondary)',
  background: isActive ? 'var(--color-accent-primary)' : 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  boxShadow: isActive ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
});

const filterButtonStyle: React.CSSProperties = {
  background: 'var(--color-background-secondary)',
  border: '1px solid var(--color-border-divider)',
  borderRadius: 8,
  padding: '6px 10px',
  width: '100%',
  maxWidth: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  transition: 'all 0.3s',
  boxSizing: 'border-box'
};

// Componente para botões segmentados
const SegmentedButtonGroup = ({ 
  value, 
  onChange, 
  icon, 
  label 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  icon?: React.ReactNode;
  label: string;
}) => (
  <div style={{
    ...filterButtonStyle,
    height: '42px',
    padding: '0 4px 0 15px',
    cursor: 'default',
    background: 'var(--color-background-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: '8px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span style={{ fontWeight: 600, fontSize: '13px' }}>{label}</span>
    </div>
    <div style={{ ...segmentedButtonGroupStyle, border: 'none', background: 'rgba(var(--color-text-primary-rgb), 0.08)' }}>
      <button
        style={segmentedButtonStyle(value === 'all')}
        onClick={() => onChange('all')}
      >
        All
      </button>
      <button
        style={segmentedButtonStyle(value === 'yes')}
        onClick={() => onChange('yes')}
      >
        Done
      </button>
      <button
        style={segmentedButtonStyle(value === 'no')}
        onClick={() => onChange('no')}
      >
        Pendent
      </button>
    </div>
  </div>
);

// Componentes modulares
import ForecastFilters from '../components/common/Forecast/ForecastFilters';
import ForecastMetrics from '../components/common/Forecast/ForecastMetrics';
import TimelinePlanner from '../components/common/Forecast/TimelinePlanner';

type DateMode = 'start' | 'beams';

interface WorkforceForecastProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function WorkforceForecast({}: WorkforceForecastProps) {
  const [rawProjects, setRawProjects] = useState<WorkforceProject[]>([]);
  const [workforceProjects, setWorkforceProjects] = useState<WorkforceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>('start');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (Cookies.get('theme') as 'light' | 'dark') || 
           (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });

  // Observar mudanças no DOM para o tema (fallback para quando o Dashboard mudar o tema)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          setTheme(isDark ? 'dark' : 'light');
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string[]>([]);
  const [selectedJobSite, setSelectedJobSite] = useState<string[]>([]);
  const [selectedProjectType, setSelectedProjectType] = useState<string>('all'); // 'all', 'Lot', 'Building'
  
  // Novos filtros vindos do mobile
  const [selectedFieldwire, setSelectedFieldwire] = useState<string>('all');
  const [selectedBuildertrend, setSelectedBuildertrend] = useState<string>('all');
  const [selectedMachines, setSelectedMachines] = useState<string>('all');
  const [selectedContractSteps, setSelectedContractSteps] = useState<string>('all');
  const [selectedWorkforce, setSelectedWorkforce] = useState<string>('all');
  const [selectedQBTime, setSelectedQBTime] = useState<string>('all');

  const [sortByDate, setSortByDate] = useState<'off' | 'asc' | 'desc' | null>(null);
  const [viewMode] = useState<'grid' | 'timeline'>('grid');
  const [groupBy, setGroupBy] = useState<'cliente' | 'job_site'>('cliente');
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  useEffect(() => {
    setSelectedYear('');
    setSelectedMonth('');
  }, [dateMode]);

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-company-menu]')) {
        setIsCompanyMenuOpen(false);
      }
    };

    if (isCompanyMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCompanyMenuOpen]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [jobSites, setJobSites] = useState<string[]>([]);

  // Buscar dados do workforce (mesma lógica do mobile)
  const fetchWorkforceData = async () => {
    try {
      setLoading(true);
      
      // Buscar dados principais da tabela forecast_data
      const { data: projectsData, error: projectsError } = await supabase
        .from('forecast_data')
        .select('*')
        .order('previous_start_date', { ascending: true });

      if (projectsError) throw projectsError;

      if (!projectsData || projectsData.length === 0) {
        setRawProjects([]);
        setWorkforceProjects([]);
        return;
      }

      // Buscar dados relacionados em paralelo
      const obraIds = projectsData.map(p => p.id);
      
      const [fieldwireData, machinesData, contractStepsData] = await Promise.all([
        supabase
          .from('forecast_fieldwire')
          .select('*')
          .in('obra_id', obraIds),
        supabase
          .from('forecast_machines')
          .select('*')
          .in('obra_id', obraIds),
        supabase
          .from('forecast_contract_steps')
          .select('*')
          .in('obra_id', obraIds)
      ]);

      // Agrupar dados relacionados por obra_id
      const fieldwireMap = new Map<string, ForecastFieldwire[]>();
      (fieldwireData.data || []).forEach((fw: ForecastFieldwire) => {
        if (!fieldwireMap.has(fw.obra_id)) {
          fieldwireMap.set(fw.obra_id, []);
        }
        fieldwireMap.get(fw.obra_id)!.push(fw);
      });

      const machinesMap = new Map<string, ForecastMachine[]>();
      (machinesData.data || []).forEach((m: ForecastMachine) => {
        if (!machinesMap.has(m.obra_id)) {
          machinesMap.set(m.obra_id, []);
        }
        machinesMap.get(m.obra_id)!.push(m);
      });

      const contractStepsMap = new Map<string, ForecastContractStep[]>();
      (contractStepsData.data || []).forEach((cs: ForecastContractStep) => {
        if (!contractStepsMap.has(cs.obra_id)) {
          contractStepsMap.set(cs.obra_id, []);
        }
        contractStepsMap.get(cs.obra_id)!.push(cs);
      });

      // Combinar dados principais com dados relacionados
      const enrichedProjects: WorkforceProject[] = projectsData.map((project: WorkforceProject) => ({
        ...project,
        fieldwire: fieldwireMap.get(project.id) || [],
        machines: machinesMap.get(project.id) || [],
        contract_steps: contractStepsMap.get(project.id) || []
      }));

      setRawProjects(enrichedProjects);
      setWorkforceProjects(enrichedProjects);

    } catch (err) {
      console.error('Erro ao buscar dados do workforce:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkforceData();
  }, []);

  useEffect(() => {
    if (!rawProjects.length) {
      setClients([]);
      setJobSites([]);
      return;
    }

    const uniqueClients = [...new Set(
      rawProjects
        .map(p => p.cliente)
        .filter((cliente): cliente is string => !!cliente)
    )].sort();
    setClients(uniqueClients);

    const uniqueJobSites = [...new Set(
      rawProjects
        .map(p => p.job_site)
        .filter((jobSite): jobSite is string => !!jobSite)
    )].sort();
    setJobSites(uniqueJobSites);

    const uniqueTypes = [...new Set(
      rawProjects
        .map(p => p.type)
        .filter((type): type is string => !!type)
    )].sort();
  }, [rawProjects]);

  useEffect(() => {
    if (!rawProjects.length) {
      setYears([]);
      setMonths([]);
      return;
    }

    const referenceDates = rawProjects
      .map(project => getReferenceDate(project, dateMode))
      .filter((date): date is string => !!date);

    const uniqueYears = [...new Set(
      referenceDates
        .map(date => new Date(date))
        .filter(dateObj => !isNaN(dateObj.getTime()))
        .map(dateObj => dateObj.getFullYear().toString())
    )].sort((a, b) => b.localeCompare(a));
    setYears(uniqueYears);

    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const uniqueMonths = [...new Set(
      referenceDates
        .map(date => {
          const parsed = new Date(date);
          if (isNaN(parsed.getTime())) return null;
          return parsed.toLocaleString('en-US', { month: 'long' });
        })
        .filter((month): month is string => !!month)
    )].sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
    setMonths(uniqueMonths);
  }, [rawProjects, dateMode]);

  // Lista de projetos visíveis de acordo com filtros selecionados (mesma lógica do mobile)
  const visibleProjects = useMemo(() => {
    if (!workforceProjects.length) return [] as typeof workforceProjects;

    const selectedClientSet = new Set(selectedClient.map(c => c.trim().toLowerCase()))
    const selectedJobSiteSet = new Set(selectedJobSite.map(j => j.trim().toLowerCase()))

    return workforceProjects.filter(project => {
      // Filtro de Status (mesma lógica do mobile usando getForecastProjectStatus)
      if (selectedStatuses.length > 0) {
        const projectStatus = getForecastProjectStatus(project);
        if (!selectedStatuses.includes(projectStatus)) return false;
      }

      // Filtros de busca e seleção (mantemos estes para funcionalidade da UI)
      const referenceDate = getReferenceDate(project, dateMode);
      
      const projectYear = referenceDate ? referenceDate.split('-')[0] : null;
      const projectMonthNum = referenceDate ? parseInt(referenceDate.split('-')[1], 10) : null;
      const projectMonth = projectMonthNum ? new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' }) : null;
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;
      const clientNorm = (project.cliente || '').trim().toLowerCase();
      const jobSiteNorm = (project.job_site || '').trim().toLowerCase();
      const clientMatch = selectedClientSet.size === 0 || selectedClientSet.has(clientNorm);
      const jobSiteMatch = selectedJobSiteSet.size === 0 || selectedJobSiteSet.has(jobSiteNorm);
      const typeMatch = selectedProjectType === 'all' || project.type === selectedProjectType;
      
      // Filtros de conclusão (mantemos para funcionalidade da UI)
      const fieldwireMatch = selectedFieldwire === 'all' || 
        (selectedFieldwire === 'yes' ? isFieldwireComplete(project) : !isFieldwireComplete(project));
      const buildertrendMatch = selectedBuildertrend === 'all' || 
        (selectedBuildertrend === 'yes' ? project.buildertrend === true : project.buildertrend !== true);
      const machinesMatch = selectedMachines === 'all' || 
        (selectedMachines === 'yes' ? isMachinesComplete(project) : !isMachinesComplete(project));
      const contractStepsMatch = selectedContractSteps === 'all' || 
        (selectedContractSteps === 'yes' ? hasCompleteContract(project) : !hasCompleteContract(project));
      const workforceMatch = selectedWorkforce === 'all' || 
        (selectedWorkforce === 'yes' ? hasWorkforce(project) : !hasWorkforce(project));
      
      const qbtimeMatch = selectedQBTime === 'all' || 
        (selectedQBTime === 'yes' ? project.qbtime === true : project.qbtime !== true);
      
      return yearMatch && monthMatch && clientMatch && jobSiteMatch && typeMatch && 
        fieldwireMatch && buildertrendMatch && machinesMatch && contractStepsMatch && workforceMatch && qbtimeMatch;
    });

  }, [workforceProjects, selectedYear, selectedMonth, selectedClient, selectedJobSite, selectedProjectType, 
      selectedFieldwire, selectedBuildertrend, selectedMachines, selectedContractSteps, selectedWorkforce, selectedQBTime, 
      selectedStatuses, dateMode]);

  // Processar dados para o forecast
  const forecastData = useMemo(() => {
    if (!visibleProjects.length) return [];

    const groupedData: { [key: string]: ForecastData } = {};

    visibleProjects.forEach(project => {
      const referenceDate = getReferenceDate(project, dateMode);
      
      let month = 'Pending';
      let year = 0;

      if (referenceDate) {
        const refDateObj = new Date(referenceDate);
        if (!isNaN(refDateObj.getTime())) {
          month = refDateObj.toLocaleString('en-US', { month: 'long' });
          year = refDateObj.getFullYear();
        }
      }
      
      const key = `${project.cliente}-${project.job_site}-${month}-${year}`;
      
      if (!groupedData[key]) {
        groupedData[key] = {
          cliente: project.cliente,
          job_site: project.job_site,
          month,
          year,
          projectCount: 0,
          startDate: project.previous_start_date,
          endDate: project.previous_end_date
        };
      }
      
      groupedData[key].projectCount += 1;
    });

    return Object.values(groupedData).sort((a, b) => {
      // Ordenação cronológica (Ano e Mês)
      if (a.year !== b.year) {
        return sortByDate === 'desc' ? b.year - a.year : a.year - b.year;
      }
      
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndexA = months.indexOf(a.month);
      const monthIndexB = months.indexOf(b.month);
      
      if (monthIndexA !== monthIndexB) {
        return sortByDate === 'desc' ? monthIndexB - monthIndexA : monthIndexA - monthIndexB;
      }
      
      return a.cliente.localeCompare(b.cliente);
    });
  }, [visibleProjects, dateMode, sortByDate]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const totalProjects = forecastData.reduce((sum, item) => sum + item.projectCount, 0);
    const uniqueClients = new Set(forecastData.map(item => item.cliente)).size;
    const uniqueJobSites = new Set(forecastData.map(item => item.job_site)).size;
    
    let periodStart = '';
    let periodEnd = '';
    
    if (forecastData.length > 0) {
      const allStartDates = forecastData
        .map(item => item.startDate ? new Date(item.startDate) : null)
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
      
      const allEndDates = forecastData
        .map(item => item.endDate ? new Date(item.endDate) : null)
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
      
      if (allStartDates.length > 0) {
         const minDate = new Date(Math.min(...allStartDates.map(d => d.getTime())));
         periodStart = formatDateUS(minDate.toISOString().split('T')[0]);
       }
       
       if (allEndDates.length > 0) {
         const maxDate = new Date(Math.max(...allEndDates.map(d => d.getTime())));
         periodEnd = formatDateUS(maxDate.toISOString().split('T')[0]);
       }
    }

    return {
      totalProjects,
      uniqueClients,
      uniqueJobSites,
      periodStart,
      periodEnd
    };
  }, [forecastData]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)'
      }}>
        <div className="spinner-border" role="status" style={{ 
          width: 40, 
          height: 40, 
          color: 'var(--color-accent-primary)',
          marginBottom: '16px'
        }}>
          <span className="visually-hidden">Loading...</span>
        </div>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
          Loading Forecast Data...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger m-4" role="alert">
        Error loading data: {error}
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '0', // Removido padding para o header ocupar 100%
      background: 'var(--color-background-primary)',
      height: '100vh', // Altura fixa da viewport
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden', // Esconde overflow na altura total
      position: 'relative'
    }}>
      {/* Barra superior com título e filtros - Padronizada com Project Monitoring */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ 
        padding: '10px 20px', 
        borderBottom: '1px solid var(--color-border-divider)', 
        background: 'var(--color-background-primary)',
        zIndex: 100 // Garante que fique acima do conteúdo rolável
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img 
              src={sublogoFraming} 
              alt="Framing" 
              style={{ width: '24px', height: '24px', objectFit: 'contain' }} 
            />
            <h1 style={{ 
              color: 'var(--color-text-primary)', 
              fontSize: 24, 
              fontWeight: 400, 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Framing</span>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>Forecast</span>
            </h1>
          </div>

          <ForecastFilters 
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            selectedClient={selectedClient}
            onClientChange={setSelectedClient}
            selectedJobSite={selectedJobSite}
            onJobSiteChange={setSelectedJobSite}
            selectedType={selectedProjectType}
            onTypeChange={setSelectedProjectType}
            years={years}
            months={months}
            clients={clients}
            jobSites={jobSites}
            dateMode={dateMode}
            onDateModeChange={setDateMode}
            sortByDate={sortByDate}
            onSortByDateChange={setSortByDate}
          />
        </div>
      </div>

      {/* Container principal - Única área rolável */}
      <div id="content" className="custom-scrollbar" style={{ 
        width: '100%',
        padding: '12px', // Ajustado para 12px em todas as direções
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flex: 1,
        overflow: 'hidden' // Esconde overflow geral
      }}>
        {/* Seção de Filtros Avançados / Stickers */}
        {isAdvancedFiltersOpen && (
          <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ 
              background: 'var(--color-background-secondary)', 
              borderRadius: '16px', 
              padding: '24px', 
              border: '1px solid var(--color-border-divider)',
              animation: 'slideDown 0.3s ease-out'
            }}>
              {/* Grid 3x2 de Filtros Segmentados */}
              <div className="row g-4">
                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="Fieldwire"
                    value={selectedFieldwire}
                    onChange={setSelectedFieldwire}
                    icon={<img src={iconFieldwire} alt="Fieldwire" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                  />
                </div>
                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="Buildertrend"
                    value={selectedBuildertrend}
                    onChange={setSelectedBuildertrend}
                    icon={<img src={theme === 'dark' ? iconBuildertrendDark : iconBuildertrend} alt="Buildertrend" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                  />
                </div>
                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="QBTime"
                    value={selectedQBTime}
                    onChange={setSelectedQBTime}
                    icon={<img src={theme === 'dark' ? iconQBTimeDark : iconQBTime} alt="QBTime" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                  />
                </div>

                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="Machines"
                    value={selectedMachines}
                    onChange={setSelectedMachines}
                    icon={<i className="bi bi-truck" style={{ fontSize: '16px' }} />}
                  />
                </div>
                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="Workforce"
                    value={selectedWorkforce}
                    onChange={setSelectedWorkforce}
                    icon={<i className="bi bi-people" style={{ fontSize: '16px' }} />}
                  />
                </div>
                <div className="col-md-4">
                  <SegmentedButtonGroup
                    label="Contract"
                    value={selectedContractSteps}
                    onChange={setSelectedContractSteps}
                    icon={<i className="bi bi-file-earmark-text" style={{ fontSize: '16px' }} />}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sumário / Métricas / Filtros Avançados - Estrutura unificada sempre visível */}
        <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Botão de Sumário Toggle (Estilo Mobile) */}
          <button
            onClick={() => setIsSummaryOpen(!isSummaryOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              background: isSummaryOpen ? 'rgba(var(--color-accent-primary-rgb), 0.05)' : 'var(--color-background-primary)',
              border: isSummaryOpen ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)',
              borderRadius: '12px',
              padding: '0 20px',
              height: '42px',
              flex: '1',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              e.currentTarget.style.background = 'rgba(var(--color-accent-primary-rgb), 0.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isSummaryOpen ? 'var(--color-accent-primary)' : 'var(--color-border-divider)';
              e.currentTarget.style.background = isSummaryOpen ? 'rgba(var(--color-accent-primary-rgb), 0.05)' : 'var(--color-background-primary)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-bar-chart-line-fill" style={{ color: 'var(--color-accent-primary)', fontSize: '16px' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Summary</span>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: '16px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-accent-primary)' }}>{stats.totalProjects}</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Projects</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text-primary)' }}>{stats.uniqueClients}</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Clients</span>
              </div>
            </div>

            <i 
              className={`bi bi-chevron-${isSummaryOpen ? 'up' : 'down'}`} 
              style={{ 
                color: isSummaryOpen ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                fontSize: '12px',
                transition: 'transform 0.3s ease'
              }} 
            />
          </button>

          {/* Botão Stickers (Altura Ajustada) */}
          <button
            onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
            style={{
              width: '160px',
              background: isAdvancedFiltersOpen ? 'rgba(var(--color-accent-primary-rgb), 0.05)' : 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: '12px',
              padding: '0 16px',
              height: '42px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              e.currentTarget.style.background = 'rgba(var(--color-accent-primary-rgb), 0.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isAdvancedFiltersOpen ? 'var(--color-accent-primary)' : 'var(--color-border-divider)';
              e.currentTarget.style.background = isAdvancedFiltersOpen ? 'rgba(var(--color-accent-primary-rgb), 0.05)' : 'var(--color-background-primary)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className={`bi bi-sliders${isAdvancedFiltersOpen ? '' : ''}`} style={{ color: 'var(--color-accent-primary)', fontSize: '14px' }} />
              <span>Stickers</span>
            </div>
            <i 
              className={`bi bi-chevron-${isAdvancedFiltersOpen ? 'up' : 'down'}`} 
              style={{ 
                color: isAdvancedFiltersOpen ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                fontSize: '12px',
                transition: 'transform 0.3s ease'
              }} 
            />
          </button>
        </div>

        {/* Sumário Expandido - Toggleable */}
        {isSummaryOpen && (
          <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ 
              width: '100%',
              animation: 'slideDown 0.3s ease-out'
            }}>
              <ForecastMetrics 
                stats={stats} 
                workforceProjects={visibleProjects}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                selectedClient={selectedClient}
                selectedJobSite={selectedJobSite}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
              />
            </div>
          </div>
        )}


        {/* Conteúdo Principal (Grid/Timeline) */}
        <div style={{ 
          flex: 1, 
          width: '100%',
          maxWidth: '1400px',
          margin: '0 auto',
          background: 'var(--color-background-primary)',
          borderRadius: '16px',
          border: 'none',
          overflowY: 'auto', // Adicionado overflow vertical apenas aqui
          display: 'flex', 
          flexDirection: 'column',
          boxShadow: 'none',
          marginBottom: '0' // Removido margin bottom
        }}>
          <TimelinePlanner 
            theme={theme}
            forecastData={forecastData}
            workforceProjects={visibleProjects}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            groupBy={groupBy}
            sortByDate={sortByDate}
            dateMode={dateMode}
            viewMode={viewMode}
          />
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Custom Scrollbar */
        .custom-scrollbar::-webkit-scrollbar,
        #content::-webkit-scrollbar,
        div::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track,
        #content::-webkit-scrollbar-track,
        div::-webkit-scrollbar-track {
          background: var(--color-background-primary);
        }

        .custom-scrollbar::-webkit-scrollbar-thumb,
        #content::-webkit-scrollbar-thumb,
        div::-webkit-scrollbar-thumb {
          background: var(--color-border-divider);
          border-radius: 10px;
          border: 2px solid var(--color-background-primary);
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover,
        #content::-webkit-scrollbar-thumb:hover,
        div::-webkit-scrollbar-thumb:hover {
          background: var(--color-accent-primary);
        }

        /* Suporte para Firefox */
        .custom-scrollbar,
        #content,
        div {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border-divider) var(--color-background-primary);
        }
      `}</style>
    </div>
  );
}