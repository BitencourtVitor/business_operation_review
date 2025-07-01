// ESSA É UMA CÓPIA DA EDGE FUNCTION USADA NO MOMENTO DENTRO DO BACKEND SUPABASE PARA COLETAR E TRATAR OS DADOS DAS PLANILHAS GOOGLE, OFERECENDO-OS PARA QUE O FRONTEND CONSULTE ATRAVÉS DE REQUISIÇÕES.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const urls = {
  timesheet: "https://docs.google.com/spreadsheets/d/1_BZtDLtDggKQ_2D-5O_JP53z8eKdWSZxbjD8DnJBDlM/export?format=csv&gid=814204999",
  permit: "https://docs.google.com/spreadsheets/d/1Em_Wyj8EiBeo56zGrShKEP9yFCMDVmkR-_EoiNXI3YA/export?format=csv&gid=1016235500",
  receivables: "https://docs.google.com/spreadsheets/d/1lk5ENgYagn9cBhvOtLVSJ6lVZdblrt3KteSMbqE_GSQ/export?format=csv&gid=0",
  payables: "https://docs.google.com/spreadsheets/d/1wsF5Ze940saB4pP-v1WVMXTFWFqUkKQog3P3Ylp_GO8/export?format=csv&gid=0"
};

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
    console.log(`Buscando dados de ${name}...`);
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
          console.log(`${name}: ${results.data.length} registros carregados`);
          resolve(results.data);
        },
        error: (err) => {
          console.error(`Erro no parse de ${name}:`, err);
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
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  } catch (error) {
    console.error(`Erro ao fazer parse da data: ${str}`, error);
    return null;
  }
}

