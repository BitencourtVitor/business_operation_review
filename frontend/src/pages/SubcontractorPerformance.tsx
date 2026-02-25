import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { premiumStorageClient } from '../premiumStorageClient';
import SubcontractorPerformanceFilters from '../components/common/SubcontractorPerformance/SubcontractorPerformanceFilters';
import { normalizeLotBuilding, normalizeJobSite } from '../utils/dataUtils';

interface SubcontractorPerformanceProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

interface RawEvent {
  id: string;
  obra_id: string;
  event: string;
  estimated_date_type: string;
  subcontractor: string;
  event_datetime: string;
}

interface BackchargeData {
  id: string;
  date: string;
  employee_name: string;
  regular_hours: number;
  jobsite: string;
  lot_building: string | null;
  worktype: string | null;
  subcontractor?: string; // Mapped from forecast
  forecastJobsite?: string; // Original jobsite from forecast if matched
}

interface MaterialUsageData {
  id: string;
  mes: string;
  total_retiradas: number;
  valor_total_retirado: number;
  subcontractor?: string; // Mapped from Storage Team
  storageTeamMatched?: string; // The exact team name in Storage
  items_details?: { product: string; quantity: number }[];
}

interface BackchargeStat {
  subcontractor: string;
  totalHours: number;
  occurrenceCount: number;
  avgHoursPerOccurrence: number;
  details: BackchargeData[];
}

interface ProjectData {
  id: string;
  job_site: string;
  type: string;
  lote_bld: string;
}

interface WorkDetail {
  id: string;
  start: string;
  end: string;
  jobsite: string;
  type: string;
  building: string;
  duration: number;
  contractCompletion: number;
}

interface SubcontractorStat {
  subcontractor: string;
  completedWorks: number;
  avgDuration: number;
  avgContractCompletion: number;
  works: WorkDetail[];
}

