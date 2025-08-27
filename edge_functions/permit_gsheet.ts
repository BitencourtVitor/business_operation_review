import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const permitUrl = "https://docs.google.com/spreadsheets/d/1Em_Wyj8EiBeo56zGrShKEP9yFCMDVmkR-_EoiNXI3YA/export?format=csv&gid=1016235500";

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

// Deletar tabela permit
async function deletePermitTable() {
  try {
    // Primeiro verifica quantos registros existem
    const { count: beforeCount } = await supabase
      .from('permit_control')
      .select('*', { count: 'exact', head: true });
    
    // Deleta TODOS os registros usando uma condição que sempre será verdadeira
    const { error } = await supabase.from('permit_control').delete().not('id', 'is', null);
    
    if (error) {
      throw error;
    }
    
    // Verifica se realmente foi limpa
    const { count: afterCount } = await supabase
      .from('permit_control')
      .select('*', { count: 'exact', head: true });
    
    // Log da limpeza
    const cleanupSummary = {
      beforeCount,
      afterCount
    };
    
    return `Tabela permit_control foi limpa com sucesso. ${beforeCount} registros removidos.`;
  } catch (error) {
    console.error('Erro em deletePermitTable:', error);
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
    throw new Error(`Erro ao inserir lote de ${name}: ${error instanceof Error ? error.message : String(error)}`);
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
    // Iniciar sincronização
    const syncSummary = {
      startTime: new Date().toISOString(),
      status: 'iniciando'
    };

    // Limpar tabela existente
    const { error: deleteError } = await supabase
      .from('permit_control')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      throw new Error(`Erro ao limpar tabela: ${deleteError.message}`);
    }

    const deleteResult = { success: true, message: 'Tabela limpa com sucesso' };

    // Buscar dados da planilha
    const permitData = await fetchCsvToJson(permitUrl, 'Permit');
    const dataSummary = {
      totalRecords: Array.isArray(permitData) ? permitData.length : 0,
      isArray: Array.isArray(permitData)
    };

    // Mapear e normalizar dados
    const mappedPermit = (permitData as any[]).map((permit: any) => ({
      intern_id: permit.intern_id,
      permit_number: permit.permit_number,
      permit_type: permit.permit_type,
      status: permit.status,
      issue_date: permit.issue_date,
      expiry_date: permit.expiry_date,
      contractor: permit.contractor,
      project: permit.project,
      location: permit.location,
      description: permit.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Remover duplicatas baseado no intern_id
    const uniquePermits = mappedPermit.filter((permit: any, index: number, self: any[]) => 
      index === self.findIndex((p: any) => p.intern_id === permit.intern_id)
    );

    const mappingSummary = {
      mappedRecords: mappedPermit.length,
      uniqueRecords: uniquePermits.length,
      duplicatesRemoved: mappedPermit.length - uniquePermits.length
    };

    // Inserir novos dados
    if (uniquePermits.length > 0) {
      const { error: insertError } = await supabase
        .from('permit_control')
        .insert(uniquePermits);

      if (insertError) {
        throw new Error(`Erro ao inserir dados: ${insertError.message}`);
      }

      const insertResult = { success: true, message: 'Dados inseridos com sucesso' };
    } else {
      const insertResult = { success: true, message: 'Nenhum dado para inserir' };
    }

    return {
      success: true,
      message: 'Sincronização concluída com sucesso',
      summary: {
        ...syncSummary,
        ...dataSummary,
        ...mappingSummary,
        finalStatus: 'concluída'
      }
    };
    
  } catch (error) {
    console.error('Erro na edge function permit:', error.message);
    
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
