import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { JobCostingTimesheetRow } from '../types/timesheet';

export function useWorkforceProductivityData() {
  const [data, setData] = useState<JobCostingTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      // Recursive pagination to fetch ALL data
      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data: dbData, error: err } = await supabase
          .from('timesheet_data_new')
          .select('*')
          .order('reference_month', { ascending: false })
          .range(from, to);

        if (err) throw err;

        if (dbData && dbData.length > 0) {
          allData = [...allData, ...dbData];
          
          // If we got less than pageSize, we reached the end
          if (dbData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      // Ensure numeric fields are actually numbers (Supabase/Postgres might return them as strings for 'numeric' type)
      const formattedData = allData
        .filter((row: any) => {
          // Helper to get worktype using the same logic as the component
          const getRowWorktype = (r: any) => {
            if (r.worktype) return r.worktype;
            const hasJobsite = !!r.jobsite;
            const hasLotBuilding = !!r.lot_building;
            if (!hasJobsite && !hasLotBuilding) return r.client || 'Unknown Client';
            return 'Normal Labor';
          };

          const calculatedWorktype = getRowWorktype(row).trim();
          
          // Filter out 'Service Call' (case-insensitive and trimmed)
           const isServiceCall = calculatedWorktype.toLowerCase() === 'service call';
           
           // Filter out August (08) and September (09) of 2025 as requested
           const monthStr = row.reference_month || '';
           const isExcludedMonth = monthStr === '2025-08' || monthStr === '2025-09';
           
           // Filter: If company is PCG, only allow client 'Callahan'
           const isPCG = (row.company || '').trim().toUpperCase() === 'PCG';
           const isCallahan = (row.client || '').trim().toUpperCase() === 'CALLAHAN';
           const failsPCGFilter = isPCG && !isCallahan;

           return !isServiceCall && !isExcludedMonth && !failsPCGFilter;
         })
        .map((row: any) => ({
          ...row,
          regular_hours: typeof row.regular_hours === 'string' ? parseFloat(row.regular_hours) : Number(row.regular_hours || 0),
          regular_rate: typeof row.regular_rate === 'string' ? parseFloat(row.regular_rate) : Number(row.regular_rate || 0),
        }));

      setData(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de produtividade da mão de obra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
}
