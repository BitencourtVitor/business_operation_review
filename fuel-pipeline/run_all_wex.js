import migrateWexHistorical from './migrate_wex_historical.js';
import syncWexIncremental from './sync_wex_incremental.js';
import dotenv from 'dotenv';

console.log('🚀 Pipeline Completo WEX');

// Configurar dotenv
dotenv.config();

async function runAllWex() {
  console.log('🚀 ==========================================');
  console.log('🚀 PIPELINE COMPLETO WEX');
  console.log('🚀 ==========================================');
  console.log('📊 Objetivo: Executar migração + sincronização');
  console.log('🔑 Estratégia: 1. Migração histórica, 2. Sincronização incremental');
  console.log('==========================================\n');

  try {
    // 1. Migração histórica
    console.log('🎯 ETAPA 1: MIGRAÇÃO HISTÓRICA');
    console.log('==========================================');
    await migrateWexHistorical();
    
    console.log('\n⏳ Aguardando 3 segundos antes da próxima etapa...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 2. Sincronização incremental
    console.log('\n🎯 ETAPA 2: SINCRONIZAÇÃO INCREMENTAL');
    console.log('==========================================');
    await syncWexIncremental();
    
    console.log('\n🎉 ==========================================');
    console.log('🎉 PIPELINE COMPLETO WEX CONCLUÍDO!');
    console.log('🎉 ==========================================');
    console.log('✅ Migração histórica: Concluída');
    console.log('✅ Sincronização incremental: Concluída');
    console.log('📊 Dados WEX sincronizados com sucesso');
    console.log('==========================================\n');
    
  } catch (error) {
    console.error('💥 ERRO NO PIPELINE WEX:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar
console.log('🎯 Executando pipeline completo WEX...');
runAllWex().then(() => {
  console.log('✅ Pipeline concluído com sucesso');
}).catch(error => {
  console.error('❌ Erro no pipeline:', error);
  process.exit(1);
});

export default runAllWex;
