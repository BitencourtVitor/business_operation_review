import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

// Componentes modulares
import ForecastFilters from '../components/common/Forecast/ForecastFilters';
import ForecastMetrics from '../components/common/Forecast/ForecastMetrics';
import TimelinePlanner from '../components/common/Forecast/TimelinePlanner';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';

interface WorkforceProject {
  id: number;
  cliente: string;
  job_site: string;
  lote_building: number;
  workforce: string;
  previous_start_date: string;
  previous_end_date: string;
  observacoes: string;
  created_at: string;
  updated_at: string;
}

interface ForecastData {
  cliente: string;
  job_site: string;
  month: string;
  year: number;
  projectCount: number;
  startDate: string;
  endDate: string;
}

interface WorkforceForecastProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
  selectedType?: string;
}

export default function WorkforceForecast({ selectedType = 'Framing' }: WorkforceForecastProps) {
  const [workforceProjects, setWorkforceProjects] = useState<WorkforceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mapeamento de ícones das empresas
  const empresaIcones: { [empresa: string]: string } = {
    'Framing': sublogoFraming,
  };
  
  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string[]>([]);
  const [selectedJobSite, setSelectedJobSite] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'cliente' | 'job_site'>('cliente');
  const [sortByDate, setSortByDate] = useState<'off' | 'asc' | 'desc' | null>(null);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [jobSites, setJobSites] = useState<string[]>([]);

  // Buscar dados do workforce
  useEffect(() => {
    const fetchWorkforceData = async () => {
      try {
        setLoading(true);
        
        // Buscar projetos
        const { data: projectsData, error: projectsError } = await supabase
          .from('workforce_projects')
          .select('*')
          .order('previous_start_date', { ascending: true });

        if (projectsError) throw projectsError;

        // Buscar grupos (mantido para futuras funcionalidades)
        const { error: groupsError } = await supabase
          .from('workforce_groups')
          .select('*')
          .order('grupo', { ascending: true });

        if (groupsError) throw groupsError;

        setWorkforceProjects(projectsData || []);

        // Extrair anos únicos
        const uniqueYears = [...new Set((projectsData || [])
          .map(p => new Date(p.previous_start_date).getFullYear().toString())
          .filter(year => year !== 'NaN'))].sort((a, b) => b.localeCompare(a));
        setYears(uniqueYears);

        // Extrair meses únicos
        const uniqueMonths = [...new Set((projectsData || [])
          .map(p => new Date(p.previous_start_date).toLocaleString('en-US', { month: 'long' }))
          .filter(month => month))].sort();
        setMonths(uniqueMonths);

        // Extrair clientes únicos
        const uniqueClients = [...new Set((projectsData || [])
          .map(p => p.cliente)
          .filter(cliente => cliente))].sort();
        setClients(uniqueClients);

        // Extrair job sites únicos
        const uniqueJobSites = [...new Set((projectsData || [])
          .map(p => p.job_site)
          .filter(jobSite => jobSite))].sort();
        setJobSites(uniqueJobSites);

      } catch (err) {
        console.error('Erro ao buscar dados do workforce:', err);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkforceData();
  }, []);

  // Processar dados para o forecast
  const forecastData = useMemo(() => {
    if (!workforceProjects.length) return [];

    const filteredProjects = workforceProjects.filter(project => {
      const projectYear = new Date(project.previous_start_date).getFullYear().toString();
      const projectMonth = new Date(project.previous_start_date).toLocaleString('en-US', { month: 'long' });
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;
      const clientMatch = selectedClient.length === 0 || selectedClient.includes(project.cliente);
      const jobSiteMatch = selectedJobSite.length === 0 || selectedJobSite.includes(project.job_site);

      return yearMatch && monthMatch && clientMatch && jobSiteMatch;
    });

    // Agrupar por cliente, job_site e mês
    const groupedData: { [key: string]: ForecastData } = {};

    filteredProjects.forEach(project => {
      const startDate = new Date(project.previous_start_date);
      const month = startDate.toLocaleString('en-US', { month: 'long' });
      const year = startDate.getFullYear();
      
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
  }, [workforceProjects, selectedYear, selectedMonth, selectedClient, selectedJobSite]);

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
      
      periodStart = minStartDate.toLocaleDateString('en-US');
      periodEnd = maxEndDate.toLocaleDateString('en-US');
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
          <span className="visually-hidden">Carregando...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)'
        }}>
          Carregando dados de Forecast...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        Erro ao carregar dados: {error}
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src={empresaIcones[selectedType] || ''} 
            alt={selectedType} 
            style={{ 
              width: 24, 
              height: 24, 
              objectFit: 'contain'
            }}
          />
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {selectedType}
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
            Forecast
          </span>
        </h1>
        
        {/* Filtros */}
        <ForecastFilters
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          selectedClient={selectedClient}
          selectedJobSite={selectedJobSite}
          years={years}
          months={months}
          clients={clients}
          jobSites={jobSites}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
          onClientChange={setSelectedClient}
          onJobSiteChange={setSelectedJobSite}
        />
      </div>

      {/* Conteúdo principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, minWidth: 0 }}>
        {/* Métricas */}
        <ForecastMetrics stats={stats} />
        
        {/* Timeline Planner */}
        <TimelinePlanner 
          forecastData={forecastData}
          workforceProjects={workforceProjects}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          sortByDate={sortByDate}
          onSortByDateChange={setSortByDate}
        />
      </div>
    </div>
  );
}