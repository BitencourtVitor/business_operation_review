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
  excessive_details?: { product: string; quantity: number; limit: number; project: string }[];
}

interface ExcessiveWithdrawalData {
  subcontractor: string;
  count: number;
  details: {
    product: string;
    withdrawn: number;
    limit: number;
    project: string;
    date: string;
  }[];
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
  const [viewMode, setViewMode] = useState<'detailed' | 'consolidated'>('consolidated');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    content: any[] | { items: any[], excessive: any[] }; 
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
          const subcontractorsList = Array.from(uniqueForecastTeams);
          setForecastSubcontractors(subcontractorsList);

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
              project_id,
              projects (
                nome,
                house_models (
                  id,
                  nome,
                  house_model_products (
                    product_id,
                    quantidade_limite
                  )
                )
              ),
              pessoa_destinataria (
                nome,
                equipe_destinataria (
                  nome
                )
              ),
              stock_movement_items (
                product_id,
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
            // Grouping logic: group by period (mesStr) and storage team (teamName)
            const groupedMap: Record<string, MaterialUsageData> = {};
            
            // To track total consumption per project and product across all movements
            const projectProductConsumption: Record<string, Record<string, number>> = {};

            (rawMovements as any[]).forEach(movement => {
              const projectName = movement.projects?.nome || '';
              if (projectName.toUpperCase().includes('(TEST)')) return;

              const pessoa = movement.pessoa_destinataria;
              const equipe = pessoa?.equipe_destinataria;
              const teamName = equipe?.nome || 'INTERNAL / NO TEAM';
              const projectId = movement.project_id;
              
              // 1. Calculate consumption and aggregate by project/product
              (movement.stock_movement_items || []).forEach((item: any) => {
                if (projectId && item.product_id) {
                  if (!projectProductConsumption[projectId]) projectProductConsumption[projectId] = {};
                  if (!projectProductConsumption[projectId][item.product_id]) projectProductConsumption[projectId][item.product_id] = 0;
                  projectProductConsumption[projectId][item.product_id] += Math.abs(item.quantidade || 0);
                }
              });

              const totalValue = (movement.stock_movement_items || []).reduce((acc: number, item: any) => {
                return acc + (Math.abs(item.quantidade) * (item.valor_unitario || 0));
              }, 0);

              const totalQuantity = (movement.stock_movement_items || []).reduce((acc: number, item: any) => {
                return acc + Math.abs(item.quantidade || 0);
              }, 0);

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
                groupedMap[groupKey].total_retiradas += totalQuantity;
                
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
                  const ignoreWords = ['CONSTRUCTION', 'SERVICES', 'INC', 'CORP', 'LLC', 'AND', 'THE', 'PANELS', 'SYSTEMS', 'GROUP'];
                  const teamWords = normalizedTeam.split(/[\s,.-]+/)
                    .filter(w => w.length > 2 && !ignoreWords.includes(w));
                  
                  if (teamWords.length > 0) {
                    matchedSub = subcontractorsList.find(sub => {
                      const normSub = sub.trim().toUpperCase();
                      const subWords = normSub.split(/[\s,.-]+/)
                        .filter(w => w.length > 2 && !ignoreWords.includes(w));
                      return teamWords.some(word => subWords.includes(word));
                    });
                  }
                }

                groupedMap[groupKey] = {
                  id: groupKey,
                  mes: mesStr,
                  total_retiradas: totalQuantity,
                  valor_total_retirado: totalValue,
                  subcontractor: matchedSub || 'NOT IDENTIFIED',
                  storageTeamMatched: teamName,
                  items_details: [...currentItemsDetails],
                  excessive_details: []
                };
              }

              // 2. Check for Excessive Withdrawals (comparing accumulated consumption with template limits)
              if (projectId && movement.projects?.house_models?.house_model_products) {
                const limits = movement.projects.house_models.house_model_products;
                const projectName = movement.projects.nome;

                (movement.stock_movement_items || []).forEach((item: any) => {
                  const productId = item.product_id;
                  const productName = item.products?.nome || 'Unknown Product';
                  const limitObj = limits.find((l: any) => l.product_id === productId);
                  
                  if (limitObj) {
                    const limit = limitObj.quantidade_limite;
                    const totalConsumed = projectProductConsumption[projectId][productId];
                    
                    if (totalConsumed > limit) {
                      // Check if we already added this excessive withdrawal to this group
                      const existingExcess = groupedMap[groupKey].excessive_details?.find(e => e.product === productName && e.project === projectName);
                      if (!existingExcess) {
                        groupedMap[groupKey].excessive_details?.push({
                          product: productName,
                          quantity: totalConsumed,
                          limit: limit,
                          project: projectName
                        });
                      } else {
                        // Update with latest total consumption
                        existingExcess.quantity = totalConsumed;
                      }
                    }
                  }
                });
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

  const executionRanking = useMemo(() => {
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

  const rankingData = executionRanking;

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

    const grouped: Record<string, { totalValue: number; totalWithdrawals: number; subcontractors: Set<string>; excessiveCount: number }> = {};

    materialUsageData.forEach(item => {
      // Group by the mapped subcontractor
      const sub = item.subcontractor || 'NOT IDENTIFIED';
      if (sub === 'NOT IDENTIFIED') return;
      
      if (!grouped[sub]) {
        grouped[sub] = { totalValue: 0, totalWithdrawals: 0, subcontractors: new Set(), excessiveCount: 0 };
      }
      grouped[sub].totalValue += item.valor_total_retirado;
      grouped[sub].totalWithdrawals += item.total_retiradas;
      grouped[sub].excessiveCount += (item.excessive_details?.length || 0);
      grouped[sub].subcontractors.add(sub);
    });

    return Object.entries(grouped)
      .map(([sub, data]) => ({
        subcontractor: sub,
        totalValue: data.totalValue,
        totalWithdrawals: data.totalWithdrawals,
        excessiveCount: data.excessiveCount
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [materialUsageData]);

  const detailedMaterialList = useMemo(() => {
    return materialUsageData
      .filter(item => {
        if (item.subcontractor === 'NOT IDENTIFIED' || !item.subcontractor) return false;
        if (selectedYear && !item.mes.startsWith(selectedYear)) return false;
        if (selectedMonth && !item.mes.endsWith(selectedMonth)) return false;
        return true;
      })
      .sort((a, b) => b.mes.localeCompare(a.mes) || b.valor_total_retirado - a.valor_total_retirado);
  }, [materialUsageData, selectedYear, selectedMonth]);

  const excessiveWithdrawalsRanking = useMemo(() => {
    if (!materialUsageData.length) return [];

    const stats: Record<string, { totalExcess: number; details: any[] }> = {};

    materialUsageData.forEach(item => {
      const sub = item.subcontractor || 'NOT IDENTIFIED';
      if (sub === 'NOT IDENTIFIED') return;
      
      if (item.excessive_details && item.excessive_details.length > 0) {
        if (!stats[sub]) {
          stats[sub] = { totalExcess: 0, details: [] };
        }
        
        item.excessive_details.forEach(ex => {
          stats[sub].totalExcess++;
          stats[sub].details.push({
            ...ex,
            mes: item.mes,
            storageTeamMatched: item.storageTeamMatched
          });
        });
      }
    });

    return Object.entries(stats)
      .map(([subcontractor, data]) => ({
        subcontractor,
        totalExcess: data.totalExcess,
        details: data.details
      }))
      .sort((a, b) => b.totalExcess - a.totalExcess);
  }, [materialUsageData]);

  const consolidatedScorecard = useMemo(() => {
    // Collect all unique subcontractors across all data sources
    const allSubcontractors = new Set<string>();
    executionRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    backchargeRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    materialRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    excessiveWithdrawalsRanking.forEach(r => allSubcontractors.add(r.subcontractor));

    return Array.from(allSubcontractors).map(sub => {
      const exec = executionRanking.find(r => r.subcontractor === sub);
      const back = backchargeRanking.find(r => r.subcontractor === sub);
      const mat = materialRanking.find(r => r.subcontractor === sub);
      const exc = excessiveWithdrawalsRanking.find(r => r.subcontractor === sub);

      // 1. Tempo de Execução (Weight: 25%)
      // Higher avgDuration is worse. Lower is better.
      // Reference: 20 days is a good average.
      const avgDuration = exec?.avgDuration || 30;
      const durationScore = Math.max(0, 100 - (avgDuration * 2.5));

      // 2. Completude de Contrato (Weight: 20%)
      const contractScore = exec?.avgContractCompletion || 0;

      // 3. Backcharges (Weight: 20%)
      // Higher totalHours is worse.
      const backHours = back?.totalHours || 0;
      const backScore = Math.max(0, 100 - (backHours * 5));

      // 4. Eficiência de Material (Weight: 20%)
      // Higher value per work is worse.
      // Adjusted divisor to 250 (zeroing at $25k) to account for varying project sizes
      const completedWorks = exec?.completedWorks || 1;
      const matValue = mat?.totalValue || 0;
      const matPerWork = matValue / completedWorks;
      const matScore = Math.max(0, 100 - (matPerWork / 250));

      // 5. Alertas de Excesso (Weight: 15%)
      const excessCount = exc?.totalExcess || 0;
      const excessScore = Math.max(0, 100 - (excessCount * 10));

      // 6. Safety Level (Weight: 0% - Placeholder)
      const safetyScore = null;
      const safetyValue = null;

      const finalScore = (
        (durationScore * 0.25) +
        (contractScore * 0.20) +
        (backScore * 0.20) +
        (matScore * 0.20) +
        (excessScore * 0.15)
      );

      return {
        subcontractor: sub,
        finalScore,
        metrics: {
          duration: { score: durationScore, value: avgDuration, label: 'Execution Time' },
          contract: { score: contractScore, value: contractScore, label: 'Contract Completion' },
          backcharge: { score: backScore, value: backHours, label: 'Backcharges' },
          material: { score: matScore, value: matValue, label: 'Material Usage' },
          excess: { score: excessScore, value: excessCount, label: 'Excess Alerts' },
          safety: { score: safetyScore, value: safetyValue, label: 'Safety Level' }
        }
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }, [executionRanking, backchargeRanking, materialRanking, excessiveWithdrawalsRanking]);

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

    // Safety check for top overflow
    if (y < 10) {
        y = 10;
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

    // Safety check for top overflow
    if (y < 10) {
        y = 10;
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: details,
      type: 'backcharge'
    });
  };

  const handleMaterialMouseEnter = (e: React.MouseEvent, details: any[], excessiveDetails?: any[]) => {
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
    const totalItems = (details?.length || 0) + (excessiveDetails?.length || 0);
    const estimatedHeight = Math.min(450, totalItems * 65 + 100); // Increased estimate
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }
    
    // Safety check for top overflow
    if (y < 10) {
        y = 10;
    }

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: { items: details, excessive: excessiveDetails || [] },
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
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
          Subcontractor Performance
        </h1>
        
        <div className="d-flex align-items-center gap-3">
          <SubcontractorPerformanceFilters
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            years={years}
            months={months}
          />
          
          <div style={{ width: '1px', height: '24px', background: 'var(--color-border-divider)', margin: '0 4px' }}></div>

          <button 
            onClick={() => setViewMode(prev => prev === 'consolidated' ? 'detailed' : 'consolidated')}
            style={{
              background: 'var(--color-background-secondary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              e.currentTarget.style.background = 'var(--color-background-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-divider)';
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }}
          >
            <i className={`bi ${viewMode === 'consolidated' ? 'bi-grid-3x3-gap-fill' : 'bi-speedometer2'}`} style={{ fontSize: '14px', color: 'var(--color-accent-primary)' }}></i>
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '11px' }}>
              {viewMode === 'consolidated' ? 'Detailed View' : 'Scorecard View'}
            </span>
          </button>
        </div>
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
        ) : (
          <>
            <div className="container-fluid px-2 py-2">
            {/* Help Container: Entendendo as Notas */}
            <div className="mx-0 mb-4" style={{ 
              background: 'transparent', 
              border: '1px solid var(--color-border-divider)', 
              borderRadius: '12px',
              padding: '20px',
              position: 'relative'
            }}>
              <div className="d-flex align-items-start mb-4" style={{ textAlign: 'start' }}>
                <i className="bi bi-info-circle me-3 mt-1" style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', opacity: 0.7 }}></i>
                <div>
                  <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'start' }}>
                    Entendendo o Cálculo das Notas
                  </h6>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', opacity: 0.8, textAlign: 'start' }}>
                    As métricas abaixo compõem a nota final de cada subcontractor, garantindo transparência no processo.
                  </p>
                </div>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '24px 32px' 
              }}>
                {[
                  { 
                    label: 'Execution Time', 
                    icon: 'bi-clock-history', 
                    desc: 'Mede a rapidez em relação à média: quanto menor o tempo médio de entrega comparado ao padrão de 40 dias, maior a pontuação.',
                    weight: '25%'
                  },
                  { 
                    label: 'Contract Completion', 
                    icon: 'bi-file-text-fill', 
                    desc: 'Proporção de completude das etapas necessárias para o cumprimento dos contratos das obras onde a equipe é direcionada.',
                    weight: '20%'
                  },
                  { 
                    label: 'Backcharges', 
                    icon: 'bi-exclamation-triangle-fill', 
                    desc: 'Penaliza custos extras por retrabalho. Nota zero acima de 20h de erros acumulados.',
                    weight: '20%'
                  },
                  { 
                    label: 'Material Usage', 
                    icon: 'bi-box-seam', 
                    desc: 'Valor total de materiais gasto vs número de obras concluídas, considerando a complexidade de cada projeto.',
                    weight: '20%'
                  },
                  { 
                    label: 'Excess Alerts', 
                    icon: 'bi-cart-x-fill', 
                    desc: 'Cada retirada acima do limite planejado deduz 10 pontos da nota total.',
                    weight: '15%'
                  },
                  { 
                    label: 'Safety Level', 
                    icon: 'bi-shield-check', 
                    desc: 'Em breve: Avaliação do cumprimento de normas e uso de EPIs no canteiro.',
                    weight: '0%'
                  }
                ].map((criterion, idx) => (
                  <div key={idx} className="d-flex gap-2" style={{ textAlign: 'start' }}>
                    <div style={{ flex: 1, textAlign: 'start' }}>
                      <div className="d-flex align-items-center gap-2 mb-1" style={{ textAlign: 'start' }}>
                        <i className={`bi ${criterion.icon}`} style={{ 
                          fontSize: '12px', 
                          color: criterion.label === 'Safety Level' ? 'var(--color-text-secondary)' : 'var(--color-accent-primary)', 
                          opacity: criterion.label === 'Safety Level' ? 0.4 : 0.8 
                        }}></i>
                        <span style={{ 
                          fontWeight: 600, 
                          fontSize: '12px', 
                          color: criterion.label === 'Safety Level' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                          opacity: criterion.label === 'Safety Level' ? 0.6 : 1,
                          textAlign: 'start'
                        }}>
                          {criterion.label}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', marginLeft: 'auto', opacity: 0.6 }}>
                          PESO {criterion.weight}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--color-text-secondary)', 
                        lineHeight: '1.5', 
                        paddingLeft: '20px', 
                        borderLeft: '1px solid var(--color-border-divider)', 
                        marginLeft: '6px',
                        opacity: criterion.label === 'Safety Level' ? 0.5 : 1,
                        textAlign: 'start'
                      }}>
                        {criterion.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {viewMode === 'consolidated' ? (
              <div className="d-flex flex-column gap-3">
                {/* Ranking Header Bar */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '0 8px',
                  marginBottom: '12px'
                }}>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: 800, 
                    color: 'var(--color-text-secondary)', 
                    textTransform: 'uppercase', 
                    letterSpacing: '2px',
                    opacity: 0.8
                  }}>
                    Ranking
                  </span>
                  <div style={{ 
                    height: '1px', 
                    flex: 1, 
                    background: 'linear-gradient(to left, transparent, var(--color-border-divider))' 
                  }}></div>
                </div>

                {consolidatedScorecard.length === 0 ? (
                  <div className="col-12 text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                    <i className="bi bi-speedometer2" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
                    <p>No performance data available for the selected period.</p>
                  </div>
                ) : (
                  consolidatedScorecard.map((item, idx) => (
                    <div key={item.subcontractor} className="col-12">
                      <div style={{ 
                        background: 'var(--color-background-secondary)',
                        borderRadius: '12px',
                        border: '1px solid var(--color-border-divider)',
                        padding: '12px 16px',
                        transition: 'all 0.2s ease',
                        cursor: 'default',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      >
                        {/* LADO ESQUERDO: RANK E NOME */}
                        <div style={{ flex: '0 0 190px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 900, 
                            color: idx === 0 ? '#fbbf24' : // Ouro
                                   idx === 1 ? '#94a3b8' : // Prata
                                   idx === 2 ? '#cd7f32' : // Bronze
                                   'var(--color-text-secondary)',
                            background: idx === 0 ? 'rgba(251, 191, 36, 0.1)' : 
                                        idx === 1 ? 'rgba(148, 163, 184, 0.1)' : 
                                        idx === 2 ? 'rgba(205, 127, 50, 0.1)' : 
                                        'var(--color-background-tertiary)',
                            border: `1px solid ${
                              idx === 0 ? '#fbbf24' : 
                              idx === 1 ? '#94a3b8' : 
                              idx === 2 ? '#cd7f32' : 
                              'var(--color-border-divider)'
                            }`,
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            position: 'relative',
                            boxShadow: idx < 3 ? `0 0 10px ${
                              idx === 0 ? 'rgba(251, 191, 36, 0.2)' : 
                              idx === 1 ? 'rgba(148, 163, 184, 0.2)' : 
                              'rgba(205, 127, 50, 0.2)'
                            }` : 'none'
                          }}>
                            <span style={{ position: 'relative', top: '-0.5px' }}>{idx + 1}</span>
                          </div>
                          <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                            <h3 style={{ 
                              margin: 0, 
                              marginRight: '10px',
                              fontSize: '15px', 
                              fontWeight: 600, 
                              color: 'var(--color-text-primary)', 
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                              lineHeight: '1.2',
                              letterSpacing: '-0.2px'
                            }}>
                              {item.subcontractor}
                            </h3>
                          </div>
                        </div>

                        {/* CENTRO: MÉTRICAS E NOTAS */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', padding: '0 6px', borderLeft: '1px solid var(--color-border-divider)', borderRight: '1px solid var(--color-border-divider)' }}>
                          {Object.entries(item.metrics).map(([key, metric]: [string, any], mIdx) => {
                            const hasScore = metric.score !== null;
                            const scoreColor = !hasScore ? 'var(--color-text-primary)' :
                                             metric.score >= 80 ? '#22c55e' : 
                                             metric.score >= 60 ? '#f59e0b' : 
                                             '#ef4444';
                            
                            return (
                              <div key={key} style={{ 
                                textAlign: 'left',
                                borderRight: mIdx < 5 ? '1px solid var(--color-border-divider)' : 'none',
                                padding: '0 4px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center'
                              }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                  {metric.label}
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {/* Valor Real */}
                                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                                    {!hasScore ? '---' :
                                     key === 'duration' ? `${Math.round(metric.value)}d` :
                                     key === 'contract' ? `${metric.value.toFixed(0)}%` :
                                     key === 'backcharge' ? `${metric.value.toFixed(2)}h` :
                                     key === 'material' ? `$${(metric.value / 1000).toFixed(1)}k` :
                                     `${metric.value}`}
                                  </div>

                                  {/* Nota 0-100 */}
                                  <div style={{ 
                                    fontSize: '11px', 
                                    fontWeight: 900, 
                                    color: scoreColor,
                                    letterSpacing: '0.2px',
                                    paddingTop: '3px',
                                    borderTop: '1px solid var(--color-border-divider)',
                                    width: 'fit-content',
                                    opacity: hasScore ? 1 : 0.5
                                  }}>
                                    {hasScore ? Math.round(metric.score) : 'PENDING'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* LADO DIREITO: OVERALL SCORE */}
                        <div style={{ flex: '0 0 80px', textAlign: 'center', paddingLeft: '8px' }}>
                          <div style={{ 
                            fontSize: '28px', 
                            fontWeight: 900, 
                            color: item.finalScore >= 80 ? '#22c55e' : 
                                   item.finalScore >= 60 ? '#f59e0b' : 
                                   '#ef4444',
                            lineHeight: 1,
                            marginBottom: '2px'
                          }}>
                            {Math.round(item.finalScore)}
                          </div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            OVERALL
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="container-fluid px-2">
                {/* Navigation Bar for Segments */}
                <div className="mx-0 mb-4 px-3 py-2" style={{ 
                  background: 'var(--color-background-secondary)', 
                  borderRadius: '12px',
                  border: '1px solid var(--color-border-divider)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  {[
                    { id: 'avg-execution', label: 'Avg Execution Time', icon: 'bi-clock-history' },
                    { id: 'contract-completion', label: 'Contract Completion', icon: 'bi-file-text-fill' },
                    { id: 'back-charges', label: 'Back Charges', icon: 'bi-exclamation-triangle-fill' },
                    { id: 'material-usage', label: 'Material Usage', icon: 'bi-box-seam' },
                    { id: 'excessive-withdrawals', label: 'Excessive Withdrawals', icon: 'bi-cart-x-fill' }
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

                <div className="mx-0 mb-4">
                  <div className="border-0 p-0 d-flex justify-content-between align-items-center" style={{ background: 'var(--color-background-primary)' }}>
                    <h4 className='my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
                      {activeTab === 'back-charges' ? (backchargeView === 'ranking' ? 'RANKING - BACK CHARGES' : 'DETAILED BACK CHARGE LIST') : 
                       activeTab === 'material-usage' ? (materialView === 'ranking' ? 'RANKING - MATERIAL USAGE' : 'DETAILED MATERIAL USAGE LIST') :
                       activeTab === 'excessive-withdrawals' ? 'EXCESSIVE WITHDRAWALS ALERTS' :
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
                    background: 'var(--color-background-secondary)',
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: '12px',
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
                              <th style={{ ...headerStyle, textAlign: 'center' }}>TOTAL COST</th>
                              <th style={{ ...headerStyle, textAlign: 'center' }}>WORKS</th>
                              <th style={{ ...headerStyle, textAlign: 'center' }}>AVG COST BY WORK</th>
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
                                    <div 
                                      style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer', display: 'inline-block', padding: '4px' }}
                                      onMouseEnter={(e) => handleBackchargeMouseEnter(e, item.details)}
                                      onMouseLeave={handleMouseLeave}
                                    >
                                      {item.worksCount}
                                    </div>
                                  </td>
                                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500 }}>
                                      {item.avgHours.toFixed(1)} h
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
                            <th style={headerStyle}>DATE</th>
                            <th style={headerStyle}>JOBSITE</th>
                            <th style={headerStyle}>SUBCONTRACTOR</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>HOURS</th>
                            <th style={headerStyle}>DESCRIPTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backchargeData.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No backcharge records found for the selected period.
                              </td>
                            </tr>
                          ) : (
                            backchargeData.map((item, index) => (
                              <tr key={index} style={{ transition: 'background-color 0.2s ease' }}>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  {item.date}
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '13px', fontWeight: 500 }}>
                                  {item.jobsite}
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '13px' }}>
                                  {item.subcontractor}
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontWeight: 600, color: 'var(--color-status-error-text)' }}>
                                  {item.regular_hours.toFixed(1)} h
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-secondary)', maxWidth: '300px' }}>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description}>
                                    {item.description}
                                  </div>
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
                            <th style={{ ...headerStyle, textAlign: 'center' }}>TOTAL ITEMS</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>EXCESSIVE ALERTS</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materialRanking.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No material usage records found for the selected period.
                              </td>
                            </tr>
                          ) : (
                            materialRanking.map((item, index) => (
                              <tr key={item.subcontractor} style={{ transition: 'background-color 0.2s ease' }}>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {index + 1}
                                    {item.excessiveAlerts > 0 && <i className="bi bi-exclamation-triangle-fill ms-2" style={{ color: '#ef4444' }}></i>}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <div 
                                    style={{ fontWeight: 500, color: 'var(--color-text-primary)', cursor: 'pointer', display: 'inline-block' }}
                                    onMouseEnter={(e) => handleMaterialMouseEnter(e, { items: item.details, excessive: item.excessiveDetails })}
                                    onMouseLeave={handleMouseLeave}
                                  >
                                    {item.subcontractor}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontWeight: 500 }}>
                                  {item.totalItems}
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontWeight: 600, color: item.excessiveAlerts > 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                  {item.excessiveAlerts}
                                </td>
                                <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    fontWeight: 700,
                                    background: item.excessiveAlerts > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                    color: item.excessiveAlerts > 0 ? '#ef4444' : '#22c55e',
                                    textTransform: 'uppercase'
                                  }}>
                                    {item.excessiveAlerts > 0 ? 'Review Needed' : 'Compliant'}
                                  </span>
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
                            <th style={headerStyle}>DATE</th>
                            <th style={headerStyle}>SUBCONTRACTOR</th>
                            <th style={headerStyle}>PRODUCT</th>
                            <th style={{ ...headerStyle, textAlign: 'center' }}>QUANTITY</th>
                            <th style={headerStyle}>PROJECT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materialData.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5" style={{ color: 'var(--color-text-secondary)' }}>
                                No material withdrawal records found.
                              </td>
                            </tr>
                          ) : (
                            materialData.map((item, index) => (
                              <tr key={index} style={{ transition: 'background-color 0.2s ease' }}>
                                <td style={{ padding: '12px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  {item.date}
                                </td>
                                <td style={{ padding: '12px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '13px', fontWeight: 500 }}>
                                  {item.subcontractor}
                                </td>
                                <td style={{ padding: '12px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '13px' }}>
                                  {item.product}
                                </td>
                                <td style={{ padding: '12px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontWeight: 600 }}>
                                  {item.quantity}
                                </td>
                                <td style={{ padding: '12px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  {item.project}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )
                  ) : activeTab === 'execution' ? (
                    <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
                        <tr>
                          <th style={headerStyle} onClick={() => handleSort('rank')}>
                            RANK <SortIcon columnKey="rank" />
                          </th>
                          <th style={headerStyle} onClick={() => handleSort('subcontractor')}>
                            SUBCONTRACTOR <SortIcon columnKey="subcontractor" />
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }}>
                            COMPLETED WORKS
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgDuration')}>
                            AVG DURATION (DAYS) <SortIcon columnKey="avgDuration" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingData.map((item, index) => (
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
                            <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                          <th style={{ ...headerStyle, textAlign: 'center' }}>
                            COMPLETED WORKS
                          </th>
                          <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('avgContractCompletion')}>
                            CONTRACT COMPLETION <SortIcon columnKey="avgContractCompletion" /> <SortIcon columnKey="avgContractCompletion" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...rankingData].sort((a, b) => b.avgContractCompletion - a.avgContractCompletion).map((item, index) => (
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
                            <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                              <span 
                                style={{ color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer', display: 'inline-block', padding: '4px' }}
                                onMouseEnter={(e) => handleMouseEnter(e, item.works)}
                                onMouseLeave={handleMouseLeave}
                              >
                                {item.completedWorks}
                              </span>
                            </td>
                            <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500 }}>
                                {item.avgContractCompletion.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )}
      </div>
    </div>
  );
}
