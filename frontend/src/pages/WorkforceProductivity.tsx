import { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useWorkforceProductivityData } from '../hooks/useWorkforceProductivityData';
import { supabase } from '../supabaseClient';
import type { WorkforceProject } from '../components/common/Forecast/types';
import { normalizeLotBuilding, normalizeJobSite } from '../utils/dataUtils';
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
import { Line, Bar, Pie } from 'react-chartjs-2';
import dayjs from 'dayjs';

// Filter component
import WorkforceProductivityFilters from '../components/common/WorkforceProductivity/WorkforceProductivityFilters';
import MultiSelectDropdown from '../components/common/MultiSelectDropdown';

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

interface WorkforceProductivityProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

const getWorktype = (row: any) => {
  if (row.worktype) return row.worktype;
  
  const hasJobsite = !!row.jobsite;
  const hasLotBuilding = !!row.lot_building;
  
  // Rule: If both jobsite and lot_building are missing, use Client as worktype
  if (!hasJobsite && !hasLotBuilding) {
    return row.client || 'Unknown Client';
  }
  
  // If we have jobsite/lot but no worktype, it's Normal Labor
  return 'Normal Labor';
};

const getJobsiteLabel = (row: any) => {
  const jobsiteName = row.jobsite;
  const lot_building = row.lot_building;
  const worktype = row.worktype;
  const company = row.company;
  const clientName = row.client || 'Unknown Client';

  // Rule: For specific jobsites, if both lot_building and worktype are missing, use Jobsite - Name format
  if (!lot_building && !worktype) {
    // Canton logic
    if (jobsiteName === 'Canton, Coppersmith') {
      return `Jobsite - ${jobsiteName}`;
    }

    // Baldwinville logic - Only for Framing company
    if (
      (jobsiteName === 'Baldwinville Scholl' || jobsiteName === 'Baldwinville School Apartments') &&
      company === 'Framing'
    ) {
      return `Jobsite - ${jobsiteName}`;
    }
  }

  // Rule: If both jobsite and lot_building are missing, use Client Name
  if (!jobsiteName && !lot_building) {
    return clientName;
  }
  
  // Otherwise, use Jobsite - Lot format
  const displayName = jobsiteName || 'Unspecified';
  const displayLot = lot_building ? ` - ${lot_building}` : '';
  return `${displayName}${displayLot}`.trim();
};

