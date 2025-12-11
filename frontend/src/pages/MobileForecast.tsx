import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { formatDateUS } from '../utils/formatters';
import ForecastMaintenance from '../components/common/Forecast/ForecastMaintenance';

// Componentes modulares
import MobileForecastLoading from '../components/common/Forecast/MobileForecastLoading';
import MobileForecastFilters from '../components/common/Forecast/MobileForecastFilters';
import MobileForecastMetrics from '../components/common/Forecast/MobileForecastMetrics';
import MobileTimelinePlanner from '../components/common/Forecast/MobileTimelinePlanner';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';

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

// Helper para verificar se tem Fieldwire ativo
const hasActiveFieldwire = (project: WorkforceProject): boolean => {
  return project.fieldwire?.some(fw => fw.status === true) || false;
};

// Helper para verificar se tem contrato completo
const hasCompleteContract = (project: WorkforceProject): boolean => {
  if (!project.contract_steps || project.contract_steps.length === 0) return false;
  return project.contract_steps.every(cs => cs.status === true);
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

export default function MobileForecast() {
  const [rawProjects, setRawProjects] = useState<WorkforceProject[]>([]);
  const [workforceProjects, setWorkforceProjects] = useState<WorkforceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('Framing');
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [dateMode, setDateMode] = useState<DateMode>('start');

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string[]>([]);
  const [selectedJobSite, setSelectedJobSite] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all'); // 'all', 'Lot', 'Building'
  const [groupBy, setGroupBy] = useState<'cliente' | 'job_site'>('cliente');
  const [sortByDate, setSortByDate] = useState<'off' | 'asc' | 'desc' | null>(null);

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

  // Mapeamento de empresas e logos
  const companies = [
    {
      id: 'Framing',
      name: 'Framing',
      logo: sublogoFraming
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

      // Filtrar apenas projetos com status 'not started' e com data de início válida
      const filtered = enrichedProjects.filter((p: WorkforceProject) => {
        const s = (p.status || '').toLowerCase().trim();
        if (s === 'not started') {
          const start = p.previous_start_date ? new Date(p.previous_start_date) : null;
          return !!(start && !isNaN(start.getTime()));
        }
        return false;
      });
      
      setWorkforceProjects(filtered);

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

    const uniqueJobSites = [...new Set(
      rawProjects
        .map(p => p.job_site)
        .filter(jobSite => !!jobSite)
    )].sort();
    setJobSites(uniqueJobSites);

      const uniqueTypes = [...new Set(
        rawProjects
          .map(p => p.type)
          .filter(type => !!type)
      )].sort();
      setAvailableTypes(uniqueTypes);
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

    const uniqueMonths = [...new Set(
      referenceDates
        .map(date => {
          const parsed = new Date(date);
          if (isNaN(parsed.getTime())) return null;
          return parsed.toLocaleString('en-US', { month: 'long' });
        })
        .filter((month): month is string => !!month)
    )].sort();
    setMonths(uniqueMonths);
  }, [rawProjects, dateMode]);

  // Lista de projetos visíveis de acordo com filtros selecionados
  const visibleProjects = useMemo(() => {
    if (!workforceProjects.length) return [] as typeof workforceProjects;

    const selectedClientSet = new Set(selectedClient.map(c => c.trim().toLowerCase()))
    const selectedJobSiteSet = new Set(selectedJobSite.map(j => j.trim().toLowerCase()))

    return workforceProjects.filter(project => {
      // Excluir cards quando as datas forem nulas/indefinidas/inválidas
      if (!project.previous_start_date || !project.previous_end_date) return false;
      const start = new Date(project.previous_start_date);
      const end = new Date(project.previous_end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      const referenceDate = getReferenceDate(project, dateMode);
      if (!referenceDate) return false;

      const dateParts = referenceDate.split('-');
      if (dateParts.length !== 3) return false;
      
      const projectYear = dateParts[0];
      const projectMonthNum = parseInt(dateParts[1], 10);
      const projectMonth = new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;
      const clientNorm = (project.cliente || '').trim().toLowerCase();
      const jobSiteNorm = (project.job_site || '').trim().toLowerCase();
      const clientMatch = selectedClientSet.size === 0 || selectedClientSet.has(clientNorm);
      const jobSiteMatch = selectedJobSiteSet.size === 0 || selectedJobSiteSet.has(jobSiteNorm);
      const typeMatch = selectedType === 'all' || project.type === selectedType;
      return yearMatch && monthMatch && clientMatch && jobSiteMatch && typeMatch;
    });

  }, [workforceProjects, selectedYear, selectedMonth, selectedClient, selectedJobSite, selectedType, dateMode]);

  // Processar dados para o forecast
  const forecastData = useMemo(() => {
    if (!visibleProjects.length) return [];

    // Agrupar por cliente, job_site e mês
    const groupedData: { [key: string]: ForecastData } = {};

    visibleProjects.forEach(project => {
      const referenceDate = getReferenceDate(project, dateMode);
      if (!referenceDate) {
        return;
      }
      const refDateObj = new Date(referenceDate);
      if (isNaN(refDateObj.getTime())) {
        return;
      }
      const month = refDateObj.toLocaleString('en-US', { month: 'long' });
      const year = refDateObj.getFullYear();
      
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
      if (a.month !== b.month) return a.month.localeCompare(b.month);
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
      const allStartDates = forecastData.map(item => new Date(item.startDate));
      const allEndDates = forecastData.map(item => new Date(item.endDate));
      
      const minStartDate = new Date(Math.min(...allStartDates.map(d => d.getTime())));
      const maxEndDate = new Date(Math.max(...allEndDates.map(d => d.getTime())));
      
      periodStart = formatDateUS(minStartDate.toISOString().split('T')[0]);
      periodEnd = formatDateUS(maxEndDate.toISOString().split('T')[0]);
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
    return <MobileForecastLoading onComplete={() => setIsInitialLoading(false)} />;
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
      minHeight: '100vh', 
      background: 'var(--color-background-primary)',
      padding: '10px',
      maxWidth: '100vw',
      overflowX: 'hidden'
    }}>
      {/* Header mobile */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '20px',
        padding: '15px 0',
        borderBottom: '2px solid var(--color-accent-primary)',
        position: 'relative'
      }}>
        {/* Botão de seleção de empresa */}
        <div style={{ position: 'relative', display: 'inline-block' }} data-company-menu>
          <button
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: '8px',
              transition: 'background 0.2s'
            }}
            onClick={() => setIsCompanyMenuOpen(!isCompanyMenuOpen)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            <img 
              src={companies.find(c => c.id === selectedCompany)?.logo || sublogoFraming} 
              alt={selectedCompany} 
              style={{ 
                width: 28, 
                height: 28, 
                objectFit: 'contain'
              }}
            />
            <h1 style={{ 
              color: 'var(--color-text-primary)', 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: 0
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
                  <img 
                    src={company.logo} 
                    alt={company.name} 
                    style={{ 
                      width: 24, 
                      height: 24, 
                      objectFit: 'contain'
                    }}
                  />
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

        <p style={{ 
          color: 'var(--color-text-secondary)', 
          fontSize: '14px', 
          margin: '5px 0 0 0' 
        }}>
          Project Timeline
        </p>
      </div>

      {/* Container principal com largura controlada */}
      <div style={{ 
        maxWidth: '100%',
        width: '100%',
        margin: '0 auto'
      }}>
        {/* Filtros mobile */}
        <div style={{ marginBottom: '20px', width: '100%' }}>
          <MobileForecastFilters
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            selectedClient={selectedClient}
            selectedJobSite={selectedJobSite}
            selectedType={selectedType}
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
          />
        </div>

        {/* Métricas mobile */}
        <div style={{ marginBottom: '20px', width: '100%' }}>
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
