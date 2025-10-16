import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// URLs das planilhas do Workforce
const workforceProjectsUrl = "https://docs.google.com/spreadsheets/d/188IqXMBS6UaVzG-FWRI9REVCFsqLV_tOkv0F3PxX83I/export?format=csv&gid=0";
const workforceGroupsUrl = "https://docs.google.com/spreadsheets/d/188IqXMBS6UaVzG-FWRI9REVCFsqLV_tOkv0F3PxX83I/export?format=csv&gid=1987603557";

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

// Função para processar dados de projetos
async function processProjectsData(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    // Normalizar strings
    const cliente = normalizeUtf8String(row['Cliente (GC)']);
    const jobSite = normalizeUtf8String(row['Job Site']);
    const type = normalizeUtf8String(row['Type']);
    const status = normalizeUtf8String(row['Status']);
    const address = normalizeUtf8String(row['Address']);
    const workforce = normalizeUtf8String(row['Workforce']);
    const hvac = normalizeUtf8String(row['HVAC']);
    const observacoes = normalizeUtf8String(row['Obs']);
    
    // Converter lote/building para número (permitir vazio)
    const loteBuilding = row['Lote / Bld'] ? parseInt(row['Lote / Bld']) || 0 : 0;
    
    // Converter datas (permitir vazio)
    const previousStartDate = row['Previous Start Date'] && row['Previous Start Date'].trim() ? 
      new Date(row['Previous Start Date']).toISOString().split('T')[0] : null;
    const previousEndDate = row['Previous End Date'] && row['Previous End Date'].trim() ? 
      new Date(row['Previous End Date']).toISOString().split('T')[0] : null;
    
    return {
      cliente,
      job_site: jobSite,
      type: type || null,
      lote_building: loteBuilding,
      workforce,
      hvac: hvac || null,
      status: status || null,
      address: address || null,
      previous_start_date: previousStartDate,
      previous_end_date: previousEndDate,
      observacoes: observacoes || null,
      updated_at: new Date().toISOString()
    };
  }).filter(row => row.cliente && row.job_site); // Filtrar apenas linhas com dados essenciais
  
  return processedData;
}

// Função para processar dados de grupos
async function processGroupsData(csvData: any[]) {
  const processedData = csvData.map((row: any) => {
    // Normalizar strings
    const grupo = normalizeUtf8String(row['Group']);
    const categoria = normalizeUtf8String(row['Category']);
    const especialidade = normalizeUtf8String(row['Especialidade']);
    const contato = normalizeUtf8String(row['Contato']);
    const observacoes = normalizeUtf8String(row['Obs']);
    
    // Converter capacidade para número (permitir vazio)
    const capacidade = row['Capacidade'] ? parseInt(row['Capacidade']) || 0 : 0;
    
    return {
      grupo,
      categoria,
      especialidade,
      capacidade,
      contato,
      observacoes: observacoes || null,
      updated_at: new Date().toISOString()
    };
  }).filter(row => row.grupo && row.categoria); // Filtrar apenas linhas com dados essenciais
  
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
    console.log('Iniciando sincronização do Workforce...');
    
    const results = {
      projects: { success: false, count: 0, error: null },
      groups: { success: false, count: 0, error: null }
    };
    
    // Limpar tabelas existentes antes de inserir novos dados
    console.log('🧹 Limpando tabelas existentes...');
    
    // Limpar tabela workforce_projects
    const { error: deleteProjectsError } = await supabase
      .from('workforce_projects')
      .delete()
      .not('id', 'is', null);
    
    if (deleteProjectsError) {
      throw new Error(`Erro ao limpar tabela workforce_projects: ${deleteProjectsError.message}`);
    }
    console.log('✅ Tabela workforce_projects limpa com sucesso');
    
    // Limpar tabela workforce_groups
    const { error: deleteGroupsError } = await supabase
      .from('workforce_groups')
      .delete()
      .not('id', 'is', null);
    
    if (deleteGroupsError) {
      throw new Error(`Erro ao limpar tabela workforce_groups: ${deleteGroupsError.message}`);
    }
    console.log('✅ Tabela workforce_groups limpa com sucesso');
    
    // Testar acesso às planilhas primeiro
    console.log('Testando acesso às planilhas...');
    console.log('URL Projetos:', workforceProjectsUrl);
    console.log('URL Grupos:', workforceGroupsUrl);
    
    const projectsAccessible = await testSheetAccess(workforceProjectsUrl, 'Workforce Projects');
    const groupsAccessible = await testSheetAccess(workforceGroupsUrl, 'Workforce Groups');
    
    // Processar projetos
    if (projectsAccessible) {
      try {
        console.log('Buscando dados de projetos...');
        const projectsCsvData = await fetchCsvToJson(workforceProjectsUrl, 'Workforce Projects');
      const processedProjects = await processProjectsData(projectsCsvData);
      
      if (processedProjects.length > 0) {
        console.log(`Inserindo ${processedProjects.length} projetos...`);
        const { error: projectsError } = await supabase
          .from('workforce_projects')
          .insert(processedProjects);
        
        if (projectsError) {
          throw new Error(`Erro ao inserir projetos: ${projectsError.message}`);
        }
        
        results.projects.success = true;
        results.projects.count = processedProjects.length;
        console.log(`✅ ${processedProjects.length} projetos sincronizados com sucesso`);
      } else {
        console.log('⚠️ Nenhum projeto válido encontrado');
      }
      } catch (error) {
        console.error('❌ Erro ao processar projetos:', error);
        results.projects.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento de projetos - planilha não acessível');
      results.projects.error = 'Planilha não acessível';
    }
    
    // Processar grupos
    if (groupsAccessible) {
      try {
        console.log('Buscando dados de grupos...');
        const groupsCsvData = await fetchCsvToJson(workforceGroupsUrl, 'Workforce Groups');
      const processedGroups = await processGroupsData(groupsCsvData);
      
      if (processedGroups.length > 0) {
        console.log(`Inserindo ${processedGroups.length} grupos...`);
        const { error: groupsError } = await supabase
          .from('workforce_groups')
          .insert(processedGroups);
        
        if (groupsError) {
          throw new Error(`Erro ao inserir grupos: ${groupsError.message}`);
        }
        
        results.groups.success = true;
        results.groups.count = processedGroups.length;
        console.log(`✅ ${processedGroups.length} grupos sincronizados com sucesso`);
      } else {
        console.log('⚠️ Nenhum grupo válido encontrado');
      }
      } catch (error) {
        console.error('❌ Erro ao processar grupos:', error);
        results.groups.error = error.message;
      }
    } else {
      console.log('⚠️ Pulando processamento de grupos - planilha não acessível');
      results.groups.error = 'Planilha não acessível';
    }
    
    const success = results.projects.success || results.groups.success;
    const totalCount = results.projects.count + results.groups.count;
    
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
