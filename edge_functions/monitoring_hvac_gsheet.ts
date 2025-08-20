import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const projectMonitoringHvacUrl = "https://docs.google.com/spreadsheets/d/19JsAWtAYFiO1Nr4bk0UeybExquU3wLxzB5YOIYe0Y8Q/export?format=csv&gid=0";

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

// Funções de parse otimizadas
function parseDateUS(str: string) {
  if (!str) return null;
  try {
    const [month, day, year] = str.split('/');
    // Criar data no fuso horário local para evitar problemas de timezone
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date;
  } catch (error) {
    console.error(`Erro ao fazer parse da data: ${str}`, error);
    return null;
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

// Deletar tabela project monitoring hvac
async function deleteProjectMonitoringHvacTable() {
  try {
    const { error } = await supabase.from('project_monitoring_hvac').delete().not('id', 'is', null);
    if (error) {
      throw error;
    }
    return "Tabela project_monitoring_hvac foi limpa com sucesso";
  } catch (error) {
    console.error('Erro em deleteProjectMonitoringHvacTable:', error);
    throw error;
  }
}

// Inserir dados em lotes para melhor performance
async function insertTableBatch(table: string, data: any[], name: string, batchSize = 1000) {
  try {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const { error } = await supabase.from(table).insert(batch);
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
    const deleteResult = await deleteProjectMonitoringHvacTable();
    
    // 2. Buscar novos dados
    const projectMonitoringHvacData = await fetchCsvToJson(projectMonitoringHvacUrl, 'Project_Monitoring_HVAC');
    
    // 3. Mapear dados com normalização UTF-8
    const mappedProjectMonitoringHvac = projectMonitoringHvacData.map((row) => ({
      city: getField(row, "City"),
      job_site: getField(row, "Job Site"),
      lot_number: getField(row, "Lot #"),
      team: getField(row, "Team"),
      start_date: getField(row, "Start Date") ? parseDateUS(getField(row, "Start Date")) : null,
      finish_date: getField(row, "Finish Date") ? parseDateUS(getField(row, "Finish Date")) : null,
      s1_rough: getField(row, "S1: Rough"),
      s1_date: getField(row, "S1_Date") ? parseDateUS(getField(row, "S1_Date")) : null,
      s2_machines: getField(row, "S2: Machines"),
      s2_date: getField(row, "S2_Date") ? parseDateUS(getField(row, "S2_Date")) : null,
      s3_condenser: getField(row, "S3: Condenser"),
      s3_date: getField(row, "S3_Date") ? parseDateUS(getField(row, "S3_Date")) : null,
      s4_finish: getField(row, "S4: Finish"),
      s4_date: getField(row, "S4_Date") ? parseDateUS(getField(row, "S4_Date")) : null,
      percent_completed: (() => {
        const stages = [
          getField(row, "S1: Rough"),
          getField(row, "S2: Machines"), 
          getField(row, "S3: Condenser"),
          getField(row, "S4: Finish")
        ];
        const completedCount = stages.filter(stage => stage === 'Completed').length;
        return Math.round((completedCount / 4) * 100);
      })(),
      last_update: getField(row, "Last Update") ? new Date(getField(row, "Last Update")) : null,
      notes: getField(row, "Notes")
    }));
    
    // 4. Inserir novos dados
    if (Array.isArray(mappedProjectMonitoringHvac) && mappedProjectMonitoringHvac.length > 0) {
      await insertTableBatch("project_monitoring_hvac", mappedProjectMonitoringHvac, "Project_Monitoring_HVAC");
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização de project monitoring HVAC concluída com sucesso!",
      deleteResult: deleteResult,
      inserted: {
        project_monitoring_hvac: Array.isArray(mappedProjectMonitoringHvac) ? mappedProjectMonitoringHvac.length : 0
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Erro na edge function project monitoring HVAC:', error.message);
    
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
