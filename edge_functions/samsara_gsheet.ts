import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// URLs das planilhas do Samsara e WEX
const samsaraIdleEventsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=0";
const samsaraTripsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=2085020611";
const wexTransactionsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=168001319";

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

// Função para parse de data do WEX (formato: "MM/DD/YYYY" ou "YYYY-MM-DD")
function parseWexDate(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  
  try {
    let date: Date;
    
    // Tentar formato MM/DD/YYYY
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        if (isNaN(month) || isNaN(day) || isNaN(year)) {
          return null;
        }
        
        date = new Date(year, month - 1, day);
      } else {
        return null;
      }
    } else {
      // Tentar formato ISO ou outro padrão
      date = new Date(dateStr);
    }
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Se houver hora, adicionar ao Date
    if (timeStr && timeStr.trim()) {
      try {
        const timeParts = timeStr.trim().split(':');
        if (timeParts.length >= 2) {
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1], 10);
          const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
          
          if (!isNaN(hours) && !isNaN(minutes)) {
            date.setHours(hours, minutes, seconds);
          }
        }
      } catch (error) {
        // Ignora erro de parse de hora
      }
    }
    
    return date;
  } catch (error) {
    console.error(`Erro ao fazer parse da data WEX: ${dateStr}`, error);
    return null;
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

// Buscar event_keys existentes em lote (mais eficiente)
async function getExistingEventKeys(eventKeys: string[]): Promise<Set<string>> {
  try {
    if (eventKeys.length === 0) return new Set();
    
    // Processar em lotes de 1000 para evitar query muito grande
    const batchSize = 1000;
    const existingKeys = new Set<string>();
    
    for (let i = 0; i < eventKeys.length; i += batchSize) {
      const batch = eventKeys.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('samsara_events')
        .select('event_key')
        .in('event_key', batch);
      
      if (error) {
        console.warn(`Erro ao buscar event_keys do lote ${i / batchSize + 1}:`, error);
        continue; // Continua com próximo lote
      }
      
      if (data) {
        data.forEach(row => {
          if (row.event_key) {
            existingKeys.add(row.event_key);
          }
        });
      }
    }
    
    return existingKeys;
  } catch (error) {
    console.error('Erro ao buscar event_keys existentes:', error);
    return new Set(); // Em caso de erro, retorna vazio (tenta inserir tudo)
  }
}

// Inserir dados em lotes usando UPSERT (ON CONFLICT DO NOTHING)
// Isso evita duplicatas automaticamente sem precisar verificar existência
// Suporta tanto samsara_events (event_key) quanto wex_transactions (transaction_key)
async function insertTableBatchUpsert(table: string, data: any[], name: string, batchSize = 1000) {
  try {
    if (data.length === 0) return;
    
    // Processar em lotes menores para evitar timeout
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        // Determinar a coluna de conflito baseada na tabela
        const conflictColumn = table === 'wex_transactions' ? 'transaction_key' : 'event_key';
        
        // Usar upsert com ignoreDuplicates para evitar duplicatas
        // O PostgreSQL vai ignorar automaticamente duplicatas baseado na constraint UNIQUE
        const { error, data } = await supabase
          .from(table)
          .upsert(batch, { 
            onConflict: conflictColumn,
            ignoreDuplicates: true
          });
        
        if (error) {
          // Se der erro de duplicata, ignorar (já existe)
          if (error.message?.includes('duplicate') || error.message?.includes('unique') || error.code === '23505') {
            console.log(`Lote ${i + 1}: alguns eventos já existem (ignorado)`);
          } else {
            // Para outros erros, tentar insert normal (pode gerar erro de duplicata, mas vamos continuar)
            console.warn(`Upsert falhou, tentando insert normal:`, error.message);
            const { error: insertError } = await supabase.from(table).insert(batch);
            if (insertError) {
              // Se der erro de duplicata, ignorar (já existe)
              if (insertError.message?.includes('duplicate') || insertError.message?.includes('unique') || insertError.code === '23505') {
                console.log(`Lote ${i + 1}: alguns eventos já existem (ignorado)`);
              } else {
                console.error(`Erro ao inserir lote ${i + 1}:`, insertError);
                // Continua com próximo lote mesmo se houver erro
              }
            }
          }
        }
      } catch (batchError: any) {
        // Se der erro de duplicata, apenas logar e continuar
        if (batchError?.message?.includes('duplicate') || batchError?.message?.includes('unique') || batchError?.code === '23505') {
          console.log(`Lote ${i + 1}: alguns eventos já existem (ignorado)`);
        } else {
          console.error(`Erro ao inserir lote ${i + 1} em ${name}:`, batchError);
          // Continua com próximo lote mesmo se houver erro
        }
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
    let wexInsertedCount = 0;
    let wexSkippedCount = 0;
    
    // 2. Buscar dados do Samsara - Idle Events
    const idleEventsData = await fetchCsvToJson(samsaraIdleEventsUrl, 'Samsara_Idle_Events');
    
    // 3. Buscar dados do Samsara - Trips
    const tripsData = await fetchCsvToJson(samsaraTripsUrl, 'Samsara_Trips');
    
    // 3b. Buscar dados do WEX - Transactions
    const wexTransactionsData = await fetchCsvToJson(wexTransactionsUrl, 'WEX_Transactions');
    
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
    
    // 6. Combinar todos os eventos do Samsara
    const allEvents = [...mappedIdleEvents, ...mappedTrips];
    
    // 6b. Mapear WEX Transactions
    const mappedWexTransactions = wexTransactionsData.map((row) => {
      const transactionDate = getField(row, "Transaction Date");
      const transactionTime = getField(row, "Transaction Time");
      const embossLine2 = getField(row, "Emboss Line 2");
      const units = getField(row, "Units");
      const grossCost = getField(row, "Gross Cost");
      const netCost = getField(row, "Net Cost");
      const merchantCity = getField(row, "Merchant City");
      
      // Criar chave única: Transaction Date + Transaction Time + Emboss Line 2 + Units
      const transactionKey = `${transactionDate}_${transactionTime}_${embossLine2}_${units}`;
      
      // Usar Net Cost se disponível, senão Gross Cost
      const valor = parseNumericValue(netCost || grossCost, 0);
      
      // Parse da data (combina Transaction Date e Transaction Time)
      const transactionDateObj = parseWexDate(transactionDate, transactionTime);
      
      return {
        transaction_key: transactionKey,
        transaction_date: transactionDateObj,
        nome: normalizeName(embossLine2),
        units: parseNumericValue(units, 0),
        valor: valor,
        local: merchantCity || null
      };
    });
    
    // Filtrar transações sem data válida
    const validWexTransactions = mappedWexTransactions.filter(tx => tx.transaction_date !== null);
    
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
     
     // 9. Estratégia otimizada: usar UPSERT para evitar verificação individual
     // Isso elimina a necessidade de verificar existência antes de inserir
     if (Array.isArray(eventsToProcess) && eventsToProcess.length > 0) {
       console.log(`Processando ${eventsToProcess.length} eventos usando UPSERT...`);
       
       // Filtrar eventos sem data válida
       const validEvents = eventsToProcess.filter(event => {
         if (!event.event_date) {
           console.log('Evento sem data ignorado:', event);
           skippedCount++;
           return false;
         }
         return true;
       });
       
       console.log(`Eventos válidos para processar: ${validEvents.length}`);
       
       // Usar UPSERT em lotes grandes - muito mais eficiente
       // O PostgreSQL vai ignorar duplicatas automaticamente
       const batchSize = 1000; // Lotes maiores são mais eficientes
       const totalBatches = Math.ceil(validEvents.length / batchSize);
       
       for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
         const startIndex = batchIndex * batchSize;
         const endIndex = Math.min(startIndex + batchSize, validEvents.length);
         const currentBatch = validEvents.slice(startIndex, endIndex);
         
         console.log(`Processando lote ${batchIndex + 1}/${totalBatches} (${currentBatch.length} eventos)`);
         
         try {
           // Preparar dados para inserção conforme schema da tabela
           // Nota: duration não está na tabela atual, então removemos esse campo
           const eventsToInsert = currentBatch.map(event => {
             return {
               event_date: event.event_date,
               nome: event.nome,
               local: event.local || null,
               distancia: event.distancia || 0,
               units: event.units || 0,
               type: event.type,
               event_key: event.event_key
             };
           });
           
           // Usar UPSERT - muito mais rápido que verificar existência
           await insertTableBatchUpsert("samsara_events", eventsToInsert, "Samsara_Events", batchSize);
           
           insertedCount += eventsToInsert.length;
           console.log(`Lote ${batchIndex + 1} processado: ${eventsToInsert.length} eventos`);
           
         } catch (error) {
           console.error(`Erro ao processar lote ${batchIndex + 1}:`, error);
           // Continua com próximo lote mesmo se houver erro
           skippedCount += currentBatch.length;
         }
         
         // Pequena pausa entre lotes para evitar sobrecarga
         if (batchIndex < totalBatches - 1) {
           await new Promise(resolve => setTimeout(resolve, 100));
         }
       }
     } else {
       console.log('Nenhum evento novo para processar');
     }
     
     // 10. Processar WEX Transactions usando UPSERT
     if (Array.isArray(validWexTransactions) && validWexTransactions.length > 0) {
       console.log(`Processando ${validWexTransactions.length} transações WEX usando UPSERT...`);
       
       const wexBatchSize = 1000;
       const wexTotalBatches = Math.ceil(validWexTransactions.length / wexBatchSize);
       
       for (let batchIndex = 0; batchIndex < wexTotalBatches; batchIndex++) {
         const startIndex = batchIndex * wexBatchSize;
         const endIndex = Math.min(startIndex + wexBatchSize, validWexTransactions.length);
         const currentBatch = validWexTransactions.slice(startIndex, endIndex);
         
         console.log(`Processando lote WEX ${batchIndex + 1}/${wexTotalBatches} (${currentBatch.length} transações)`);
         
         try {
           // Preparar dados para inserção
           const transactionsToInsert = currentBatch.map(tx => {
             // Converter Date para string no formato YYYY-MM-DD
             let transactionDateStr = null;
             if (tx.transaction_date) {
               const year = tx.transaction_date.getFullYear();
               const month = String(tx.transaction_date.getMonth() + 1).padStart(2, '0');
               const day = String(tx.transaction_date.getDate()).padStart(2, '0');
               transactionDateStr = `${year}-${month}-${day}`;
             }
             
             return {
               transaction_key: tx.transaction_key,
               transaction_date: transactionDateStr,
               nome: tx.nome,
               units: tx.units || 0,
               valor: tx.valor || 0,
               local: tx.local || null
             };
           });
           
           // Usar UPSERT para WEX Transactions
           await insertTableBatchUpsert("wex_transactions", transactionsToInsert, "WEX_Transactions", wexBatchSize);
           
           wexInsertedCount += transactionsToInsert.length;
           console.log(`Lote WEX ${batchIndex + 1} processado: ${transactionsToInsert.length} transações`);
           
         } catch (error) {
           console.error(`Erro ao processar lote WEX ${batchIndex + 1}:`, error);
           wexSkippedCount += currentBatch.length;
         }
         
         // Pequena pausa entre lotes
         if (batchIndex < wexTotalBatches - 1) {
           await new Promise(resolve => setTimeout(resolve, 50));
         }
       }
     } else {
       console.log('Nenhuma transação WEX válida para processar');
     }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização do Samsara e WEX concluída com sucesso!",
      summary: {
        samsara: {
          total_events: Array.isArray(allEvents) ? allEvents.length : 0,
          idle_events: mappedIdleEvents.length,
          trips: mappedTrips.length,
          inserted: insertedCount,
          skipped: skippedCount
        },
        wex: {
          total_transactions: Array.isArray(validWexTransactions) ? validWexTransactions.length : 0,
          inserted: wexInsertedCount,
          skipped: wexSkippedCount
        }
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