const ChartCard = ({ title, legendLabel, legendColor, legendType = 'bar', children, style = {}, isEmpty = false }: { 
  title: string, 
  legendLabel?: string, 
  legendColor?: string, 
  legendType?: 'bar' | 'line',
  children: React.ReactNode,
  style?: React.CSSProperties,
  isEmpty?: boolean
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
      {!isEmpty && legendLabel && legendColor && (
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
      <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {isEmpty ? (
          <div style={{ 
            position: 'absolute', 
            top: 0, left: 0, right: 0, bottom: 0, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            opacity: 0.8,
            padding: '20px',
            textAlign: 'center'
          }}>
            <i className="bi bi-graph-down mb-2" style={{ fontSize: '28px' }}></i>
            <span style={{ fontWeight: 500 }}>No data available</span>
            <span style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your filters</span>
          </div>
        ) : children}
      </div>
    </div>
  </div>
);

export default function WorkforceProductivity({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: WorkforceProductivityProps) {
  const { data, loading, error } = useWorkforceProductivityData();
  
  const [telaId] = useState<string>(telaIdFromProps);
  const [_usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [_usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);
  const [_podeEditar, setPodeEditar] = useState(false);

  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedJobsites, setSelectedJobsites] = useState<string[]>([]);
  const [selectedWorktypes, setSelectedWorktypes] = useState<string[]>([]);

  // Efficiency control
  const [efficiencyLimit, setEfficiencyLimit] = useState<number>(10);

  // Filter options states
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [jobsites, setJobsites] = useState<string[]>([]);
  const [worktypesList, setWorktypesList] = useState<string[]>([]);
  const [projectLimit, setProjectLimit] = useState<number>(10);

  // Forecast data for back charge tooltips
  const [forecastProjects, setForecastProjects] = useState<WorkforceProject[]>([]);
  const [forecastContractSteps, setForecastContractSteps] = useState<any[]>([]);

  // States for Monthly Notes
  const [notes, setNotes] = useState<string>('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState<string>('');

  // Log render state
  console.log('WorkforceProductivity Render:', { 
    selectedYear, 
    selectedMonth, 
    hasData: data.length > 0,
    loading 
  });

  // Fetch forecast data
  useEffect(() => {
    const fetchForecastData = async () => {
      try {
        const { data: projects, error } = await supabase
          .from('forecast_data')
          .select('*');
        if (error) throw error;
        setForecastProjects(projects || []);

        const { data: steps, error: stepsError } = await supabase
          .from('forecast_contract_steps')
          .select('obra_id, team')
          .not('team', 'is', null);
        if (stepsError) throw stepsError;
        setForecastContractSteps(steps || []);
      } catch (err) {
        console.error('Error fetching forecast data:', err);
      }
    };
    fetchForecastData();
  }, []);

  // Theme observer
  const [themeColors, setThemeColors] = useState({
    textPrimary: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    background: '#ffffff',
    backgroundSecondary: '#fff',
    isDark: false
  });

  // Fetch monthly notes from Supabase
  useEffect(() => {
    const fetchNotes = async () => {
      // Log for debugging
      console.log('--- Fetching Notes Debug ---');
      console.log('selectedYear:', selectedYear);
      console.log('selectedMonth:', selectedMonth);

      if (!selectedYear || !selectedMonth) {
        console.log('Missing selectedYear or selectedMonth, clearing notes');
        setNotes('');
        return;
      }

      try {
        const yearInt = parseInt(selectedYear);
        const monthInt = parseInt(selectedMonth);
        console.log('Executing query for year:', yearInt, 'month:', monthInt);

        const { data: noteData, error: noteError } = await supabase
          .from('workforce_monthly_notes')
          .select('content')
          .eq('year', yearInt)
          .eq('month', monthInt)
          .maybeSingle();

        if (noteError) {
          console.error('Supabase error fetching notes:', noteError);
          throw noteError;
        }
        
        console.log('Fetch success, data:', noteData);
        setNotes(noteData?.content || '');
      } catch (err) {
        console.error('Error fetching monthly notes:', err);
      }
    };

    fetchNotes();
  }, [selectedYear, selectedMonth]);

  const handleSaveNotes = async () => {
    if (!selectedYear || !selectedMonth) return;

    try {
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth);

      const { error } = await supabase
        .from('workforce_monthly_notes')
        .upsert({
          year,
          month,
          content: tempNotes,
          updated_at: new Date().toISOString()
        }, { onConflict: 'year,month' });

      if (error) throw error;
      
      setNotes(tempNotes);
      setIsEditingNotes(false);
    } catch (err) {
      console.error('Error saving monthly notes:', err);
      alert('Failed to save notes. Please try again.');
    }
  };

  useEffect(() => {
    const updateColors = () => {
      const style = getComputedStyle(document.documentElement);
      const isDark = document.documentElement.classList.contains('dark-theme');
      
      setThemeColors({
        textPrimary: style.getPropertyValue('--color-text-primary').trim() || (isDark ? '#f8fafc' : '#1e293b'),
        textSecondary: style.getPropertyValue('--color-text-secondary').trim() || (isDark ? '#94a3b8' : '#64748b'),
        border: style.getPropertyValue('--color-border-divider').trim() || (isDark ? '#334155' : '#e2e8f0'),
        background: style.getPropertyValue('--color-background-primary').trim() || (isDark ? '#0f172a' : '#ffffff'),
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
    if (data.length > 0 && years.length === 0) {
      const uniqueYears = [...new Set(data.map(d => d.reference_month.split('-')[0]))].sort((a, b) => b.localeCompare(a));
      const uniqueClients = [...new Set(data.map(d => d.client))].filter(Boolean).sort();
      const uniqueJobsites = [...new Set(data.map(d => getJobsiteLabel(d)))].filter(Boolean).sort();
      const uniqueWorktypes = [...new Set(data.map(d => getWorktype(d)))].filter(Boolean).sort();

      setYears(uniqueYears);
      setClients(uniqueClients);
      setJobsites(uniqueJobsites);
      setWorktypesList(uniqueWorktypes);

      // Default year to "Todos" (empty string) only if not already set
      if (!selectedYear) {
        setSelectedYear('');
      }
    }
  }, [data, years.length, selectedYear]);

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
    if (selectedJobsites.length > 0) {
      filtered = filtered.filter(d => {
        const concatenated = getJobsiteLabel(d);
        return selectedJobsites.includes(concatenated);
      });
    }
    if (selectedWorktypes.length > 0) filtered = filtered.filter(d => selectedWorktypes.includes(getWorktype(d)));
    return filtered;
  }, [data, selectedYear, selectedMonth, selectedClients, selectedJobsites, selectedWorktypes]);

  // Process data for charts based on filteredData
  const globalMonthlyData = useMemo(() => {
    if (!filteredData.length) return [];

    const monthlyMap = new Map<string, { totalHours: number; employees: Set<string> }>();

    filteredData.forEach(row => {
      // Ensure row and required fields exist
      if (!row || !row.reference_month) return;

      const month = row.reference_month;
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { totalHours: 0, employees: new Set() });
      }
      const current = monthlyMap.get(month)!;
      current.totalHours += (typeof row.regular_hours === 'number' ? row.regular_hours : 0);
      if (row.employee_name) {
        current.employees.add(row.employee_name);
      }
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

  // Data by Jobsite (Top 5 Projects by Total Hours)
  const jobsiteData = useMemo(() => {
    if (!filteredData.length) return { labels: [], datasets: [] };

    const jobsiteMap = new Map<string, { totalHours: number; employees: Set<string> }>();
    
    filteredData.forEach(row => {
      // Ensure row exists
      if (!row) return;

      const jobsiteLabel = getJobsiteLabel(row);
      
      if (!jobsiteMap.has(jobsiteLabel)) {
        jobsiteMap.set(jobsiteLabel, { totalHours: 0, employees: new Set() });
      }
      const current = jobsiteMap.get(jobsiteLabel)!;
      current.totalHours += (typeof row.regular_hours === 'number' ? row.regular_hours : 0);
      if (row.employee_name) {
        current.employees.add(row.employee_name);
      }
    });

    // Sort by Total Hours DESC and apply dynamic limit
    const sortedEntries = Array.from(jobsiteMap.entries())
      .sort((a, b) => b[1].totalHours - a[1].totalHours)
      .slice(0, projectLimit);
    
    return {
      labels: sortedEntries.map(e => e[0]),
      totalHours: sortedEntries.map(e => Number(e[1].totalHours.toFixed(2))),
      hoursPerEmployee: sortedEntries.map(e => e[1].employees.size > 0 ? Number((e[1].totalHours / e[1].employees.size).toFixed(2)) : 0)
    };
  }, [filteredData, projectLimit]);

  // Data by Worktype
  const worktypeData = useMemo(() => {
    if (!filteredData.length) return { labels: [], datasets: [] };

    const wtMap = new Map<string, { totalHours: number; employees: Set<string> }>();
    filteredData.forEach(row => {
      // Get worktype using fallback logic
      const wt = getWorktype(row);
      
      if (!wtMap.has(wt)) {
        wtMap.set(wt, { totalHours: 0, employees: new Set() });
      }
      const current = wtMap.get(wt)!;
      current.totalHours += (typeof row.regular_hours === 'number' ? row.regular_hours : 0);
      if (row.employee_name) {
        current.employees.add(row.employee_name);
      }
    });

    const sortedEntries = Array.from(wtMap.entries()).sort((a, b) => b[1].totalHours - a[1].totalHours);
    
    return {
      labels: sortedEntries.map(e => e[0]),
      totalHours: sortedEntries.map(e => Number(e[1].totalHours.toFixed(2))),
      hoursPerEmployee: sortedEntries.map(e => e[1].employees.size > 0 ? Number((e[1].totalHours / e[1].employees.size).toFixed(2)) : 0)
    };
  }, [filteredData]);

  // Determine if we are in a single project view
  const isSingleProject = selectedJobsites.length === 1;
  const activeProject = isSingleProject ? selectedJobsites[0] : null;

  // Data for single project view
  const projectMonthlyData = useMemo(() => {
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
      current.totalHours += (typeof row.regular_hours === 'number' ? row.regular_hours : 0);
      if (row.employee_name) {
        current.employees.add(row.employee_name);
      }
      
      const wt = getWorktype(row);
      current.worktypes.set(wt, (current.worktypes.get(wt) || 0) + (typeof row.regular_hours === 'number' ? row.regular_hours : 0));
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
    return Array.from(new Set(filteredData.map(row => getWorktype(row)))).sort();
  }, [filteredData, activeProject]);

  // Paleta de cores expandida e com alto contraste para categorias
  const colors = useMemo(() => [
    '#2E6BE6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#06B6D4', // Cyan
    '#6366F1', // Indigo
    '#A855F7', // Purple
    '#D946EF', // Fuchsia
    '#F43F5E', // Rose
    '#84CC16', // Lime
    '#EAB308', // Yellow
    '#3B82F6', // Light Blue
    '#22C55E', // Green
    '#64748B', // Slate
    '#94A3B8', // Light Slate
  ], []);

  // Cores fixas para worktypes para garantir consistência entre gráficos
  const worktypeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Garante que 'Normal Labor' sempre tenha uma cor consistente se existir
    const sortedWorktypes = [...worktypesList].sort((a, b) => {
      if (a === 'Normal Labor') return -1;
      if (b === 'Normal Labor') return 1;
      return a.localeCompare(b);
    });

    sortedWorktypes.forEach((wt, idx) => {
      map[wt] = colors[idx % colors.length];
    });
    return map;
  }, [worktypesList, colors]);

  // Process data for worktype proportion
  const worktypeProportionData = useMemo(() => {
    if (!filteredData.length) return { labels: [], datasets: [] };

    const wtMap = new Map<string, number>();
    filteredData.forEach(row => {
      const wt = getWorktype(row);
      wtMap.set(wt, (wtMap.get(wt) || 0) + row.regular_hours);
    });

    const sortedEntries = Array.from(wtMap.entries()).sort((a, b) => b[1] - a[1]);
    
    return {
      labels: sortedEntries.map(e => e[0]),
      datasets: [{
        data: sortedEntries.map(e => Number(e[1].toFixed(2))),
        backgroundColor: sortedEntries.map(e => worktypeColorMap[e[0]] || 'rgb(156, 163, 175)'),
        borderColor: themeColors.backgroundSecondary,
        borderWidth: 2,
      }]
    };
  }, [filteredData, themeColors, worktypeColorMap]);

  // Efficiency Data: Worktype Hours vs Employees (Ratio Efficiency)
  const efficiencyData = useMemo(() => {
    if (!filteredData.length) return { labels: [], datasets: [] };

    // Group by Project + Worktype to see where the effort is concentrated
    const efficiencyMap = new Map<string, { totalHours: number; employees: Set<string> }>();
    
    filteredData.forEach(row => {
      const jobsiteName = row.jobsite || 'Unspecified';
      const lot = row.lot_building ? ` - ${row.lot_building}` : '';
      const key = `${jobsiteName}${lot}`.trim() + ` | ${getWorktype(row)}`;
      
      if (!efficiencyMap.has(key)) {
        efficiencyMap.set(key, { totalHours: 0, employees: new Set() });
      }
      const current = efficiencyMap.get(key)!;
      current.totalHours += row.regular_hours;
      current.employees.add(row.employee_name);
    });

    // Top efficiency hotspots
     const sortedEntries = Array.from(efficiencyMap.entries())
       .sort((a, b) => b[1].totalHours - a[1].totalHours)
       .slice(0, efficiencyLimit);

    return {
      labels: sortedEntries.map(e => e[0]),
      totalHours: sortedEntries.map(e => Number(e[1].totalHours.toFixed(2))),
      hoursPerEmployee: sortedEntries.map(e => e[1].employees.size > 0 ? Number((e[1].totalHours / e[1].employees.size).toFixed(2)) : 0)
    };
  }, [filteredData, efficiencyLimit]);

  const projectComparisonChartData = useMemo(() => {
    const labels = projectMonthlyData.map(d => dayjs(d.month).format('MMM YYYY'));
    const datasets = [];

    // Só adiciona a linha de Total se houver mais de um tipo de trabalho
    if (worktypes.length > 1) {
      datasets.push({
        label: 'Total Hours',
        data: projectMonthlyData.map(d => d.totalHours),
        borderColor: themeColors.textPrimary,
        borderWidth: 3,
        borderDash: [5, 5],
        tension: 0.1,
      });
    }

    // Adiciona os datasets de cada worktype
    worktypes.forEach((wt) => {
      datasets.push({
        label: wt,
        data: projectMonthlyData.map(d => d.worktypes[wt] || 0),
        borderColor: worktypeColorMap[wt] || 'rgb(156, 163, 175)',
        backgroundColor: worktypeColorMap[wt] || 'rgb(156, 163, 175)',
        tension: 0.1,
      });
    });

    return { labels, datasets };
  }, [projectMonthlyData, worktypes, themeColors.textPrimary, worktypeColorMap]);

  const efficiencyChartData = useMemo(() => ({
    labels: efficiencyData.labels,
    datasets: [
      {
        label: 'Total Hours',
        data: efficiencyData.totalHours,
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: 'rgb(99, 102, 241)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Ratio (Hrs/Emp)',
        data: efficiencyData.hoursPerEmployee,
        borderColor: 'rgb(244, 63, 94)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 4,
        type: 'line' as const,
      }
    ]
  }), [efficiencyData]);

  const totalHoursChartData = useMemo(() => ({
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
  }), [globalMonthlyData]);

  const employeesChartData = useMemo(() => ({
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
  }), [globalMonthlyData]);

  const hoursPerEmployeeChartData = useMemo(() => ({
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
  }), [globalMonthlyData]);

  const jobsiteChartData = useMemo(() => ({
    labels: jobsiteData.labels,
    datasets: [
      {
        label: 'Total Hours',
        data: jobsiteData.totalHours,
        backgroundColor: 'rgba(46, 107, 230, 0.8)',
        borderColor: 'rgb(46, 107, 230)',
        borderWidth: 1,
        borderRadius: 4,
      }
    ]
  }), [jobsiteData]);

  const worktypeChartData = useMemo(() => ({
    labels: worktypeData.labels,
    datasets: [
      {
        label: 'Total Hours',
        data: worktypeData.totalHours,
        backgroundColor: worktypeData.labels.map(label => worktypeColorMap[label] || '#10B981'),
        borderColor: worktypeData.labels.map(label => worktypeColorMap[label] || '#10B981'),
        borderWidth: 1,
        borderRadius: 4,
      }
    ]
  }), [worktypeData, worktypeColorMap]);

  const [customTooltip, setCustomTooltip] = useState<any>({ opacity: 0, top: 0, left: 0, title: '', body: [], afterBody: [], yAlign: 'top' });
  const containerRef = useRef<HTMLDivElement>(null);

  const chartOptions: any = useMemo(() => {
    const isBackChargeFiltered = selectedWorktypes.includes('Back Charge');

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 25,
          bottom: 10,
          left: 10
        }
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
          external: (context: any) => {
            const { tooltip } = context;
            if (tooltip.opacity === 0) {
              setCustomTooltip((prev: any) => ({ ...prev, opacity: 0 }));
              return;
            }

            const position = context.chart.canvas.getBoundingClientRect();
            
            // Coordinates relative to viewport
             const viewportLeft = position.left + tooltip.caretX;
             const viewportTop = position.top + tooltip.caretY;
             
             // Threshold for flipping (if tooltip would go above viewport)
             // Estimated tooltip height is around 250px-450px depending on content
             const flipThreshold = 450;
             const yAlign = viewportTop < flipThreshold ? 'bottom' : 'top';
 
             // Horizontal adjustment to prevent clipping on edges
             const tooltipWidthEstimate = 280;
             let adjustedLeft = viewportLeft;
             const padding = 20;
             
             if (viewportLeft - tooltipWidthEstimate / 2 < padding) {
               adjustedLeft = tooltipWidthEstimate / 2 + padding;
             } else if (viewportLeft + tooltipWidthEstimate / 2 > window.innerWidth - padding) {
               adjustedLeft = window.innerWidth - tooltipWidthEstimate / 2 - padding;
             }

            // Replicar a lógica de geração de conteúdo do afterBody aqui para o estado
            const findChartTitle = (canvas: HTMLCanvasElement) => {
              let current: HTMLElement | null = canvas;
              while (current && current !== document.body) {
                const title = current.querySelector('h4');
                if (title) return title.textContent || '';
                current = current.parentElement;
              }
              return '';
            };

            const chartTitle = findChartTitle(context.chart.canvas);
            const isMonthYearChart = chartTitle.includes('Month/Year');
            const isServiceTypeChart = chartTitle.includes('Service Type');
            const isProjectChart = chartTitle.includes('Project');

            // MAPPING LOGIC
            const obraToTeam: Record<string, string> = {};
            forecastContractSteps.forEach(step => {
              if (step.team && !obraToTeam[step.obra_id]) {
                obraToTeam[step.obra_id] = step.team;
              }
            });

            const subLookup: Record<string, string> = {};
            forecastProjects.forEach(f => {
              const team = obraToTeam[f.id];
              if (team) {
                const key = `${normalizeJobSite(f.cliente)}|${normalizeJobSite(f.job_site)}|${normalizeLotBuilding(f.lote_bld)}`;
                subLookup[key] = team;
              }
            });

            const findSubcontractor = (row: any) => {
              if (row.obra_id && obraToTeam[row.obra_id]) return { name: obraToTeam[row.obra_id], isMapped: true };
              const key = `${normalizeJobSite(row.client)}|${normalizeJobSite(row.jobsite)}|${normalizeLotBuilding(row.lot_building)}`;
              if (subLookup[key]) return { name: subLookup[key], isMapped: true };
              const normTsClient = normalizeJobSite(row.client);
              const normTsJob = normalizeJobSite(row.jobsite);
              const normTsLot = normalizeLotBuilding(row.lot_building);
              const tsWords = normTsJob.split(' ').filter(w => w.length > 2);
              let bestMatch: { team: string; score: number } | null = null;
              forecastProjects.forEach(f => {
                const team = obraToTeam[f.id];
                if (!team || normalizeLotBuilding(f.lote_bld) !== normTsLot) return;
                let currentScore = 0;
                const normFJob = normalizeJobSite(f.job_site);
                const wordScore = tsWords.filter(word => normFJob.includes(word)).length;
                currentScore += wordScore * 2;
                if (normalizeJobSite(f.cliente) === normTsClient && normTsClient !== '') currentScore += 3;
                if (currentScore >= 4 && (!bestMatch || currentScore > bestMatch.score)) {
                  bestMatch = { team, score: currentScore };
                }
              });
              if (bestMatch?.team) return { name: bestMatch.team, isMapped: true };
              return { 
                name: `${row.jobsite || ''}${row.lot_building ? ' - ' + row.lot_building : ''}` || 'Obra não identificada', 
                isMapped: false 
              };
            };

            let afterBodyContent: any[] = [];
            const firstItem = tooltip.dataPoints[0];

            // Only show detailed breakdown if a worktype filter is active (not "Todos")
            if (selectedWorktypes.length > 0) {
              if (isMonthYearChart || isServiceTypeChart) {
                let relevantRows = [];
                if (isMonthYearChart) {
                  const referenceMonth = globalMonthlyData[firstItem.dataIndex]?.month;
                  relevantRows = filteredData.filter(d => d.reference_month === referenceMonth);
                } else {
                  const worktype = worktypeData.labels[firstItem.dataIndex];
                  relevantRows = filteredData.filter(d => getWorktype(d) === worktype);
                }

                const mappedSubsMap = new Map<string, number>();
                const unmappedProjectsMap = new Map<string, number>();

                relevantRows.forEach(row => {
                  const result = findSubcontractor(row);
                  if (result.isMapped) {
                    mappedSubsMap.set(result.name, (mappedSubsMap.get(result.name) || 0) + (row.regular_hours || 0));
                  } else {
                    unmappedProjectsMap.set(result.name, (unmappedProjectsMap.get(result.name) || 0) + (row.regular_hours || 0));
                  }
                });

                const sortedMapped = Array.from(mappedSubsMap.entries()).sort((a, b) => b[1] - a[1]);
                const sortedUnmapped = Array.from(unmappedProjectsMap.entries()).sort((a, b) => b[1] - a[1]);

                if (sortedMapped.length > 0) {
                  afterBodyContent.push({ type: 'header', text: 'DETALHAMENTO POR SUBCONTRATADO:' });
                  sortedMapped.forEach(([sub, hours]) => {
                    afterBodyContent.push({ type: 'item', text: `${sub}: ${Number(hours).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h` });
                  });
                }
                if (sortedUnmapped.length > 0) {
                  afterBodyContent.push({ type: 'header', text: 'SUBCONTRATADO NÃO IDENTIFICADO:' });
                  sortedUnmapped.forEach(([proj, hours]) => {
                    afterBodyContent.push({ type: 'item', text: `${proj}: ${Number(hours).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h` });
                  });
                }
              } else if (isProjectChart) {
                const jobsiteLabel = jobsiteData.labels[firstItem.dataIndex];
                const relevantRows = filteredData.filter(d => getJobsiteLabel(d) === jobsiteLabel);
                
                const mappedSubsMap = new Map<string, { total: number; months: Map<string, number> }>();
                let unmappedHours = 0;

                relevantRows.forEach(row => {
                  const result = findSubcontractor(row);
                  const hours = Number(row.regular_hours || 0);
                  const month = row.reference_month || 'N/A';

                  if (result.isMapped) {
                    if (!mappedSubsMap.has(result.name)) {
                      mappedSubsMap.set(result.name, { total: 0, months: new Map() });
                    }
                    const subData = mappedSubsMap.get(result.name)!;
                    subData.total += hours;
                    subData.months.set(month, (subData.months.get(month) || 0) + hours);
                  } else {
                    unmappedHours += hours;
                  }
                });

                const sortedMapped = Array.from(mappedSubsMap.entries()).sort((a, b) => b[1].total - a[1].total);

                if (sortedMapped.length > 0) {
                  afterBodyContent.push({ type: 'header', text: 'RESPONSÁVEIS (SUBCONTRATADO):' });
                  sortedMapped.forEach(([sub, data]) => {
                    afterBodyContent.push({ 
                      type: 'item', 
                      text: `${sub}: ${Number(data.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h` 
                    });
                    
                    // Monthly breakdown for this sub
                    const sortedMonths = Array.from(data.months.entries()).sort((a, b) => {
                      // Simple sort by date string (YYYY-MM)
                      return a[0].localeCompare(b[0]);
                    });

                    sortedMonths.forEach(([month, hours]) => {
                      // Format month from YYYY-MM to MM/YYYY
                      let displayMonth = month;
                      try {
                        const [year, monthNum] = month.split('-');
                        displayMonth = `${monthNum}/${year}`;
                      } catch (e) {}
                      
                      afterBodyContent.push({ 
                        type: 'sub-item', 
                        text: `${displayMonth}: ${Number(hours).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h` 
                      });
                    });
                  });
                }

                if (unmappedHours > 0) {
                  afterBodyContent.push({ 
                    type: 'info', 
                    text: `Outras horas: ${Number(unmappedHours).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h (Subcontratado não identificado)` 
                  });
                }
                
                if (sortedMapped.length === 0 && unmappedHours === 0) {
                  afterBodyContent.push({ type: 'info', text: 'Sem informações de subcontratado' });
                }
              }
            }

            setCustomTooltip({
              opacity: 1,
              left: adjustedLeft,
              top: viewportTop,
              yAlign,
              title: tooltip.title?.[0] || '',
              body: tooltip.body.map((b: any) => b.lines[0]),
              afterBody: afterBodyContent
            });
          }
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: themeColors.border,
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
            color: themeColors.border,
            drawTicks: false,
          },
          ticks: {
            color: themeColors.textSecondary,
            font: { size: 11 },
            padding: 10,
            callback: (value: any) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          },
          title: {
            display: true,
            text: 'Hours',
            color: themeColors.textSecondary,
            font: { size: 10, weight: 'bold' }
          }
        }
      }
    };
  }, [themeColors, selectedWorktypes, globalMonthlyData, filteredData, forecastProjects, forecastContractSteps, worktypeData.labels, jobsiteData.labels]);

  const horizontalChartOptions: any = useMemo(() => ({
    ...chartOptions,
    indexAxis: 'y' as const,
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        ticks: {
          ...chartOptions.scales.x.ticks,
          maxRotation: 0,
          minRotation: 0,
        },
        title: {
          display: true,
          text: 'Hours',
          color: themeColors.textSecondary,
          font: { size: 10, weight: 'bold' }
        }
      },
      y: {
        ...chartOptions.scales.y,
        title: {
          display: true,
          text: 'Month / Year',
          color: themeColors.textSecondary,
          font: { size: 10, weight: 'bold' }
        }
      }
    }
  }), [chartOptions, themeColors.textSecondary]);

  // Simple custom plugin for data labels
  const datalabelsPlugin = useMemo(() => ({
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
              const isHorizontal = chart.config.options.indexAxis === 'y';
              const x = isHorizontal ? bar.x + 5 : bar.x;
              const y = isHorizontal ? bar.y : bar.y - 8;
              ctx.fillStyle = themeColors.textSecondary;
              ctx.font = 'bold 10px Inter, sans-serif';
              ctx.textAlign = isHorizontal ? 'left' : 'center';
              ctx.textBaseline = isHorizontal ? 'middle' : 'bottom';
              ctx.fillText(value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), x, y);
            }
          });
        }
      });
      ctx.restore();
    }
  }), [themeColors.textSecondary]);

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

  return (
    <div id="content" ref={containerRef} style={{ height: 'calc(100vh - 65px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)', position: 'relative' }}>
      {/* Custom Tooltip Portal */}
      {customTooltip.opacity > 0 && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: customTooltip.top,
          left: customTooltip.left,
          transform: customTooltip.yAlign === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)',
          marginTop: customTooltip.yAlign === 'top' ? '-10px' : '15px',
          backgroundColor: themeColors.isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          color: themeColors.isDark ? '#cbd5e1' : '#475569',
          border: `1px solid ${themeColors.border}`,
          borderRadius: '8px',
          padding: '12px',
          pointerEvents: 'auto',
          zIndex: 9999,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          minWidth: '220px',
          maxWidth: '350px',
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          fontFamily: "'Inter', sans-serif"
        }}>
          {customTooltip.title && (
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', color: themeColors.isDark ? '#f8fafc' : '#1e293b' }}>
              {customTooltip.title}
            </div>
          )}
          {customTooltip.body.map((line: string, i: number) => (
            <div key={i} style={{ fontSize: '13px', marginBottom: customTooltip.afterBody.length > 0 ? '8px' : '0' }}>
              {line}
            </div>
          ))}
          {customTooltip.afterBody.map((item: any, i: number) => (
            <div key={i} style={{ 
              marginTop: item.type === 'header' ? '12px' : '4px',
              fontWeight: item.type === 'header' ? 700 : 400,
              fontSize: item.type === 'header' ? '11px' : (item.type === 'sub-item' ? '12px' : '13px'),
              textTransform: item.type === 'header' ? 'uppercase' : 'none',
              color: item.type === 'header' ? (themeColors.isDark ? '#94a3b8' : '#64748b') : (themeColors.isDark ? '#cbd5e1' : '#475569'),
              display: 'flex',
              alignItems: 'center',
              paddingLeft: item.type === 'sub-item' ? '14px' : '0',
              position: 'relative'
            }}>
              {item.type === 'sub-item' && (
                <div style={{
                  position: 'absolute',
                  left: '4px',
                  top: '-4px',
                  bottom: i === customTooltip.afterBody.length - 1 || customTooltip.afterBody[i+1]?.type !== 'sub-item' ? '50%' : '-4px',
                  width: '1px',
                  backgroundColor: themeColors.isDark ? '#475569' : '#cbd5e1'
                }} />
              )}
              {item.type === 'sub-item' && (
                <div style={{
                  width: '6px',
                  height: '1px',
                  backgroundColor: themeColors.isDark ? '#475569' : '#cbd5e1',
                  marginRight: '6px'
                }} />
              )}
              {item.text}
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', flex: '0 0 auto' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Workforce Productivity</h1>
        <WorkforceProductivityFilters
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

      {/* Conteúdo principal: gráficos */}
      <div className="custom-scrollbar" style={{ flex: 1, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'row', padding: 0 }}>
        
        {/* Lado Esquerdo: Gráficos */}
        <div style={{ 
          flex: 1,
          minWidth: 0,
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          transition: 'all 0.3s ease'
        }}>
          {!activeProject ? (
            <div className="d-flex flex-column h-100" style={{ width: '100%', margin: 0 }}>
              {/* Linha 1: Total de Horas ao longo do tempo (Largura Total) */}
              <div style={{ height: '40%', padding: '0 20px' }}>
                <ChartCard 
                  title="Total Hours by Month/Year" 
                  legendLabel="Total Hours" 
                  legendColor="rgb(46, 107, 230)"
                  legendType="bar"
                  style={{ borderTop: 0, borderLeft: 0, borderRight: 0 }}
                  isEmpty={globalMonthlyData.length === 0}
                >
                  <Bar data={totalHoursChartData} options={chartOptions} plugins={[datalabelsPlugin]} />
                </ChartCard>
              </div>

              {/* Linha 2: Gráficos por Projeto e Serviço lado a lado */}
              <div className="d-flex flex-row" style={{ height: '60%', padding: '0 10px' }}>
                {/* 2. Horas por Projeto com controle Top N */}
                <div className="col-6 h-100" style={{ padding: '0 10px' }}>
                  <ChartCard 
                    title="Hours by Project" 
                    style={{ borderTop: 0, borderLeft: 0, borderBottom: 0 }}
                    isEmpty={jobsiteData.labels.length === 0}
                  >
                    <div className="d-flex flex-column h-100">
                      <div className="ms-4 d-flex justify-content-between align-items-center mb-2 pe-4">
                        <div className="d-flex align-items-center gap-2">
                          <div style={{ width: 15, height: 8, backgroundColor: 'rgba(46, 107, 230, 0.8)', borderRadius: 2 }} />
                          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Total Hours</span>
                        </div>
                        
                        {/* Seletor Top N com Assinatura Visual e Dropdown Personalizado */}
                        <div className="d-flex align-items-center" style={{ 
                          background: 'var(--color-background-primary)', 
                          borderRadius: 6, 
                          height: 28, 
                          border: '1.5px solid var(--color-border-divider)', 
                          overflow: 'hidden',
                          width: 100
                        }}>
                          <div className="d-flex align-items-center justify-content-center" style={{ 
                            background: 'var(--color-background-secondary)', 
                            height: '100%', 
                            width: 32, 
                            color: 'var(--color-accent-primary)',
                            borderRight: '1.5px solid var(--color-border-divider)'
                          }}>
                            <i className="bi bi-filter-left" style={{ fontSize: 18 }} />
                          </div>
                          <div style={{ flex: 1, height: '100%' }}>
                            <MultiSelectDropdown 
                              variant="ghost"
                              isSingleSelect={true}
                              options={[
                                { value: '5', label: 'Top 5' },
                                { value: '10', label: 'Top 10' },
                                { value: '15', label: 'Top 15' },
                                { value: '20', label: 'Top 20' }
                              ]}
                              selectedValues={[projectLimit.toString()]}
                              onChange={(values) => {
                                if (values.length > 0) {
                                  setProjectLimit(Number(values[0]));
                                }
                              }}
                              allLabel="Top 10"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex-grow-1">
                        <Bar key={projectLimit} data={jobsiteChartData} options={chartOptions} plugins={[datalabelsPlugin]} />
                      </div>
                    </div>
                  </ChartCard>
                </div>

                {/* 3. Horas por Tipo de Serviço */}
                <div className="col-6 h-100" style={{ padding: '0 10px' }}>
                  <ChartCard 
                    title="Hours by Service Type" 
                    style={{ borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
                    isEmpty={worktypeData.labels.length === 0}
                  >
                    <div className="d-flex flex-column h-100">
                      <div className="ms-4 d-flex gap-3 mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <div style={{ width: 15, height: 8, backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 2 }} />
                          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Total Hours</span>
                        </div>
                      </div>
                      <div className="flex-grow-1">
                        <Bar data={worktypeChartData} options={chartOptions} plugins={[datalabelsPlugin]} />
                      </div>
                    </div>
                  </ChartCard>
                </div>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column h-100" style={{ width: '100%', margin: 0 }}>
              <div className="d-flex flex-row" style={{ height: '55%', padding: 0 }}>
                <div className="col-8 h-100" style={{ padding: 0 }}>
                  <ChartCard 
                    title={`Hours: Total vs Worktype - ${activeProject}`}
                    style={{ borderTop: 0, borderLeft: 0 }}
                    isEmpty={projectMonthlyData.length === 0}
                  >
                    <div className="d-flex flex-column h-100">
                      <div className="flex-grow-1">
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
                          options={{
                            ...chartOptions,
                            plugins: {
                              ...chartOptions.plugins,
                              tooltip: {
                                ...chartOptions.plugins?.tooltip,
                                itemSort: (a: any, b: any) => {
                                  // Mantém 'Total Hours' sempre no topo
                                  if (a.dataset.label === 'Total Hours') return -1;
                                  if (b.dataset.label === 'Total Hours') return 1;
                                  // Ordena os demais por valor descendente
                                  return (b.raw as number) - (a.raw as number);
                                },
                                callbacks: {
                                  label: (context: any) => {
                                    const label = context.dataset.label || '';
                                    const value = context.raw || 0;
                                    return `${label}: ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`;
                                  },
                                  // Adiciona uma linha separadora após o Total Hours
                                  afterLabel: (context: any) => {
                                    if (context.dataset.label === 'Total Hours') {
                                      return '--------------------';
                                    }
                                    return '';
                                  }
                                }
                              }
                            }
                          } as any} 
                        />
                      </div>
                    </div>
                  </ChartCard>
                </div>

                <div className="col-4 h-100" style={{ padding: 0 }}>
                  <ChartCard 
                    title="Work Type Proportion"
                    style={{ borderTop: 0, borderLeft: 0, borderRight: 0 }}
                    isEmpty={worktypeProportionData.labels.length === 0}
                  >
                    <div style={{ height: '100%', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Pie 
                        data={worktypeProportionData} 
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          cutout: '70%',
                          plugins: {
                            legend: {
                              display: true,
                              position: 'bottom',
                              labels: {
                                boxWidth: 10,
                                font: { size: 9 },
                                color: themeColors.textSecondary,
                                padding: 10
                              }
                            },
                            tooltip: {
                              backgroundColor: themeColors.isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                              titleColor: themeColors.isDark ? '#fff' : '#000',
                              bodyColor: themeColors.isDark ? '#fff' : '#000',
                              borderColor: themeColors.borderDivider,
                              borderWidth: 1,
                            }
                          }
                        } as any} 
                      />
                    </div>
                  </ChartCard>
                </div>
              </div>

              <div className="d-flex flex-row" style={{ height: '45%', padding: 0 }}>
                <div className="col-6 h-100" style={{ padding: 0 }}>
                  <ChartCard 
                    title={`Hours per Employee`}
                    legendLabel="Hours per Employee"
                    legendColor="rgb(245, 158, 11)"
                    legendType="line"
                    style={{ borderTop: 0, borderLeft: 0, borderBottom: 0 }}
                    isEmpty={projectMonthlyData.length === 0}
                  >
                    <Line 
                      data={{
                        labels: projectMonthlyData.map(d => dayjs(d.month).format('MMM YYYY')),
                        datasets: [{
                          label: 'Hours per Employee',
                          data: projectMonthlyData.map(d => d.hoursPerEmployee),
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
                <div className="col-6 h-100" style={{ padding: 0 }}>
                  <ChartCard 
                    title={`Employee Count`}
                    legendLabel="Employees"
                    legendColor="rgb(16, 185, 129)"
                    legendType="bar"
                    style={{ borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
                    isEmpty={projectMonthlyData.length === 0}
                  >
                    <Bar 
                      data={{
                        labels: projectMonthlyData.map(d => dayjs(d.month).format('MMM YYYY')),
                        datasets: [{
                          label: 'Employees',
                          data: projectMonthlyData.map(d => d.employeeCount),
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
            </div>
          )}
        </div>

        {/* Lado Direito: Monthly Notes (Altura Total) */}
        {selectedYear && selectedMonth && (
          <div style={{ 
            flex: '0 0 320px', 
            height: '100%', 
            borderLeft: '1px solid var(--color-border-divider)',
            background: 'var(--color-background-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 20px 10px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'transparent'
            }}>
              <h4 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: 400, 
                color: 'var(--color-text-secondary)',
                minHeight: 30,
                display: 'flex',
                alignItems: 'center'
              }}>
                Notes
              </h4>
            </div>
            
            <div style={{ flex: 1, padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
              {isEditingNotes ? (
                <textarea 
                  className="custom-scrollbar"
                  value={tempNotes}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    // Garantir que a primeira linha tenha um bullet se houver texto
                    if (newValue.length > 0 && !newValue.startsWith(' • ')) {
                      setTempNotes(' • ' + newValue.replace(/^(\s*•\s*)?/, ''));
                    } else {
                      setTempNotes(newValue);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const target = e.target as HTMLTextAreaElement;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const value = target.value;

                      // Insere nova linha com bullet
                      const newValue = value.substring(0, start) + '\n • ' + value.substring(end);
                      setTempNotes(newValue);

                      // Ajusta a posição do cursor após o novo bullet
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 4;
                      }, 0);
                    }
                  }}
                  placeholder="Write your notes for this month here..."
                  style={{
                    width: '100%',
                    flex: 1,
                    background: 'var(--color-background-secondary)',
                    border: '1px solid var(--color-accent-primary)',
                    borderRadius: '8px',
                    padding: '12px',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    resize: 'none',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                />
              ) : (
                <div 
                  className="custom-scrollbar"
                  style={{
                    width: '100%',
                    flex: 1,
                    padding: '4px 12px',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    lineHeight: '1.8',
                    overflowY: 'auto'
                  }}
                >
                  {notes ? notes.split('\n').filter(line => line.trim() !== '').map((line, idx) => {
                    // Remove o bullet existente se houver para evitar duplicidade na exibição
                    const cleanLine = line.replace(/^(\s*•\s*)/, '');
                    return (
                      <div key={idx} style={{ marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: 'var(--color-accent-primary)', fontWeight: 'bold' }}>•</span>
                        <span>{cleanLine}</span>
                      </div>
                    );
                  }) : (
                    <div style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '12px' }}>
                      No notes for this period. Click Edit to add.
                    </div>
                  )}
                </div>
              )}

              <div style={{ 
                display: 'flex',
                gap: '8px',
                width: '100%'
              }}>
                {!isEditingNotes ? (
                  <button 
                    onClick={() => {
                      // Prepara o texto com bullets se não tiver
                      const formattedNotes = notes ? notes.split('\n')
                        .map(line => line.trim() === '' ? '' : (line.startsWith(' • ') ? line : ` • ${line}`))
                        .join('\n') : ' • ';
                      setTempNotes(formattedNotes);
                      setIsEditingNotes(true);
                    }}
                    title="Edit Notes"
                    style={{
                      background: 'var(--color-background-secondary)',
                      border: '1px solid var(--color-border-divider)',
                      color: 'var(--color-text-primary)',
                      width: '100%',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                      e.currentTarget.style.color = 'var(--color-accent-primary)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }}
                  >
                    <i className="bi bi-pencil-square" style={{ fontSize: '14px' }}></i>
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleSaveNotes}
                      title="Save Changes"
                      style={{
                        background: 'rgb(16, 185, 129)',
                        border: 'none',
                        color: '#fff',
                        flex: 1,
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                      onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      <i className="bi bi-check-lg" style={{ fontSize: '16px' }}></i>
                    </button>
                    <button 
                      onClick={() => setIsEditingNotes(false)}
                      title="Cancel Edit"
                      style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        color: 'var(--color-text-secondary)',
                        flex: 1,
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-text-secondary)';
                        e.currentTarget.style.color = 'var(--color-text-primary)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }}
                    >
                      <i className="bi bi-x-lg" style={{ fontSize: '14px' }}></i>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
