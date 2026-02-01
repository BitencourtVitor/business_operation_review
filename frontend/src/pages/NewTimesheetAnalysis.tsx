import { useState, useMemo, useEffect } from 'react';
import { useJobCostingData } from '../hooks/useJobCostingData';
import { supabase } from '../supabaseClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import dayjs from 'dayjs';

// Modal imports
import DestaqueModal from '../components/modals/DestaqueModal';
import OportunidadeModal from '../components/modals/OportunidadeModal';
import PlanoAcaoModal from '../components/modals/PlanoAcaoModal';
import DestaqueViewModal from '../components/modals/DestaqueViewModal';
import OportunidadeViewModal from '../components/modals/OportunidadeViewModal';
import PlanoAcaoViewModal from '../components/modals/PlanoAcaoViewModal';

// Partition imports
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';

// Filter component
import JobCostingFilters from '../components/common/JobCosting/JobCostingFilters';

// Types
import type { PlanoAcao } from '../types/planoAcao';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Interfaces for partition data (local to match TimesheetAnalysis)
interface Destaque {
  id: string;
  usuario_id: string;
  tela_id: string;
  mes: string;
  ano: string;
  criado_em: string;
  positivos: string[];
  negativos: string[];
}

interface Oportunidade {
  id: string;
  usuario_id: string;
  tela_id: string;
  mes: string;
  ano: string;
  titulo: string;
  criado_em: string;
  desafios: string[];
  melhorias: string[];
}

interface NewTimesheetAnalysisProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function NewTimesheetAnalysis({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: NewTimesheetAnalysisProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);

  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedJobsites, setSelectedJobsites] = useState<string[]>([]);
  const [selectedWorktypes, setSelectedWorktypes] = useState<string[]>([]);

  // Filter options states
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [jobsites, setJobsites] = useState<string[]>([]);
  const [worktypesList, setWorktypesList] = useState<string[]>([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano'>('destaque');
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { data, loading, error } = useJobCostingData();

  // Resolved theme colors for Chart.js
  const [themeColors, setThemeColors] = useState({
    textSecondary: '#666',
    borderDivider: 'rgba(255, 255, 255, 0.1)',
    backgroundSecondary: '#fff',
    isDark: false
  });

  useEffect(() => {
    const updateColors = () => {
      const style = getComputedStyle(document.documentElement);
      const isDark = document.documentElement.classList.contains('dark');
      setThemeColors({
        textSecondary: style.getPropertyValue('--color-text-secondary').trim() || '#666',
        borderDivider: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        backgroundSecondary: style.getPropertyValue('--color-background-secondary').trim() || '#fff',
        isDark
      });
    };
    
    updateColors();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateColors();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Sync telaId
  useEffect(() => {
    setTelaId(telaIdFromProps);
  }, [telaIdFromProps]);

  // Fetch permissions and responsible users (matching TimesheetAnalysis logic)
  useEffect(() => {
    const fetchResponsavelData = async () => {
      if (!telaId) return;

      const { data: usuariosTelas, error: usuariosTelasError } = await supabase
        .from('usuarios_telas')
        .select('usuario_id')
        .eq('tela_id', telaId);

      if (usuariosTelasError) {
        console.error('Erro ao buscar usuarios_telas:', usuariosTelasError);
        return;
      }

      if (usuariosTelas && usuariosTelas.length > 0) {
        const responsaveisIds = usuariosTelas.map(ut => ut.usuario_id);
        const responsavelPrincipalId = responsaveisIds[0];
        setUsuarioResponsavelId(responsavelPrincipalId);

        if (role === 'dev' || role === 'manager' || role === 'gestor') {
          setPodeEditar(true);
        } else if (isResponsavelPelaTela) {
          setPodeEditar(true);
        } else {
          setPodeEditar(false);
        }

        const usuariosParaBuscarArray = [...responsaveisIds];
        if ((role === 'dev' || role === 'manager' || role === 'gestor') && !usuariosParaBuscarArray.includes(usuarioId)) {
          usuariosParaBuscarArray.push(usuarioId);
        }
        setUsuariosParaBuscar(usuariosParaBuscarArray);
      } else {
        // Fallback case: no one assigned to the screen yet
        setUsuarioResponsavelId(usuarioId);
        setPodeEditar(role === 'dev' || role === 'manager' || role === 'gestor' || isResponsavelPelaTela);
        setUsuariosParaBuscar([usuarioId]);
      }
    };

    fetchResponsavelData();
  }, [telaId, usuarioId, role, isResponsavelPelaTela]);

  // Initialize filter options
  useEffect(() => {
    if (data.length > 0) {
      const uniqueYears = [...new Set(data.map(d => d.reference_month.split('-')[0]))].sort((a, b) => b.localeCompare(a));
      const uniqueClients = [...new Set(data.map(d => d.client))].filter(Boolean).sort();
      const uniqueJobsites = [...new Set(data.map(d => d.jobsite))].filter(Boolean).sort();
      const uniqueWorktypes = [...new Set(data.map(d => d.worktype || 'Unspecified'))].filter(Boolean).sort();

      setYears(uniqueYears);
      setClients(uniqueClients);
      setJobsites(uniqueJobsites);
      setWorktypesList(uniqueWorktypes);

      // Default year to "Todos" (empty string)
      setSelectedYear('');
    }
  }, [data]);

  // Update available months when year changes
  useEffect(() => {
    if (!selectedYear) {
      setMonths([]);
      return;
    }
    const availableMonths = [...new Set(
      data
        .filter(d => d.reference_month.startsWith(selectedYear + '-'))
        .map(d => d.reference_month.split('-')[1])
    )].sort();
    setMonths(availableMonths);
  }, [selectedYear, data]);

  // Filtered data memo
  const filteredData = useMemo(() => {
    let filtered = data;
    if (selectedYear) filtered = filtered.filter(d => d.reference_month.startsWith(selectedYear + '-'));
    if (selectedMonth) filtered = filtered.filter(d => d.reference_month.endsWith('-' + selectedMonth));
    if (selectedClients.length > 0) filtered = filtered.filter(d => selectedClients.includes(d.client));
    if (selectedJobsites.length > 0) filtered = filtered.filter(d => selectedJobsites.includes(d.jobsite));
    if (selectedWorktypes.length > 0) filtered = filtered.filter(d => selectedWorktypes.includes(d.worktype || 'Unspecified'));
    return filtered;
  }, [data, selectedYear, selectedMonth, selectedClients, selectedJobsites, selectedWorktypes]);

  // Process data for charts based on filteredData
  const globalMonthlyData = useMemo(() => {
    if (!filteredData.length) return [];

    const monthlyMap = new Map<string, { totalHours: number; employees: Set<string> }>();

    filteredData.forEach(row => {
      const month = row.reference_month;
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { totalHours: 0, employees: new Set() });
      }
      const current = monthlyMap.get(month)!;
      current.totalHours += row.regular_hours;
      current.employees.add(row.employee_name);
    });

    return Array.from(monthlyMap.entries())
      .map(([month, stats]) => ({
        month,
        totalHours: Number(stats.totalHours.toFixed(2)),
        employeeCount: stats.employees.size,
        hoursPerEmployee: stats.employees.size > 0 ? Number((stats.totalHours / stats.employees.size).toFixed(2)) : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredData]);

  // Handle partition save
  const handleSave = async () => {
    setRefreshTrigger(prevTrigger => prevTrigger + 1);
  };

  // Determine if we are in a single project view
  const isSingleProject = selectedJobsites.length === 1;
  const activeProject = isSingleProject ? selectedJobsites[0] : null;

  // Data for single project view
  const projectData = useMemo(() => {
    if (!activeProject || !filteredData.length) return [];

    const monthlyMap = new Map<string, { 
      totalHours: number; 
      employees: Set<string>;
      worktypes: Map<string, number>;
    }>();

    filteredData.forEach(row => {
      const month = row.reference_month;
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { 
          totalHours: 0, 
          employees: new Set(),
          worktypes: new Map()
        });
      }
      const current = monthlyMap.get(month)!;
      current.totalHours += row.regular_hours;
      current.employees.add(row.employee_name);
      
      const wt = row.worktype || 'Unspecified';
      current.worktypes.set(wt, (current.worktypes.get(wt) || 0) + row.regular_hours);
    });

    return Array.from(monthlyMap.entries())
      .map(([month, stats]) => ({
        month,
        totalHours: Number(stats.totalHours.toFixed(2)),
        employeeCount: stats.employees.size,
        hoursPerEmployee: stats.employees.size > 0 ? Number((stats.totalHours / stats.employees.size).toFixed(2)) : 0,
        worktypes: Object.fromEntries(stats.worktypes) as Record<string, number>
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredData, activeProject]);

  // Unique worktypes for the single project
  const worktypes = useMemo(() => {
    if (!activeProject) return [];
    return Array.from(new Set(filteredData.map(row => row.worktype || 'Unspecified'))).sort();
  }, [filteredData, activeProject]);

  // Cores para worktypes
  const colors = [
    'rgb(46, 107, 230)',
    'rgb(16, 185, 129)',
    'rgb(245, 158, 11)',
    'rgb(239, 68, 68)',
    'rgb(139, 92, 246)',
    'rgb(236, 72, 153)',
    'rgb(20, 184, 166)',
  ];

  // Process data for worktype proportion
  const worktypeProportionData = useMemo(() => {
    if (!filteredData.length) return { labels: [], datasets: [] };

    const wtMap = new Map<string, number>();
    filteredData.forEach(row => {
      const wt = row.worktype || 'Unspecified';
      wtMap.set(wt, (wtMap.get(wt) || 0) + row.regular_hours);
    });

    const sortedEntries = Array.from(wtMap.entries()).sort((a, b) => b[1] - a[1]);
    
    return {
      labels: sortedEntries.map(e => e[0]),
      datasets: [{
        data: sortedEntries.map(e => Number(e[1].toFixed(2))),
        backgroundColor: colors.slice(0, sortedEntries.length),
        borderColor: themeColors.backgroundSecondary,
        borderWidth: 2,
      }]
    };
  }, [filteredData, themeColors]);

  if (loading || !telaId) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
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
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>Carregando...</p>
        {!telaId && <p style={{ marginTop: '8px', fontSize: '12px' }}>Aguardando ID da tela...</p>}
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">Error loading data: {error}</div>;
  }

  const chartOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: themeColors.isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: themeColors.isDark ? '#fff' : '#000',
        bodyColor: themeColors.isDark ? '#fff' : '#000',
        borderColor: themeColors.borderDivider,
        borderWidth: 1,
        padding: 10,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13 },
      },
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: themeColors.borderDivider,
          drawTicks: false,
        },
        ticks: {
          color: themeColors.textSecondary,
          maxRotation: 45,
          minRotation: 45,
          font: { size: 11 },
          padding: 10,
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          display: true,
          color: themeColors.borderDivider,
          drawTicks: false,
        },
        ticks: {
          color: themeColors.textSecondary,
          font: { size: 11 },
          padding: 10,
          callback: (value) => value.toLocaleString('pt-BR')
        }
      }
    }
  };

  // Simple custom plugin for data labels
  const datalabelsPlugin = {
    id: 'datalabels',
    afterDatasetsDraw(chart: any) {
      const { ctx, data } = chart;
      ctx.save();
      data.datasets.forEach((dataset: any, i: number) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.type === 'bar') {
          meta.data.forEach((bar: any, index: number) => {
            const value = dataset.data[index];
            if (value !== null && value !== undefined) {
              const x = bar.x;
              const y = bar.y - 8;
              ctx.fillStyle = themeColors.textSecondary;
              ctx.font = 'bold 10px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(value.toLocaleString('pt-BR'), x, y);
            }
          });
        }
      });
      ctx.restore();
    }
  };

  const ChartCard = ({ title, legendLabel, legendColor, legendType = 'bar', children, style = {} }: { 
    title: string, 
    legendLabel?: string, 
    legendColor?: string, 
    legendType?: 'bar' | 'line',
    children: React.ReactNode,
    style?: React.CSSProperties
  }) => (
    <div className="h-100 d-flex flex-column" style={{ 
      background: 'var(--color-background-primary)', 
      border: '1px solid var(--color-border-divider)', 
      borderRadius: '0px',
      ...style
    }}>
      <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ 
        color: 'var(--color-text-secondary)', 
        fontSize: 18, 
        fontWeight: 400, 
        minHeight: 30
      }}>
        {title}
      </h4>
      <div className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
        {legendLabel && legendColor && (
          <div className="ms-4" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <div style={{ 
              width: legendType === 'bar' ? 24 : 16, 
              height: 8, 
              backgroundColor: legendType === 'bar' ? legendColor.replace('rgb', 'rgba').replace(')', ', 0.8)') : 'transparent',
              border: legendType === 'bar' ? 'none' : `2px solid ${legendColor}`,
              borderRadius: legendType === 'bar' ? 4 : '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {legendType === 'line' && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: legendColor }} />
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{legendLabel}</span>
          </div>
        )}
        <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );

  const totalHoursChartData = {
    labels: globalMonthlyData.map(d => dayjs(d.month).format('MMM YYYY')),
    datasets: [
      {
        label: 'Total Hours',
        data: globalMonthlyData.map(d => d.totalHours),
        backgroundColor: 'rgba(46, 107, 230, 0.8)',
        borderColor: 'rgb(46, 107, 230)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  };

  const employeesChartData = {
    labels: globalMonthlyData.map(d => dayjs(d.month).format('MMM YYYY')),
    datasets: [
      {
        label: 'Employee Count',
        data: globalMonthlyData.map(d => d.employeeCount),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  };

  const hoursPerEmployeeChartData = {
    labels: globalMonthlyData.map(d => dayjs(d.month).format('MMM YYYY')),
    datasets: [
      {
        label: 'Hours per Employee',
        data: globalMonthlyData.map(d => d.hoursPerEmployee),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: 'rgb(245, 158, 11)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  };

  const projectComparisonChartData = {
    labels: projectData.map(d => dayjs(d.month).format('MMM YYYY')),
    datasets: [
      {
        label: 'Total Hours',
        data: projectData.map(d => d.totalHours),
        borderColor: 'rgba(0, 0, 0, 0.8)',
        borderWidth: 3,
        borderDash: [5, 5],
        tension: 0.1,
      },
      ...worktypes.map((wt, idx) => ({
        label: wt,
        data: projectData.map(d => d.worktypes[wt] || 0),
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length],
        tension: 0.1,
      }))
    ]
  };

  return (
    <div id="content" style={{ height: 'calc(100vh - 65px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', flex: '0 0 auto' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>New Timesheet Analysis</h1>
        <JobCostingFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedClients={selectedClients}
          setSelectedClients={setSelectedClients}
          selectedJobsites={selectedJobsites}
          setSelectedJobsites={setSelectedJobsites}
          selectedWorktypes={selectedWorktypes}
          setSelectedWorktypes={setSelectedWorktypes}
          years={years}
          months={months}
          clients={clients}
          jobsites={jobsites}
          worktypes={worktypesList}
        />
      </div>

      {/* Conteúdo principal: gráfico à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ width: '70%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)', padding: 0 }}>
          
          {!activeProject ? (
            <div className="row g-0" style={{ width: '100%', margin: 0 }}>
              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title="Total Hours per Month" 
                  legendLabel="Total Hours" 
                  legendColor="rgb(46, 107, 230)"
                  legendType="bar"
                  style={{ borderTop: 0, borderLeft: 0 }}
                >
                  <Bar data={totalHoursChartData} options={chartOptions} plugins={[datalabelsPlugin]} />
                </ChartCard>
              </div>
              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title="Employees per Month" 
                  legendLabel="Employee Count" 
                  legendColor="rgb(16, 185, 129)"
                  legendType="bar"
                  style={{ borderTop: 0, borderLeft: 0, borderRight: 0 }}
                >
                  <Bar data={employeesChartData} options={chartOptions} plugins={[datalabelsPlugin]} />
                </ChartCard>
              </div>
              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title="Total Hours per Employee" 
                  legendLabel="Hours per Employee" 
                  legendColor="rgb(245, 158, 11)"
                  legendType="line"
                  style={{ borderTop: 0, borderLeft: 0, borderBottom: 0 }}
                >
                  <Line data={hoursPerEmployeeChartData} options={chartOptions} />
                </ChartCard>
              </div>
              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title="Work Type Proportion"
                  style={{ borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
                >
                  <div style={{ height: '100%', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Pie 
                      data={worktypeProportionData} 
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                              boxWidth: 10,
                              font: { size: 9 },
                              color: themeColors.textSecondary,
                              padding: 10
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                </ChartCard>
              </div>
            </div>
          ) : (
            <div className="row g-0" style={{ width: '100%', margin: 0 }}>
              <div className="col-8" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title={`Hours: Total vs Worktype - ${activeProject}`}
                  style={{ borderTop: 0, borderLeft: 0 }}
                >
                  <Line 
                    data={{
                      ...projectComparisonChartData,
                      datasets: projectComparisonChartData.datasets.map(ds => ({
                        ...ds,
                        borderWidth: ds.label === 'Total Hours' ? 3 : 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3
                      }))
                    }} 
                    options={chartOptions} 
                  />
                  <div className="d-flex flex-wrap justify-content-center gap-3 mt-2">
                    {projectComparisonChartData.datasets.map((ds, idx) => (
                      <div key={idx} className="d-flex align-items-center gap-2">
                        <div style={{ 
                          width: 15, 
                          height: 8, 
                          backgroundColor: ds.backgroundColor as string,
                          border: ds.borderDash ? '2px dashed #666' : `2px solid ${ds.borderColor}`,
                          borderRadius: 4
                        }} />
                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{ds.label}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>

              <div className="col-4" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title="Work Type Proportion"
                  style={{ borderTop: 0, borderLeft: 0, borderRight: 0 }}
                >
                  <div style={{ height: '100%', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Pie 
                      data={worktypeProportionData} 
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                              boxWidth: 10,
                              font: { size: 9 },
                              color: themeColors.textSecondary,
                              padding: 10
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                </ChartCard>
              </div>

              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title={`Hours per Employee`}
                  legendLabel="Hours per Employee"
                  legendColor="rgb(245, 158, 11)"
                  legendType="line"
                  style={{ borderTop: 0, borderLeft: 0, borderBottom: 0 }}
                >
                  <Line 
                    data={{
                      labels: projectData.map(d => dayjs(d.month).format('MMM YYYY')),
                      datasets: [{
                        label: 'Hours per Employee',
                        data: projectData.map(d => d.hoursPerEmployee),
                        borderColor: 'rgb(245, 158, 11)',
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: 'rgb(245, 158, 11)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                      }]
                    }} 
                    options={chartOptions} 
                  />
                </ChartCard>
              </div>
              <div className="col-6" style={{ height: '400px', padding: 0 }}>
                <ChartCard 
                  title={`Employee Count`}
                  legendLabel="Employees"
                  legendColor="rgb(16, 185, 129)"
                  legendType="bar"
                  style={{ borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
                >
                  <Bar 
                    data={{
                      labels: projectData.map(d => dayjs(d.month).format('MMM YYYY')),
                      datasets: [{
                        label: 'Employees',
                        data: projectData.map(d => d.employeeCount),
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: 'rgb(16, 185, 129)',
                        borderWidth: 1,
                        borderRadius: 4,
                        borderSkipped: false,
                      }]
                    }} 
                    options={chartOptions} 
                    plugins={[datalabelsPlugin]}
                  />
                </ChartCard>
              </div>
            </div>
          )}
        </div>

        <div id="individual_data" style={{ width: '30%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
          {/* Partições */}
          <DestaquesPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            isAdmin={podeEditar}
            usuarioLogadoId={usuarioId}
            onEdit={async (mes, ano, uId) => {
              setModalType('destaque');
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes.toString() : (selectedMonth || '');
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano.toString() : (selectedYear || '');
              const targetUserId = uId || (usuariosParaBuscar.length > 0 ? usuariosParaBuscar[0] : usuarioId);
              
              if (!mesRef || !anoRef || !targetUserId) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              
              const { data: destaques } = await supabase
                .from('destaques')
                .select('*')
                .eq('tela_id', telaId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef))
                .eq('usuario_id', targetUserId);
              
              if (destaques && destaques.length > 0) {
                const destaque = destaques[0];
                const { data: positivos } = await supabase.from('destaques_positivos').select('*').eq('destaque_id', destaque.id);
                const { data: negativos } = await supabase.from('destaques_negativos').select('*').eq('destaque_id', destaque.id);
                setModalData({
                  ...destaque,
                  mes: destaque.mes.toString(),
                  ano: destaque.ano.toString(),
                  positivos: (positivos || []).map((p: any) => p.texto),
                  negativos: (negativos || []).map((n: any) => n.texto),
                });
              } else {
                setModalData({
                  id: '',
                  usuario_id: targetUserId,
                  tela_id: telaId,
                  mes: mesRef,
                  ano: anoRef,
                  criado_em: new Date().toISOString(),
                  positivos: [],
                  negativos: [],
                });
              }
              setModalOpen(true);
            }}
            onView={async (destaque) => {
              setModalType('destaque');
              setModalData(destaque);
              setViewModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
          <OportunidadesPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            selectedYear={selectedYear ? Number(selectedYear) : undefined}
            selectedMonth={selectedMonth ? Number(selectedMonth) : undefined}
            isAdmin={podeEditar}
            usuarioLogadoId={usuarioId}
            onEdit={async (mes, ano, uId) => {
              setModalType('oportunidade');
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes.toString() : (selectedMonth || '');
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano.toString() : (selectedYear || '');
              const targetUserId = uId || (usuariosParaBuscar.length > 0 ? usuariosParaBuscar[0] : usuarioId);
              
              if (!mesRef || !anoRef || !targetUserId) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              
              const { data: oportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('tela_id', telaId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef))
                .eq('usuario_id', targetUserId);
              
              if (oportunidades && oportunidades.length > 0) {
                const oportunidade = oportunidades[0];
                const { data: desafios } = await supabase.from('desafios').select('*').eq('oportunidade_id', oportunidade.id);
                const { data: melhorias } = await supabase.from('melhorias').select('*').eq('oportunidade_id', oportunidade.id);
                setModalData({
                  ...oportunidade,
                  mes: oportunidade.mes.toString(),
                  ano: oportunidade.ano.toString(),
                  desafios: (desafios || []).map((d: any) => d.texto),
                  melhorias: (melhorias || []).map((m: any) => m.texto),
                });
              } else {
                setModalData({
                  id: '',
                  usuario_id: targetUserId,
                  tela_id: telaId,
                  mes: mesRef.toString(),
                  ano: anoRef.toString(),
                  titulo: '',
                  criado_em: new Date().toISOString(),
                  desafios: [],
                  melhorias: [],
                });
              }
              setModalOpen(true);
            }}
          onView={async (oportunidade) => {
            setModalType('oportunidade');
            
            // Buscar todas as oportunidades do período para permitir navegação
            const { data: todasOportunidades } = await supabase
              .from('oportunidades')
              .select('*')
              .eq('usuario_id', oportunidade.usuario_id)
              .eq('tela_id', telaId)
              .eq('mes', Number(oportunidade.mes))
              .eq('ano', Number(oportunidade.ano));
            
            if (todasOportunidades && todasOportunidades.length > 0) {
              const opIds = todasOportunidades.map(op => op.id);
              
              // Buscar desafios e melhorias apenas para as oportunidades do período
              const { data: todosDesafios } = await supabase
                .from('desafios')
                .select('*')
                .in('oportunidade_id', opIds);
              
              const { data: todasMelhorias } = await supabase
                .from('melhorias')
                .select('*')
                .in('oportunidade_id', opIds);
              
              const oportunidadesCompletas = todasOportunidades.map(op => ({
                ...op,
                mes: op.mes.toString(),
                ano: op.ano.toString(),
                desafios: (todosDesafios || []).filter((d: any) => d.oportunidade_id === op.id).map((d: any) => d.texto),
                melhorias: (todasMelhorias || []).filter((m: any) => m.oportunidade_id === op.id).map((m: any) => m.texto),
              }));
              
              const currentIndex = oportunidadesCompletas.findIndex(op => op.id === oportunidade.id);
              setModalData({
                ...oportunidade,
                oportunidadesList: oportunidadesCompletas,
                initialIndex: currentIndex >= 0 ? currentIndex : 0
              } as any);
            } else {
              setModalData(oportunidade);
            }
            setViewModalOpen(true);
          }}
            refreshTrigger={refreshTrigger}
          />
          <PlanoAcaoPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            isAdmin={podeEditar}
            onEdit={async (plano) => {
              setModalType('plano');
              // Buscar ações do plano específico
              const { data: acoes } = await supabase
                .from('acoes')
                .select('*')
                .eq('plano_id', plano.id);
              
              setModalData({
                ...plano,
                tela_id: telaId,
                acoes: (acoes || []).map((acao: any) => ({
                  ...acao,
                  responsaveis: acao.responsaveis || [acao.responsavel]
                })),
              } as any);
              setModalOpen(true);
            }}
            onView={async (plano) => {
              setModalType('plano');
              // Buscar ações do plano específico
              const { data: acoes } = await supabase
                .from('acoes')
                .select('*')
                .eq('plano_id', plano.id);
              
              setModalData({
                ...plano,
                acoes: (acoes || []).map((acao: any) => ({
                  ...acao,
                  responsaveis: acao.responsaveis || [acao.responsavel]
                })),
              } as any);
              setViewModalOpen(true);
            }}
            onAdd={() => {
              setModalType('plano');
              setModalData({
                id: '',
                usuario_id: usuarioId,
                tela_id: telaId,
                titulo: '',
                descricao: '',
                status: 'Pending',
                prioridade: 'Medium',
                criado_em: new Date().toISOString(),
                data_inicio: dayjs().format('YYYY-MM-DD'),
                data_fim: null,
                deletado: false,
                acoes: []
              } as any);
              setModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Modais */}
      {modalOpen && modalType === 'destaque' && modalData && (
        <DestaqueModal
          key={`destaque-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={handleSave}
          data={modalData as Destaque}
          usuarioId={usuarioId}
        />
      )}
      {modalOpen && modalType === 'oportunidade' && modalData && (
        <OportunidadeModal
          key={`oportunidade-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={handleSave}
          data={modalData as Oportunidade}
          anoSelecionado={selectedYear?.toString()}
          mesSelecionado={selectedMonth?.toString()}
          usuarioId={usuarioId}
        />
      )}
      {modalOpen && modalType === 'plano' && modalData && (
        <PlanoAcaoModal
          key={`plano-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={handleSave}
          data={modalData as PlanoAcao}
        />
      )}
      {viewModalOpen && modalType === 'destaque' && modalData && (
        <DestaqueViewModal
          key={`destaque-view-${modalData.id}`}
          visible={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as Destaque}
        />
      )}
      {viewModalOpen && modalType === 'oportunidade' && modalData && (
        <OportunidadeViewModal
          key={`oportunidade-view-${modalData.id}`}
          show={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as any}
        />
      )}
      {viewModalOpen && modalType === 'plano' && modalData && (
        <PlanoAcaoViewModal
          key={`plano-view-${modalData.id}`}
          show={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as PlanoAcao}
        />
      )}
    </div>
  );
}
