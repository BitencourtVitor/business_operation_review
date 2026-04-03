import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const payablesUrl = "https://docs.google.com/spreadsheets/d/1wsF5Ze940saB4pP-v1WVMXTFWFqUkKQog3P3Ylp_GO8/export?format=csv&gid=0";

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
    return str;
  }
}

// Função otimizada para buscar CSV com encoding UTF-8
async function fetchCsvToJson(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} for ${name}`);
    }
    
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
        complete: (results) => {
          resolve(results.data);
        },
        error: (err) => {
          reject(new Error(`Erro ao fazer parse do CSV ${name}: ${err.message}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`Erro ao buscar CSV ${name}: ${error.message}`);
  }
}

function parseDateUS(str: string) {
  if (!str) return null;
  
  try {
    // Remove espaços e caracteres extras
    const cleanStr = str.trim();
    
    // Tenta diferentes formatos de data
    const date = new Date(cleanStr);
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) {
      console.warn(`Data inválida: ${str}`);
      return null;
    }
    
    return date.toISOString().split('T')[0]; // Retorna apenas a parte da data (YYYY-MM-DD)
  } catch (error) {
    console.warn(`Erro ao fazer parse da data ${str}:`, error);
    return null;
  }
}

function parseNumericValue(value: any, defaultValue = 0) {
  if (!value || value === '') {
    return defaultValue;
  }
  
  try {
    // Converte para string e remove formatação
    const stringValue = String(value).trim();
    
    // Remove caracteres de formatação (vírgulas, espaços, parênteses, etc.)
    let cleanValue = stringValue.replace(/[$,()\s]/g, '');
    
    // Se estava entre parênteses, é negativo
    if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
      cleanValue = '-' + cleanValue;
    }
    
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? defaultValue : parsed;
  } catch (error) {
    console.error(`Erro ao fazer parse do valor: ${value}`, error);
    return defaultValue;
  }
}

function getField(row: any, key: string) {
  if (!row || !key) return '';
  
  try {
    const value = row[key];
    if (value === null || value === undefined) return '';
    
    return normalizeUtf8String(String(value));
  } catch (error) {
    console.warn(`Erro ao buscar campo ${key}:`, error);
    return '';
  }
}

// Função SUPER otimizada para buscar apenas registros que realmente mudaram
async function getOnlyChangedRecords(table: string, dataToCheck: any[]) {
  try {
    // Extrair IDs únicos da planilha
    const allIds = dataToCheck.map(row => row.intern_id).filter(id => id);
    const uniqueIds = Array.from(new Set(allIds));
    
    if (uniqueIds.length === 0) {
      return dataToCheck;
    }
    
    // Buscar apenas registros existentes em lotes
    const existingMap = new Map();
    const batchSize = 1000;
    
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const idBatch = uniqueIds.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from(table)
        .select('intern_id, last_update_datetimez')
        .in('intern_id', idBatch);
      
      if (error) throw error;
      
      data?.forEach(row => {
        existingMap.set(row.intern_id, row.last_update_datetimez);
      });
    }
    
    // Filtrar APENAS registros que realmente mudaram
    const recordsToUpdate = [];
    let newRecords = 0;
    let modifiedRecords = 0;
    let unchangedRecords = 0;
    
    for (const row of dataToCheck) {
      const internId = row.intern_id;
      const lastUpdate = row.last_update_datetimez;
      
      if (!internId) {
        // Registro sem ID - considerar como novo
        recordsToUpdate.push(row);
        newRecords++;
        continue;
      }
      
      const existingUpdate = existingMap.get(internId);
      
      if (!existingUpdate) {
        // Registro novo
        recordsToUpdate.push(row);
        newRecords++;
      } else if (lastUpdate && new Date(lastUpdate) > new Date(existingUpdate)) {
        // Registro modificado
        recordsToUpdate.push(row);
        modifiedRecords++;
      } else {
        // Registro inalterado - NÃO processar
        unchangedRecords++;
      }
    }
    
    return recordsToUpdate;
  } catch (error) {
    console.error('❌ Erro ao buscar registros modificados:', error);
    throw error;
  }
}

