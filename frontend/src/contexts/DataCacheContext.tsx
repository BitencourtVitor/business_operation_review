import { useState, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import { fetchAllRows, normalizeUtf8String } from '../utils/dataUtils';
import { DataCacheContext, type CacheData } from './DataCacheContextTypes';

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<CacheData>({
    accounting: {
      data: [],
      loading: false,
      error: null,
      lastFetch: null,
      years: [],
      months: [],
      agingIntervals: [],
      receivablesCategories: [],
      payablesCategories: [],
    },
    timesheet: {
      data: [],
      loading: false,
      error: null,
      lastFetch: null,
      years: [],
      months: [],
      teams: [],
      corporations: [],
      errors: [],
    },
    permit: {
      data: [],
      loading: false,
      error: null,
      lastFetch: null,
      years: [],
      months: [],
      models: [],
      situations: [],
      jobsites: [],
    },
    quickbooks: {
      data: null,
      loading: false,
      error: null,
      lastFetch: null,
    },
  });

  const isDataStale = (dataType: keyof CacheData, maxAgeMinutes = 5) => {
    const data = cache[dataType];
    if (!data.lastFetch) return true;
    
    const maxAge = maxAgeMinutes * 60 * 1000;
    return Date.now() - data.lastFetch > maxAge;
  };

  const fetchAccountingData = async () => {
    // Se já está carregando, não fazer nada
    if (cache.accounting.loading) return;
    
    // Se os dados não estão stale, usar cache
    if (!isDataStale('accounting') && cache.accounting.data.length > 0) {
      return;
    }

    setCache(prev => ({
      ...prev,
      accounting: { ...prev.accounting, loading: true, error: null }
    }));

    try {
      // Buscar todos os dados de receivables_accounting e payables_accounting
      let receivablesData: unknown[] = [];
      let payablesData: unknown[] = [];
      
      try {
        receivablesData = await fetchAllRows('receivables_accounting');
      } catch {
        receivablesData = [];
      }
      
      try {
        payablesData = await fetchAllRows('payables_accounting');
      } catch {
        payablesData = [];
      }

      // Transformar dados de receivables para o formato unificado
      const receivables = (receivablesData || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ''),
          date: String(r.date_field ?? ''), // Voltar para date_field como estava
          date_field: String(r.date_field ?? ''),
          inv_date: String(r.inv_date ?? ''),
          transaction_type: normalizeUtf8String(String(r.transaction_type ?? '')),
          inv_num: String(r.inv_num ?? ''),
          customer_full_name: normalizeUtf8String(String(r.customer_full_name ?? '')),
          due_date: String(r.due_date ?? ''),
          open_balance: Number(r.open_balance ?? 0),
          category: normalizeUtf8String(String(r.category ?? '')),
          aging_intervals: String(r.aging_intervals ?? ''),
          type: 'receivables' as const,
        };
      });

      // Transformar dados de payables para o formato unificado
      const payables = (payablesData || []).map((row) => {
        const p = row as Record<string, unknown>;
        return {
          id: String(p.id ?? ''),
          date: String(p.date_field ?? ''), // Voltar para date_field como estava
          date_field: String(p.date_field ?? ''),
          expense_date: String(p.expense_date ?? ''),
          transaction_type: normalizeUtf8String(String(p.transaction_type ?? '')),
          bill_num: String(p.bill_num ?? ''),
          vendor_display_name: normalizeUtf8String(String(p.vendor_display_name ?? '')),
          due_date: String(p.due_date ?? ''),
          open_balance: Number(p.open_balance ?? 0),
          category: normalizeUtf8String(String(p.category ?? '')),
          aging_intervals: String(p.aging_intervals ?? ''),
          type: 'payables' as const,
        };
      });

      // Função para normalizar aging intervals
      const normalizeAgingInterval = (aging: string) => {
        const lower = aging.toLowerCase();
        if (lower === 'current' || lower === 'not due yet') return 'Current/Not due yet';
        if (lower === '1-30 days') return '1-30 Days';
        if (lower === '31-60 days') return '31-60 Days';
        if (lower === '61-90 days') return '61-90 Days';
        if (lower === '>90 days') return '>90 Days';
        return aging; // manter original se não reconhecer
      };

      // Normalizar aging intervals nos dados
      const normalizedReceivables = receivables.map(row => ({
        ...row,
        aging_intervals: normalizeAgingInterval(row.aging_intervals)
      }));

      const normalizedPayables = payables.map(row => ({
        ...row,
        aging_intervals: normalizeAgingInterval(row.aging_intervals)
      }));

      // Combinar os dados normalizados
      const combinedData = [...normalizedReceivables, ...normalizedPayables];

      // Extrair filtros únicos dos dados normalizados
      const uniqueAging = [...new Set(combinedData.map(d => d.aging_intervals).filter(Boolean))];
      const uniqueYears = [...new Set(combinedData.map(d => d.date?.split('-')[0]).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

      // Separar categorias por tipo
      const receivablesCats = [...new Set(receivables.map(d => d.category).filter(Boolean))];
      const payablesCats = [...new Set(payables.map(d => d.category).filter(Boolean))];

      // Extrair todos os meses únicos que possuem dados
      const uniqueMonths = [...new Set(combinedData.map(d => {
        if (!d.date) return null;
        return String(Number(d.date.split('-')[1])).padStart(2, '0');
      }).filter((v): v is string => v !== null))].sort((a, b) => Number(a) - Number(b));

      // Sempre incluir o ano atual na lista de anos disponíveis
      const currentYear = new Date().getFullYear().toString();
      const yearsWithCurrent = uniqueYears.includes(currentYear) ? uniqueYears : [currentYear, ...uniqueYears];

      setCache(prev => ({
        ...prev,
        accounting: {
          data: combinedData,
          loading: false,
          error: null,
          lastFetch: Date.now(),
          years: yearsWithCurrent,
          months: uniqueMonths,
          agingIntervals: uniqueAging,
          receivablesCategories: receivablesCats,
          payablesCategories: payablesCats,
        }
      }));

    } catch (err) {
      setCache(prev => ({
        ...prev,
        accounting: {
          ...prev.accounting,
          loading: false,
          error: err instanceof Error ? err.message : 'Erro ao carregar dados'
        }
      }));
    }
  };

  const fetchTimesheetData = async () => {
    if (cache.timesheet.loading) return;
    
    if (!isDataStale('timesheet') && cache.timesheet.data.length > 0) {
      return;
    }

    setCache(prev => ({
      ...prev,
      timesheet: { ...prev.timesheet, loading: true, error: null }
    }));

    try {
      const { data: dbData, error: err } = await supabase.from('timesheet_analysis').select('*');
      
      if (err) throw err;

      const timesheetData = (dbData || []).map((row) => ({
        id: String(row.id ?? ''),
        date: row.date ? new Date(row.date).toISOString().split('T')[0] : '',
        nome: normalizeUtf8String(row.nome),
        error: normalizeUtf8String(row.error),
        team: normalizeUtf8String(row.team),
        corporation: normalizeUtf8String(row.corporation),
        payrate: String(row.payrate ?? ''),
        add_time_hour: String(row.add_time_hour ?? ''),
        remove_time_hour: String(row.remove_time_hour ?? ''),
        add_dollar: String(row.add_dollar ?? ''),
        remove_dollar: String(row.remove_dollar ?? ''),
        total: String(row.total ?? ''),
      }));

      // Extrair filtros únicos
      const uniqueYears = [...new Set(timesheetData.map(d => d.date?.split('-')[0]).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      const uniqueTeams = [...new Set(timesheetData.map(d => d.team).filter(Boolean))];
      const uniqueCorporations = [...new Set(timesheetData.map(d => d.corporation).filter(Boolean))];
      const uniqueErrors = [...new Set(timesheetData.map(d => d.error).filter(Boolean))];

      // Sempre incluir o ano atual na lista de anos disponíveis
      const currentYear = new Date().getFullYear().toString();
      const yearsWithCurrent = uniqueYears.includes(currentYear) ? uniqueYears : [currentYear, ...uniqueYears];

      setCache(prev => ({
        ...prev,
        timesheet: {
          data: timesheetData,
          loading: false,
          error: null,
          lastFetch: Date.now(),
          years: yearsWithCurrent,
          months: [],
          teams: uniqueTeams,
          corporations: uniqueCorporations,
          errors: uniqueErrors,
        }
      }));

    } catch (err) {
      setCache(prev => ({
        ...prev,
        timesheet: {
          ...prev.timesheet,
          loading: false,
          error: err instanceof Error ? err.message : 'Erro ao carregar dados'
        }
      }));
    }
  };

  const fetchPermitData = async () => {
    if (cache.permit.loading) return;
    
    if (!isDataStale('permit') && cache.permit.data.length > 0) {
      return;
    }

    setCache(prev => ({
      ...prev,
      permit: { ...prev.permit, loading: true, error: null }
    }));

    try {
      const { data: dbData, error: err } = await supabase.from('permit_control').select('*');
      
      if (err) throw err;

      const permitData = (dbData || []).map((row) => ({
        id: String(row.id ?? ''),
        model: normalizeUtf8String(row.model),
        jobsite: normalizeUtf8String(row.jobsite),
        lot_address: normalizeUtf8String(row.lot_address),
        situacao: normalizeUtf8String(row.situacao),
        solicitacao: row.solicitacao ? new Date(row.solicitacao).toISOString().split('T')[0] : '',
        aplicacao: row.aplicacao ? new Date(row.aplicacao).toISOString().split('T')[0] : '',
        emissao: row.emissao ? new Date(row.emissao).toISOString().split('T')[0] : '',
        observacao: normalizeUtf8String(row.observacao),
        arquivo: String(row.arquivo ?? ''),
      }));

      // Extrair filtros únicos
      const uniqueYears = [...new Set(permitData.map(d => {
        const relevantDate = d.solicitacao || d.aplicacao || d.emissao;
        return relevantDate?.split('-')[0];
      }).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      
      const uniqueModels = [...new Set(permitData.map(d => d.model).filter(Boolean))];
      const uniqueSituations = [...new Set(permitData.map(d => d.situacao).filter(Boolean))];
      const uniqueJobsites = [...new Set(permitData.map(d => d.jobsite).filter(Boolean))];

      // Sempre incluir o ano atual na lista de anos disponíveis
      const currentYear = new Date().getFullYear().toString();
      const yearsWithCurrent = uniqueYears.includes(currentYear) ? uniqueYears : [currentYear, ...uniqueYears];

      setCache(prev => ({
        ...prev,
        permit: {
          data: permitData,
          loading: false,
          error: null,
          lastFetch: Date.now(),
          years: yearsWithCurrent,
          months: [],
          models: uniqueModels,
          situations: uniqueSituations,
          jobsites: uniqueJobsites,
        }
      }));

    } catch (err) {
      setCache(prev => ({
        ...prev,
        permit: {
          ...prev.permit,
          loading: false,
          error: err instanceof Error ? err.message : 'Erro ao carregar dados'
        }
      }));
    }
  };

  const fetchQuickbooksData = async () => {
    if (cache.quickbooks.loading) return;
    if (!isDataStale('quickbooks') && cache.quickbooks.data) return;
    setCache(prev => ({ ...prev, quickbooks: { ...prev.quickbooks, loading: true, error: null } }));
    try {
      // Função auxiliar para buscar todos os dados com paginação
      const fetchAllData = async (tableName: string) => {
        let allData: unknown[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = [...allData, ...data];
          from += pageSize;
          if (data.length < pageSize) break;
        }
        return allData;
      };
      const [billLines, billLinks, billPaymentLinks, billPayments, bills, estimateLines, estimateLinks, estimates, invoiceLines, invoiceLinks, invoices, paymentLinks, payments] = await Promise.all([
        fetchAllData('hvac_bill_lines'),
        fetchAllData('hvac_bill_links'),
        fetchAllData('hvac_bill_payment_links'),
        fetchAllData('hvac_bill_payments'),
        fetchAllData('hvac_bills'),
        fetchAllData('hvac_estimate_lines'),
        fetchAllData('hvac_estimate_links'),
        fetchAllData('hvac_estimates'),
        fetchAllData('hvac_invoice_lines'),
        fetchAllData('hvac_invoice_links'),
        fetchAllData('hvac_invoices'),
        fetchAllData('hvac_payment_links'),
        fetchAllData('hvac_payments'),
      ]);
      const dataToSet = {
        hvac_bill_lines: billLines,
        hvac_bill_links: billLinks,
        hvac_bill_payment_links: billPaymentLinks,
        hvac_bill_payments: billPayments,
        hvac_bills: bills,
        hvac_estimate_lines: estimateLines,
        hvac_estimate_links: estimateLinks,
        hvac_estimates: estimates,
        hvac_invoice_lines: invoiceLines,
        hvac_invoice_links: invoiceLinks,
        hvac_invoices: invoices,
        hvac_payment_links: paymentLinks,
        hvac_payments: payments,
      };
      setCache(prev => ({
        ...prev,
        quickbooks: {
          data: dataToSet,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        }
      }));
    } catch (err) {
      setCache(prev => ({
        ...prev,
        quickbooks: {
          ...prev.quickbooks,
          loading: false,
          error: err instanceof Error ? err.message : 'Erro ao carregar dados do Quickbooks',
        }
      }));
    }
  };

  const clearCache = () => {
    setCache({
      accounting: {
        data: [],
        loading: false,
        error: null,
        lastFetch: null,
        years: [],
        months: [],
        agingIntervals: [],
        receivablesCategories: [],
        payablesCategories: [],
      },
      timesheet: {
        data: [],
        loading: false,
        error: null,
        lastFetch: null,
        years: [],
        months: [],
        teams: [],
        corporations: [],
        errors: [],
      },
      permit: {
        data: [],
        loading: false,
        error: null,
        lastFetch: null,
        years: [],
        months: [],
        models: [],
        situations: [],
        jobsites: [],
      },
      quickbooks: {
        data: null,
        loading: false,
        error: null,
        lastFetch: null,
      },
    });
  };

  return (
    <DataCacheContext.Provider value={{
      cache,
      fetchAccountingData,
      fetchTimesheetData,
      fetchPermitData,
      fetchQuickbooksData,
      clearCache,
      isDataStale,
    }}>
      {children}
    </DataCacheContext.Provider>
  );
}

 