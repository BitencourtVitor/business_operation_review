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
 */ function normalizeUtf8String(str) {
  if (!str) return '';
  try {
    // Decodifica entidades HTML comuns
    const decoded = str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&agrave;/g, 'à').replace(/&atilde;/g, 'ã').replace(/&acirc;/g, 'â').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê').replace(/&iacute;/g, 'í').replace(/&igrave;/g, 'ì').replace(/&ocirc;/g, 'ô').replace(/&otilde;/g, 'õ').replace(/&ograve;/g, 'ò').replace(/&uacute;/g, 'ú').replace(/&ugrave;/g, 'ù').replace(/&ccedil;/g, 'ç').replace(/&Aacute;/g, 'Á').replace(/&Agrave;/g, 'À').replace(/&Atilde;/g, 'Ã').replace(/&Acirc;/g, 'Â').replace(/&Eacute;/g, 'É').replace(/&Egrave;/g, 'È').replace(/&Ecirc;/g, 'Ê').replace(/&Iacute;/g, 'Í').replace(/&Igrave;/g, 'Ì').replace(/&Ocirc;/g, 'Ô').replace(/&Otilde;/g, 'Õ').replace(/&Ograve;/g, 'Ò').replace(/&Uacute;/g, 'Ú').replace(/&Ugrave;/g, 'Ù').replace(/&Ccedil;/g, 'Ç');
    // Normaliza espaços e remove caracteres problemáticos
    return decoded.replace(/\s+/g, ' ') // Normaliza espaços múltiplos
    .trim();
  } catch (error) {
    console.warn('Erro ao normalizar string UTF-8:', error);
    return str;
  }
}
// Função otimizada para buscar CSV com encoding UTF-8
async function fetchCsvToJson(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} for ${name}`);
    }
    const buffer = await res.arrayBuffer();
    // Tentar diferentes encodings para melhor compatibilidade UTF-8
    let csvText;
    try {
      // Primeiro tenta UTF-8
      csvText = new TextDecoder("utf-8").decode(buffer);
    } catch  {
      try {
        // Se falhar, tenta UTF-8 com BOM
        csvText = new TextDecoder("utf-8-sig").decode(buffer);
      } catch  {
        // Último recurso: latin1
        csvText = new TextDecoder("latin1").decode(buffer);
      }
    }
    return new Promise((resolve, reject)=>{
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results)=>{
          resolve(results.data);
        },
        error: (err)=>{
          reject(new Error(`Erro ao fazer parse do CSV ${name}: ${err.message}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`Erro ao buscar CSV ${name}: ${error.message}`);
  }
}
function parseDateUS(str) {
  if (!str) return null;
  try {
    // Remove espaços e caracteres extras
    const cleanStr = str.trim();
    
    // Verifica se a string está vazia após limpeza
    if (!cleanStr) return null;
    
    // Tenta diferentes formatos de data
    const date = new Date(cleanStr);
    
    // Verifica se a data é válida e está dentro de um range razoável
    if (isNaN(date.getTime())) {
      console.warn(`Data inválida: ${str}`);
      return null;
    }
    
    // Verifica se a data está dentro de um range válido (1900-2100)
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      console.warn(`Data fora do range válido (${year}): ${str}`);
      return null;
    }
    
    return date.toISOString().split('T')[0]; // Retorna apenas a parte da data (YYYY-MM-DD)
  } catch (error) {
    console.warn(`Erro ao fazer parse da data ${str}:`, error);
    return null;
  }
}
function parseNumericValue(value, defaultValue = 0) {
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
function getField(row, key) {
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
async function getOnlyChangedRecords(table, dataToCheck) {
  try {
    console.log(`🔍 Analisando ${dataToCheck.length} registros para mudanças...`);
    // Extrair IDs únicos da planilha
    const allIds = dataToCheck.map((row)=>row.intern_id).filter((id)=>id);
    const uniqueIds = Array.from(new Set(allIds));
    console.log(`📊 Encontrados ${uniqueIds.length} IDs únicos na planilha`);
    if (uniqueIds.length === 0) {
      console.log(`⚠️ Nenhum ID encontrado - processando tudo como novo`);
      return dataToCheck;
    }
    // Buscar apenas registros existentes em lotes
    const existingMap = new Map();
    const batchSize = 1000;
    for(let i = 0; i < uniqueIds.length; i += batchSize){
      const idBatch = uniqueIds.slice(i, i + batchSize);
      const { data, error } = await supabase.from(table).select('intern_id, last_update_datetimez').in('intern_id', idBatch);
      if (error) throw error;
      data?.forEach((row)=>{
        existingMap.set(row.intern_id, row.last_update_datetimez);
      });
    }
    console.log(`📋 Encontrados ${existingMap.size} registros existentes no banco`);
    // Filtrar APENAS registros que realmente mudaram
    const recordsToUpdate = [];
    let newRecords = 0;
    let modifiedRecords = 0;
    let unchangedRecords = 0;
    for (const row of dataToCheck){
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
    console.log(`✅ Filtro concluído:`);
    console.log(`   - Novos: ${newRecords}`);
    console.log(`   - Modificados: ${modifiedRecords}`);
    console.log(`   - Inalterados: ${unchangedRecords}`);
    console.log(`   - TOTAL para processar: ${recordsToUpdate.length}`);
    return recordsToUpdate;
  } catch (error) {
    console.error('❌ Erro ao buscar registros modificados:', error);
    throw error;
  }
}
async function upsertTableBatch(table, data, name, batchSize = 100) {
  try {
    if (data.length === 0) {
      console.log(`✅ Nenhum registro para processar em ${name}`);
      return 0;
    }
    console.log(`🚀 Iniciando upsert de ${data.length} registros para ${name} (batch: ${batchSize})`);
    
    // Deduplicar dados finais antes de criar lotes
    const finalData = [];
    const seenIds = new Map();
    
    for (const record of data) {
      if (record.intern_id) {
        seenIds.set(record.intern_id, record);
      } else {
        finalData.push(record);
      }
    }
    
    finalData.push(...Array.from(seenIds.values()));
    console.log(`🔄 Deduplicação final: ${data.length} → ${finalData.length} registros`);
    
    const batches = [];
    for(let i = 0; i < finalData.length; i += batchSize){
      batches.push(finalData.slice(i, i + batchSize));
    }
    let totalUpserted = 0;
    for(let i = 0; i < batches.length; i++){
      const batch = batches[i];
      // Timeout mais curto para cada lote
      const timeoutPromise = new Promise((_, reject)=>{
        setTimeout(()=>reject(new Error('Timeout')), 15000);
      });
      const upsertPromise = supabase.from(table).upsert(batch, {
        onConflict: 'intern_id',
        ignoreDuplicates: false
      });
      const { data: result, error } = await Promise.race([
        upsertPromise,
        timeoutPromise
      ]);
      if (error) {
        console.error(`❌ Erro no lote ${i + 1}/${batches.length}:`, error);
        throw error;
      }
      totalUpserted += batch.length;
      console.log(`✅ Lote ${i + 1}/${batches.length}: ${batch.length} registros (Total: ${totalUpserted})`);
      // Pausa entre lotes
      if (i < batches.length - 1) {
        await new Promise((resolve)=>setTimeout(resolve, 200));
      }
    }
    console.log(`🎉 Upsert concluído para ${name}: ${totalUpserted} registros`);
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
serve(async (req)=>{
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
    const receivablesData = await fetchCsvToJson(receivablesUrl, 'Receivables');
    // 2. Mapear dados com normalização UTF-8
    const mappedReceivables = receivablesData.map((row)=>{
      // Debug dos valores problemáticos
      const invAmountRaw = getField(row, "INV Amount");
      const openBalanceRaw = getField(row, "Open balance");
      const epoNumberRaw = getField(row, "EPO Number");
      return {
        intern_id: getField(row, "INTERN_ID"),
        last_update_datetimez: parseDateUS(getField(row, "LAST_UPDATE_DATETIMEZ")),
        inv_date: parseDateUS(getField(row, "Inv Date")),
        transaction_type: getField(row, "Transaction type"),
        inv_num: getField(row, "INV Num"),
        customer_full_name: getField(row, "Customer full name"),
        due_date: parseDateUS(getField(row, "Due date")),
        inv_amount: parseNumericValue(invAmountRaw, 0),
        open_balance: parseNumericValue(openBalanceRaw, 0),
        epo_number: epoNumberRaw && epoNumberRaw.toString().trim() !== '' ? epoNumberRaw.toString().trim() : null,
        category: getField(row, "Category"),
        aging_days: getField(row, "Aging days") ? parseInt(getField(row, "Aging days")) : null,
        aging_intervals: getField(row, "Aging Intervals"),
        date_field: parseDateUS(getField(row, "Date")),
        created_at: new Date()
      };
    });
    // 3. Fazer upsert dos dados
    if (Array.isArray(mappedReceivables) && mappedReceivables.length > 0) {
      // 3.0. Filtrar registros com dados válidos
      const validReceivables = mappedReceivables.filter(record => {
        // Verifica se pelo menos o intern_id existe
        if (!record.intern_id) return false;
        
        // Verifica se as datas são válidas (não são strings inválidas)
        const dateFields = ['last_update_datetimez', 'inv_date', 'due_date', 'date_field'];
        for (const field of dateFields) {
          if (record[field] && typeof record[field] === 'string' && record[field].includes('+045911')) {
            console.warn(`Registro com data inválida removido: ${record.intern_id} - ${field}: ${record[field]}`);
            return false;
          }
        }
        
        return true;
      });
      
      console.log(`📊 Registros válidos após filtro: ${validReceivables.length}/${mappedReceivables.length}`);
      
      // 3.0.5. Deduplicar registros por intern_id (manter o último)
      const deduplicatedReceivables = [];
      const seenIds = new Map();
      
      for (const record of validReceivables) {
        if (record.intern_id) {
          seenIds.set(record.intern_id, record);
        } else {
          // Registros sem ID são mantidos (serão novos)
          deduplicatedReceivables.push(record);
        }
      }
      
      // Adicionar registros únicos por ID
      deduplicatedReceivables.push(...Array.from(seenIds.values()));
      
      console.log(`🔄 Deduplicação: ${validReceivables.length} → ${deduplicatedReceivables.length} registros`);
      
      // 3.1. Buscar dados existentes do banco
      const filteredReceivables = await getOnlyChangedRecords("receivables_accounting", deduplicatedReceivables);
      // 3.2. Fazer upsert dos registros modificados/novos
      if (filteredReceivables.length > 0) {
        const upsertedCount = await upsertTableBatch("receivables_accounting", filteredReceivables, "Receivables");
        return new Response(JSON.stringify({
          success: true,
          message: "Sincronização de receivables concluída com sucesso!",
          upserted: {
            receivables: upsertedCount
          }
        }), {
          status: 200,
          headers: corsHeaders
        });
      } else {
        return new Response(JSON.stringify({
          success: true,
          message: "Nenhum dado de receivable encontrado para sincronizar.",
          upserted: {
            receivables: 0
          }
        }), {
          status: 200,
          headers: corsHeaders
        });
      }
    } else {
      return new Response(JSON.stringify({
        success: true,
        message: "Nenhum dado de receivable encontrado para sincronizar.",
        upserted: {
          receivables: 0
        }
      }), {
        status: 200,
        headers: corsHeaders
      });
    }
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