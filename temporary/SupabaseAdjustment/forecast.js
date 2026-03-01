import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// Base URL da planilha
const spreadsheetId = "188IqXMBS6UaVzG-FWRI9REVCFsqLV_tOkv0F3PxX83I";
const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=`;

// URLs das planilhas
const dataUrl = `${baseUrl}0`; // GID=0
const fieldwireUrl = `${baseUrl}187846874`; // GID=187846874
const machinesUrl = `${baseUrl}1720524266`; // GID=1720524266
const contractStepsUrl = `${baseUrl}1936634959`; // GID=1936634959

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

const YES_VALUES = ['yes', 'sim', 'true', '1', 'y'];
function parseYesNo(value: string | null | undefined): boolean | null {
  if (!value) return null;
  const normalized = normalizeUtf8String(value).toLowerCase();
  if (!normalized) return null;
  if (YES_VALUES.includes(normalized)) return true;
  if (['no', 'não', 'nao', 'false', '0', 'n'].includes(normalized)) return false;
  return null;
}

/**
 * Converte data no formato M/D/YYYY para Date ISO string
 */
function parseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  
  try {
    // Formato esperado: M/D/YYYY
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 0) {
        const date = new Date(year, month - 1, day);
        return date.toISOString().split('T')[0]; // Retorna YYYY-MM-DD
      }
    }
    
    // Tenta parse direto como fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    return null;
  } catch (error) {
    console.warn(`Erro ao parsear data: ${dateStr}`, error);
    return null;
  }
}

/**
 * Converte datetime no formato ISO (2025-12-11T15:34:34Z) para timestamp
 */
function parseDateTime(datetimeStr: string | null | undefined): string | null {
  if (!datetimeStr || !datetimeStr.trim()) return null;
  
  try {
    const date = new Date(datetimeStr.trim());
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return null;
  } catch (error) {
    console.warn(`Erro ao parsear datetime: ${datetimeStr}`, error);
    return null;
  }
}

// Função para testar se a planilha está acessível
async function testSheetAccess(url: string, name: string) {
  try {
    console.log(`Testando acesso à planilha ${name}...`);
    const response = await fetch(url, { method: 'HEAD' });
    console.log(`Status da planilha ${name}: ${response.status}`);
    
    if (!response.ok) {
      console.error(`❌ Planilha ${name} não acessível: ${response.status} ${response.statusText}`);
      return false;
    }
    
    console.log(`✅ Planilha ${name} acessível`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao testar acesso à planilha ${name}:`, error);
    return false;
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
          if (results.errors.length > 0) {
            console.warn(`Avisos no parsing de ${name}:`, results.errors);
          }
          resolve(results.data);
        },
        error: (error) => {
          reject(new Error(`Erro ao fazer parse do CSV ${name}: ${error.message}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`Erro ao buscar CSV ${name}: ${error.message}`);
  }
}

// Função para processar dados da planilha Data
async function processDataSheet(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    const id = normalizeUtf8String(row['ID']);
    if (!id) return null; // Pular linhas sem ID
    
    return {
      id,
      cliente: normalizeUtf8String(row['Cliente']) || '',
      job_site: normalizeUtf8String(row['Job Site']) || '',
      type: normalizeUtf8String(row['Type']) || null,
      lote_bld: normalizeUtf8String(row['Lote / Bld']) || null,
      status: normalizeUtf8String(row['Status']) || null,
      address: normalizeUtf8String(row['Address']) || null,
      workforce: normalizeUtf8String(row['Workforce']) || null,
      previous_beams_date: parseDate(row['Previous Beams Date']),
      previous_start_date: parseDate(row['Previous Start Date']),
      previous_end_date: parseDate(row['Previous End Date']),
      obs: normalizeUtf8String(row['Obs']) || null,
      hvac: parseYesNo(row['HVAC']),
      buildertrend: parseYesNo(row['Buildertrend']),
      machine_provider: normalizeUtf8String(row['MachineProvider']) || null,
      create_datetime: parseDateTime(row['Create DateTime']),
      lastupdate_datetimez: parseDateTime(row['LastUpdate DatetimeZ'])
    };
  }).filter(row => row !== null && row.id); // Filtrar apenas linhas válidas
  
  return processedData;
}

// Função para processar dados da planilha Fieldwire
async function processFieldwireSheet(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    const obraId = normalizeUtf8String(row['ID']);
    if (!obraId) return null; // Pular linhas sem ID da obra
    
    return {
      obra_id: obraId,
      category: normalizeUtf8String(row['Category']) || null,
      document: normalizeUtf8String(row['Document']) || null,
      status: parseYesNo(row['Status']),
      lastupdate_datetimez: parseDateTime(row['LastUpdate DatetimeZ'])
    };
  }).filter(row => row !== null && row.obra_id); // Filtrar apenas linhas válidas
  
  return processedData;
}

// Função para processar dados da planilha Machines
async function processMachinesSheet(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    const obraId = normalizeUtf8String(row['ID']);
    if (!obraId) return null; // Pular linhas sem ID da obra
    
    return {
      obra_id: obraId,
      category: normalizeUtf8String(row['Category']) || null,
      subcategory: normalizeUtf8String(row['Subcategory']) || null,
      equipment_category: normalizeUtf8String(row['Equipment Category']) || null,
      title: normalizeUtf8String(row['Title']) || null,
      status: parseYesNo(row['Status']) ? 'Scheduled' : null,
      unit: normalizeUtf8String(row['Unit']) || null,
      lastupdate_datetimez: parseDateTime(row['LastUpdate DatetimeZ'])
    };
  }).filter(row => row !== null && row.obra_id); // Filtrar apenas linhas válidas
  
  return processedData;
}

// Função para processar dados da planilha ContractSteps
async function processContractStepsSheet(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    const obraId = normalizeUtf8String(row['ID']);
    if (!obraId) return null; // Pular linhas sem ID da obra
    
    return {
      obra_id: obraId,
      step: normalizeUtf8String(row['Step']) || null,
      status: parseYesNo(row['Status']),
      lastupdate_datetimez: parseDateTime(row['LastUpdate DatetimeZ'])
    };
  }).filter(row => row !== null && row.obra_id); // Filtrar apenas linhas válidas
  
  return processedData;
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
    console.log('Iniciando sincronização do Forecast...');
    
    const results = {
      data: { success: false, count: 0, error: null },
      fieldwire: { success: false, count: 0, error: null },
      machines: { success: false, count: 0, error: null },
      contractSteps: { success: false, count: 0, error: null }
    };
    
    // Limpar tabelas existentes antes de inserir novos dados
    console.log('🧹 Limpando tabelas existentes...');
    
    // Limpar tabelas derivadas primeiro (devido às FKs)
    const tableNames = ['forecast_contract_steps', 'forecast_machines', 'forecast_fieldwire'];
    const deletePromises = [
      supabase.from('forecast_contract_steps').delete().not('id', 'is', null),
      supabase.from('forecast_machines').delete().not('id', 'is', null),
      supabase.from('forecast_fieldwire').delete().not('id', 'is', null)
    ];
    
    const deleteResults = await Promise.all(deletePromises);
    
    for (let i = 0; i < deleteResults.length; i++) {
      const { error } = deleteResults[i];
      if (error) {
        throw new Error(`Erro ao limpar tabela ${tableNames[i]}: ${error.message}`);
      }
      console.log(`✅ Tabela ${tableNames[i]} limpa com sucesso`);
    }
    
    // Limpar tabela principal por último
    const { error: deleteDataError } = await supabase
      .from('forecast_data')
      .delete()
      .not('id', 'is', null);
    
    if (deleteDataError) {
      throw new Error(`Erro ao limpar tabela forecast_data: ${deleteDataError.message}`);
    }
    console.log('✅ Tabela forecast_data limpa com sucesso');
    
    // Testar acesso às planilhas primeiro (assíncrono)
    console.log('Testando acesso às planilhas...');
    const accessTests = await Promise.all([
      testSheetAccess(dataUrl, 'Data'),
      testSheetAccess(fieldwireUrl, 'Fieldwire'),
      testSheetAccess(machinesUrl, 'Machines'),
      testSheetAccess(contractStepsUrl, 'ContractSteps')
    ]);
    
    const [dataAccessible, fieldwireAccessible, machinesAccessible, contractStepsAccessible] = accessTests;
    
    // Buscar dados das planilhas (assíncrono quando possível)
    const fetchPromises = [];
    if (dataAccessible) fetchPromises.push(fetchCsvToJson(dataUrl, 'Data').then(data => ({ type: 'data', data })));
    if (fieldwireAccessible) fetchPromises.push(fetchCsvToJson(fieldwireUrl, 'Fieldwire').then(data => ({ type: 'fieldwire', data })));
    if (machinesAccessible) fetchPromises.push(fetchCsvToJson(machinesUrl, 'Machines').then(data => ({ type: 'machines', data })));
    if (contractStepsAccessible) fetchPromises.push(fetchCsvToJson(contractStepsUrl, 'ContractSteps').then(data => ({ type: 'contractSteps', data })));
    
    const fetchedData = await Promise.all(fetchPromises);
    
    // Processar dados da planilha Data
    if (dataAccessible) {
      try {
        const dataItem = fetchedData.find(item => item.type === 'data');
        if (dataItem) {
          console.log('Processando dados da planilha Data...');
          const processedData = await processDataSheet(dataItem.data);
          
          if (processedData.length > 0) {
            console.log(`Inserindo ${processedData.length} registros na tabela forecast_data...`);
            const { error: dataError } = await supabase
              .from('forecast_data')
              .insert(processedData);
            
            if (dataError) {
              throw new Error(`Erro ao inserir dados: ${dataError.message}`);
            }
            
            results.data.success = true;
            results.data.count = processedData.length;
            console.log(`✅ ${processedData.length} registros da planilha Data sincronizados com sucesso`);
          } else {
            console.log('⚠️ Nenhum registro válido encontrado na planilha Data');
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar planilha Data:', error);
        results.data.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento da planilha Data - planilha não acessível');
      results.data.error = 'Planilha não acessível';
    }
    
    // Processar dados da planilha Fieldwire
    if (fieldwireAccessible) {
      try {
        const fieldwireItem = fetchedData.find(item => item.type === 'fieldwire');
        if (fieldwireItem) {
          console.log('Processando dados da planilha Fieldwire...');
          const processedFieldwire = await processFieldwireSheet(fieldwireItem.data);
          
          if (processedFieldwire.length > 0) {
            console.log(`Inserindo ${processedFieldwire.length} registros na tabela forecast_fieldwire...`);
            const { error: fieldwireError } = await supabase
              .from('forecast_fieldwire')
              .insert(processedFieldwire);
            
            if (fieldwireError) {
              throw new Error(`Erro ao inserir fieldwire: ${fieldwireError.message}`);
            }
            
            results.fieldwire.success = true;
            results.fieldwire.count = processedFieldwire.length;
            console.log(`✅ ${processedFieldwire.length} registros da planilha Fieldwire sincronizados com sucesso`);
          } else {
            console.log('⚠️ Nenhum registro válido encontrado na planilha Fieldwire');
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar planilha Fieldwire:', error);
        results.fieldwire.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento da planilha Fieldwire - planilha não acessível');
      results.fieldwire.error = 'Planilha não acessível';
    }
    
    // Processar dados da planilha Machines
    if (machinesAccessible) {
      try {
        const machinesItem = fetchedData.find(item => item.type === 'machines');
        if (machinesItem) {
          console.log('Processando dados da planilha Machines...');
          const processedMachines = await processMachinesSheet(machinesItem.data);
          
          if (processedMachines.length > 0) {
            console.log(`Inserindo ${processedMachines.length} registros na tabela forecast_machines...`);
            const { error: machinesError } = await supabase
              .from('forecast_machines')
              .insert(processedMachines);
            
            if (machinesError) {
              throw new Error(`Erro ao inserir machines: ${machinesError.message}`);
            }
            
            results.machines.success = true;
            results.machines.count = processedMachines.length;
            console.log(`✅ ${processedMachines.length} registros da planilha Machines sincronizados com sucesso`);
          } else {
            console.log('⚠️ Nenhum registro válido encontrado na planilha Machines');
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar planilha Machines:', error);
        results.machines.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento da planilha Machines - planilha não acessível');
      results.machines.error = 'Planilha não acessível';
    }
    
    // Processar dados da planilha ContractSteps
    if (contractStepsAccessible) {
      try {
        const contractStepsItem = fetchedData.find(item => item.type === 'contractSteps');
        if (contractStepsItem) {
          console.log('Processando dados da planilha ContractSteps...');
          const processedContractSteps = await processContractStepsSheet(contractStepsItem.data);
          
          if (processedContractSteps.length > 0) {
            console.log(`Inserindo ${processedContractSteps.length} registros na tabela forecast_contract_steps...`);
            const { error: contractStepsError } = await supabase
              .from('forecast_contract_steps')
              .insert(processedContractSteps);
            
            if (contractStepsError) {
              throw new Error(`Erro ao inserir contract steps: ${contractStepsError.message}`);
            }
            
            results.contractSteps.success = true;
            results.contractSteps.count = processedContractSteps.length;
            console.log(`✅ ${processedContractSteps.length} registros da planilha ContractSteps sincronizados com sucesso`);
          } else {
            console.log('⚠️ Nenhum registro válido encontrado na planilha ContractSteps');
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar planilha ContractSteps:', error);
        results.contractSteps.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento da planilha ContractSteps - planilha não acessível');
      results.contractSteps.error = 'Planilha não acessível';
    }
    
    const success = results.data.success || results.fieldwire.success || results.machines.success || results.contractSteps.success;
    const totalCount = results.data.count + results.fieldwire.count + results.machines.count + results.contractSteps.count;
    
    return new Response(
      JSON.stringify({
        success,
        message: `Sincronização concluída. ${totalCount} registros processados.`,
        results,
        timestamp: new Date().toISOString()
      }),
      { 
        status: success ? 200 : 500,
        headers: corsHeaders
      }
    );
    
  } catch (error) {
    console.error('❌ Erro geral na Edge Function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Erro interno do servidor",
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
});
