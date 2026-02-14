import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

// URL da planilha de Subcontractor Performance (GID 1136114995)
const spreadsheetId = "188IqXMBS6UaVzG-FWRI9REVCFsqLV_tOkv0F3PxX83I";
const subPerfUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=1136114995`;

/**
 * Normaliza strings para UTF-8 adequado
 * Remove caracteres especiais problemáticos e decodifica entidades HTML
 */
function normalizeUtf8String(str: string | null | undefined): string {
  if (!str) return '';
  
  try {
    // Decodifica entidades HTML comuns
    const decoded = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&aacute;/g, 'á')
      .replace(/&agrave;/g, 'à')
      .replace(/&atilde;/g, 'ã')
      .replace(/&acirc;/g, 'â')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&ecirc;/g, 'ê')
      .replace(/&iacute;/g, 'í')
      .replace(/&igrave;/g, 'ì')
      .replace(/&ocirc;/g, 'ô')
      .replace(/&otilde;/g, 'õ')
      .replace(/&ograve;/g, 'ò')
      .replace(/&uacute;/g, 'ú')
      .replace(/&ugrave;/g, 'ù')
      .replace(/&ccedil;/g, 'ç')
      .replace(/&Aacute;/g, 'Á')
      .replace(/&Agrave;/g, 'À')
      .replace(/&Atilde;/g, 'Ã')
      .replace(/&Acirc;/g, 'Â')
      .replace(/&Eacute;/g, 'É')
      .replace(/&Egrave;/g, 'È')
      .replace(/&Ecirc;/g, 'Ê')
      .replace(/&Iacute;/g, 'Í')
      .replace(/&Igrave;/g, 'Ì')
      .replace(/&Ocirc;/g, 'Ô')
      .replace(/&Otilde;/g, 'Õ')
      .replace(/&Ograve;/g, 'Ò')
      .replace(/&Uacute;/g, 'Ú')
      .replace(/&Ugrave;/g, 'Ù')
      .replace(/&Ccedil;/g, 'Ç');
    
    // Normaliza espaços e remove caracteres problemáticos
    return decoded
      .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
      .trim();
  } catch (error) {
    console.warn('Erro ao normalizar string UTF-8:', error);
    return str || '';
  }
}

async function fetchCsvToJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar CSV: ${res.status}`);
  
  const buffer = await res.arrayBuffer();
  
  // Tentar diferentes encodings para melhor compatibilidade UTF-8
  let csvText: string;
  try {
    // Primeiro tenta UTF-8
    csvText = new TextDecoder("utf-8").decode(buffer);
  } catch {
    try {
      // Se falhar, tenta UTF-8 com BOM
      csvText = new TextDecoder("utf-8-sig").decode(buffer);
    } catch {
      // Último recurso: latin1
      csvText = new TextDecoder("latin1").decode(buffer);
    }
  }

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, { 
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error: any) => reject(error)
    });
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    console.log("Iniciando sincronização de Subcontractor Performance via CSV...");

    // 1. Coleta os dados diretamente da planilha (igual ao forecast.ts)
    const events: any = await fetchCsvToJson(subPerfUrl);
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      console.log("Nenhum dado encontrado na planilha.");
      return new Response(JSON.stringify({ success: true, message: "Planilha vazia" }), { headers: corsHeaders });
    }

    console.log(`Processando ${events.length} eventos da planilha...`);

    // 2. Mapeia os dados para o formato do banco
    const records = events.map((event: any) => ({
      obra_id: normalizeUtf8String(event.ID),
      event: normalizeUtf8String(event.Event),
      estimated_date_type: normalizeUtf8String(event.Estimated_DateType),
      subcontractor: normalizeUtf8String(event.Subcontractor),
      event_datetime: event["Create DateTime"] ? new Date(event["Create DateTime"]).toISOString() : null,
      user_email: normalizeUtf8String(event.UserEmail)
    })).filter((r: any) => r.obra_id && r.event);

    // 3. Upsert no banco
    const { error } = await supabase
      .from('subcontractor_performance')
      .upsert(records, { 
        onConflict: 'obra_id,event,event_datetime',
        ignoreDuplicates: true 
      });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, processed: records.length }), { 
      status: 200, 
      headers: corsHeaders 
    });

  } catch (error: any) {
    console.error("Erro na sincronização:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
