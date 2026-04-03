import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const takeoffWorksUrl = "https://docs.google.com/spreadsheets/d/1ktRGvvjn-c_YGhXMUAfcTtdTFOtTwoP-1gZTCeheAgU/export?format=csv&gid=0";
const takeoffWorksResponsiblesUrl = "https://docs.google.com/spreadsheets/d/1ktRGvvjn-c_YGhXMUAfcTtdTFOtTwoP-1gZTCeheAgU/export?format=csv&gid=883077868";

function normalizeUtf8String(str) {
  if (!str) return '';
  try {
    const decoded = str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&agrave;/g, 'à').replace(/&atilde;/g, 'ã').replace(/&acirc;/g, 'â').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê').replace(/&iacute;/g, 'í').replace(/&igrave;/g, 'ì').replace(/&ocirc;/g, 'ô').replace(/&otilde;/g, 'õ').replace(/&ograve;/g, 'ò').replace(/&uacute;/g, 'ú').replace(/&ugrave;/g, 'ù').replace(/&ccedil;/g, 'ç').replace(/&Aacute;/g, 'Á').replace(/&Agrave;/g, 'À').replace(/&Atilde;/g, 'Ã').replace(/&Acirc;/g, 'Â').replace(/&Eacute;/g, 'É').replace(/&Egrave;/g, 'È').replace(/&Ecirc;/g, 'Ê').replace(/&Iacute;/g, 'Í').replace(/&Igrave;/g, 'Ì').replace(/&Ocirc;/g, 'Ô').replace(/&Otilde;/g, 'Õ').replace(/&Ograve;/g, 'Ò').replace(/&Uacute;/g, 'Ú').replace(/&Ugrave;/g, 'Ù').replace(/&Ccedil;/g, 'Ç');
    return decoded.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.warn('Erro ao normalizar string UTF-8:', error);
    return str;
  }
}

async function fetchCsvToJson(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} for ${name}`);
    }
    const buffer = await res.arrayBuffer();
    let csvText;
    try {
      csvText = new TextDecoder("utf-8").decode(buffer);
    } catch {
      try {
        csvText = new TextDecoder("utf-8-sig").decode(buffer);
      } catch {
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
          reject(err);
        }
      });
    });
  } catch (error) {
    console.error(`Erro ao buscar ${name}:`, error);
    throw error;
  }
}

function getField(row, key) {
  let value = null;
  if (row[key] !== undefined) value = row[key];
  else if (row[` ${key}`] !== undefined) value = row[` ${key}`];
  else if (row[`${key} `] !== undefined) value = row[`${key} `];
  else {
    const foundKey = Object.keys(row).find((k)=>k.replace(/\s/g, '') === key.replace(/\s/g, ''));
    if (foundKey) value = row[foundKey];
  }
  if (typeof value === 'string') {
    return normalizeUtf8String(value);
  }
  return value;
}

// ABORDAGEM SIMPLES: Deletar sem condições
async function clearTakeoffTables() {
  try {
    // Deletar tudo sem condições - mais simples e direto
    const { error: error1 } = await supabase
      .from('takeoff_works')
      .delete()
      .neq('project', 'NON_EXISTENT_VALUE'); // Deleta todos os registros
    
    const { error: error2 } = await supabase
      .from('takeoff_works_responsibles')
      .delete()
      .neq('step', 'NON_EXISTENT_VALUE'); // Deleta todos os registros
    
    if (error1) throw error1;
    if (error2) throw error2;
    
    return "Tabelas takeoff foram limpas com sucesso";
  } catch (error) {
    console.error('Erro em clearTakeoffTables:', error);
    throw error;
  }
}

async function insertTableBatch(table, data, name, batchSize = 1000) {
  try {
    const batches = [];
    for(let i = 0; i < data.length; i += batchSize){
      batches.push(data.slice(i, i + batchSize));
    }
    for(let i = 0; i < batches.length; i++){
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

serve(async (req)=>{
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
    // Ler o body da requisição para compatibilidade com o frontend
    const body = await req.json().catch(() => ({}));
    
    // 1. Limpar tabelas usando SQL direto
    const clearResult = await clearTakeoffTables();
    
    // 2. Buscar novos dados em paralelo
    const [takeoffWorksData, takeoffWorksResponsiblesData] = await Promise.all([
      fetchCsvToJson(takeoffWorksUrl, 'Takeoff_Works'),
      fetchCsvToJson(takeoffWorksResponsiblesUrl, 'Takeoff_Works_Responsibles')
    ]);
    
    // 3. Mapear dados
    const mappedTakeoffWorks = takeoffWorksData.map((row)=>{
      const obj = {
        project: getField(row, "Project"),
        data_solicitacao: getField(row, "Data_Solicitacao") && getField(row, "Data_Solicitacao").trim() !== '' ? new Date(getField(row, "Data_Solicitacao")) : null,
        data_inicio: getField(row, "Data_Inicio") && getField(row, "Data_Inicio").trim() !== '' ? new Date(getField(row, "Data_Inicio")) : null,
        data_estimada_entrega: getField(row, "Data_Estimada_Entrega") && getField(row, "Data_Estimada_Entrega").trim() !== '' ? new Date(getField(row, "Data_Estimada_Entrega")) : null,
        entrega_real: getField(row, "Entrega Real") && getField(row, "Entrega Real").trim() !== '' ? new Date(getField(row, "Entrega Real")) : null,
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
      Object.keys(obj).forEach((k)=>obj[k] === undefined ? delete obj[k] : null);
      return obj;
    });
    
    const mappedTakeoffWorksResponsibles = takeoffWorksResponsiblesData.map((row)=>{
      const obj = {
        step: getField(row, "Item") || 'N/A',
        responsible: getField(row, "Responsavel") || 'N/A'
      };
      Object.keys(obj).forEach((k)=>obj[k] === undefined ? delete obj[k] : null);
      return obj;
    }).filter((obj)=>obj.step && String(obj.step).trim() !== "");
    
    // 4. Inserir novos dados em paralelo
    const upserts = [];
    if (Array.isArray(mappedTakeoffWorks) && mappedTakeoffWorks.length > 0) {
      upserts.push(insertTableBatch("takeoff_works", mappedTakeoffWorks, "Takeoff_Works"));
    }
    if (Array.isArray(mappedTakeoffWorksResponsibles) && mappedTakeoffWorksResponsibles.length > 0) {
      upserts.push(insertTableBatch("takeoff_works_responsibles", mappedTakeoffWorksResponsibles, "Takeoff_Works_Responsibles"));
    }
    if (upserts.length > 0) {
      await Promise.all(upserts);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização de takeoff concluída com sucesso!",
      clearResult: clearResult,
      inserted: {
        takeoff_works: Array.isArray(mappedTakeoffWorks) ? mappedTakeoffWorks.length : 0,
        takeoff_works_responsibles: Array.isArray(mappedTakeoffWorksResponsibles) ? mappedTakeoffWorksResponsibles.length : 0
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Erro na edge function takeoff:', error.message);
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
