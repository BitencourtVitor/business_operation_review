import SamsaraClient from './samsaraClient.js';
import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

console.log('🚀 Sincronização Incremental Samsara');

// Configurar dotenv
dotenv.config();

async function syncIncremental() {
  console.log('🚀 ==========================================');
  console.log('🚀 SINCRONIZAÇÃO INCREMENTAL SAMSARA');
  console.log('🚀 ==========================================');
  console.log('📊 Objetivo: Capturar apenas dados NOVOS');
  console.log('🔑 Estratégia: Verificar último evento e inserir apenas novos');
  console.log('==========================================\n');

  const samsaraClient = new SamsaraClient();
  const supabaseClient = new SupabaseClient();

  try {
    // 1. Testar conexão
    console.log('🔌 Testando conexão com Supabase...');
    const connectionOk = await supabaseClient.testConnection();
    if (!connectionOk) {
      throw new Error('Falha na conexão com Supabase');
    }

    // 2. Verificar estado atual
    console.log('📊 Verificando estado atual da tabela...');
    const totalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros atuais: ${totalRecords}`);

    if (totalRecords === 0) {
      throw new Error('Tabela vazia! Execute primeiro a migração histórica');
    }

    // 3. Buscar último evento processado
    console.log('\n🔍 Buscando último evento processado...');
    const lastProcessedEvent = await supabaseClient.getLastProcessedEvent();
    console.log(`📅 Último evento: ${lastProcessedEvent.event_date}`);
    console.log(`🔑 Chave: ${lastProcessedEvent.event_key}`);

    // 4. Buscar dados do Samsara
    console.log('\n📥 Buscando dados do Samsara...');
    const { idleEventsData, tripsData } = await samsaraClient.fetchAllData();

    // 5. Mapear dados
    console.log('\n🔄 Mapeando e transformando dados...');
    const mappedIdleEvents = samsaraClient.mapIdleEvents(idleEventsData);
    const mappedTrips = samsaraClient.mapTrips(tripsData);

    // 6. Combinar todos os eventos
    const allEvents = [...mappedIdleEvents, ...mappedTrips];
    console.log(`📊 Total de eventos mapeados: ${allEvents.length}`);

    // 7. Filtrar eventos com data válida
    const validEvents = allEvents.filter(event => event.event_date !== null);
    console.log(`✅ Eventos com data válida: ${validEvents.length}`);

    // 8. REMOVER DUPLICATAS E FILTRAR APENAS NOVOS
    console.log('\n🔍 REMOVENDO DUPLICATAS E FILTRANDO NOVOS...');
    
    // Usar Map para manter apenas o último evento de cada chave
    const uniqueEventsMap = new Map();
    
    for (const event of validEvents) {
      const key = event.event_key;
      if (key) {
        // Se já existe, substitui (mantém o mais recente)
        uniqueEventsMap.set(key, event);
      }
    }
    
    const uniqueEvents = Array.from(uniqueEventsMap.values());
    const duplicatesRemoved = validEvents.length - uniqueEvents.length;
    
    console.log(`📊 Eventos originais: ${validEvents.length}`);
    console.log(`🔍 Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`✅ Eventos únicos: ${uniqueEvents.length}`);

    // 9. FILTRAR APENAS EVENTOS NOVOS (mais recentes que o último processado)
    console.log('\n🆕 FILTRANDO APENAS EVENTOS NOVOS...');
    
    const newEvents = uniqueEvents.filter(event => {
      if (!event.event_date || !lastProcessedEvent.event_date) return false;
      return event.event_date > lastProcessedEvent.event_date;
    });
    
    console.log(`📊 Eventos únicos: ${uniqueEvents.length}`);
    console.log(`🆕 Eventos NOVOS: ${newEvents.length}`);
    console.log(`⏭️  Eventos já processados: ${uniqueEvents.length - newEvents.length}`);

    if (newEvents.length === 0) {
      console.log('\n🎯 NENHUM EVENTO NOVO ENCONTRADO!');
      console.log('✅ Sincronização concluída - dados já estão atualizados');
      return;
    }

    // 10. INSERIR APENAS EVENTOS NOVOS
    console.log('\n🚀 INSERINDO APENAS EVENTOS NOVOS...');
    
    try {
      // Upsert direto com onConflict - SEM verificação individual
      await supabaseClient.upsertSamsaraEvents(newEvents);
      console.log(`✅ ${newEvents.length} eventos NOVOS inseridos com sucesso!`);
    } catch (error) {
      console.error(`❌ Erro ao inserir eventos novos:`, error.message);
      
      // Fallback: tentar em lotes menores
      console.log('🔄 Fallback: tentando inserir em lotes de 1000...');
      const fallbackBatchSize = 1000;
      for (let i = 0; i < newEvents.length; i += fallbackBatchSize) {
        const fallbackBatch = newEvents.slice(i, i + fallbackBatchSize);
        try {
          await supabaseClient.upsertSamsaraEvents(fallbackBatch);
          console.log(`✅ Fallback lote ${Math.floor(i/fallbackBatchSize) + 1} inserido`);
        } catch (fallbackError) {
          console.error(`❌ Erro no fallback lote:`, fallbackError.message);
        }
      }
    }

    // 11. Resultado final
    console.log('\n🎯 ==========================================');
    console.log('🎯 RESULTADO DA SINCRONIZAÇÃO INCREMENTAL');
    console.log('🎯 ==========================================');
    console.log(`📊 Total de eventos únicos: ${uniqueEvents.length}`);
    console.log(`🔍 Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`🆕 Eventos NOVOS inseridos: ${newEvents.length}`);
    console.log(`⏭️  Eventos já processados: ${uniqueEvents.length - newEvents.length}`);
    
    // 12. Verificar estado final da tabela
    const finalTotalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros na tabela: ${finalTotalRecords}`);
    console.log(`📈 Registros adicionados nesta sincronização: ${newEvents.length}`);
    
    console.log('\n🎉 SINCRONIZAÇÃO INCREMENTAL CONCLUÍDA COM SUCESSO!');
    console.log('==========================================\n');

  } catch (error) {
    console.error('💥 ERRO CRÍTICO:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar
console.log('🎯 Executando sincronização incremental...');
syncIncremental().then(() => {
  console.log('✅ Sincronização concluída');
}).catch(error => {
  console.error('❌ Erro na sincronização:', error);
  process.exit(1);
});

export default syncIncremental;
