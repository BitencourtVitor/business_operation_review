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
      const formattedData = allData.map((row: any) => ({
        ...row,
        regular_hours: typeof row.regular_hours === 'string' ? parseFloat(row.regular_hours) : Number(row.regular_hours || 0),
        regular_rate: typeof row.regular_rate === 'string' ? parseFloat(row.regular_rate) : Number(row.regular_rate || 0),
      }));

      // DEBUG: Count rows by reference_month as requested
      const monthCounts = formattedData.reduce((acc: Record<string, number>, row) => {
        const month = row.reference_month || 'UNKNOWN/NULL';
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});

      console.group('Workforce Productivity Data Debug');
      console.log('Total rows loaded from timesheet_data_new (Recursive Fetch):', formattedData.length);
      console.log('Rows by reference_month:', monthCounts);
      console.groupEnd();

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
