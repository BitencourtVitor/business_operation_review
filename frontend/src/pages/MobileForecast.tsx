import { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import { formatDateUS } from '../utils/formatters';
import ForecastMaintenance from '../components/common/Forecast/ForecastMaintenance';

// Componentes modulares
import MobileForecastLoading from '../components/common/Forecast/MobileForecastLoading';
import MobileForecastFilters from '../components/common/Forecast/MobileForecastFilters';
import MobileForecastMetrics from '../components/common/Forecast/MobileForecastMetrics';
import MobileTimelinePlanner from '../components/common/Forecast/MobileTimelinePlanner';

import { 
  getForecastProjectStatus, 
  type ForecastProjectStatus 
} from '../components/common/Forecast/helpers';

type DateMode = 'start' | 'beams';

interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface ForecastMachine {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: boolean | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
}

interface ForecastContractStep {
  id: number;
  obra_id: string;
  step: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface WorkforceProject {
  id: string; // Mudou de number para string (ID da obra)
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null; // Mudou de lote_building (number) para lote_bld (string)
  workforce: string | null;
  hvac: boolean | null; // Mudou de string para boolean
  buildertrend: boolean | null; // Novo campo
  qbtime: boolean | null; // Novo campo
  storage: boolean | null; // Indica se a obra já foi adicionada ao sistema de estoque
  machine_provider: string | null; // Novo campo
  status: string | null;
  address: string | null;
  previous_beams_date: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
  obs: string | null; // Mudou de observacoes para obs
  create_datetime: string | null; // Mudou de created_at
  lastupdate_datetimez: string | null; // Mudou de updated_at
  // Dados relacionados das tabelas derivadas
  fieldwire?: ForecastFieldwire[];
  machines?: ForecastMachine[];
  contract_steps?: ForecastContractStep[];
}

const getReferenceDate = (project: WorkforceProject, mode: DateMode): string | null => {
  if (mode === 'beams') {
    return project.previous_beams_date || project.previous_start_date || null;
  }
  return project.previous_start_date || null;
};

// Helper para verificar se Fieldwire está completo (todos os documentos com status true)
const isFieldwireComplete = (project: WorkforceProject): boolean => {
  if (!project.fieldwire || project.fieldwire.length === 0) return false;
  return project.fieldwire.every(fw => fw.status === true);
};

// Helper para verificar se Machines and Attachments está completo
const isMachinesComplete = (project: WorkforceProject): boolean => {
  if (!project.machines || project.machines.length === 0) return false;
  return project.machines.every(m => m.status === true);
};

// Helper para verificar se tem contrato completo
const hasCompleteContract = (project: WorkforceProject): boolean => {
  if (!project.contract_steps || project.contract_steps.length === 0) return false;
  return project.contract_steps.every(cs => cs.status === true);
};

// Helper para verificar se tem Workforce
const hasWorkforce = (project: WorkforceProject): boolean => {
  return !!(project.workforce && project.workforce.trim() !== '');
};

// Helper para verificar se a obra já iniciou (baseado na data de início)
const hasProjectStarted = (project: WorkforceProject): boolean => {
  if (!project.previous_start_date) return false;
  const startDate = new Date(project.previous_start_date);
  if (isNaN(startDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  return startDate <= today;
};

interface ForecastData {
  cliente: string;
  job_site: string;
  month: string;
  year: number;
  projectCount: number;
  startDate: string;
  endDate: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function MobileForecast() {
  const [theme, setTheme] = useState<'light' | 'dark'>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [rawProjects, setRawProjects] = useState<WorkforceProject[]>([]);
  const [workforceProjects, setWorkforceProjects] = useState<WorkforceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('Framing');
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [dateMode, setDateMode] = useState<DateMode>('start');

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string[]>([]);
  const [selectedJobSite, setSelectedJobSite] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all'); // 'all', 'Lot', 'Building'
  const [selectedFieldwire, setSelectedFieldwire] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedBuildertrend, setSelectedBuildertrend] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedMachines, setSelectedMachines] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedContractSteps, setSelectedContractSteps] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedWorkforce, setSelectedWorkforce] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedQBTime, setSelectedQBTime] = useState<string>('all'); // 'all', 'yes', 'no'
  const [selectedStatuses, setSelectedStatuses] = useState<ForecastProjectStatus[]>(['overdue', 'not started']); // Inicia mostrando apenas overdue e not started
  const [groupBy, setGroupBy] = useState<'cliente' | 'job_site'>('cliente');
  const [sortByDate, setSortByDate] = useState<'off' | 'asc' | 'desc' | null>(null);

  // Persistir tema no cookie e aplicar classe
  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    setSelectedYear('');
    setSelectedMonth('');
  }, [dateMode]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [jobSites, setJobSites] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  // Mapeamento de empresas
  const companies = [
    {
      id: 'Framing',
      name: 'Framing'
    }
    // Futuras empresas podem ser adicionadas aqui
  ];

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

  // Função para buscar dados do forecast (novo modelo)
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
      const enrichedProjects: WorkforceProject[] = projectsData.map((project: any) => ({
        ...project,
        fieldwire: fieldwireMap.get(project.id) || [],
        machines: machinesMap.get(project.id) || [],
        contract_steps: contractStepsMap.get(project.id) || []
      }));

      setRawProjects(enrichedProjects);
      
      // Não filtrar por status aqui - será feito no visibleProjects
      setWorkforceProjects(enrichedProjects);

    } catch (err) {
      console.error('Erro ao buscar dados do forecast:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Buscar dados após o loading inicial
  useEffect(() => {
    if (!isInitialLoading) {
      fetchWorkforceData();
    }
  }, [isInitialLoading]);

  useEffect(() => {
    if (!rawProjects.length) {
      setClients([]);
      setJobSites([]);
      setAvailableTypes([]);
      return;
    }

    const uniqueClients = [...new Set(
      rawProjects
        .map(p => p.cliente)
        .filter(cliente => !!cliente)
    )].sort();
    setClients(uniqueClients);

    const filteredForJobSites = selectedClient.length > 0
      ? rawProjects.filter(p => selectedClient.includes(p.cliente))
      : rawProjects;

    const uniqueJobSites = [...new Set(
      filteredForJobSites
        .map(p => p.job_site)
        .filter(jobSite => !!jobSite)
    )].sort();
    setJobSites(uniqueJobSites);

    // Limpar job sites selecionados que não pertencem mais aos clientes selecionados
    if (selectedJobSite.length > 0) {
      const validJobSites = new Set(uniqueJobSites);
      const newSelectedJobSite = selectedJobSite.filter(js => validJobSites.has(js));
      if (newSelectedJobSite.length !== selectedJobSite.length) {
        setSelectedJobSite(newSelectedJobSite);
      }
    }

    const uniqueTypes = [...new Set(
      rawProjects
        .map(p => p.type)
        .filter(type => !!type)
    )].sort();
    setAvailableTypes(uniqueTypes);
  }, [rawProjects, selectedClient]);

  useEffect(() => {
    if (!rawProjects.length) {
      setYears([]);
      setMonths([]);
      return;
    }

    const referenceDates = rawProjects
      .map(project => getReferenceDate(project, dateMode))
      .filter((date): date is string => !!date);

    // Mapear datas para { year, monthIndex } de forma robusta
    const parsedDates = referenceDates.map(date => {
      // Tentar extrair via split primeiro (YYYY-MM-DD)
      const parts = date.split('-');
      if (parts.length >= 2) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        if (!isNaN(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
          return { year, monthIndex };
        }
      }
      // Fallback para Date object
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return { 
          year: d.getUTCFullYear().toString(), 
          monthIndex: d.getUTCMonth() 
        };
      }
      return null;
    }).filter((d): d is { year: string, monthIndex: number } => d !== null);

    // 1. Extrair anos únicos com dados
    const uniqueYears = [...new Set(parsedDates.map(d => d.year))].sort((a, b) => b.localeCompare(a));
    setYears(uniqueYears);

    // 2. Extrair meses únicos com dados, filtrando pelo ano selecionado
    const filteredByYear = parsedDates.filter(d => !selectedYear || d.year === selectedYear);
    const uniqueMonthIndices = [...new Set(filteredByYear.map(d => d.monthIndex))].sort((a, b) => a - b);
    const uniqueMonths = uniqueMonthIndices.map(index => MONTH_NAMES[index]);

    setMonths(uniqueMonths);
    
    // Se o mês selecionado não estiver mais disponível no novo ano, limpa a seleção
    if (selectedMonth && !uniqueMonths.includes(selectedMonth)) {
      setSelectedMonth('');
    }
  }, [rawProjects, dateMode, selectedYear]);

  // Lista de projetos visíveis de acordo com filtros selecionados
  const visibleProjects = useMemo(() => {
    if (!workforceProjects.length) return [] as typeof workforceProjects;

    const selectedClientSet = new Set(selectedClient.map(c => c.trim().toLowerCase()))
    const selectedJobSiteSet = new Set(selectedJobSite.map(j => j.trim().toLowerCase()))

    return workforceProjects.filter(project => {
      // Quando selectedStatuses está ativo, filtramos pelos status selecionados
      if (selectedStatuses.length > 0) {
        const status = getForecastProjectStatus(project);
        if (!selectedStatuses.includes(status)) return false;
      }

      // Filtros de busca e seleção (mantemos estes para funcionalidade da UI)
      const referenceDate = getReferenceDate(project, dateMode);
      
      const projectYear = referenceDate ? referenceDate.split('-')[0] : null;
      const projectMonthNum = referenceDate ? parseInt(referenceDate.split('-')[1], 10) : null;
      const projectMonth = projectMonthNum ? MONTH_NAMES[projectMonthNum - 1] : null;
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;
      const clientNorm = (project.cliente || '').trim().toLowerCase();
      const jobSiteNorm = (project.job_site || '').trim().toLowerCase();
      const clientMatch = selectedClientSet.size === 0 || selectedClientSet.has(clientNorm);
      const jobSiteMatch = selectedJobSiteSet.size === 0 || selectedJobSiteSet.has(jobSiteNorm);
      const typeMatch = selectedType === 'all' || project.type === selectedType;
      
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

  }, [workforceProjects, selectedYear, selectedMonth, selectedClient, selectedJobSite, selectedType, 
      selectedFieldwire, selectedBuildertrend, selectedMachines, selectedContractSteps, selectedWorkforce, selectedQBTime, 
      selectedStatuses, dateMode]);

  // Processar dados para o forecast
  const forecastData = useMemo(() => {
    if (!visibleProjects.length) return [];

    // Agrupar por cliente, job_site e mês
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
      if (a.year !== b.year) return b.year - a.year;
      const monthIndexA = MONTH_NAMES.indexOf(a.month);
      const monthIndexB = MONTH_NAMES.indexOf(b.month);
      if (monthIndexA !== monthIndexB) return monthIndexA - monthIndexB;
      return a.cliente.localeCompare(b.cliente);
    });
  }, [visibleProjects, dateMode]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const totalProjects = forecastData.reduce((sum, item) => sum + item.projectCount, 0);
    const uniqueClients = new Set(forecastData.map(item => item.cliente)).size;
    const uniqueJobSites = new Set(forecastData.map(item => item.job_site)).size;
    
    // Calcular período (data mínima e máxima)
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
        const minStartDate = new Date(Math.min(...allStartDates.map(d => d.getTime())));
        periodStart = formatDateUS(minStartDate.toISOString().split('T')[0]);
      }
      
      if (allEndDates.length > 0) {
        const maxEndDate = new Date(Math.max(...allEndDates.map(d => d.getTime())));
        periodEnd = formatDateUS(maxEndDate.toISOString().split('T')[0]);
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

  // Mostrar loading inicial se ainda estiver carregando
  if (isInitialLoading) {
    return <MobileForecastLoading onComplete={() => setIsInitialLoading(false)} theme={theme} />;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)',
        padding: '20px'
      }}>
        <div className="spinner-border" role="status" style={{ 
          width: 40, 
          height: 40, 
          color: 'var(--color-accent-primary)',
          marginBottom: '16px'
        }}>
          <span className="visually-hidden">Carregando...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '16px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          textAlign: 'center'
        }}>
          Loading Forecast...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-background-primary)',
        padding: '20px'
      }}>
        <div className="alert alert-danger" role="alert" style={{ textAlign: 'center', maxWidth: '400px' }}>
          <i className="bi bi-exclamation-triangle" style={{ fontSize: '24px', marginBottom: '10px' }}></i>
          <h5>Error loading data</h5>
          <p className="mb-0">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '12px', 
      background: 'var(--color-background-primary)', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden'
    }}>
      {/* Header mobile */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '12px',
        padding: '6px 0',
        borderBottom: '2px solid var(--color-accent-primary)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {/* Espaçador para equilibrar o layout à esquerda */}
        <div style={{ width: 32, marginLeft: 8 }}></div>

        {/* Botão de seleção de empresa */}
        <div style={{ position: 'relative', display: 'inline-block', flex: 1 }} data-company-menu>
          <button
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '8px',
              transition: 'background 0.2s',
              margin: '0 auto'
            }}
            onClick={() => setIsCompanyMenuOpen(!isCompanyMenuOpen)}
          >
            <h1 style={{ 
              color: 'var(--color-text-primary)', 
              fontSize: '18px', 
              fontWeight: 700, 
              margin: 0,
              whiteSpace: 'nowrap'
            }}>
              {selectedCompany} Forecast
            </h1>
            <i 
              className={`bi bi-chevron-${isCompanyMenuOpen ? 'up' : 'down'}`}
              style={{ 
                color: 'var(--color-text-secondary)',
                fontSize: '16px'
              }}
            />
          </button>

          {/* Menu dropdown de empresas */}
          {isCompanyMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              minWidth: '200px',
              marginTop: '8px'
            }}>
              {companies.map((company) => (
                <button
                  key={company.id}
                  style={{
                    width: '100%',
                    background: selectedCompany === company.id ? 'var(--color-background-secondary)' : 'transparent',
                    border: 'none',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    borderBottom: '1px solid var(--color-border-divider)',
                    borderRadius: company.id === companies[companies.length - 1].id ? '0 0 8px 8px' : '0'
                  }}
                  onClick={() => {
                    setSelectedCompany(company.id);
                    setIsCompanyMenuOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCompany !== company.id) {
                      e.currentTarget.style.background = 'var(--color-background-secondary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCompany !== company.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{
                    color: 'var(--color-text-primary)',
                    fontSize: '16px',
                    fontWeight: selectedCompany === company.id ? 600 : 400
                  }}>
                    {company.name}
                  </span>
                  {selectedCompany === company.id && (
                    <i 
                      className="bi bi-check" 
                      style={{ 
                        color: 'var(--color-accent-primary)',
                        marginLeft: 'auto'
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botão de Tema */}
        <button
          type="button"
          onClick={handleThemeToggle}
          className="btn-secondary-custom d-flex align-items-center justify-content-center"
          style={{ 
            width: 42, 
            height: 38, 
            fontSize: 16, 
            marginRight: 10,
            borderRadius: '8px',
            background: 'var(--color-background-secondary)',
            border: '1.5px solid var(--color-border-divider)',
            color: 'var(--color-text-primary)'
          }}
        >
          <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`}/>
        </button>
      </div>

      {/* Container principal com largura controlada */}
      <div style={{ 
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Filtros mobile */}
        <div style={{ width: '100%' }}>
          <MobileForecastFilters
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            selectedClient={selectedClient}
            selectedJobSite={selectedJobSite}
            selectedType={selectedType}
            selectedFieldwire={selectedFieldwire}
            selectedBuildertrend={selectedBuildertrend}
            selectedMachines={selectedMachines}
            selectedContractSteps={selectedContractSteps}
            selectedWorkforce={selectedWorkforce}
            selectedQBTime={selectedQBTime}
            selectedStatuses={selectedStatuses}
            years={years}
            months={months}
            clients={clients}
            jobSites={jobSites}
            availableTypes={availableTypes}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonth}
            onClientChange={setSelectedClient}
            onJobSiteChange={setSelectedJobSite}
            onTypeChange={setSelectedType}
            onFieldwireChange={setSelectedFieldwire}
            onBuildertrendChange={setSelectedBuildertrend}
            onMachinesChange={setSelectedMachines}
            onContractStepsChange={setSelectedContractSteps}
            onWorkforceChange={setSelectedWorkforce}
            onQBTimeChange={setSelectedQBTime}
            onStatusesChange={setSelectedStatuses}
            dateMode={dateMode}
            onDateModeChange={setDateMode}
            sortByDate={sortByDate}
            onSortByDateChange={setSortByDate}
          />
        </div>

        {/* Métricas mobile */}
        <div style={{ width: '100%' }}>
          <MobileForecastMetrics 
            stats={stats} 
            workforceProjects={workforceProjects}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            selectedClient={selectedClient}
            selectedJobSite={selectedJobSite}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
          />
        </div>
        
        {/* Timeline Planner mobile */}
        <div style={{ flex: 1, width: '100%' }}>
          <MobileTimelinePlanner 
            theme={theme}
            forecastData={forecastData}
            workforceProjects={visibleProjects}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            sortByDate={sortByDate}
            onSortByDateChange={setSortByDate}
            dateMode={dateMode}
            onDateModeChange={setDateMode}
          />
        </div>
      </div>
    </div>
  );
}
