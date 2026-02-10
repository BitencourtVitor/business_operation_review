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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    console.log("Iniciando cálculo do OFI...");

    // 1. Definir o mês de referência (mês seguinte ao atual)
    const now = new Date();
    let refMonth = now.getMonth() + 2; // +1 para ser próximo mês, +1 porque getMonth() é 0-indexed
    let refYear = now.getFullYear();

    if (refMonth > 12) {
      refMonth = 1;
      refYear++;
    }

    console.log(`Calculando OFI para ${refMonth}/${refYear}`);

    // 2. Buscar obras (Apenas as que começam no mês de referência)
    console.log(`Buscando obras que começam em ${refMonth}/${refYear}...`);
    
    const startOfMonth = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(refYear, refMonth, 0).getDate();
    const endOfMonth = `${refYear}-${String(refMonth).padStart(2, '0')}-${lastDay}`;

    const { data: obras, error: obrasError } = await supabase
      .from('forecast_data')
      .select('id, storage, qbtime, buildertrend')
      .gte('previous_start_date', startOfMonth)
      .lte('previous_start_date', endOfMonth);

    if (obrasError) {
      console.error("Erro ao buscar obras:", obrasError);
      throw obrasError;
    }

    if (!obras || obras.length === 0) {
      console.log(`Nenhuma obra encontrada começando em ${refMonth}/${refYear}.`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Nenhuma obra nova encontrada para iniciar em ${refMonth}/${refYear}.` 
      }), { status: 200, headers: corsHeaders });
    }

    console.log(`Encontradas ${obras.length} obras para o período. Verificando registros existentes...`);

    // 2.1 Buscar o que já existe para este mês/ano para não sobrescrever
    const { data: existingRecords, error: existingError } = await supabase
      .from('operational_forecast_index')
      .select('obra_id')
      .eq('reference_month', refMonth)
      .eq('reference_year', refYear);

    if (existingError) {
      console.error("Erro ao buscar registros existentes:", existingError);
      throw existingError;
    }

    const existingObraIds = new Set(existingRecords?.map(r => r.obra_id) || []);
    console.log(`${existingObraIds.size} obras já possuem registro para este período.`);

    const ofiRecords = [];

    for (const obra of obras) {
      // Se a obra já existe para este mês/ano, PULA. Não mexe no que já está lá.
      if (existingObraIds.has(obra.id)) {
        continue;
      }

      try {
        // CALCULAR FIELDWIRE (Peso 2)
        const { data: fwItems, error: fwError } = await supabase.from('forecast_fieldwire').select('status').eq('obra_id', obra.id);
        if (fwError) console.warn(`Erro Fieldwire para obra ${obra.id}:`, fwError);
        const fwScore = fwItems && fwItems.length > 0 
          ? (fwItems.filter((i: any) => i.status === true).length / fwItems.length) * 2 
          : 0;

        // CALCULAR MÁQUINAS (Peso 2)
        const { data: machineItems, error: mError } = await supabase.from('forecast_machines').select('status').eq('obra_id', obra.id);
        if (mError) console.warn(`Erro Máquinas para obra ${obra.id}:`, mError);
        const machineScore = machineItems && machineItems.length > 0 
          ? (machineItems.filter((i: any) => i.status === true).length / machineItems.length) * 2 
          : 0;

        // CALCULAR CONTRATOS (Peso 2)
        const { data: contractItems, error: cError } = await supabase.from('forecast_contract_steps').select('status').eq('obra_id', obra.id);
        if (cError) console.warn(`Erro Contratos para obra ${obra.id}:`, cError);
        const contractScore = contractItems && contractItems.length > 0 
          ? (contractItems.filter((i: any) => i.status === true).length / contractItems.length) * 2 
          : 0;

        // CALCULAR SISTEMAS (Peso 1)
        let systemsPoints = 0;
        if (obra.storage === true) systemsPoints += 0.333;
        if (obra.qbtime === true) systemsPoints += 0.333;
        if (obra.buildertrend === true) systemsPoints += 0.334;
        const systemsScore = Math.min(1.0, systemsPoints);

        const totalScore = fwScore + machineScore + contractScore + systemsScore;

        ofiRecords.push({
          obra_id: obra.id,
          reference_month: refMonth,
          reference_year: refYear,
          fieldwire_score: parseFloat(fwScore.toFixed(2)),
          machines_score: parseFloat(machineScore.toFixed(2)),
          contract_score: parseFloat(contractScore.toFixed(2)),
          systems_score: parseFloat(systemsScore.toFixed(2)),
          total_score: parseFloat(totalScore.toFixed(2))
        });
      } catch (itemError) {
        console.error(`Erro ao processar obra ${obra.id}:`, itemError);
      }
    }

    if (ofiRecords.length === 0) {
      console.log("Nenhum novo registro de OFI para adicionar.");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Todos os projetos já possuem registros para este período. Nada foi alterado." 
      }), { status: 200, headers: corsHeaders });
    }

    console.log(`Gravando ${ofiRecords.length} novos registros no banco...`);

    // 3. Gravar no Banco (INSERT apenas para novos)
    const { error: insertError } = await supabase
      .from('operational_forecast_index')
      .insert(ofiRecords);

    if (insertError) {
      console.error("Erro no Insert:", insertError);
      throw insertError;
    }

    console.log("Cálculo concluído com sucesso!");


    return new Response(JSON.stringify({ 
      success: true, 
      count: ofiRecords.length,
      month: refMonth,
      year: refYear
    }), { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error("Erro no OFI Calculator:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
