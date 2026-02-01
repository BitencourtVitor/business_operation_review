import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

/**
 * Edge Function para coletar dados da tabela timesheet_data_new.
 */
serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Tenta obter o corpo da requisição se for POST
    let filters: any = {};
    if (req.method === "POST") {
      try {
        filters = await req.json();
      } catch {
        // Ignora erros de JSON vazio ou malformado
      }
    }

    const { reference_month } = filters;

    // Inicia a query na tabela timesheet_data_new
    let query = supabase
      .from('timesheet_data_new')
      .select('*')
      .order('created_at', { ascending: false });

    // Aplica filtro de mês de referência se fornecido
    if (reference_month) {
      query = query.eq('reference_month', reference_month);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({
      success: true,
      count: data?.length || 0,
      data: data
    }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (error: any) {
    console.error('Erro na edge function timesheet_data_new:', error.message);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
