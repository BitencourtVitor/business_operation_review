import SamsaraClient from './samsaraClient.js';
import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

console.log('🚀 Script iniciado');

// Configurar dotenv
dotenv.config();
console.log('✅ dotenv configurado');
console.log('🔑 SUPABASE_URL:', process.env.SUPABASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA');

async function migrateHistorical() {
  console.log('🚀 ==========================================');
  console.log('🚀 MIGRAÇÃO HISTÓRICA DO SAMSARA');
  console.log('🚀 ==========================================');
  console.log('📅 Período: Jan 2024 - Jul 2025');
  console.log('📊 Objetivo: Migrar todos os dados históricos');
  console.log('==========================================\n');

  const samsaraClient = new SamsaraClient();
  const supabaseClient = new SupabaseClient();

  try {
    // 1. Testar conexão com Supabase
    console.log('🔌 Testando conexão com Supabase...');
    const connectionOk = await supabaseClient.testConnection();
    if (!connectionOk) {
      throw new Error('Falha na conexão com Supabase');
    }

    // 2. Verificar estado atual da tabela
    console.log('📊 Verificando estado atual da tabela...');
    const totalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros atuais: ${totalRecords}`);

    if (totalRecords > 0) {
      console.log('⚠️  ATENÇÃO: A tabela já contém dados!');
      console.log('❓ Deseja limpar a tabela e fazer migração completa? (s/N)');
      
      // Em produção, você pode querer confirmar isso
      // Por enquanto, vamos assumir que sim para migração inicial
      console.log('🔄 Prosseguindo com limpeza da tabela...');
      await supabaseClient.clearTable();
    }

    // 3. Buscar todos os dados do Samsara
    console.log('\n📥 Buscando dados do Samsara...');
    const { idleEventsData, tripsData } = await samsaraClient.fetchAllData();

    // 4. Criar backups dos dados brutos
    console.log('\n💾 Criando backups dos dados brutos...');
    await samsaraClient.createBackup(idleEventsData, 'idle_events_raw');
    await samsaraClient.createBackup(tripsData, 'trips_raw');

    // 5. Mapear e transformar dados
    console.log('\n🔄 Mapeando e transformando dados...');
    const mappedIdleEvents = samsaraClient.mapIdleEvents(idleEventsData);
    const mappedTrips = samsaraClient.mapTrips(tripsData);

    // 6. Combinar todos os eventos
    const allEvents = [...mappedIdleEvents, ...mappedTrips];
    console.log(`📊 Total de eventos mapeados: ${allEvents.length}`);
    console.log(`   - Idle Events: ${mappedIdleEvents.length}`);
    console.log(`   - Trips: ${mappedTrips.length}`);

    // 7. Filtrar eventos com data válida
    const validEvents = allEvents.filter(event => event.event_date !== null);
    const invalidEvents = allEvents.filter(event => event.event_date === null);
    
    console.log(`✅ Eventos com data válida: ${validEvents.length}`);
    if (invalidEvents.length > 0) {
      console.log(`⚠️  Eventos sem data válida: ${invalidEvents.length}`);
      console.log('   Exemplo de evento inválido:', invalidEvents[0]);
    }

    // 8. Processar em lotes para melhor performance
    const batchSize = 1000;
    const totalBatches = Math.ceil(validEvents.length / batchSize);
    
    console.log(`\n🔄 Processando ${validEvents.length} eventos em ${totalBatches} lotes...`);
    
    let totalInserted = 0;
    let totalErrors = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, validEvents.length);
      const currentBatch = validEvents.slice(startIndex, endIndex);
      
      console.log(`\n📦 Processando lote ${batchIndex + 1}/${totalBatches} (${currentBatch.length} eventos)`);
      
      try {
        await supabaseClient.upsertSamsaraEvents(currentBatch);
        totalInserted += currentBatch.length;
        
        console.log(`✅ Lote ${batchIndex + 1} processado com sucesso`);
        console.log(`📊 Progresso: ${totalInserted}/${validEvents.length} (${Math.round((totalInserted/validEvents.length)*100)}%)`);
        
        // Pequena pausa entre lotes para não sobrecarregar o banco
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Erro no lote ${batchIndex + 1}:`, error);
        totalErrors++;
        
        // Em caso de erro, tentar processar o lote em partes menores
        console.log('🔄 Tentando processar lote em partes menores...');
        const subBatchSize = 100;
        const subBatches = Math.ceil(currentBatch.length / subBatchSize);
        
        for (let subIndex = 0; subIndex < subBatches; subIndex++) {
          const subStart = subIndex * subBatchSize;
          const subEnd = Math.min(subStart + subBatchSize, currentBatch.length);
          const subBatch = currentBatch.slice(subStart, subEnd);
          
          try {
            await supabaseClient.upsertSamsaraEvents(subBatch);
            totalInserted += subBatch.length;
            console.log(`✅ Sub-lote ${subIndex + 1} processado`);
          } catch (subError) {
            console.error(`❌ Erro no sub-lote ${subIndex + 1}:`, subError);
            totalErrors++;
          }
        }
      }
    }

    // 9. Verificar resultado final
    console.log('\n🎯 ==========================================');
    console.log('🎯 RESULTADO DA MIGRAÇÃO');
    console.log('🎯 ==========================================');
    console.log(`📊 Total de eventos processados: ${validEvents.length}`);
    console.log(`✅ Eventos inseridos com sucesso: ${totalInserted}`);
    console.log(`❌ Erros encontrados: ${totalErrors}`);
    console.log(`📈 Taxa de sucesso: ${Math.round((totalInserted/validEvents.length)*100)}%`);
    
    // 10. Verificar estado final da tabela
    const finalTotalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros na tabela: ${finalTotalRecords}`);
    
    if (finalTotalRecords === validEvents.length) {
      console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    } else {
      console.log('⚠️  MIGRAÇÃO PARCIALMENTE CONCLUÍDA');
      console.log(`   Esperado: ${validEvents.length}, Encontrado: ${finalTotalRecords}`);
    }
    
    console.log('==========================================\n');

  } catch (error) {
    console.error('💥 ERRO CRÍTICO NA MIGRAÇÃO:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar migração diretamente
console.log('🎯 Executando migração histórica...');
migrateHistorical().then(() => {
  console.log('✅ Migração concluída');
}).catch(error => {
  console.error('❌ Erro na migração:', error);
  process.exit(1);
});

export default migrateHistorical;
