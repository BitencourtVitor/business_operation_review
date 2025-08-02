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
  payables: "https://docs.google.com/spreadsheets/d/1wsF5Ze940saB4pP-v1WVMXTFWFqUkKQog3P3Ylp_GO8/export?format=csv&gid=0",
  takeoff_works: "https://docs.google.com/spreadsheets/d/1ktRGvvjn-c_YGhXMUAfcTtdTFOtTwoP-1gZTCeheAgU/export?format=csv&gid=0",
  takeoff_works_responsibles: "https://docs.google.com/spreadsheets/d/1ktRGvvjn-c_YGhXMUAfcTtdTFOtTwoP-1gZTCeheAgU/export?format=csv&gid=883077868",
  service_requests: "https://docs.google.com/spreadsheets/d/142NUG_ffJwVotYwShXLywKcNzK8EQoNny_4Ow50qTu8/export?format=csv&gid=0"
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
  console.log(`🔍 parseNumericValue input: ${value}, type: ${typeof value}`);
  
  if (!value || value === '') {
    console.log(`🔍 parseNumericValue: valor vazio, retornando ${defaultValue}`);
    return defaultValue;
  }
  
  try {
    // Converte para string e remove formatação
    const stringValue = String(value).trim();
    console.log(`🔍 parseNumericValue stringValue: "${stringValue}"`);
    
    // Remove caracteres de formatação (vírgulas, espaços, parênteses, etc.)
    let cleanValue = stringValue.replace(/[$,()\s]/g, '');
    console.log(`🔍 parseNumericValue cleanValue: "${cleanValue}"`);
    
    // Se estava entre parênteses, é negativo
    if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
      cleanValue = '-' + cleanValue;
      console.log(`🔍 parseNumericValue: valor negativo detectado: "${cleanValue}"`);
    }
    
    const parsed = parseFloat(cleanValue);
    console.log(`🔍 parseNumericValue parsed: ${parsed}, isNaN: ${isNaN(parsed)}`);
    
    const result = isNaN(parsed) ? defaultValue : parsed;
    console.log(`🔍 parseNumericValue final result: ${result}`);
    return result;
  } catch (error) {
    console.error(`❌ Erro ao fazer parse do valor: ${value}`, error);
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

// Deletar tabelas em paralelo
async function deleteAllTables() {
  try {
    console.log('Deletando dados existentes em paralelo...');
    const deletePromises = [
      supabase.from('timesheet_analysis').delete().not('id', 'is', null),
      supabase.from('permit_control').delete().not('id', 'is', null),
      supabase.from('receivables_accounting').delete().not('id', 'is', null),
      supabase.from('payables_accounting').delete().not('id', 'is', null),
      supabase.from('takeoff_works').delete().not('id', 'is', null),
      supabase.from('takeoff_works_responsibles').delete().not('id', 'is', null),
      supabase.from('service_requests').delete().not('id', 'is', null)
    ];
    const results = await Promise.all(deletePromises);
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
    console.log('=== INICIANDO SINCRONIZAÇÃO OTIMIZADA COM UTF-8 ===');
    
    // 1. Deletar dados existentes
    const deleteResult = await deleteAllTables();
    
    // 2. Buscar novos dados em paralelo
    console.log('Buscando dados em paralelo...');
    const [timesheetData, permitData, receivablesData, payablesData, takeoffWorksData, takeoffWorksResponsiblesData, serviceRequestsData] = await Promise.all([
      fetchCsvToJson(urls.timesheet, 'Timesheet'),
      fetchCsvToJson(urls.permit, 'Permit'),
      fetchCsvToJson(urls.receivables, 'Receivables'),
      fetchCsvToJson(urls.payables, 'Payables'),
      fetchCsvToJson(urls.takeoff_works, 'Takeoff_Works'),
      fetchCsvToJson(urls.takeoff_works_responsibles, 'Takeoff_Works_Responsibles'),
      fetchCsvToJson(urls.service_requests, 'Service_Requests')
    ]);
    
    // 3. Mapear dados em paralelo com normalização UTF-8
    const [mappedTimesheet, mappedPermit, mappedReceivables, mappedPayables, mappedTakeoffWorks, mappedTakeoffWorksResponsibles, mappedServiceRequests] = await Promise.all([
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
        
        console.log(`🔍 Payables - Total Amount raw: ${totalAmountRaw}, Open balance raw: ${openBalanceRaw}`);
        
        const result = {
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
        
        console.log(`📊 Payables processado:`, result);
        return result;
      })),
      // Mapeamento para takeoff_works (NÃO enviar id nem created_at)
      Promise.resolve(takeoffWorksData.map((row) => {
        const obj = {
          project: getField(row, "Project"),
          data_solicitacao: getField(row, "Data_Solicitacao") ? new Date(getField(row, "Data_Solicitacao")) : null,
          data_inicio: getField(row, "Data_Inicio") ? new Date(getField(row, "Data_Inicio")) : null,
          data_estimada_entrega: getField(row, "Data_Estimada_Entrega") ? new Date(getField(row, "Data_Estimada_Entrega")) : null,
          entrega_real: getField(row, "Entrega Real") ? new Date(getField(row, "Entrega Real")) : null,
          description: getField(row, "Description"),
          doc_links: getField(row, "Doc_Links"),
          modelo_da_casa: getField(row, "Modelo da Casa"),
          opcionais_da_casa: getField(row, "Opcionais da Casa"),
          arquivo_dwg: getField(row, "Arquivo DWG"),
          plano_estrutural: getField(row, "Plano Estrutural"),
          adequacao_dwg: getField(row, "Adequacao do DWG"),
          importacao_dwg_mitek: getField(row, "Importacao DWG para Mitek"),
          execucao_3d_mitek: getField(row, "Execucao do 3D no Mitek"),
          lista_materiais_excel: getField(row, "Lista de Materiais em Excel"),
          dividir_3d_paineis: getField(row, "Dividir projeto 3D em Paineis"),
          validacao_projeto_takeoff: getField(row, "Validacao do Projeto 3D e Take Off")
        };
        Object.keys(obj).forEach(k => (obj[k] === undefined ? delete obj[k] : null));
        return obj;
      })),
             // Mapeamento para takeoff_works_responsibles (NÃO enviar id nem created_at)
       Promise.resolve(
         takeoffWorksResponsiblesData
           .map((row) => {
             const obj = {
               step: getField(row, "Item") || 'N/A',
               responsible: getField(row, "Responsavel") || 'N/A'
             };
             Object.keys(obj).forEach(k => (obj[k] === undefined ? delete obj[k] : null));
             return obj;
           })
           .filter(obj => obj.step && String(obj.step).trim() !== "")
       ),
       // Mapeamento para service_requests
       Promise.resolve(serviceRequestsData.map((row) => ({
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
         cost: parseNumericValue(getField(row, "COST"), 0),
         tech: getField(row, "TECH")
       })))
     ]);
    
    console.log('Dados mapeados com sucesso e normalizados UTF-8');
    
    // 4. Inserir novos dados em paralelo
    console.log('Inserindo dados em paralelo...');
    const upserts = [];
    if (Array.isArray(mappedTimesheet) && mappedTimesheet.length > 0) upserts.push(upsertTableBatch("timesheet_analysis", mappedTimesheet, "Timesheet"));
    if (Array.isArray(mappedPermit) && mappedPermit.length > 0) upserts.push(upsertTableBatch("permit_control", mappedPermit, "Permit"));
    if (Array.isArray(mappedReceivables) && mappedReceivables.length > 0) upserts.push(upsertTableBatch("receivables_accounting", mappedReceivables, "Receivables"));
    if (Array.isArray(mappedPayables) && mappedPayables.length > 0) upserts.push(upsertTableBatch("payables_accounting", mappedPayables, "Payables"));
    if (Array.isArray(mappedTakeoffWorks) && mappedTakeoffWorks.length > 0) upserts.push(upsertTableBatch("takeoff_works", mappedTakeoffWorks, "Takeoff_Works"));
    if (Array.isArray(mappedTakeoffWorksResponsibles) && mappedTakeoffWorksResponsibles.length > 0) upserts.push(upsertTableBatch("takeoff_works_responsibles", mappedTakeoffWorksResponsibles, "Takeoff_Works_Responsibles"));
    if (Array.isArray(mappedServiceRequests) && mappedServiceRequests.length > 0) upserts.push(upsertTableBatch("service_requests", mappedServiceRequests, "Service_Requests"));
    if (upserts.length > 0) {
      await Promise.all(upserts);
    }
    
    console.log('=== SINCRONIZAÇÃO OTIMIZADA COM UTF-8 CONCLUÍDA COM SUCESSO ===');
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização otimizada com UTF-8 concluída com sucesso!",
      deleteResult: deleteResult,
      inserted: {
        timesheet: Array.isArray(mappedTimesheet) ? mappedTimesheet.length : 0,
        permit: Array.isArray(mappedPermit) ? mappedPermit.length : 0,
        receivables: Array.isArray(mappedReceivables) ? mappedReceivables.length : 0,
        payables: Array.isArray(mappedPayables) ? mappedPayables.length : 0,
        takeoff_works: Array.isArray(mappedTakeoffWorks) ? mappedTakeoffWorks.length : 0,
        takeoff_works_responsibles: Array.isArray(mappedTakeoffWorksResponsibles) ? mappedTakeoffWorksResponsibles.length : 0,
        service_requests: Array.isArray(mappedServiceRequests) ? mappedServiceRequests.length : 0
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