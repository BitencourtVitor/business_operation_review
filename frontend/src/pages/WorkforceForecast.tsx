import { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import { formatDateUS } from '../utils/formatters';
import ForecastMaintenance from '../components/common/Forecast/ForecastMaintenance';
import type { WorkforceProject, ForecastData, ForecastFieldwire, ForecastMachine, ForecastContractStep } from '../components/common/Forecast/types';
import { isFieldwireComplete, isMachinesComplete, hasCompleteContract, getReferenceDate, hasWorkforce } from '../components/common/Forecast/helpers';

// Componentes modulares
import ForecastFilters from '../components/common/Forecast/ForecastFilters';
import ForecastMetrics from '../components/common/Forecast/ForecastMetrics';
import TimelinePlanner from '../components/common/Forecast/TimelinePlanner';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';

type DateMode = 'start' | 'beams';

interface WorkforceForecastProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
  selectedType?: string;
}

export default function WorkforceForecast({ selectedType: initialSelectedType = 'Framing' }: WorkforceForecastProps) {
  const [rawProjects, setRawProjects] = useState<WorkforceProject[]>([]);
  const [workforceProjects, setWorkforceProjects] = useState<WorkforceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>('start');
  const [selectedType, setSelectedType] = useState<string>(initialSelectedType);

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

  // Mapeamento de ícones das empresas
  const empresaIcones: { [empresa: string]: string } = {
    'Framing': sublogoFraming,
  };
  
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
  const [filterNotStarted, setFilterNotStarted] = useState<boolean>(false);

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

  // Sincronizar selectedType se prop mudar
  useEffect(() => {
    if (initialSelectedType) {
      setSelectedType(initialSelectedType);
    }
  }, [initialSelectedType]);

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
      const enrichedProjects: WorkforceProject[] = projectsData.map((project: any) => ({
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

  // Lista de projetos visíveis de acordo com filtros selecionados (mesma lógica do mobile)
  const visibleProjects = useMemo(() => {
    if (!workforceProjects.length) return [] as typeof workforceProjects;

    const selectedClientSet = new Set(selectedClient.map(c => c.trim().toLowerCase()))
    const selectedJobSiteSet = new Set(selectedJobSite.map(j => j.trim().toLowerCase()))

    return workforceProjects.filter(project => {
      // Quando filterNotStarted está ativo, filtramos apenas 'open'
      if (filterNotStarted) {
        const s = (project.status || '').toLowerCase().trim();
        if (s !== 'open') return false;
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
      filterNotStarted, dateMode]);

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
    <div id="content" style={{ 
      height: '100%', 
      minHeight: '100%', 
      overflow: 'hidden', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--color-background-primary)'
    }}>
      {/* Barra superior com título e filtros */}
      <header style={{ 
        padding: '20px 32px', 
        borderBottom: '1px solid var(--color-border-divider)', 
        background: 'var(--color-background-secondary)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        zIndex: 101
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h1 style={{ 
            color: 'var(--color-text-primary)', 
            fontSize: 28, 
            fontWeight: 800, 
            marginBottom: 0, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 20 
          }}>
            <div style={{
              background: 'white',
              padding: '8px',
              borderRadius: '14px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0,0,0,0.05)'
            }}>
              <img 
                src={empresaIcones[selectedType] || sublogoFraming} 
                alt={selectedType} 
                style={{ width: 36, height: 36, objectFit: 'contain' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent-primary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '2px' }}>
                Forecast System
              </span>
              <span style={{ lineHeight: 1 }}>
                {selectedType}
              </span>
            </div>
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              background: 'rgba(var(--color-accent-primary-rgb), 0.05)',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-accent-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="bi bi-clock-history" />
              Atualizado em Tempo Real
            </div>
            
            <button 
              onClick={fetchWorkforceData}
              style={{
                background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: '10px',
                padding: '10px 16px',
                color: 'var(--color-text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                e.currentTarget.style.transform = 'rotate(15deg)';
                setTimeout(() => e.currentTarget.style.transform = 'rotate(0deg)', 200);
              }}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}
            >
              <i className="bi bi-arrow-clockwise" />
              Atualizar
            </button>
          </div>
        </div>
        
        {/* Filtros */}
        <ForecastFilters
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          selectedClient={selectedClient}
          selectedJobSite={selectedJobSite}
          selectedType={selectedProjectType}
          selectedFieldwire={selectedFieldwire}
          selectedBuildertrend={selectedBuildertrend}
          selectedMachines={selectedMachines}
          selectedContractSteps={selectedContractSteps}
          selectedWorkforce={selectedWorkforce}
          selectedQBTime={selectedQBTime}
          filterNotStarted={filterNotStarted}
          years={years}
          months={months}
          clients={clients}
          jobSites={jobSites}
          availableTypes={availableTypes}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
          onClientChange={setSelectedClient}
          onJobSiteChange={setSelectedJobSite}
          onTypeChange={setSelectedProjectType}
          onFieldwireChange={setSelectedFieldwire}
          onBuildertrendChange={setSelectedBuildertrend}
          onMachinesChange={setSelectedMachines}
          onContractStepsChange={setSelectedContractSteps}
          onWorkforceChange={setSelectedWorkforce}
          onQBTimeChange={setSelectedQBTime}
          onFilterNotStartedChange={setFilterNotStarted}
        />
      </header>

      {/* Conteúdo principal com scroll */}
      <main style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        background: 'var(--color-background-primary)'
      }}>
        {/* Métricas */}
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
        
        {/* Timeline Planner */}
        <div style={{
          background: 'var(--color-background-secondary)',
          borderRadius: '24px',
          border: '1px solid var(--color-border-divider)',
          padding: '32px',
          flex: 1,
          minHeight: '700px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decoração sutil no fundo */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, var(--color-accent-primary), transparent)'
          }} />

          <TimelinePlanner 
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
            filterNotStarted={filterNotStarted}
          />
        </div>
      </main>
    </div>
  );
}
