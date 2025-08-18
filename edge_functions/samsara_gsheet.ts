import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// URLs das planilhas do Samsara
const samsaraIdleEventsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=0";
const samsaraTripsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=2085020611";

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

// Função para parse de data do Samsara (formato: "Apr 2 2024 5:29AM EDT")
function parseSamsaraDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  try {
    // Remove o fuso horário (EDT, EST, etc.) para evitar problemas
    const cleanDateStr = dateStr.replace(/\s+(EDT|EST|CST|MST|PST|UTC|GMT)$/i, '');
    
    // Parse manual da data para melhor compatibilidade
    // Formato esperado: "Apr 2 2024 5:29AM"
    const dateMatch = cleanDateStr.match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)$/i);
    
    if (dateMatch) {
      const [, month, day, year, hour, minute, ampm] = dateMatch;
      
      // Mapear abreviações de mês para números
      const monthMap: { [key: string]: number } = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      
      const monthNum = monthMap[month.toLowerCase()];
      if (monthNum === undefined) {
        throw new Error(`Mês inválido: ${month}`);
      }
      
      let hourNum = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hourNum !== 12) {
        hourNum += 12;
      } else if (ampm.toUpperCase() === 'AM' && hourNum === 12) {
        hourNum = 0;
      }
      
      const date = new Date(
        parseInt(year),
        monthNum,
        parseInt(day),
        hourNum,
        parseInt(minute)
      );
      
      if (isNaN(date.getTime())) {
        throw new Error('Data inválida após parse manual');
      }
      
      return date;
    }
    
    // Fallback: tentar com o construtor Date original
    const date = new Date(cleanDateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Data inválida - formato não reconhecido');
    }
    
    return date;
  } catch (error) {
    console.error(`Erro ao fazer parse da data Samsara: ${dateStr}`, error);
    return null;
  }
}

// Função para parse de duração no formato hh:mm:ss
function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;
  
  try {
    const parts = durationStr.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return hours + (minutes / 60) + (seconds / 3600);
    }
    return 0;
  } catch (error) {
    console.error(`Erro ao fazer parse da duração: ${durationStr}`, error);
    return 0;
  }
}