// Função melhorada para parse de valores numéricos
function parseNumericValue(value: any, defaultValue = 0) {
  if (!value || value === '') return defaultValue;
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

function parseAccountingValue(str: string) {
  return parseNumericValue(str, 0);
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

// Deletar tabelas em paralelo
async function deleteAllTables() {
  try {
    console.log('Deletando dados existentes em paralelo...');
    const deletePromises = [
      supabase.from('timesheet_analysis').delete().not('id', 'is', null),
      supabase.from('permit_control').delete().not('id', 'is', null),
      supabase.from('receivables_accounting').delete().not('id', 'is', null),
      supabase.from('payables_accounting').delete().not('id', 'is', null)
    ];
    const results = await Promise.all(deletePromises);
    // Verificar erros
    for (let i = 0; i < results.length; i++) {
      if (results[i].error) {
        throw results[i].error;
      }
    }
    console.log('Todas as tabelas foram limpas com sucesso');
    return "Todas as tabelas foram limpas com sucesso";
  } catch (error) {
    console.error('Erro em deleteAllTables:', error);
    throw error;
  }
}

// Inserir dados em lotes para melhor performance
async function upsertTableBatch(table: string, data: any[], name: string, batchSize = 1000) {
  try {
    console.log(`Inserindo dados em ${name} em lotes de ${batchSize}...`);
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
      console.log(`${name}: lote ${i + 1}/${batches.length} inserido`);
    }
    console.log(`${name} inserido com sucesso (${data.length} registros)`);
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
    console.log('=== INICIANDO SINCRONIZAÇÃO OTIMIZADA COM UTF-8 ===');
    
    // 1. Deletar dados existentes
    const deleteResult = await deleteAllTables();
    
    // 2. Buscar novos dados em paralelo
    console.log('Buscando dados em paralelo...');
    const [timesheetData, permitData, receivablesData, payablesData] = await Promise.all([
      fetchCsvToJson(urls.timesheet, 'Timesheet'),
      fetchCsvToJson(urls.permit, 'Permit'),
      fetchCsvToJson(urls.receivables, 'Receivables'),
      fetchCsvToJson(urls.payables, 'Payables')
    ]);
    
    // Log para debug dos headers
    if (receivablesData && receivablesData.length > 0) {
      console.log("Receivables headers:", Object.keys(receivablesData[0]));
      console.log("Primeiro registro receivables:", receivablesData[0]);
    }
    if (payablesData && payablesData.length > 0) {
      console.log("Payables headers:", Object.keys(payablesData[0]));
      console.log("Primeiro registro payables:", payablesData[0]);
    }
    
    // 3. Mapear dados em paralelo com normalização UTF-8
    console.log('Mapeando dados em paralelo com normalização UTF-8...');
    const [mappedTimesheet, mappedPermit, mappedReceivables, mappedPayables] = await Promise.all([
      Promise.resolve(timesheetData.map((row) => ({
        date: getField(row, "Date") ? new Date(getField(row, "Date")) : null,
        nome: getField(row, "Nome"),
        error: getField(row, "Error"),
        team: getField(row, "Team"),
        corporation: getField(row, "Corporation"),
        payrate: getField(row, "Payrate") ? parseFloat(getField(row, "Payrate")) : null,
        add_time_hour: getField(row, "Add time/hour") ? parseFloat(getField(row, "Add time/hour")) : null,
        remove_time_hour: getField(row, "Remove time/hour") ? parseFloat(getField(row, "Remove time/hour")) : null,
        add_dollar: getField(row, "ADD $") ? parseFloat(getField(row, "ADD $")) : null,
        remove_dollar: getField(row, "REMOVE $") ? parseFloat(getField(row, "REMOVE $")) : null,
        total: getField(row, "TOTAL") ? parseFloat(getField(row, "TOTAL")) : null
      }))),
      
      Promise.resolve(permitData.map((row) => ({
        model: getField(row, "MODEL"),
        jobsite: getField(row, "JOBSITE"),
        lot_address: getField(row, "LOT/ADDRESS"),
        situacao: getField(row, "SITUACAO"),
        solicitacao: parseDateUS(getField(row, "SOLICITACAO")),
        aplicacao: parseDateUS(getField(row, "APLICACAO")),
        emissao: parseDateUS(getField(row, "EMISSAO")),
        observacao: getField(row, "OBSERVACAO"),
        arquivo: getField(row, "ARQUIVO")
      }))),
      
      Promise.resolve(receivablesData.map((row) => {
        // Debug dos valores problemáticos
        const invAmountRaw = getField(row, "INV Amount");
        const openBalanceRaw = getField(row, "Open balance");
        const epoNumberRaw = getField(row, "EPO Number");
        console.log(`Receivables debug - INV Amount: "${invAmountRaw}" (${typeof invAmountRaw})`);
        console.log(`Receivables debug - Open balance: "${openBalanceRaw}" (${typeof openBalanceRaw})`);
        console.log(`Receivables debug - EPO Number: "${epoNumberRaw}" (${typeof epoNumberRaw})`);
        
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
      })),
      
      Promise.resolve(payablesData.map((row) => {
        // Debug dos valores problemáticos
        const totalAmountRaw = getField(row, "Total Amount");
        const openBalanceRaw = getField(row, "Open balance");
        console.log(`Payables debug - Total Amount: "${totalAmountRaw}" (${typeof totalAmountRaw})`);
        console.log(`Payables debug - Open balance: "${openBalanceRaw}" (${typeof openBalanceRaw})`);
        
        return {
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
      }))
    ]);
    
    console.log('Dados mapeados com sucesso e normalizados UTF-8');
    
    // 4. Inserir novos dados em paralelo
    console.log('Inserindo dados em paralelo...');
    await Promise.all([
      upsertTableBatch("timesheet_analysis", mappedTimesheet, "Timesheet"),
      upsertTableBatch("permit_control", mappedPermit, "Permit"),
      upsertTableBatch("receivables_accounting", mappedReceivables, "Receivables"),
      upsertTableBatch("payables_accounting", mappedPayables, "Payables")
    ]);
    
    console.log('=== SINCRONIZAÇÃO OTIMIZADA COM UTF-8 CONCLUÍDA COM SUCESSO ===');
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização otimizada com UTF-8 concluída com sucesso!",
      deleteResult: deleteResult,
      inserted: {
        timesheet: mappedTimesheet.length,
        permit: mappedPermit.length,
        receivables: mappedReceivables.length,
        payables: mappedPayables.length
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('=== ERRO NA EDGE FUNCTION OTIMIZADA ===');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    
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