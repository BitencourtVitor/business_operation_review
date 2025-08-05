import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const receivablesUrl = "https://docs.google.com/spreadsheets/d/1lk5ENgYagn9cBhvOtLVSJ6lVZdblrt3KteSMbqE_GSQ/export?format=csv&gid=0";

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
          reject(err);
        }
      });
    });
  } catch (error) {
    console.error(`Erro ao buscar ${name}:`, error);
    throw error;
  }
}

// Função melhorada para parse de valores numéricos
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

// Função para garantir que pega o campo mesmo com espaços extras e normaliza UTF-8
function getField(row: any, key: string) {
  let value = null;
  
  if (row[key] !== undefined) value = row[key];
  else if (row[` ${key}`] !== undefined) value = row[` ${key}`];
  else if (row[`${key} `] !== undefined) value = row[`${key} `];
  else {
    // Tenta remover todos os espaços
    const foundKey = Object.keys(row).find((k) => k.replace(/\s/g, '') === key.replace(/\s/g, ''));
    if (foundKey) value = row[foundKey];
  }
  
  // Normaliza UTF-8 se for string
  if (typeof value === 'string') {
    return normalizeUtf8String(value);
  }
  
  return value;
}

// Deletar tabela receivables
async function deleteReceivablesTable() {
  try {
    const { error } = await supabase.from('receivables_accounting').delete().not('id', 'is', null);
    if (error) {
      throw error;
    }
    return "Tabela receivables_accounting foi limpa com sucesso";
  } catch (error) {
    console.error('Erro em deleteReceivablesTable:', error);
    throw error;
  }
}

// Inserir dados em lotes para melhor performance
async function upsertTableBatch(table: string, data: any[], name: string, batchSize = 1000) {
  try {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const { error } = await supabase.from(table).upsert(batch, {
        onConflict: ['id']
      });
      if (error) {
        console.error(`Erro ao inserir lote ${i + 1} em ${name}:`, error);
        throw error;
      }
    }
  } catch (error) {
    console.error(`Erro ao acessar tabela ${name}:`, error);
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
    // 1. Deletar dados existentes
    const deleteResult = await deleteReceivablesTable();
    
    // 2. Buscar novos dados
    const receivablesData = await fetchCsvToJson(receivablesUrl, 'Receivables');
    
    // 3. Mapear dados com normalização UTF-8
    const mappedReceivables = receivablesData.map((row) => {
      // Debug dos valores problemáticos
      const invAmountRaw = getField(row, "INV Amount");
      const openBalanceRaw = getField(row, "Open balance");
      const epoNumberRaw = getField(row, "EPO Number");
      
      return {
        id: crypto.randomUUID(),
        inv_date: getField(row, "Inv Date") ? new Date(getField(row, "Inv Date")) : null,
        transaction_type: getField(row, "Transaction type"),
        inv_num: getField(row, "INV Num"),
        customer_full_name: getField(row, "Customer full name"),
        due_date: getField(row, "Due date") ? new Date(getField(row, "Due date")) : null,
        inv_amount: parseNumericValue(invAmountRaw, 0),
        open_balance: parseNumericValue(openBalanceRaw, 0),
        epo_number: epoNumberRaw && epoNumberRaw.toString().trim() !== '' ? epoNumberRaw.toString().trim() : null,
        category: getField(row, "Category"),
        aging_days: getField(row, "Aging days") ? parseInt(getField(row, "Aging days")) : null,
        aging_intervals: getField(row, "Aging Intervals"),
        date_field: getField(row, "Date") ? new Date(getField(row, "Date")) : null,
        created_at: new Date()
      };
    });
    
    // 4. Inserir novos dados
    if (Array.isArray(mappedReceivables) && mappedReceivables.length > 0) {
      await upsertTableBatch("receivables_accounting", mappedReceivables, "Receivables");
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização de receivables concluída com sucesso!",
      deleteResult: deleteResult,
      inserted: {
        receivables: Array.isArray(mappedReceivables) ? mappedReceivables.length : 0
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Erro na edge function receivables:', error.message);
    
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