// Função para capitalizar apenas as primeiras letras de cada palavra
function capitalizeWords(str: string): string {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Função para normalizar nomes (corrigir apelidos)
function normalizeName(name: string): string {
  if (!name) return '';
  
  // Capitalizar palavras
  let normalizedName = capitalizeWords(name);
  
  // Correções hardcoded para apelidos
  if (normalizedName.toLowerCase() === 'norim') {
    return 'Jose Honorio';
  }
  
  return normalizedName;
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

// Função para parse de valores numéricos
function parseNumericValue(value: any, defaultValue = 0): number {
  if (!value || value === '') {
    return defaultValue;
  }
  
  try {
    const stringValue = String(value).trim();
    const parsed = parseFloat(stringValue);
    return isNaN(parsed) ? defaultValue : parsed;
  } catch (error) {
    console.error(`Erro ao fazer parse do valor: ${value}`, error);
    return defaultValue;
  }
}

// Função auxiliar para contar registros na tabela
async function getTotalRecords(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('samsara_events')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Erro ao contar registros:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error('Erro ao contar registros:', error);
    return 0;
  }
}

// Buscar o último evento processado na tabela
async function getLastProcessedEvent(): Promise<{ event_date: Date | null, event_key: string | null }> {
  try {
    // Primeiro, vamos ver quantos registros existem na tabela
    const totalRecords = await getTotalRecords();
    console.log(`Total de registros na tabela: ${totalRecords}`);
    
    if (totalRecords === 0) {
      console.log('Tabela vazia, começando do zero');
      return { event_date: null, event_key: null };
    }
    
    // Buscar o último evento processado
    const { data, error } = await supabase
      .from('samsara_events')
      .select('event_date, event_key')
      .order('event_date', { ascending: false })
      .limit(1);
    
    if (error) {
      throw error;
    }
    
    if (data && data.length > 0) {
      console.log('Último evento encontrado:', data[0]);
      return {
        event_date: new Date(data[0].event_date),
        event_key: data[0].event_key
      };
    }
    
    return { event_date: null, event_key: null };
  } catch (error) {
    console.error('Erro ao buscar último evento processado:', error);
    return { event_date: null, event_key: null };
  }
}

// Verificar se evento já existe na tabela
async function checkEventExists(eventKey: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('samsara_events')
      .select('event_key')
      .eq('event_key', eventKey)
      .limit(1);
    
    if (error) {
      throw error;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Erro ao verificar se evento existe:', error);
    throw error;
  }
}

// Inserir dados em lotes para melhor performance
async function insertTableBatch(table: string, data: any[], name: string, batchSize = 50) {
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
      
      // Pequena pausa entre inserções para evitar sobrecarga
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
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
    // 1. Inicializar contadores
    let insertedCount = 0;
    let skippedCount = 0;
    
    // 2. Buscar dados do Samsara - Idle Events
    const idleEventsData = await fetchCsvToJson(samsaraIdleEventsUrl, 'Samsara_Idle_Events');
    
    // 3. Buscar dados do Samsara - Trips
    const tripsData = await fetchCsvToJson(samsaraTripsUrl, 'Samsara_Trips');
    
         // 4. Mapear Idle Events
     const mappedIdleEvents = idleEventsData.map((row) => {
       const startTime = getField(row, "Idle Event Start Time");
       const assetName = getField(row, "Asset: Name");
       
       return {
         event_date: parseSamsaraDate(startTime),
         nome: normalizeName(assetName),
         local: getField(row, "Address"),
         distancia: 0, // Idle events não têm distância
         units: parseNumericValue(getField(row, "Fuel Consumed (gal)"), 0),
         type: 'idle',
         // PK composta para identificar unicamente o evento
         event_key: `${startTime}_${assetName}`,
         // Campos adicionais para referência
         idle_duration: parseDuration(getField(row, "Idle Event Duration (hh:mm:ss)")),
         raw_start_time: startTime,
         raw_asset_name: assetName
       };
     });
    
         // 5. Mapear Trips
     const mappedTrips = tripsData.map((row) => {
       const startTime = getField(row, "Start Time");
       const assetName = getField(row, "Asset: Name");
       
       return {
         event_date: parseSamsaraDate(startTime),
         nome: normalizeName(assetName),
         local: getField(row, "Starting GPS Address"),
         distancia: parseNumericValue(getField(row, "Distance (mi)"), 0),
         units: parseNumericValue(getField(row, "Fuel Used (gal)"), 0),
         type: 'trip',
         // PK composta para identificar unicamente o evento
         event_key: `${startTime}_${assetName}`,
         // Campos adicionais para referência
         raw_start_time: startTime,
         raw_asset_name: assetName
       };
     });
    
    // 6. Combinar todos os eventos
    const allEvents = [...mappedIdleEvents, ...mappedTrips];
    
         // 7. Buscar último evento processado para continuar de onde parou
     const lastProcessedEvent = await getLastProcessedEvent();
     console.log('Último evento processado:', lastProcessedEvent);
     
           // 8. Estratégia inteligente para dados históricos vs. novos
      let eventsToProcess = allEvents;
      if (lastProcessedEvent.event_date) {
        console.log('Último evento processado encontrado, aplicando estratégia inteligente...');
        console.log('Data do último evento processado:', lastProcessedEvent.event_date);
        
        // Estratégia: se temos poucos registros (menos de 10.000), provavelmente
        // ainda estamos processando dados históricos, então processar tudo
        // Se temos muitos registros, processar apenas eventos novos
        const totalRecords = await getTotalRecords();
        
        if (totalRecords < 10000) {
          console.log(`Apenas ${totalRecords} registros na tabela - ainda processando dados históricos`);
          console.log('Processando TODOS os eventos para completar ingestão histórica');
          eventsToProcess = allEvents;
        } else {
          console.log(`${totalRecords} registros na tabela - dados históricos já processados`);
          console.log('Processando TODOS os eventos para verificar quais não existem ainda');
          
          // Processar TODOS os eventos, mas verificar existência individualmente
          // Isso garante que eventos perdidos ou com problemas sejam capturados
          eventsToProcess = allEvents.filter(event => {
            if (!event.event_date) {
              console.log('Evento sem data:', event);
              return false;
            }
            
            // Não filtrar por data - processar todos e verificar existência
            return true;
          });
          
          console.log(`Processando ${eventsToProcess.length} eventos para verificar existência`);
        }
        
        console.log(`Total de eventos originais: ${allEvents.length}`);
        console.log(`Eventos para processar: ${eventsToProcess.length}`);
        
        if (totalRecords >= 10000) {
          console.log('🔍 ESTRATÉGIA: Processando TODOS os eventos para capturar os perdidos');
          console.log('📊 Objetivo: Encontrar os eventos que não foram inseridos na migração histórica');
        }
        
        // Debug: mostrar alguns exemplos
        if (eventsToProcess.length > 0) {
          console.log('Exemplo de evento para processar:', eventsToProcess[0]);
        }
      } else {
        console.log('Nenhum evento anterior encontrado, processando todos os eventos históricos');
      }
     
     // 9. Inserir apenas eventos que não existem (otimizado para grandes volumes)
     if (Array.isArray(eventsToProcess) && eventsToProcess.length > 0) {
       console.log(`Processando ${eventsToProcess.length} eventos em lotes...`);
       
       // Processar em lotes menores para evitar timeout
       const batchSize = 100;
       const totalBatches = Math.ceil(eventsToProcess.length / batchSize);
       
       for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
         const startIndex = batchIndex * batchSize;
         const endIndex = Math.min(startIndex + batchSize, eventsToProcess.length);
         const currentBatch = eventsToProcess.slice(startIndex, endIndex);
         
         console.log(`Processando lote ${batchIndex + 1}/${totalBatches} (${currentBatch.length} eventos)`);
         
         const eventsToInsert = [];
         
         // Verificar existência em paralelo para melhor performance
         const existenceChecks = await Promise.all(
           currentBatch.map(async (event) => {
             try {
               const exists = await checkEventExists(event.event_key);
               return { event, exists };
             } catch (error) {
               console.warn(`Erro ao verificar evento ${event.event_key}:`, error);
               return { event, exists: false }; // Em caso de erro, tenta inserir
             }
           })
         );
         
         for (const { event, exists } of existenceChecks) {
           if (!exists) {
             eventsToInsert.push(event);
             insertedCount++;
           } else {
             skippedCount++;
           }
         }
         
         // Inserir lote atual se houver dados
         if (eventsToInsert.length > 0) {
           await insertTableBatch("samsara_events", eventsToInsert, "Samsara_Events");
           console.log(`Lote ${batchIndex + 1} inserido: ${eventsToInsert.length} eventos`);
         } else {
           console.log(`Lote ${batchIndex + 1}: todos os eventos já existem`);
         }
         
         // Pequena pausa entre lotes para evitar sobrecarga
         if (batchIndex < totalBatches - 1) {
           await new Promise(resolve => setTimeout(resolve, 100));
         }
       }
     } else {
       console.log('Nenhum evento novo para processar');
     }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização do Samsara concluída com sucesso!",
      summary: {
        total_events: Array.isArray(allEvents) ? allEvents.length : 0,
        idle_events: mappedIdleEvents.length,
        trips: mappedTrips.length,
        inserted: insertedCount,
        skipped: skippedCount
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('Erro na edge function Samsara:', error.message);
    
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