export default function SubcontractorPerformance({ telaId: _telaId, usuarioId: _usuarioId, role: _role, isResponsavelPelaTela: _isResponsavelPelaTela }: SubcontractorPerformanceProps) {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeTab, setActiveTab] = useState('avg-execution');
  const [backchargeView, setBackchargeView] = useState<'ranking' | 'details'>('ranking');
  const [years] = useState<string[]>(['2026', '2025']);
  const [months] = useState<string[]>(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [contractData, setContractData] = useState<Record<string, { total: number; completed: number }>>({});
  const [backchargeData, setBackchargeData] = useState<BackchargeData[]>([]);
  const [materialUsageData, setMaterialUsageData] = useState<MaterialUsageData[]>([]);
  const [forecastSubcontractors, setForecastSubcontractors] = useState<string[]>([]);
  const [materialView, setMaterialView] = useState<'ranking' | 'details'>('ranking');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    content: any[]; 
    type: 'execution' | 'backcharge' | 'material'
  }>({
    visible: false,
    x: 0,
    y: 0,
    content: [],
    type: 'execution'
  });
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sorting state
  type SortConfig = {
    key: keyof SubcontractorStat | 'rank';
    direction: 'asc' | 'desc';
  } | null;

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'avgDuration', direction: 'asc' });

  const handleSort = (key: keyof SubcontractorStat | 'rank') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <i className="bi bi-arrow-down-up ms-2" style={{ fontSize: '10px', opacity: 0.3 }} />;
    }
    return sortConfig.direction === 'asc' 
      ? <i className="bi bi-arrow-up ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />
      : <i className="bi bi-arrow-down ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />;
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-border-divider)',
    background: 'var(--color-background-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 10
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Fetch raw events
      const { data: eventsData, error: eventsError } = await supabase
        .from('subcontractor_performance')
        .select('*')
        .order('event_datetime', { ascending: true });

      if (eventsError) throw eventsError;

      // 2. Fetch project details
      // Get unique obra_ids from eventsData to filter (optional, but good practice if list is huge)
      // For now fetch all or just rely on client-side join if dataset is manageable.
      // Given we need details for ALL events, let's fetch all relevant projects.
      // Or simply fetch all from forecast_data if not too large.
      // Let's optimize: extract unique obra_ids first.
      const uniqueObraIds = Array.from(new Set((eventsData || []).map(e => e.obra_id)));
      
      let projectsMap: Record<string, ProjectData> = {};
      
      if (uniqueObraIds.length > 0) {
        const { data: projectsData, error: projectsError } = await supabase
          .from('forecast_data')
          .select('id, job_site, type, lote_bld')
          .in('id', uniqueObraIds);
          
        if (projectsError) {
            console.error('Error fetching project data:', projectsError);
            // Non-blocking error, we can proceed without details
        } else {
            projectsData?.forEach(p => {
                projectsMap[p.id] = {
                    id: p.id,
                    job_site: p.job_site,
                    type: p.type,
                    lote_bld: p.lote_bld
                };
            });
        }
      }
      // 3. Fetch contract steps data
      let contractsMap: Record<string, { total: number; completed: number }> = {};
      
      if (uniqueObraIds.length > 0) {
        const { data: contractsData, error: contractsError } = await supabase
          .from('forecast_contract_steps')
          .select('obra_id, status')
          .in('obra_id', uniqueObraIds);
          
        if (contractsError) {
          console.error('Error fetching contract steps data:', contractsError);
        } else {
          contractsData?.forEach(c => {
            if (!contractsMap[c.obra_id]) {
              contractsMap[c.obra_id] = { total: 0, completed: 0 };
            }
            contractsMap[c.obra_id].total++;
            if (c.status === true) { // Explicitly check for true
              contractsMap[c.obra_id].completed++;
            }
          });
        }
      }
      
      setRawEvents(eventsData || []);
      setProjectData(projectsMap);
      setContractData(contractsMap);

      // 4. Fetch Backcharge data from timesheet_data_new
      const { data: tsData, error: tsError } = await supabase
        .from('timesheet_data_new')
        .select('id, reference_month, employee_name, regular_hours, jobsite, lot_building, worktype')
        .eq('worktype', 'Back Charge'); // Filter ONLY 'Back Charge' as requested

      if (tsError) {
        console.error('Error fetching backcharge data:', tsError);
      } else {
        // Fetch forecast data and contract steps to map subcontractors
        const { data: forecastData, error: fError } = await supabase
          .from('forecast_data')
          .select('id, job_site, lote_bld, type');

        const { data: stepsData, error: sError } = await supabase
          .from('forecast_contract_steps')
          .select('obra_id, team')
          .not('team', 'is', null);

        if (fError || sError) {
          console.error('Error fetching forecast mapping data:', fError || sError);
        } else {
          // Map obra_id to a team (subcontractor)
          const obraToTeam: Record<string, string> = {};
          const uniqueForecastTeams = new Set<string>();
          stepsData?.forEach(step => {
            if (step.team) {
              uniqueForecastTeams.add(step.team);
              if (!obraToTeam[step.obra_id]) {
                obraToTeam[step.obra_id] = step.team;
              }
            }
          });
          const currentForecastSubcontractors = Array.from(uniqueForecastTeams);
          setForecastSubcontractors(currentForecastSubcontractors);

          // Create a lookup map using normalized client, jobsite and lot/building
          const subLookup: Record<string, string> = {};
          forecastData?.forEach(f => {
            const team = obraToTeam[f.id];
            if (team) {
              const normalizedClient = normalizeJobSite(f.cliente);
              const normalizedJobSite = normalizeJobSite(f.job_site);
              const normalizedLot = normalizeLotBuilding(f.lote_bld);
              const key = `${normalizedClient}|${normalizedJobSite}|${normalizedLot}`;
              subLookup[key] = team;
            }
          });

          // Helper for fuzzy matching if exact normalized match fails
          const findFuzzyTeam = (tsClient: string, tsJobsite: string, tsLot: string) => {
            const normTsClient = normalizeJobSite(tsClient);
            const normTsJob = normalizeJobSite(tsJobsite);
            const normTsLot = normalizeLotBuilding(tsLot);
            
            // 1. Try exact normalized match (including client)
            const exactKey = `${normTsClient}|${normTsJob}|${normTsLot}`;
            if (subLookup[exactKey]) {
              // Find the forecast object for this exact match to get the full name
              const forecast = forecastData?.find(f => 
                normalizeJobSite(f.cliente) === normTsClient && 
                normalizeJobSite(f.job_site) === normTsJob && 
                normalizeLotBuilding(f.lote_bld) === normTsLot
              );
              return { team: subLookup[exactKey], forecastJobsite: forecast ? `${forecast.job_site} ${forecast.lote_bld || ''}` : undefined };
            }

            // 2. Try partial match
            const tsWords = normTsJob.split(' ').filter(w => w.length > 2);
            let bestMatch: { team: string; score: number; forecastJobsite?: string } | null = null;

            forecastData?.forEach(f => {
              const normFJob = normalizeJobSite(f.job_site);
              const normFLot = normalizeLotBuilding(f.lote_bld);
              const team = obraToTeam[f.id];
              if (!team) return;

              // REQUIRE EXACT LOT MATCH (considering only leading zeros removal by normalizeLotBuilding)
              if (normFLot !== normTsLot) return;

              let currentScore = 0;

              // Check jobsite words match
              const wordScore = tsWords.filter(word => normFJob.includes(word)).length;
              currentScore += wordScore * 2;

              // Check client match (Low priority, as it might be an employee name in timesheet)
              const normFClient = normalizeJobSite(f.cliente);
              if (normFClient === normTsClient && normTsClient !== '') {
                currentScore += 3;
              }

              if (currentScore > 0 && (!bestMatch || currentScore > bestMatch.score)) {
                bestMatch = { team, score: currentScore, forecastJobsite: `${f.job_site} ${f.lote_bld || ''}` };
              }
            });

            // Minimum score threshold to avoid false positives
            return (bestMatch && bestMatch.score >= 4) ? { team: bestMatch.team, forecastJobsite: bestMatch.forecastJobsite } : null;
          };

          const mappedBackcharges: BackchargeData[] = tsData?.map(ts => {
            const match = findFuzzyTeam(ts.client || '', ts.jobsite || '', ts.lot_building || '');
            
            return {
              id: ts.id.toString(),
              date: ts.reference_month || '', 
              employee_name: ts.employee_name,
              regular_hours: typeof ts.regular_hours === 'string' ? parseFloat(ts.regular_hours) : (ts.regular_hours || 0),
              jobsite: ts.jobsite,
              lot_building: ts.lot_building,
              worktype: ts.worktype,
              subcontractor: match?.team || 'Unknown Subcontractor',
              forecastJobsite: match?.forecastJobsite
            };
          }) || [];
          
          // 5. Fetch Material Usage data from Storage system (Refactored to hierarchy)
          const { data: rawMovements, error: storageError } = await premiumStorageClient
            .from('stock_movements')
            .select(`
              id,
              movement_date,
              pessoa_destinataria (
                nome,
                equipe_destinataria (
                  nome
                )
              ),
              stock_movement_items (
                quantidade,
                valor_unitario,
                products (
                  nome
                )
              )
            `)
            .eq('tipo', 'saida');

          if (storageError) {
            console.error('Error fetching Storage Material Usage:', storageError);
          } else if (rawMovements) {
            // Matrix comparison: use the distinct list of subcontractors from forecast_contract_steps
            // IMPORTANT: use the local variable currentForecastSubcontractors to avoid async state issues
            const subcontractorsList = currentForecastSubcontractors.length > 0 
              ? currentForecastSubcontractors 
              : Array.from(new Set(eventsData?.map(e => e.subcontractor) || []));

            // Grouping logic: group by period (mesStr) and storage team (teamName)
            const groupedMap: Record<string, MaterialUsageData> = {};

            (rawMovements as any[]).forEach(movement => {
              const pessoa = movement.pessoa_destinataria;
              const equipe = pessoa?.equipe_destinataria;
              const teamName = equipe?.nome || 'INTERNAL / NO TEAM';
              
              const totalValue = (movement.stock_movement_items || []).reduce((acc: number, item: any) => {
                return acc + (Math.abs(item.quantidade) * (item.valor_unitario || 0));
              }, 0);

              const totalItems = (movement.stock_movement_items || []).length;

              // Extract product details from this movement
              const currentItemsDetails = (movement.stock_movement_items || []).map((item: any) => ({
                product: item.products?.nome || 'Unknown Product',
                quantity: Math.abs(item.quantidade || 0)
              }));

              const date = movement.movement_date ? new Date(movement.movement_date) : new Date();
              const mesStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

              // Create unique key for grouping
              const groupKey = `${mesStr}_${teamName}`;

              if (groupedMap[groupKey]) {
                groupedMap[groupKey].valor_total_retirado += totalValue;
                groupedMap[groupKey].total_retiradas += totalItems;
                
                // Aggregate product details
                currentItemsDetails.forEach(newItem => {
                  const existingItem = groupedMap[groupKey].items_details?.find(i => i.product === newItem.product);
                  if (existingItem) {
                    existingItem.quantity += newItem.quantity;
                  } else {
                    groupedMap[groupKey].items_details?.push({ ...newItem });
                  }
                });
              } else {
                const normalizedTeam = teamName.trim().toUpperCase();
                
                // 1. Exact Match
                let matchedSub: string | undefined = subcontractorsList.find(s => s.trim().toUpperCase() === normalizedTeam);
                
                // 2. Fuzzy Match (Partial) - Only if not "INTERNAL / NO TEAM"
                if (!matchedSub && teamName !== 'INTERNAL / NO TEAM') {
                  // Common words to ignore in matching to avoid false positives
                  const ignoreWords = ['CONSTRUCTION', 'SERVICES', 'INC', 'CORP', 'LLC', 'AND', 'THE', 'PANELS', 'SYSTEMS', 'GROUP'];
                  
                  // Extract words from the storage team name, filtering out short words and common noise
                  const teamWords = normalizedTeam.split(/[\s,.-]+/)
                    .filter(w => w.length > 2 && !ignoreWords.includes(w));
                  
                  if (teamWords.length > 0) {
                    // Find a subcontractor that shares at least one significant word
                    matchedSub = subcontractorsList.find(sub => {
                      const normSub = sub.trim().toUpperCase();
                      const subWords = normSub.split(/[\s,.-]+/)
                        .filter(w => w.length > 2 && !ignoreWords.includes(w));
                      
                      // Check if any significant word from team name matches any significant word in subcontractor name
                      return teamWords.some(word => subWords.includes(word));
                    });
                  }
                }

                groupedMap[groupKey] = {
                  id: groupKey, // Using groupKey as ID since it's now an aggregate
                  mes: mesStr,
                  total_retiradas: totalItems,
                  valor_total_retirado: totalValue,
                  subcontractor: matchedSub || 'NOT IDENTIFIED',
                  storageTeamMatched: teamName,
                  items_details: [...currentItemsDetails]
                };
              }
            });

            setMaterialUsageData(Object.values(groupedMap));
          }

          setBackchargeData(mappedBackcharges);
        }
      }
    } catch (err: any) {
      console.error('Error fetching subcontractor performance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const rankingData = useMemo(() => {
    if (!rawEvents.length) return [];

    // 1. Group events by obra_id
    const works: Record<string, { start?: string; end?: string; subcontractor?: string }> = {};

    rawEvents.forEach(event => {
      if (!works[event.obra_id]) {
        works[event.obra_id] = {};
      }
      
      // Assume subcontractor is consistent across events for the same obra_id
      // If not, we might need logic to handle it, but for now take the first non-null
      if (event.subcontractor && !works[event.obra_id].subcontractor) {
        works[event.obra_id].subcontractor = event.subcontractor;
      }

      if (event.estimated_date_type === 'Start') {
        works[event.obra_id].start = event.event_datetime;
      } else if (event.estimated_date_type === 'End') {
        works[event.obra_id].end = event.event_datetime;
      }
    });

    // 2. Calculate duration for completed works and filter by date
    const completedWorks: { subcontractor: string; duration: number; obra_id: string; start: string; end: string }[] = [];

    Object.entries(works).forEach(([obra_id, work]) => {
      if (work.start && work.end && work.subcontractor) {
        const startDate = new Date(work.start);
        const endDate = new Date(work.end);
        
        // Use UTC methods to avoid timezone shifts when filtering by year/month
        const itemYear = endDate.getUTCFullYear().toString();
        const itemMonth = (endDate.getUTCMonth() + 1).toString().padStart(2, '0');

        // Filter by selected Year/Month based on End Date
        if (selectedYear && itemYear !== selectedYear) return;
        if (selectedMonth && itemMonth !== selectedMonth) return;

        // Calculate duration in days
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        completedWorks.push({
          subcontractor: work.subcontractor,
          duration: diffDays,
          obra_id: obra_id,
          start: work.start,
          end: work.end
        });
      }
    });

    // 3. Aggregate by subcontractor
    const stats: Record<string, { totalDuration: number; count: number; totalContractPct: number; works: WorkDetail[] }> = {};

    completedWorks.forEach(work => {
      if (!stats[work.subcontractor]) {
        stats[work.subcontractor] = { totalDuration: 0, count: 0, totalContractPct: 0, works: [] };
      }
      stats[work.subcontractor].totalDuration += work.duration;
      stats[work.subcontractor].count += 1;
      
      const pData = projectData[work.obra_id];
      const cData = contractData[work.obra_id];
      const contractPct = cData && cData.total > 0 ? (cData.completed / cData.total) * 100 : 0;
      
      stats[work.subcontractor].totalContractPct += contractPct;

      stats[work.subcontractor].works.push({
        id: work.obra_id,
        start: work.start,
        end: work.end,
        jobsite: pData?.job_site || 'Unknown',
        type: pData?.type || 'Unknown',
        building: pData?.lote_bld || 'Unknown',
        duration: work.duration,
        contractCompletion: contractPct
      });
    });

    // 4. Format for display and sort
    const formattedData = Object.entries(stats).map(([subcontractor, data]) => ({
      subcontractor,
      completedWorks: data.count,
      avgDuration: data.totalDuration / data.count,
      avgContractCompletion: data.totalContractPct / data.count,
      works: data.works
    }));

    // Default sort by avgDuration ascending (ranking logic)
    if (!sortConfig) {
      return formattedData.sort((a, b) => a.avgDuration - b.avgDuration);
    }

    return formattedData.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof SubcontractorStat];
      let bValue: any = b[sortConfig.key as keyof SubcontractorStat];

      // Special case for Rank (which is based on avgDuration ascending)
      if (sortConfig.key === 'rank') {
        aValue = a.avgDuration;
        bValue = b.avgDuration;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  }, [rawEvents, projectData, contractData, selectedYear, selectedMonth, sortConfig]);

  const backchargeRanking = useMemo(() => {
    if (!backchargeData.length) return [];

    const stats: Record<string, { totalHours: number; details: any[]; uniqueWorks: Set<string> }> = {};

    backchargeData.forEach(item => {
      // Filter by selected year/month
      // Use string splitting instead of new Date() to avoid timezone shifts for "YYYY-MM" strings
      const dateParts = item.date.split('-');
      const itemYear = dateParts[0];
      const itemMonth = dateParts[1];
      
      if (selectedYear && itemYear !== selectedYear) return;
      if (selectedMonth && itemMonth !== selectedMonth) return;

      const sub = item.subcontractor;
      if (!sub || sub === 'Unknown Subcontractor') return;

      if (!stats[sub]) {
        stats[sub] = { totalHours: 0, details: [], uniqueWorks: new Set() };
      }
      stats[sub].totalHours += item.regular_hours;
      
      // Track unique works (Jobsite + Lot)
      const workKey = `${item.jobsite}|${item.lot_building || ''}`;
      stats[sub].uniqueWorks.add(workKey);
      
      // Group details by jobsite, lot, and month/year to avoid duplicate lines in tooltip
      const monthYear = `${itemYear}-${itemMonth}`;
      const detailKey = `${item.jobsite}|${item.lot_building || ''}|${monthYear}`;
      
      const existingDetail = stats[sub].details.find(d => 
        `${d.jobsite}|${d.lot_building || ''}|${d.date}` === detailKey
      );

      if (existingDetail) {
        existingDetail.regular_hours += item.regular_hours;
      } else {
        stats[sub].details.push({
          jobsite: item.jobsite,
          lot_building: item.lot_building,
          regular_hours: item.regular_hours,
          date: monthYear
        });
      }
    });

    const formatted = Object.entries(stats).map(([subcontractor, data]) => ({
      subcontractor,
      totalHours: data.totalHours,
      worksCount: data.uniqueWorks.size,
      avgHoursPerWork: data.totalHours / data.uniqueWorks.size,
      details: data.details.sort((a, b) => {
        // 1. Sort by Jobsite
        const jobsiteA = a.jobsite.toLowerCase();
        const jobsiteB = b.jobsite.toLowerCase();
        if (jobsiteA < jobsiteB) return -1;
        if (jobsiteA > jobsiteB) return 1;

        // 2. Sort by Lot/Building
        const lotA = (a.lot_building || '').toLowerCase();
        const lotB = (b.lot_building || '').toLowerCase();
        if (lotA < lotB) return -1;
        if (lotA > lotB) return 1;

        // 3. Sort by Date (Year-Month) chronologically
        return a.date.localeCompare(b.date);
      })
    }));

    // Rank by totalHours descending
    return formatted.sort((a, b) => b.totalHours - a.totalHours);
  }, [backchargeData, selectedYear, selectedMonth]);

  const detailedBackchargeList = useMemo(() => {
    if (!backchargeData.length) return [];

    const aggregated: Record<string, any> = {};

    backchargeData
      .filter(item => {
        // Filter by selected year/month
        // Use string splitting instead of new Date() to avoid timezone shifts for "YYYY-MM" strings
        const dateParts = item.date.split('-');
        const itemYear = dateParts[0];
        const itemMonth = dateParts[1];
        
        if (selectedYear && itemYear !== selectedYear) return false;
        if (selectedMonth && itemMonth !== selectedMonth) return false;
        return true;
      })
      .forEach(item => {
        const period = item.date;
        const tsJobsite = `${item.jobsite} ${item.lot_building || ''}`;
        const forecastJobsite = item.forecastJobsite || 'NOT IDENTIFIED';
        const subcontractor = item.subcontractor || 'Unknown Subcontractor';
        
        // Key to group by: period, tsJobsite, forecastJobsite, subcontractor
        const key = `${period}|${tsJobsite}|${forecastJobsite}|${subcontractor}`;
        
        if (!aggregated[key]) {
          aggregated[key] = {
            period,
            tsJobsite,
            forecastJobsite,
            totalHours: 0,
            subcontractor
          };
        }
        
        aggregated[key].totalHours += item.regular_hours;
      });

    return Object.values(aggregated)
      .sort((a, b) => b.period.localeCompare(a.period) || b.totalHours - a.totalHours);
  }, [backchargeData, selectedYear, selectedMonth]);

  const materialRanking = useMemo(() => {
    if (!materialUsageData.length) return [];

    const grouped: Record<string, { totalValue: number; totalWithdrawals: number; subcontractors: Set<string> }> = {};

    materialUsageData.forEach(item => {
      // Group by the mapped subcontractor
      const sub = item.subcontractor || 'NOT IDENTIFIED';
      if (!grouped[sub]) {
        grouped[sub] = { totalValue: 0, totalWithdrawals: 0, subcontractors: new Set() };
      }
      grouped[sub].totalValue += item.valor_total_retirado;
      grouped[sub].totalWithdrawals += item.total_retiradas;
      grouped[sub].subcontractors.add(item.subcontractor || 'NOT IDENTIFIED');
    });

    return Object.entries(grouped)
      .map(([sub, data]) => ({
        subcontractor: sub,
        totalValue: data.totalValue,
        totalWithdrawals: data.totalWithdrawals
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [materialUsageData]);

  const detailedMaterialList = useMemo(() => {
    return materialUsageData
      .filter(item => {
        if (selectedYear && !item.mes.startsWith(selectedYear)) return false;
        if (selectedMonth && !item.mes.endsWith(selectedMonth)) return false;
        return true;
      })
      .sort((a, b) => b.mes.localeCompare(a.mes) || b.valor_total_retirado - a.valor_total_retirado);
  }, [materialUsageData, selectedYear, selectedMonth]);

  const handleMouseEnter = (e: React.MouseEvent, works: WorkDetail[]) => {
    // Clear any pending hide timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    
    // Position to the right by default
    let x = rect.right + 10;
    
    // If it doesn't fit on the right, flip to left
    if (x + tooltipWidth > window.innerWidth) {
        x = Math.max(10, rect.left - tooltipWidth - 10);
    }
    
    // Estimate height to avoid cutting off at bottom
    const estimatedHeight = Math.min(300, works.length * 90 + 70);
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: works,
      type: 'execution'
    });
  };

  const handleBackchargeMouseEnter = (e: React.MouseEvent, details: any[]) => {
    // Clear any pending hide timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    
    // Position to the right by default
    let x = rect.right + 10;
    
    // If it doesn't fit on the right, flip to left
    if (x + tooltipWidth > window.innerWidth) {
        x = Math.max(10, rect.left - tooltipWidth - 10);
    }
    
    // Estimate height to avoid cutting off at bottom
    const estimatedHeight = Math.min(300, details.length * 70 + 70);
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: details,
      type: 'backcharge'
    });
  };

  const handleMaterialMouseEnter = (e: React.MouseEvent, details: any[]) => {
    // Clear any pending hide timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    
    // Position to the right by default
    let x = rect.right + 10;
    
    // If it doesn't fit on the right, flip to left
    if (x + tooltipWidth > window.innerWidth) {
        x = Math.max(10, rect.left - tooltipWidth - 10);
    }
    
    // Estimate height to avoid cutting off at bottom
    const estimatedHeight = Math.min(300, details.length * 45 + 70);
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: details,
      type: 'material'
    });
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow moving mouse into tooltip
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(prev => ({ ...prev, visible: false }));
    }, 300);
  };

  const handleTooltipMouseEnter = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
     tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(prev => ({ ...prev, visible: false }));
    }, 300);
  };

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

      {/* Conteúdo principal */}
      <div className="custom-scrollbar" style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '20px' }}>
        {loading ? (
           <div className="d-flex justify-content-center align-items-center" style={{ height: '200px', color: 'var(--color-text-secondary)' }}>
             <div className="spinner-border" role="status">
               <span className="visually-hidden">Loading...</span>
             </div>
           </div>
        ) : error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : rankingData.length === 0 ? (
          <div className="col-12 text-center" style={{ padding: '100px', color: 'var(--color-text-secondary)' }}>
            <i className="bi bi-clipboard-check" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
            <p>No completed works found for the selected period.</p>
          </div>
        ) : (
          <>
            <div className="mx-4 mb-4" style={{ 
              background: 'var(--color-background-primary)', 
              border: '1px solid var(--color-border-divider)', 
              borderRadius: '8px',
              padding: '16px 20px'
            }}>
              <div className="d-flex align-items-center mb-3">
                <i className="bi bi-info-circle me-2" style={{ color: 'var(--color-accent-primary)', fontSize: '1rem' }}></i>
                <h6 style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px' }}>
                  Performance Evaluation Criteria
                </h6>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '16px',
                fontSize: '11px' 
              }}>
                {[
                  { 
                    label: 'Avg Execution Time', 
                    icon: 'bi-clock-history', 
                    desc: 'Média de dias entre o início e fim das obras concluídas.',
                    completed: true 
                  },
                  { 
                    label: 'Contract Completion', 
                    icon: 'bi-file-text-fill', 
                    desc: 'Percentual de etapas do contrato finalizadas no sistema.',
                    completed: true 
                  },
                  { 
                    label: 'Back Charges', 
                    icon: 'bi-exclamation-triangle-fill', 
                    desc: 'Custos extras por retrabalho ou erros (Identificados por Fuzzy Join).',
                    completed: true 
                  },
                  { 
                    label: 'Safety Level', 
                    icon: 'bi-shield-check', 
                    desc: 'Conformidade com normas de segurança (Em breve).',
                    completed: false 
                  },
                  { 
                    label: 'Material Usage', 
                    icon: 'bi-box-seam', 
                    desc: 'Eficiência no uso de materiais alocados (Integrado com Storage).',
                    completed: true 
                  },
                  { 
                    label: 'Excessive Withdrawals', 
                    icon: 'bi-cart-x-fill', 
                    desc: 'Alertas de retiradas acima do planejado (Em breve).',
                    completed: false 
                  }
                ].map((criterion, idx) => (
                  <div key={idx} className="d-flex flex-column gap-1">
                    <div className="d-flex align-items-center px-2 py-1" style={{ 
                      background: criterion.completed 
                        ? 'rgba(27, 191, 92, 0.12)' 
                        : 'var(--color-background-secondary)', 
                      borderRadius: '4px', 
                      border: criterion.completed 
                        ? '1.5px solid #1BBF5C' 
                        : '1px dashed var(--color-border-divider)',
                      width: 'fit-content' 
                    }}>
                      <i className={`bi ${criterion.icon} me-2`} style={{ 
                        color: criterion.completed ? '#1BBF5C' : 'var(--color-text-secondary)',
                        WebkitTextStroke: criterion.completed ? '0.5px #1BBF5C' : 'none'
                      }}></i>
                      <span style={{ 
                        fontWeight: 700, 
                        color: criterion.completed ? '#1BBF5C' : 'var(--color-text-secondary)' 
                      }}>
                        {criterion.label}
                      </span>
                    </div>
                    <span style={{ 
                      color: criterion.completed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', 
                      paddingLeft: '4px', 
                      fontSize: '10px', 
                      lineHeight: '1.2',
                      fontWeight: criterion.completed ? 600 : 400
                    }}>
                      {criterion.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation Bar for Segments */}
            <div className="mx-4 mb-4 px-3 py-2" style={{ 
              background: 'var(--color-background-secondary)', 
              borderRadius: '8px',
              border: '1px solid var(--color-border-divider)',
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}>
              {[
                { id: 'avg-execution', label: 'Avg Execution Time', icon: 'bi-clock-history' },
                { id: 'contract-completion', label: 'Contract Completion', icon: 'bi-file-text-fill' },
                { id: 'back-charges', label: 'Back Charges', icon: 'bi-exclamation-triangle-fill' },
                { id: 'material-usage', label: 'Material Usage', icon: 'bi-box-seam' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: activeTab === tab.id ? 'var(--color-background-primary)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    border: activeTab === tab.id ? '1px solid var(--color-border-divider)' : '1px solid transparent',
                    padding: '6px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: activeTab === tab.id ? 600 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                >
                  <i className={`bi ${tab.icon}`} style={{ 
                    color: activeTab === tab.id ? (tab.id === 'back-charges' ? 'var(--color-status-error-text)' : 'var(--color-status-success-text)') : 'inherit' 
                  }}></i>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mx-4 mb-4">
              <div className="border-0 p-0 d-flex justify-content-between align-items-center" style={{ background: 'var(--color-background-primary)' }}>
                <h4 className='my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
                  {activeTab === 'back-charges' ? (backchargeView === 'ranking' ? 'RANKING - BACK CHARGES' : 'DETAILED BACK CHARGE LIST') : 
                   activeTab === 'material-usage' ? (materialView === 'ranking' ? 'RANKING - MATERIAL USAGE' : 'DETAILED MATERIAL USAGE LIST') :
                   (activeTab === 'avg-execution' ? 'RANKING - AVG EXECUTION TIME' : 'RANKING - CONTRACT COMPLETION')}
                </h4>
                
                {activeTab === 'back-charges' && (
                  <div className="d-flex gap-2">
                    <button 
                      onClick={() => setBackchargeView('ranking')}
                      className="btn btn-sm"
                      style={{
                        background: backchargeView === 'ranking' ? 'var(--color-background-secondary)' : 'transparent',
                        color: backchargeView === 'ranking' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        fontSize: '12px',
                        fontWeight: backchargeView === 'ranking' ? 600 : 400
                      }}
                    >
                      <i className="bi bi-list-ol me-1"></i> Ranking
                    </button>
                    <button 
                      onClick={() => setBackchargeView('details')}
                      className="btn btn-sm"
                      style={{
                        background: backchargeView === 'details' ? 'var(--color-background-secondary)' : 'transparent',
                        color: backchargeView === 'details' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        fontSize: '12px',
                        fontWeight: backchargeView === 'details' ? 600 : 400
                      }}
                    >
                      <i className="bi bi-search me-1"></i> Debug List
                    </button>
                  </div>
                )}

                {activeTab === 'material-usage' && (
                  <div className="d-flex gap-2">
                    <button 
                      onClick={() => setMaterialView('ranking')}
                      className="btn btn-sm"
                      style={{
                        background: materialView === 'ranking' ? 'var(--color-background-secondary)' : 'transparent',
                        color: materialView === 'ranking' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        fontSize: '12px',
                        fontWeight: materialView === 'ranking' ? 600 : 400
                      }}
                    >
                      <i className="bi bi-list-ol me-1"></i> Ranking
                    </button>
                    <button 
                      onClick={() => setMaterialView('details')}
                      className="btn btn-sm"
                      style={{
                        background: materialView === 'details' ? 'var(--color-background-secondary)' : 'transparent',
                        color: materialView === 'details' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        fontSize: '12px',
                        fontWeight: materialView === 'details' ? 600 : 400
                      }}
                    >
                      <i className="bi bi-search me-1"></i> Debug List
                    </button>
                  </div>
                )}
              </div>
              <div style={{ 
                background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 0,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div className="table-responsive custom-scrollbar" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {activeTab === 'back-charges' ? (
                    backchargeView === 'ranking' ? (
                      <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                          <tr>
                            <th style={headerStyle}>RANK</th>
                            <th style={headerStyle}>SUBCONTRACTOR</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>TOTAL BACKCHARGE HOURS</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>WORKS</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>AVG HOURS BY WORK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backchargeRanking.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No backcharge records found for the selected period.
                              </td>
                            </tr>
                          ) : (
                            backchargeRanking.map((item, index) => (
                              <tr key={item.subcontractor} style={{ transition: 'background-color 0.2s ease' }}>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {index + 1}
                                    {index === 0 && <i className="bi bi-exclamation-octagon-fill ms-2" style={{ color: 'var(--color-status-error-text)' }}></i>}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div 
                                    style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer', display: 'inline-block' }}
                                    onMouseEnter={(e) => handleBackchargeMouseEnter(e, item.details)}
                                    onMouseLeave={handleMouseLeave}
                                  >
                                    {item.subcontractor}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {item.totalHours.toFixed(1)} h
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {item.worksCount}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {item.avgHoursPerWork.toFixed(1)} h/work
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                          <tr>
                            <th style={{ ...headerStyle, width: '120px' }}>PERIOD (YEAR-MO)</th>
                            <th style={{ ...headerStyle, width: '350px' }}>TIMESHEET JOBSITE (ORIGINAL)</th>
                            <th style={{ ...headerStyle, width: '350px' }}>FORECAST IDENTIFIED (FUZZY)</th>
                            <th style={{ ...headerStyle, textAlign: 'center', width: '100px' }}>HOURS</th>
                            <th style={headerStyle}>RESPONSIBLE TEAM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedBackchargeList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No raw backcharge records found.
                              </td>
                            </tr>
                          ) : (
                            detailedBackchargeList.map((item, index) => (
                                <tr key={index} style={{ transition: 'background-color 0.2s ease' }}>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.period}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.tsJobsite}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: item.forecastJobsite === 'NOT IDENTIFIED' ? 'var(--color-status-error-text)' : 'var(--color-text-primary)' }}>
                                    {item.forecastJobsite}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.totalHours.toFixed(1)} h
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.subcontractor}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    )
                  ) : activeTab === 'material-usage' ? (
                    materialView === 'ranking' ? (
                      <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                          <tr>
                            <th style={headerStyle}>RANK</th>
                            <th style={headerStyle}>SUBCONTRACTOR</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>TOTAL MATERIAL VALUE</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>TOTAL WITHDRAWALS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materialRanking.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No material usage records found for the selected period.
                              </td>
                            </tr>
                          ) : (
                            materialRanking.map((item, index) => (
                              <tr key={item.subcontractor} style={{ transition: 'background-color 0.2s ease' }}>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {index + 1}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {item.subcontractor}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--positive-color)', fontSize: '13px' }}>
                                    ${item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px' }}>
                                    {item.totalWithdrawals}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                          <tr>
                            <th style={{ ...headerStyle, width: '120px' }}>PERIOD</th>
                            <th style={{ ...headerStyle, width: '350px' }}>STORAGE TEAM</th>
                            <th style={{ ...headerStyle, width: '350px' }}>SUBCONTRACTOR</th>
                            <th style={{ ...headerStyle, textAlign: 'center', width: '150px' }}>VALUE</th>
                            <th style={{ ...headerStyle, textAlign: 'center', width: '100px' }}>ITEMS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedMaterialList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No raw material usage records found.
                              </td>
                            </tr>
                          ) : (
                            detailedMaterialList.map((item, index) => (
                                <tr key={index} style={{ transition: 'background-color 0.2s ease' }}>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.mes}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.storageTeamMatched}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: item.subcontractor === 'NOT IDENTIFIED' ? 'var(--color-status-error-text)' : 'var(--color-text-primary)' }}>
                                    {item.subcontractor}
                                  </td>
                                  <td 
                                    style={{ 
                                      padding: '12px 24px', 
                                      fontSize: '12px', 
                                      fontFamily: 'monospace', 
                                      textAlign: 'center', 
                                      borderBottom: '1px solid var(--color-border-divider)', 
                                      background: 'var(--color-background-primary)', 
                                      color: 'var(--positive-color)', 
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => handleMaterialMouseEnter(e, item.items_details || [])}
                                    onMouseLeave={handleMouseLeave}
                                  >
                                    ${item.valor_total_retirado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td style={{ padding: '12px 24px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
                                    {item.total_retiradas}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    )
                  ) : (
                    <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                        <tr>
                          <th style={headerStyle} onClick={() => handleSort('rank')}>
                            RANK <SortIcon columnKey="rank" />
                          </th>
                          <th style={headerStyle} onClick={() => handleSort('subcontractor')}>
                            SUBCONTRACTOR <SortIcon columnKey="subcontractor" />
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('completedWorks')}>
                            COMPLETED WORKS <SortIcon columnKey="completedWorks" />
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgDuration')}>
                            AVG DURATION (DAYS) <SortIcon columnKey="avgDuration" />
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgContractCompletion')}>
                            CONTRACT COMPLETION <SortIcon columnKey="avgContractCompletion" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingData.map((item, index) => {
                           return (
                            <tr key={item.subcontractor} style={{ transition: 'background-color 0.2s ease' }}>
                              <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                  {index + 1}
                                  {index === 0 && <i className="bi bi-trophy-fill ms-2" style={{ color: 'var(--color-status-warning-text)' }}></i>}
                                  {index === 1 && <i className="bi bi-trophy-fill ms-2" style={{ color: 'var(--color-text-secondary)' }}></i>}
                                  {index === 2 && <i className="bi bi-trophy-fill ms-2" style={{ color: 'var(--color-status-pending-text)' }}></i>}
                                </div>
                              </td>
                              <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.subcontractor}</div>
                              </td>
                              <td 
                                style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}
                              >
                                <span 
                                  style={{ color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer', display: 'inline-block', padding: '4px' }}
                                  onMouseEnter={(e) => handleMouseEnter(e, item.works)}
                                  onMouseLeave={handleMouseLeave}
                                >
                                  {item.completedWorks}
                                </span>
                              </td>
                              <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500 }}>
                                  {item.avgDuration.toFixed(1)}
                              </td>
                              <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500 }}>
                                  {item.avgContractCompletion.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div 
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: tooltip.x,
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '8px',
            padding: '0',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            width: '320px',
            maxHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid var(--color-border-divider)', 
            background: 'var(--color-background-tertiary)',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px'
          }}>
            <h6 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {tooltip.type === 'execution' ? 'Completed Works Details' : 
               tooltip.type === 'material' ? 'Material Usage Details' : 'Backcharge Works Details'}
            </h6>
          </div>
          <div className="custom-scrollbar" style={{ 
            padding: '12px', 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px' 
          }}>
            {tooltip.type === 'execution' ? (
              tooltip.content.map((work, idx) => (
                <div key={idx} style={{ 
                  fontSize: '12px', 
                  color: 'var(--color-text-secondary)', 
                  padding: '10px', 
                  background: 'var(--color-background-primary)', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border-divider)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'border-color 0.2s',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center' }}>
                     <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {work.jobsite}
                     </div>
                     <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                       {work.type}
                     </div>
                     <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                       {work.building}
                     </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border-divider)', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                      <span title="Start Date"><i className="bi bi-calendar-event me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                        {new Date(work.start).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                      </span>
                      <span title="End Date"><i className="bi bi-calendar-check me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                        {new Date(work.end).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span title="Duration" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        <i className="bi bi-clock me-1" style={{ color: 'var(--color-text-tertiary)' }}></i>
                        {work.duration} days
                      </span>
                      <span title="Contract Completion" style={{ 
                        fontWeight: 600, 
                        color: work.contractCompletion >= 100 ? 'var(--color-status-success-text)' : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <i className="bi bi-file-text" style={{ fontSize: '10px' }}></i>
                        {work.contractCompletion.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : tooltip.type === 'material' ? (
              tooltip.content.map((item, idx) => (
                <div key={idx} style={{ 
                  fontSize: '12px', 
                  color: 'var(--color-text-secondary)', 
                  padding: '10px', 
                  background: 'var(--color-background-primary)', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border-divider)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'border-color 0.2s',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}
                >
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                    {item.product}
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--color-accent-primary)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: '4px', minWidth: '40px', textAlign: 'center' }}>
                    {item.quantity}
                  </div>
                </div>
              ))
            ) : (
              tooltip.content.map((item, idx) => (
                <div key={idx} style={{ 
                  fontSize: '12px', 
                  color: 'var(--color-text-secondary)', 
                  padding: '10px', 
                  background: 'var(--color-background-primary)', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border-divider)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'border-color 0.2s',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-status-error-border)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                     <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {item.jobsite}
                     </div>
                     <div style={{ fontWeight: 600, color: 'var(--color-status-error-text)' }}>
                       {item.regular_hours.toFixed(1)} h
                     </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border-divider)', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                      <i className="bi bi-building me-1"></i>
                      {item.lot_building || 'N/A'}
                    </div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>
                      <i className="bi bi-calendar3 me-1"></i>
                      {item.date}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
