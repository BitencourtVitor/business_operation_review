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
    ? (machineItems.filter((i: any) => i.status === 'Scheduled' || i.status === 'Dispensed').length / machineItems.length) * 2 
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
    
    // Tentar ler o body apenas se houver conteúdo
    const body = await req.json().catch(() => ({}));

    // --- PARTE 1: MONTHLY EXECUTION (Mês que está acabando) ---
    // O mês atual é o mês de execução que queremos salvar o histórico
    // Permitimos override via body para casos de re-processamento (ex: rodar dia 1 para fechar o mês anterior)
    const currentMonth = body.execution_month || now.getMonth() + 1;
    const currentYear = body.execution_year || now.getFullYear();
    
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
      
      // 1.2 PRESERVAR DADOS: Antes de limpar, vamos buscar os dados existentes para preservar o campo 'reason'
      const { data: existingHistory } = await supabase
        .from('monthly_execution_history')
        .select('obra_id, reason')
        .eq('reference_month', currentMonth)
        .eq('reference_year', currentYear);

      const reasonMap = new Map();
      if (existingHistory) {
        existingHistory.forEach((h: any) => {
          if (h.reason) reasonMap.set(h.obra_id, h.reason);
        });
      }

      // 1.3 LIMPEZA: Remover todos os registros do histórico para este mês antes de recalcular
      // Isso garante que não sobrem registros de projetos que não deveriam estar mais aqui
      const { error: deleteError } = await supabase
        .from('monthly_execution_history')
        .delete()
        .eq('reference_month', currentMonth)
        .eq('reference_year', currentYear);

      if (deleteError) {
        console.error("Erro ao limpar histórico anterior:", deleteError);
        throw deleteError;
      }

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

        // 1. Verificar o status atual no forecast_data (para pegar o que foi sincronizado agora)
        const isStarted = ['open', 'started', 'closed'].includes((currentObra.status || '').toLowerCase().trim());
        const isCompleted = (currentObra.status || '').toLowerCase().trim() === 'closed';

        // 2. Buscar o último subcontratado conhecido para esta obra
        const { data: latestSubData } = await supabase
          .from('subcontractor_performance')
          .select('subcontractor')
          .eq('obra_id', plan.obra_id)
          .order('event_datetime', { ascending: false })
          .limit(1);
        
        const subcontractor = latestSubData && latestSubData.length > 0 ? latestSubData[0].subcontractor : null;

        executionRecords.push({
          obra_id: plan.obra_id,
          reference_month: currentMonth,
          reference_year: currentYear,
          actual_status: currentObra.status,
          actual_start_date: isStarted ? (currentObra.previous_start_date || new Date().toISOString().split('T')[0]) : null,
          subcontractor: subcontractor,
          actual_end_date: isCompleted ? (currentObra.previous_end_date || new Date().toISOString().split('T')[0]) : null,
          is_cycle_completed: isCompleted, // Agora baseado apenas no status CLOSED
          reason: reasonMap.get(plan.obra_id) || null
        });
      }

      if (executionRecords.length > 0) {
        console.log(`Gravando ${executionRecords.length} registros de execução histórica...`);
        // Usamos insert porque já limpamos a tabela para este mês
        const { error: execInsertError } = await supabase
          .from('monthly_execution_history')
          .insert(executionRecords);
        
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
    
    // Se não vieram no body, calculamos o padrão (próximo mês)
    if (body.month && body.year) {
      targetMonth = body.month;
      targetYear = body.year;
    } else {
      let nextMonth = now.getMonth() + 2; 
      let nextYear = now.getFullYear();
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      targetMonth = nextMonth;
      targetYear = nextYear;
    }
    
    console.log(`Período alvo definido para planejamento: mês ${targetMonth}, ano ${targetYear}`);

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
      console.log(`Encontradas ${obras.length} obras para o período. Recalculando planejamento...`);
      
      // 2.1 LIMPEZA: Remover todos os registros do OFI para o mês alvo antes de recalcular
      // Isso garante que o planejamento seja refeito do zero, removendo obras que podem ter mudado de data
      const { error: deleteOFIError } = await supabase
        .from('operational_forecast_index')
        .delete()
        .eq('reference_month', targetMonth)
        .eq('reference_year', targetYear);

      if (deleteOFIError) {
        console.error("Erro ao limpar OFI anterior:", deleteOFIError);
        throw deleteOFIError;
      }

      const ofiRecords = [];

      for (const obra of obras) {
        // Como limpamos tudo, não precisamos checar se já existe (existingIds)
        // Apenas calculamos e adicionamos tudo que foi encontrado no range de datas
        
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
        // Se não inseriu nada novo, retorna 0 pois limpamos tudo
        ofiCount = 0;
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
