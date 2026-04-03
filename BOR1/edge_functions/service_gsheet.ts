import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const serviceRequestsUrl = "https://docs.google.com/spreadsheets/d/142NUG_ffJwVotYwShXLywKcNzK8EQoNny_4Ow50qTu8/export?format=csv&gid=0";

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
  if (!str || str.trim() === '') return null;
  
  try {
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    
    const [monthStr, dayStr, yearStr] = parts;
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    
    // Validar se os valores parseados são números válidos
    if (isNaN(month) || isNaN(day) || isNaN(year)) {
      console.warn(`Data inválida (NaN detectado): ${str}`);
      return null;
    }
    
    // Validar ranges básicos
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
      console.warn(`Data fora do range válido: ${str}`);
      return null;
    }
    
    // Adicionar 1 dia para corrigir problema de timezone
    const date = new Date(year, month - 1, day);
    
    // Verificar se a data é válida
    if (isNaN(date.getTime())) {
      console.warn(`Data inválida após criação: ${str}`);
      return null;
    }
    
    date.setDate(date.getDate() + 1); // Adicionar 1 dia
    
    // Retornar como string no formato YYYY-MM-DD
    const resultYear = date.getFullYear();
    const resultMonth = date.getMonth() + 1;
    const resultDay = date.getDate();
    
    // Verificar se o resultado é válido
    if (isNaN(resultYear) || isNaN(resultMonth) || isNaN(resultDay)) {
      console.warn(`Resultado inválido ao formatar data: ${str}`);
      return null;
    }
    
    return `${resultYear}-${String(resultMonth).padStart(2, '0')}-${String(resultDay).padStart(2, '0')}`;
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

// Função para capitalizar cada palavra
function capitalizeEachWord(str: string | null | undefined): string {
  if (!str) return '';
  const normalized = normalizeUtf8String(str);
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Função para tratar valores booleanos
function parseBooleanValue(value: any): boolean {
  if (!value) return false;
  
  const stringValue = String(value).trim().toLowerCase();
  
  // Valores que devem retornar true
  if (['true', 'yes', '1', 'sim', 's', 'y'].includes(stringValue)) {
    return true;
  }
  
  // Valores que devem retornar false
  if (['false', 'no', '0', 'não', 'nao', 'n'].includes(stringValue)) {
    return false;
  }
  
  // Se não reconhecer, retorna false por padrão
  return false;
}

// Função para gerar ID único baseado nos dados
function generateUniqueId(row: any): string {
  const contractor = getField(row, "CONTRACTOR") || '';
  const jobSite = getField(row, "JOB SITE") || '';
  const lot = getField(row, "LOT") || '';
  const address = getField(row, "ADDRESS") || '';
  
  // Cria um ID único baseado nos campos principais
  const uniqueString = `${contractor}-${jobSite}-${lot}-${address}`;
  return uniqueString.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
}

// Deletar tabela service requests
async function deleteServiceRequestsTable() {
  try {
    const { error } = await supabase.from('service_requests').delete().not('id', 'is', null);
    if (error) {
      throw error;
    }
    return "Tabela service_requests foi limpa com sucesso";
  } catch (error) {
    console.error('Erro em deleteServiceRequestsTable:', error);
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
    const deleteResult = await deleteServiceRequestsTable();
    
    // 2. Buscar novos dados
    const serviceRequestsData = await fetchCsvToJson(serviceRequestsUrl, 'Service_Requests');
    
    // 3. Mapear dados com normalização UTF-8
    const mappedServiceRequests = serviceRequestsData.map((row) => ({
      contractor: capitalizeEachWord(getField(row, "CONTRACTOR")),
      job_site: getField(row, "JOB SITE"),
      city: getField(row, "CITY"),
      lot: getField(row, "LOT"),
      address: getField(row, "ADDRESS"),
      close_date: parseDateUS(getField(row, "CLOSE DATE")),
      date_received: parseDateUS(getField(row, "DATE RECEIVED")),
      material_available_date: parseDateUS(getField(row, "DISPONIBILIDADE DO MATERIAL")),
      resident_available_date: parseDateUS(getField(row, "DISPONIBILIDADE DO MORADOR")),
      date_completed: parseDateUS(getField(row, "DATE COMPLETED")),
      additional_visits: getField(row, "ADDITIONAL VISITS") ? getField(row, "ADDITIONAL VISITS").split(',').map(date => parseDateUS(date.trim())).filter(date => date) : null,
      issue: getField(row, "ISSUE"),
      warranty: parseBooleanValue(getField(row, "WARRANTY")),
      tech: getField(row, "TECH")
    }));
    
    // 4. Inserir novos dados
    if (Array.isArray(mappedServiceRequests) && mappedServiceRequests.length > 0) {
      await insertTableBatch("service_requests", mappedServiceRequests, "Service_Requests");
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização de service requests concluída com sucesso!",
      deleteResult: deleteResult,
      inserted: {
        service_requests: Array.isArray(mappedServiceRequests) ? mappedServiceRequests.length : 0
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Erro na edge function service requests:', error.message);
    
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
