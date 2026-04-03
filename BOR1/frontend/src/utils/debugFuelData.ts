import { supabase } from '../supabaseClient';

export const debugFuelData = async () => {
  console.log('🔍 DEBUG - Iniciando verificação de dados de combustível...');
  
  try {
    // Verificar contagem total de registros
    const { count: samsaraCount } = await supabase
      .from('samsara_events')
      .select('*', { count: 'exact', head: true });
    
    const { count: wexCount } = await supabase
      .from('wex_transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`🔍 DEBUG - Total Samsara: ${samsaraCount} registros`);
    console.log(`🔍 DEBUG - Total WEX: ${wexCount} registros`);
    
    // Verificar dados de setembro 2025 especificamente
    const { data: samsaraSeptember2025, error: samsaraError2025 } = await supabase
      .from('samsara_events')
      .select('event_date, nome, units')
      .gte('event_date', '2025-09-01')
      .lt('event_date', '2025-10-01')
      .order('event_date', { ascending: false })
      .limit(10);
    
    if (samsaraError2025) {
      console.error('❌ DEBUG - Erro ao buscar Samsara setembro 2025:', samsaraError2025);
    } else {
      console.log(`🔍 DEBUG - Samsara setembro 2025: ${samsaraSeptember2025?.length || 0} registros encontrados`);
      if (samsaraSeptember2025 && samsaraSeptember2025.length > 0) {
        console.log('🔍 DEBUG - Exemplos Samsara setembro 2025:', samsaraSeptember2025);
      }
    }
    
    const { data: wexSeptember2025, error: wexError2025 } = await supabase
      .from('wex_transactions')
      .select('transaction_date, nome, units')
      .gte('transaction_date', '2025-09-01')
      .lt('transaction_date', '2025-10-01')
      .order('transaction_date', { ascending: false })
      .limit(10);
    
    if (wexError2025) {
      console.error('❌ DEBUG - Erro ao buscar WEX setembro 2025:', wexError2025);
    } else {
      console.log(`🔍 DEBUG - WEX setembro 2025: ${wexSeptember2025?.length || 0} registros encontrados`);
      if (wexSeptember2025 && wexSeptember2025.length > 0) {
        console.log('🔍 DEBUG - Exemplos WEX setembro 2025:', wexSeptember2025);
      }
    }
    
    // Verificar anos disponíveis
    const { data: samsaraYears, error: samsaraYearsError } = await supabase
      .from('samsara_events')
      .select('event_date')
      .order('event_date', { ascending: false });
    
    if (samsaraYears && !samsaraYearsError) {
      const uniqueYears = [...new Set(samsaraYears.map(e => e.event_date?.split('-')[0]).filter(Boolean))];
      console.log('🔍 DEBUG - Anos disponíveis Samsara:', uniqueYears);
    }
    
    const { data: wexYears, error: wexYearsError } = await supabase
      .from('wex_transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false });
    
    if (wexYears && !wexYearsError) {
      const uniqueYears = [...new Set(wexYears.map(t => t.transaction_date?.split('-')[0]).filter(Boolean))];
      console.log('🔍 DEBUG - Anos disponíveis WEX:', uniqueYears);
    }
    
    // Verificar dados mais recentes
    const { data: recentSamsara, error: recentSamsaraError } = await supabase
      .from('samsara_events')
      .select('event_date, nome, units')
      .order('event_date', { ascending: false })
      .limit(5);
    
    if (recentSamsara && !recentSamsaraError) {
      console.log('🔍 DEBUG - Dados mais recentes Samsara:', recentSamsara);
    }
    
    const { data: recentWex, error: recentWexError } = await supabase
      .from('wex_transactions')
      .select('transaction_date, nome, units')
      .order('transaction_date', { ascending: false })
      .limit(5);
    
    if (recentWex && !recentWexError) {
      console.log('🔍 DEBUG - Dados mais recentes WEX:', recentWex);
    }
    
  } catch (error) {
    console.error('❌ DEBUG - Erro geral:', error);
  }
};
