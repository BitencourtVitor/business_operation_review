import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

/**
 * Função utilitária para calcular o score de uma obra no momento atual
 */
async function calculateCurrentScores(obraId: string, obraData: any) {
  // CALCULAR FIELDWIRE (Peso 2)
  const { data: fwItems } = await supabase.from('forecast_fieldwire').select('status').eq('obra_id', obraId);
  const fwScore = fwItems && fwItems.length > 0 
    ? (fwItems.filter((i: any) => i.status === true).length / fwItems.length) * 2 
    : 0;

  // CALCULAR MÁQUINAS (Peso 2)
  const { data: machineItems } = await supabase.from('forecast_machines').select('status').eq('obra_id', obraId);
  const machineScore = machineItems && machineItems.length > 0 
    ? (machineItems.filter((i: any) => i.status === true).length / machineItems.length) * 2 
    : 0;

  // CALCULAR CONTRATOS (Peso 2)
  const { data: contractItems } = await supabase.from('forecast_contract_steps').select('status').eq('obra_id', obraId);
  const contractScore = contractItems && contractItems.length > 0 
    ? (contractItems.filter((i: any) => i.status === true).length / contractItems.length) * 2 
    : 0;

  // CALCULAR SISTEMAS (Peso 1)
  let systemsPoints = 0;
  if (obraData.storage === true) systemsPoints += 0.333;
  if (obraData.qbtime === true) systemsPoints += 0.333;
  if (obraData.buildertrend === true) systemsPoints += 0.334;
  const systemsScore = Math.min(1.0, systemsPoints);

  const totalScore = fwScore + machineScore + contractScore + systemsScore;

  return {
    fieldwire_score: parseFloat(fwScore.toFixed(2)),
    machines_score: parseFloat(machineScore.toFixed(2)),
    contract_score: parseFloat(contractScore.toFixed(2)),
    systems_score: parseFloat(systemsScore.toFixed(2)),
    total_score: parseFloat(totalScore.toFixed(2))
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    console.log("Iniciando processo de fechamento de mês e planejamento...");

    const now = new Date();
    
    // --- PARTE 1: MONTHLY EXECUTION (Mês que está acabando) ---
    // O mês atual é o mês de execução que queremos salvar o histórico
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    let executionCount = 0;
    let ofiCount = 0;

    console.log(`Consolidando execução para ${currentMonth}/${currentYear}`);

    // 1.1 Buscar o planejamento (OFI) que foi feito para este mês atual
    const { data: plannedOFI, error: plannedError } = await supabase
      .from('operational_forecast_index')
      .select('*')
      .eq('reference_month', currentMonth)
      .eq('reference_year', currentYear);

    if (plannedError) throw plannedError;

    if (plannedOFI && plannedOFI.length > 0) {
      console.log(`Encontrados ${plannedOFI.length} projetos planejados para este mês. Verificando execução...`);
      
      const executionRecords = [];
      
      for (const plan of plannedOFI) {
        // Buscar status atual da obra no forecast_data
        const { data: currentObra, error: obraError } = await supabase
          .from('forecast_data')
          .select('id, status, previous_start_date')
          .eq('id', plan.obra_id)
          .single();
        
        if (obraError || !currentObra) continue;

        // --- NOVO: Buscar dados de performance (subcontratado e finalização) ---
        // Pegamos o evento de "End" mais recente para esta obra no mês atual
        const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();

        const { data: perfData } = await supabase
          .from('subcontractor_performance')
          .select('subcontractor, event_datetime, estimated_date_type')
          .eq('obra_id', plan.obra_id)
          .eq('estimated_date_type', 'End')
          .gte('event_datetime', startOfMonth)
          .lte('event_datetime', endOfMonth)
          .order('event_datetime', { ascending: false })
          .limit(1)
          .single();

        // Verificar se a obra também teve um início no mesmo mês
        const { data: startEvent } = await supabase
          .from('subcontractor_performance')
          .select('id')
          .eq('obra_id', plan.obra_id)
          .eq('estimated_date_type', 'Start')
          .gte('event_datetime', startOfMonth)
          .lte('event_datetime', endOfMonth)
          .limit(1);

        executionRecords.push({
          obra_id: plan.obra_id,
          reference_month: currentMonth,
          reference_year: currentYear,
          actual_status: currentObra.status,
          actual_start_date: currentObra.previous_start_date,
          subcontractor: perfData?.subcontractor || null,
          actual_end_date: perfData?.event_datetime ? new Date(perfData.event_datetime).toISOString().split('T')[0] : null,
          is_cycle_completed: !!(perfData && startEvent && startEvent.length > 0)
        });
      }

      if (executionRecords.length > 0) {
        console.log(`Gravando ${executionRecords.length} registros de execução histórica...`);
        const { error: execInsertError } = await supabase
          .from('monthly_execution_history')
          .upsert(executionRecords, { onConflict: 'obra_id,reference_month,reference_year' });
        
        if (execInsertError) {
          console.error("Erro ao gravar execução:", execInsertError);
        } else {
          executionCount = executionRecords.length;
        }
      }
    } else {
      console.log("Nenhum planejamento (OFI) encontrado para o mês atual.");
    }


    // --- PARTE 2: OFI CALCULATOR (Planejamento para o mês seguinte) ---
    // IMPORTANTE: Se o usuário enviou month/year no body, usamos esses valores
    let targetMonth: number, targetYear: number;
    
    try {
      // Tentar ler o body apenas se houver conteúdo
      const body = await req.json().catch(() => ({}));
      targetMonth = body.month;
      targetYear = body.year;
      
      // Se não vieram no body, calculamos o padrão (próximo mês)
      if (!targetMonth || !targetYear) {
        let nextMonth = now.getMonth() + 2; 
        let nextYear = now.getFullYear();
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }
        targetMonth = targetMonth || nextMonth;
        targetYear = targetYear || nextYear;
      }
      
      console.log(`Período alvo definido: mês ${targetMonth}, ano ${targetYear}`);
    } catch (e) {
      console.error("Erro ao processar body, usando padrão:", e);
      let nextMonth = now.getMonth() + 2; 
      let nextYear = now.getFullYear();
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      targetMonth = nextMonth;
      targetYear = nextYear;
    }

    console.log(`Calculando OFI (Planejamento) para ${targetMonth}/${targetYear}`);

    const startOfTargetMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    const endOfTargetMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDayOfTargetMonth}`;

    const { data: obras, error: obrasError } = await supabase
      .from('forecast_data')
      .select('id, storage, qbtime, buildertrend, status, previous_start_date')
      .gte('previous_start_date', startOfTargetMonth)
      .lte('previous_start_date', endOfTargetMonth);

    if (obrasError) throw obrasError;

    if (!obras || obras.length === 0) {
      console.log(`Nenhuma obra encontrada com data em ${targetMonth}/${targetYear}.`);
    } else {
      console.log(`Encontradas ${obras.length} obras para o período. Verificando status e duplicatas...`);
      
      const { data: existingOFI } = await supabase
        .from('operational_forecast_index')
        .select('obra_id')
        .eq('reference_month', targetMonth)
        .eq('reference_year', targetYear);

      const existingIds = new Set(existingOFI?.map(r => r.obra_id) || []);
      const ofiRecords = [];

      for (const obra of obras) {
        // Ignorar se já estiver no OFI deste mês
        if (existingIds.has(obra.id)) continue;
        
        // No planejamento (OFI), geralmente focamos em obras que "Not Started" 
        // mas vamos permitir todas que estão no período e não foram registradas ainda
        // para garantir que o count bata com o esperado pelo usuário.
        
        const scores = await calculateCurrentScores(obra.id, obra);
        ofiRecords.push({
          obra_id: obra.id,
          reference_month: targetMonth,
          reference_year: targetYear,
          fieldwire_score: scores.fieldwire_score,
          machines_score: scores.machines_score,
          contract_score: scores.contract_score,
          systems_score: scores.systems_score,
          total_score: scores.total_score
        });
      }

      if (ofiRecords.length > 0) {
        console.log(`Gravando ${ofiRecords.length} novos registros de OFI...`);
        const { error: ofiInsertError } = await supabase
          .from('operational_forecast_index')
          .insert(ofiRecords);
        
        if (ofiInsertError) {
          console.error("Erro ao inserir OFI:", ofiInsertError);
          // Não trava o processo se for erro de duplicata ou similar
        }
        
        // O ofiCount deve refletir o que está no banco para aquele mês após a operação
        const { count } = await supabase
          .from('operational_forecast_index')
          .select('*', { count: 'exact', head: true })
          .eq('reference_month', targetMonth)
          .eq('reference_year', targetYear);
          
        ofiCount = count || ofiRecords.length;
      } else {
        // Se não inseriu nada novo, retorna o que já existe
        const { count } = await supabase
          .from('operational_forecast_index')
          .select('*', { count: 'exact', head: true })
          .eq('reference_month', targetMonth)
          .eq('reference_year', targetYear);
        ofiCount = count || 0;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      execution_count: executionCount,
      ofi_count: ofiCount,
      execution_month: currentMonth,
      planning_month: targetMonth,
      planning_year: targetYear
    }), { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error("Erro no processo mensal:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
