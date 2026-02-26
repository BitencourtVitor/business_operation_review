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
    project_details?: { name: string; value: number }[];
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
  const [selectedYear, setSelectedYear] = useState<string>(() => localStorage.getItem('subcontractor_performance_year') || '');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => localStorage.getItem('subcontractor_performance_month') || '');

  // Persist filters to localStorage
  useEffect(() => {
    if (selectedYear) {
      localStorage.setItem('subcontractor_performance_year', selectedYear);
    } else {
      localStorage.removeItem('subcontractor_performance_year');
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedMonth) {
      localStorage.setItem('subcontractor_performance_month', selectedMonth);
    } else {
      localStorage.removeItem('subcontractor_performance_month');
    }
  }, [selectedMonth]);
  const [years] = useState<string[]>(['2026', '2025']);
  const [months] = useState<string[]>(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [contractData, setContractData] = useState<Record<string, { total: number; completed: number }>>({});
  const [backchargeData, setBackchargeData] = useState<BackchargeData[]>([]);
  const [materialUsageData, setMaterialUsageData] = useState<MaterialUsageData[]>([]);
  const [forecastSubcontractors, setForecastSubcontractors] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    content: any[] | { items: any[], excessive: any[] }; 
    type: 'execution' | 'backcharge' | 'material' | 'overall'
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
                quantity: Math.abs(item.quantidade || 0),
                project: projectName,
                lot_building: movement.projects?.lot_building || 'N/A',
                type: movement.projects?.type || 'N/A'
              }));

              const date = movement.movement_date ? new Date(movement.movement_date) : new Date();
              const mesStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

              // Create unique key for grouping
              const groupKey = `${mesStr}_${teamName}`;

              if (groupedMap[groupKey]) {
                groupedMap[groupKey].valor_total_retirado += totalValue;
                groupedMap[groupKey].total_retiradas += totalQuantity;
                
                // Aggregate project details
                const existingProject = groupedMap[groupKey].project_details?.find(p => p.name === projectName);
                if (existingProject) {
                  existingProject.value += totalValue;
                } else {
                  groupedMap[groupKey].project_details?.push({ name: projectName, value: totalValue });
                }

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
                  project_details: [{ name: projectName, value: totalValue }],
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
      const obraId = event.obra_id?.toString().trim();
      if (!obraId) return;

      if (!works[obraId]) {
        works[obraId] = {};
      }
      
      if (event.subcontractor && !works[obraId].subcontractor) {
        works[obraId].subcontractor = event.subcontractor.trim();
      }

      if (event.estimated_date_type === 'Start') {
        works[obraId].start = event.event_datetime;
      } else if (event.estimated_date_type === 'End') {
        works[obraId].end = event.event_datetime;
      }
    });

    // 2. Calculate duration for completed works and filter by date
    const completedWorks: { subcontractor: string; duration: number; obra_id: string; start: string; end: string }[] = [];

    Object.entries(works).forEach(([obra_id, work]) => {
      if (work.start && work.end && work.subcontractor) {
        const startDate = new Date(work.start);
        const endDate = new Date(work.end);
        
        // Filter by selected Year/Month based on End Date
        const itemYear = endDate.getFullYear().toString();
        const itemMonth = (endDate.getMonth() + 1).toString().padStart(2, '0');

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
      const cleanObraId = work.obra_id.trim();
      const pData = projectData[cleanObraId];
      const cData = contractData[cleanObraId];
      
      // ONLY count if we have project data (jobsite name)
      if (!pData || !pData.job_site) {
        return; 
      }

      if (!stats[work.subcontractor]) {
        stats[work.subcontractor] = { totalDuration: 0, count: 0, totalContractPct: 0, works: [] };
      }
      stats[work.subcontractor].totalDuration += work.duration;
      stats[work.subcontractor].count += 1;
      
      const contractPct = cData && cData.total > 0 ? (cData.completed / cData.total) * 100 : 0;
      stats[work.subcontractor].totalContractPct += contractPct;

      stats[work.subcontractor].works.push({
        id: cleanObraId,
        start: work.start,
        end: work.end,
        jobsite: pData.job_site,
        type: pData.type || 'Unknown',
        building: pData.lote_bld || 'Unknown',
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

  const materialRanking = useMemo(() => {
    if (!materialUsageData.length) return [];

    const grouped: Record<string, { totalValue: number; totalWithdrawals: number; subcontractors: Set<string>; excessiveCount: number; details: any[]; projects: any[] }> = {};

    materialUsageData.forEach(item => {
      // Group by the mapped subcontractor
      const sub = item.subcontractor || 'NOT IDENTIFIED';
      if (sub === 'NOT IDENTIFIED') return;
      
      if (!grouped[sub]) {
        grouped[sub] = { totalValue: 0, totalWithdrawals: 0, subcontractors: new Set(), excessiveCount: 0, details: [], projects: [] };
      }
      grouped[sub].totalValue += item.valor_total_retirado;
      grouped[sub].totalWithdrawals += item.total_retiradas;
      grouped[sub].excessiveCount += (item.excessive_details?.length || 0);
      grouped[sub].subcontractors.add(sub);

      // Aggregate project details
      if (item.project_details) {
        item.project_details.forEach(proj => {
          const existing = grouped[sub].projects.find(p => p.name === proj.name);
          if (existing) {
            existing.value += proj.value;
          } else {
            grouped[sub].projects.push({ ...proj });
          }
        });
      }

      // Aggregate product details for the tooltip (products and quantities)
      if (item.items_details) {
        item.items_details.forEach(detail => {
          // Add details for grouped view (by project and lot)
          grouped[sub].details.push({
            ...detail,
            date: item.mes,
            value: detail.value || 0
          });
        });
      }
    });

    return Object.entries(grouped)
      .map(([sub, data]) => ({
        subcontractor: sub,
        totalValue: data.totalValue,
        totalWithdrawals: data.totalWithdrawals,
        totalQuantity: data.details.reduce((sum, d) => sum + (d.quantity || 0), 0),
        excessiveCount: data.excessiveCount,
        details: data.details.sort((a, b) => {
          // Sort by project then by lot_building
          const projCompare = (a.project || '').localeCompare(b.project || '');
          if (projCompare !== 0) return projCompare;
          return (a.lot_building || '').localeCompare(b.lot_building || '');
        }),
        projects: data.projects
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [materialUsageData]);

  const excessiveWithdrawalsRanking = useMemo(() => {
    if (!materialUsageData.length) return [];

    const stats: Record<string, { totalExcess: number; details: any[] }> = {};

    materialUsageData.forEach(item => {
      const sub = item.subcontractor || 'NOT IDENTIFIED';
      if (sub === 'NOT IDENTIFIED') return;
      
      // Strict date filter: Only show data for the selected period
      if (selectedYear && selectedMonth) {
        const selectedPeriod = `${selectedYear}-${selectedMonth}`;
        if (item.mes !== selectedPeriod) return;
      }
      
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
  }, [materialUsageData, selectedYear, selectedMonth]);

  const consolidatedScorecard = useMemo(() => {
    // Collect all unique subcontractors across all data sources
    const allSubcontractors = new Set<string>();
    executionRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    backchargeRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    materialRanking.forEach(r => allSubcontractors.add(r.subcontractor));
    excessiveWithdrawalsRanking.forEach(r => allSubcontractors.add(r.subcontractor));

    // Calculate Global Average Duration for all works in the selected period
    const allWorks = executionRanking.flatMap(r => r.works);
    const globalAvgDuration = allWorks.length > 0 
      ? allWorks.reduce((sum, w) => sum + w.duration, 0) / allWorks.length 
      : 30; // Fallback if no works at all

    return Array.from(allSubcontractors).map(sub => {
      const exec = executionRanking.find(r => r.subcontractor === sub);
      const back = backchargeRanking.find(r => r.subcontractor === sub);
      const mat = materialRanking.find(r => r.subcontractor === sub);
      const exc = excessiveWithdrawalsRanking.find(r => r.subcontractor === sub);

      // 1. Tempo de Execução (Weight: 25%)
      // Comparamos a média da equipe com a média GLOBAL de todas as equipes no período.
      // Se a equipe for mais rápida que a média global, a nota é alta.
      const hasExecData = exec && exec.works && exec.works.length > 0;
      const avgDuration = hasExecData ? exec.avgDuration : 0;
      
      let durationScore = 0;
      if (hasExecData) {
        // Se a duração for igual à média global, ganha 70 pontos.
        // Se for metade da média (muito rápido), ganha 100.
        // Se for o dobro da média (muito lento), ganha 0.
        const performanceRatio = avgDuration / globalAvgDuration;
        durationScore = Math.max(0, Math.min(100, 100 - (performanceRatio - 0.5) * 60));
      }

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
        completedWorks,
        metrics: {
            duration: { 
              score: durationScore, 
              value: avgDuration, 
              label: 'Execution Time', 
              details: exec?.works || []
            },
            contract: { score: contractScore, value: contractScore, label: 'Contract Completion', details: exec?.works || [] },
            backcharge: { score: backScore, value: backHours, label: 'Backcharges', details: back?.details || [] },
            material: { 
              score: matScore, 
              value: matValue, 
              quantity: mat?.totalQuantity || 0,
              label: 'Material Usage', 
              details: mat?.details || [], 
              excessiveDetails: exc?.details || [], 
              projects: mat?.projects || [] 
            },
            excess: { score: excessScore, value: excessCount, label: 'Excess Alerts', details: exc?.details || [] },
            safety: { score: safetyScore, value: safetyValue, label: 'Safety Level' }
          }
        };
      }).sort((a, b) => b.finalScore - a.finalScore);
    }, [executionRanking, backchargeRanking, materialRanking, excessiveWithdrawalsRanking, projectData, contractData]);

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

  const handleContractMouseEnter = (e: React.MouseEvent, works: any[]) => {
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
    const estimatedHeight = Math.min(300, works.length * 70 + 70);
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
      type: 'contract'
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

  const handleExcessMouseEnter = (e: React.MouseEvent, details: any[]) => {
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
    
    // Estimate height
    const estimatedHeight = Math.min(450, details.length * 65 + 70);
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }

    if (y < 10) y = 10;

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: details,
      type: 'excess'
    });
  };

  const handleMaterialMouseEnter = (e: React.MouseEvent, details: any[], projects?: any[]) => {
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
    
    // Estimate height
    const totalItems = (details?.length || 0) + (projects?.length || 0);
    const estimatedHeight = Math.min(450, totalItems * 65 + 100);
    let y = rect.top;
    
    // If it goes off bottom, shift it up
    if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - estimatedHeight - 10);
    }
    
    if (y < 10) y = 10;

    setTooltip({
      visible: true,
      x: x,
      y: y,
      content: { items: details, projects: projects || [] },
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

  const handleOverallMouseEnter = (e: React.MouseEvent, metrics: any) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    
    let x = rect.left - tooltipWidth - 10;
    if (x < 10) {
        x = rect.right + 10;
    }

    setTooltip({
      visible: true,
      x: x,
      y: rect.top,
      content: metrics,
      type: 'overall'
    });
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
                    desc: 'Avalia a agilidade da equipe em relação ao coletivo. Calculamos a média de tempo de todas as equipes no período e comparamos com o desempenho individual. Se a equipe entregar mais rápido que a média das outras, a nota sobe. Se não houver trabalhos no período, a nota é zero para manter a competitividade justa.',
                    weight: '25%'
                  },
                  { 
                    label: 'Contract Completion', 
                    icon: 'bi-file-text-fill', 
                    desc: 'Mede o engajamento administrativo da equipe. Antes da obra começar, o subcontratado precisa colaborar com diversas etapas burocráticas e assinaturas. Esta nota reflete quantas dessas etapas obrigatórias foram concluídas, garantindo que a equipe esteja regularizada e pronta para trabalhar.',
                    weight: '20%'
                  },
                  { 
                    label: 'Backcharges', 
                    icon: 'bi-exclamation-triangle-fill', 
                    desc: 'Mede a qualidade e o cuidado. Toda vez que precisamos gastar horas extras para corrigir erros ou retrabalhos da equipe, isso gera um "Backcharge". Cada hora de erro reduz a nota, e acumular mais de 20 horas zera este critério.',
                    weight: '20%'
                  },
                  { 
                    label: 'Material Usage', 
                    icon: 'bi-box-seam', 
                    desc: 'Monitora o uso consciente de recursos. Calculamos a média de gasto de material por cada obra concluída. Se o custo total de materiais for excessivo em relação à quantidade de obras entregues, a nota cai. O objetivo é premiar quem produz mais com menos desperdício.',
                    weight: '20%'
                  },
                  { 
                    label: 'Excess Alerts', 
                    icon: 'bi-cart-x-fill', 
                    desc: 'Penaliza a falta de planejamento. Cada vez que a equipe solicita material acima do limite planejado na lista de materiais da obra (feita a partir do template original), ela perde 10 pontos nesta nota. Menos alertas significam melhor controle e fidelidade ao projeto.',
                    weight: '15%'
                  },
                  { 
                    label: 'Safety Level', 
                    icon: 'bi-shield-check', 
                    desc: 'Em breve: Este critério avaliará o compromisso integral com a vida. Mediremos o cumprimento rigoroso de todas as normas de segurança, o uso correto de EPIs e a adoção de boas práticas no canteiro. Manter um ambiente seguro é a regra número um para qualquer parceria.',
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
                        <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <h3 style={{ 
                            margin: 0, 
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
                          <div style={{ 
                            padding: '2px 6px',
                            color: 'var(--color-text-secondary)',
                            fontSize: '11px',
                            fontWeight: 400,
                            whiteSpace: 'nowrap',
                            fontStyle: 'italic',
                            opacity: 0.8
                          }}>
                            {item.completedWorks} {item.completedWorks === 1 ? 'work' : 'works'}
                          </div>
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
                              justifyContent: 'center',
                              cursor: 'help',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--color-background-tertiary)';
                              if (key === 'duration') {
                                handleMouseEnter(e, metric.details);
                              } else if (key === 'contract') {
                                handleContractMouseEnter(e, metric.details);
                              } else if (key === 'backcharge') {
                                handleBackchargeMouseEnter(e, metric.details);
                              } else if (key === 'material') {
                                handleMaterialMouseEnter(e, metric.details, metric.projects);
                              } else if (key === 'excess') {
                                handleExcessMouseEnter(e, metric.details);
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              handleMouseLeave();
                            }}
                            >
                              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                {metric.label}
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {/* Valor Real */}
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                                  {!hasScore ? '---' :
                                   key === 'duration' ? (
                                     metric.details.length > 0 ? `${Math.round(metric.value)}d/work` : '—'
                                   ) :
                                   key === 'contract' ? `${metric.value.toFixed(0)}%` :
                                   key === 'backcharge' ? `${metric.value.toFixed(2)}h` :
                                   key === 'material' ? (
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                         <span style={{ fontSize: '14px', fontWeight: 700 }}>${(metric.value / 1000).toFixed(1)}k</span>
                                         <span style={{ color: 'var(--color-border-divider)', fontWeight: 300 }}>|</span>
                                         <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                                           {metric.quantity.toLocaleString()}
                                         </span>
                                       </div>
                                   ) :
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
                      <div 
                        style={{ 
                          flex: '0 0 80px', 
                          textAlign: 'center', 
                          paddingLeft: '8px',
                          cursor: 'help',
                          transition: 'all 0.2s ease',
                          borderRadius: '8px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-background-tertiary)';
                          handleOverallMouseEnter(e, item.metrics);
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          handleMouseLeave();
                        }}
                      >
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
          </div>
        </>
      )}
    </div>

      {/* TOOLTIP DINÂMICO */}
      {tooltip.visible && (
        <div 
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: tooltip.x,
            width: '320px',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 9999,
            padding: '16px',
            pointerEvents: 'auto',
            transition: 'opacity 0.2s ease'
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--color-border-divider)', paddingBottom: '8px' }}>
            <i className={`bi ${
              tooltip.type === 'execution' ? 'bi-clock-history' :
              tooltip.type === 'contract' ? 'bi-file-text-fill' :
              tooltip.type === 'backcharge' ? 'bi-exclamation-triangle-fill' :
            tooltip.type === 'material' ? 'bi-box-seam' : 
            tooltip.type === 'excess' ? 'bi-cart-x-fill' :
            tooltip.type === 'overall' ? 'bi-speedometer2' : 'bi-info-circle'
          }`} style={{ color: 'var(--color-accent-primary)' }}></i>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-primary)' }}>
            {tooltip.type === 'execution' ? 'Execution Details' :
             tooltip.type === 'contract' ? 'Contract Steps' :
             tooltip.type === 'backcharge' ? 'Backcharge Details' :
             tooltip.type === 'material' ? 'Material Usage Details' : 
             tooltip.type === 'excess' ? 'Excess Withdrawal Alerts' : 
             tooltip.type === 'overall' ? 'Score Breakdown' : 'Details'}
          </span>
        </div>

        <div className="custom-scrollbar" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {tooltip.type === 'overall' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Execution', weight: '25%', score: tooltip.content.duration.score },
                { label: 'Contract', weight: '20%', score: tooltip.content.contract.score },
                { label: 'Backcharges', weight: '20%', score: tooltip.content.backcharge.score },
                { label: 'Material', weight: '20%', score: tooltip.content.material.score },
                { label: 'Excess', weight: '15%', score: tooltip.content.excess.score },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--color-background-tertiary)', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.label}</div>
                    <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>Weight: {item.weight}</div>
                  </div>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: 800, 
                    color: item.score >= 80 ? '#22c55e' : item.score >= 60 ? '#f59e0b' : '#ef4444' 
                  }}>
                    {Math.round(item.score)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tooltip.type === 'execution' && Array.isArray(tooltip.content) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tooltip.content.length > 0 ? (
                  tooltip.content.map((work: any, i: number) => (
                    <div key={i} style={{ padding: '8px', background: 'var(--color-background-tertiary)', borderRadius: '6px', borderLeft: '3px solid var(--color-accent-primary)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {work.jobsite} {work.building && work.building !== 'Unknown' ? `- ${work.type === 'building' ? 'Bld' : 'Lot'} ${work.building}` : ''}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '4px', textTransform: 'capitalize' }}>
                        {work.type}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                          {new Date(work.start).toLocaleDateString()} - {new Date(work.end).toLocaleDateString()}
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                           {work.duration}d / work
                         </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    borderRadius: '8px', 
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="bi bi-calendar-x" style={{ fontSize: '24px', color: 'var(--color-text-secondary)' }}></i>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      No works found!
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      No identified projects match the execution time records for this period.
                    </div>
                  </div>
                )}
              </div>
            )}

            {tooltip.type === 'contract' && Array.isArray(tooltip.content) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tooltip.content.map((work: any, i: number) => (
                  <div key={i} style={{ padding: '8px', background: 'var(--color-background-tertiary)', borderRadius: '6px', borderLeft: '3px solid var(--color-accent-primary)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {work.jobsite} {work.building && work.building !== 'Unknown' ? `- ${work.type === 'building' ? 'Bld' : 'Lot'} ${work.building}` : ''}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '4px', textTransform: 'capitalize' }}>
                      {work.type}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <div style={{ flex: 1, marginRight: '10px' }}>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${work.contractCompletion}%`, 
                            background: work.contractCompletion >= 80 ? '#22c55e' : work.contractCompletion >= 50 ? '#f59e0b' : '#ef4444',
                            borderRadius: '3px'
                          }}></div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                         {Math.round(work.contractCompletion)}%
                       </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tooltip.type === 'backcharge' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Array.isArray(tooltip.content) && tooltip.content.length > 0 ? (
                  tooltip.content.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '8px', background: 'var(--color-background-tertiary)', borderRadius: '6px', borderLeft: '3px solid #ef4444' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.jobsite} {item.lot_building || ''}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>Occurrence: {item.date}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>{item.regular_hours.toFixed(1)}h</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    background: 'rgba(34, 197, 94, 0.05)', 
                    borderRadius: '8px', 
                    border: '1px dashed rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="bi bi-check-circle-fill" style={{ fontSize: '24px', color: '#22c55e' }}></i>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      No backcharges found!
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      The subcontractor has no recorded issues for this period.
                    </div>
                  </div>
                )}
              </div>
            )}

            {tooltip.type === 'excess' && Array.isArray(tooltip.content) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tooltip.content.length > 0 ? (
                  (() => {
                    const groups: Record<string, any[]> = {};
                    tooltip.content.forEach((ex: any) => {
                      const key = ex.project || 'Unknown Project';
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(ex);
                    });

                    return Object.entries(groups).map(([project, items], idx) => (
                      <div key={idx} style={{ 
                        padding: '10px', 
                        background: 'rgba(239, 68, 68, 0.05)', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(239, 68, 68, 0.2)', 
                        borderLeft: '4px solid #ef4444' 
                      }}>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: 800, 
                          color: 'var(--color-text-primary)',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <i className="bi bi-geo-alt-fill" style={{ color: '#ef4444' }}></i>
                          {project}
                        </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {items.map((ex: any, i: number) => (
                              <div key={i} style={{ 
                                padding: '6px 8px', 
                                background: 'rgba(255,255,255,0.03)', 
                                borderRadius: '4px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflow: 'hidden' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {ex.product}
                                  </span>
                                  <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                    Last Withdrawal: {ex.mes}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: '60px', marginLeft: '12px' }}>
                                  <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '11px' }}>
                                    {ex.quantity} / {ex.limit}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                      </div>
                    ));
                  })()
                ) : (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    background: 'rgba(34, 197, 94, 0.05)', 
                    borderRadius: '8px', 
                    border: '1px dashed rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="bi bi-cart-x-fill" style={{ fontSize: '24px', color: '#22c55e' }}></i>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      No excess withdrawals!
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      All material usage is within the established limits for this period.
                    </div>
                  </div>
                )}
              </div>
            )}

            {tooltip.type === 'material' && tooltip.content && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Grouped by Project/Lot */}
                {Array.isArray(tooltip.content.items) && tooltip.content.items.length > 0 ? (
                  (() => {
                    const groups: Record<string, any[]> = {};
                    tooltip.content.items.forEach((item: any) => {
                      const key = item.project || 'Unknown';
                      if (!groups[key]) groups[key] = { products: [] };
                      groups[key].products.push(item);
                    });

                    return Object.entries(groups).map(([groupKey, groupData]: [string, any], idx) => (
                      <div key={idx} style={{ 
                        background: 'var(--color-background-tertiary)', 
                        borderRadius: '8px', 
                        padding: '10px',
                        borderLeft: '4px solid var(--color-accent-primary)'
                      }}>
                        <div style={{ 
                          fontSize: '11px', 
                          fontWeight: 800, 
                          color: 'var(--color-text-primary)',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <i className="bi bi-geo-alt-fill" style={{ color: 'var(--color-accent-primary)' }}></i>
                          {groupKey}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {groupData.products.map((p: any, pIdx: number) => (
                            <div key={pIdx} style={{ 
                              padding: '6px 8px', 
                              background: 'rgba(255,255,255,0.03)', 
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'baseline', gap: '12px', width: '100%' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.product}
                                </span>
                                {p.date ? (
                                  <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                    Last Withdrawal: {p.date}
                                  </span>
                                ) : (
                                  <span></span>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: '40px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    {p.quantity.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()
                ) : (
                  <div style={{ padding: '10px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                    No material usage details recorded.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