async function upsertTableBatch(table: string, data: any[], name: string, batchSize = 100) {
  try {
    if (data.length === 0) {
      return 0;
    }
    
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    let totalUpserted = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Timeout mais curto para cada lote
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 15000);
      });
      
      const upsertPromise = supabase
        .from(table)
        .upsert(batch, { 
          onConflict: 'intern_id',
          ignoreDuplicates: false 
        });
      
      const { data: result, error } = await Promise.race([upsertPromise, timeoutPromise]) as any;
      
      if (error) {
        console.error(`❌ Erro no lote ${i + 1}/${batches.length}:`, error);
        throw error;
      }
      
      totalUpserted += batch.length;
      
      // Pausa entre lotes
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return totalUpserted;
  } catch (error) {
    console.error(`❌ Erro ao acessar tabela ${name}:`, error);
    throw error;
  }
}

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Método não permitido"
    }), {
      status: 405,
      headers: corsHeaders
    });
  }
  
  try {
    // 1. Buscar novos dados
    const payablesData = await fetchCsvToJson(payablesUrl, 'Payables');
    
    // 2. Mapear dados com normalização UTF-8
    const mappedPayables = payablesData.map((row) => {
      const totalAmountRaw = getField(row, "Total Amount");
      const openBalanceRaw = getField(row, "Open balance");
      
      return {
        intern_id: getField(row, "INTERN_ID"),
        last_update_datetimez: getField(row, "LAST_UPDATE_DATETIMEZ") ? new Date(getField(row, "LAST_UPDATE_DATETIMEZ")) : null,
        expense_date: getField(row, "Expense Date") ? parseDateUS(getField(row, "Expense Date")) : null,
        transaction_type: getField(row, "Transaction type"),
        bill_num: getField(row, "Bill Num"),
        vendor_display_name: getField(row, "Vendor display name"),
        due_date: getField(row, "Due date") ? parseDateUS(getField(row, "Due date")) : null,
        total_amount: parseNumericValue(totalAmountRaw, 0),
        open_balance: parseNumericValue(openBalanceRaw, 0),
        category: getField(row, "Category"),
        past_due: getField(row, "Past due") ? parseInt(getField(row, "Past due")) : null,
        aging_intervals: getField(row, "Aging Intervals"),
        date_field: getField(row, "Date") ? parseDateUS(getField(row, "Date")) : null,
        created_at: new Date()
      };
    });
    
    // 3. Fazer upsert dos dados
    if (Array.isArray(mappedPayables) && mappedPayables.length > 0) {
      // 3.1. Buscar APENAS registros que realmente mudaram
      const recordsToUpdate = await getOnlyChangedRecords("payables_accounting", mappedPayables);
      
      // 3.2. Fazer upsert apenas dos registros modificados/novos
      if (recordsToUpdate.length > 0) {
        const upsertedCount = await upsertTableBatch("payables_accounting", recordsToUpdate, "Payables");
        
        return new Response(JSON.stringify({
          success: true,
          message: "Sincronização de payables concluída com sucesso!",
          upserted: {
            payables: upsertedCount
          }
        }), {
          status: 200,
          headers: corsHeaders
        });
      } else {
        return new Response(JSON.stringify({
          success: true,
          message: "Nenhum dado de payable encontrado para sincronizar.",
          upserted: {
            payables: 0
          }
        }), {
          status: 200,
          headers: corsHeaders
        });
      }
    } else {
      return new Response(JSON.stringify({
        success: true,
        message: "Nenhum dado de payable encontrado para sincronizar.",
        upserted: {
          payables: 0
        }
      }), {
        status: 200,
        headers: corsHeaders
      });
    }
    
  } catch (error) {
    console.error('Erro na edge function payables:', error.message);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
