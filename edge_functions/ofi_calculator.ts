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

    // 2. Buscar obras que começam no mês de referência
    const startOfMonth = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(refYear, refMonth, 0).getDate();
    const endOfMonth = `${refYear}-${String(refMonth).padStart(2, '0')}-${lastDay}`;

    const { data: obras, error: obrasError } = await supabase
      .from('forecast_data')
      .select('*')
      .gte('previous_start_date', startOfMonth)
      .lte('previous_start_date', endOfMonth);

    if (obrasError) throw obrasError;
    if (!obras || obras.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhuma obra encontrada para o próximo mês." }), { status: 200, headers: corsHeaders });
    }

    const ofiRecords = [];

    for (const obra of obras) {
      // CALCULAR FIELDWIRE (Peso 2)
      const { data: fwItems } = await supabase.from('forecast_fieldwire').select('status').eq('obra_id', obra.id);
      const fwScore = fwItems && fwItems.length > 0 
        ? (fwItems.filter((i: any) => i.status).length / fwItems.length) * 2 
        : 0;

      // CALCULAR MÁQUINAS (Peso 2)
      const { data: machineItems } = await supabase.from('forecast_machines').select('status').eq('obra_id', obra.id);
      const machineScore = machineItems && machineItems.length > 0 
        ? (machineItems.filter((i: any) => i.status).length / machineItems.length) * 2 
        : 0;

      // CALCULAR CONTRATOS (Peso 2)
      const { data: contractItems } = await supabase.from('forecast_contract_steps').select('status').eq('obra_id', obra.id);
      const contractScore = contractItems && contractItems.length > 0 
        ? (contractItems.filter((i: any) => i.status).length / contractItems.length) * 2 
        : 0;

      // CALCULAR SISTEMAS (Peso 1)
      // Parâmetros: Storage, QBTime, Buildertrend (0.33 cada)
      let systemsPoints = 0;
      if (obra.storage) systemsPoints += 0.333;
      if (obra.qbtime) systemsPoints += 0.333;
      if (obra.buildertrend) systemsPoints += 0.334; // Ajuste para somar 1.0
      const systemsScore = Math.min(1.0, systemsPoints);

      const totalScore = fwScore + machineScore + contractScore + systemsScore;

      ofiRecords.push({
        obra_id: obra.id,
        reference_month: refMonth,
        reference_year: refYear,
        fieldwire_score: fwScore,
        machines_score: machineScore,
        contract_score: contractScore,
        systems_score: systemsScore,
        total_score: totalScore
      });
    }

    // 3. Gravar no Banco (Upsert para permitir re-execução no mesmo dia)
    const { error: upsertError } = await supabase
      .from('operational_forecast_index')
      .upsert(ofiRecords, { onConflict: 'obra_id,reference_month,reference_year' });

    if (upsertError) throw upsertError;

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
