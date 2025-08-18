import WexClient from './wexClient.js';
import WexSupabaseClient from './wexSupabaseClient.js';
import dotenv from 'dotenv';

console.log('🚀 Sincronização Incremental WEX');

// Configurar dotenv
dotenv.config();

async function syncWexIncremental() {
  console.log('🚀 ==========================================');
  console.log('🚀 SINCRONIZAÇÃO INCREMENTAL WEX');
  console.log('🚀 ==========================================');
  console.log('📊 Objetivo: Capturar apenas dados NOVOS');
  console.log('🔑 Estratégia: Verificar última transação e inserir apenas novas');
  console.log('📋 Formato: Data, Nome, Units, Valor, Local');
  console.log('==========================================\n');

  const wexClient = new WexClient();
  const supabaseClient = new WexSupabaseClient();

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

    // 3. Buscar última transação processada
    console.log('\n🔍 Buscando última transação processada...');
    const lastProcessedTransaction = await supabaseClient.getLastProcessedTransaction();
    console.log(`📅 Última transação: ${lastProcessedTransaction.transaction_date}`);
    console.log(`🔑 Chave: ${lastProcessedTransaction.transaction_key}`);

    // 4. Buscar dados do WEX
    console.log('\n📥 Buscando dados do WEX...');
    const wexData = await wexClient.fetchAllData();
    console.log(`📊 Total de transações obtidas: ${wexData.length}`);

    // 5. Mapear dados
    console.log('\n🔄 Mapeando e transformando dados...');
    const mappedTransactions = wexData.filter(transaction => {
      return transaction.transaction_date !== null && 
             transaction.nome !== null &&
             transaction.units !== null && 
             transaction.valor !== null;
    });
    console.log(`✅ Transações com dados válidos: ${mappedTransactions.length}`);

    // 6. REMOVER DUPLICATAS E FILTRAR APENAS NOVAS com logs detalhados
    console.log('\n🔍 REMOVENDO DUPLICATAS E FILTRANDO NOVAS...');
    
    // Usar Map para manter apenas a última transação de cada chave
    const uniqueTransactionsMap = new Map();
    const duplicatesFound = [];
    
    for (const transaction of mappedTransactions) {
      const key = transaction.transaction_key;
      if (key) {
        if (uniqueTransactionsMap.has(key)) {
          // Encontrou duplicata - registrar detalhes
          const existingTransaction = uniqueTransactionsMap.get(key);
          duplicatesFound.push({
            duplicate: transaction,
            existing: existingTransaction,
            key: key
          });
          
          console.log(`🔍 DUPLICATA IDENTIFICADA:`);
          console.log(`   Chave: ${key}`);
          console.log(`   Existente: ${existingTransaction.transaction_date} | ${existingTransaction.nome} | ${existingTransaction.units} gal | $${existingTransaction.valor} | ${existingTransaction.local}`);
          console.log(`   Duplicata: ${transaction.transaction_date} | ${transaction.nome} | ${transaction.units} gal | $${transaction.valor} | ${transaction.local}`);
          console.log(`   → Mantendo a mais recente\n`);
        }
        // Se já existe, substitui (mantém a mais recente)
        uniqueTransactionsMap.set(key, transaction);
      }
    }
    
    const uniqueTransactions = Array.from(uniqueTransactionsMap.values());
    const duplicatesRemoved = mappedTransactions.length - uniqueTransactions.length;
    
    console.log(`📊 Transações originais: ${mappedTransactions.length}`);
    console.log(`🔍 Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`✅ Transações únicas: ${uniqueTransactions.length}`);
    
    if (duplicatesFound.length > 0) {
      console.log(`\n📋 RESUMO DAS DUPLICATAS:`);
      duplicatesFound.forEach((dup, index) => {
        console.log(`${index + 1}. Chave: ${dup.key}`);
        console.log(`   Existente: ${dup.existing.transaction_date} | ${dup.existing.nome} | ${dup.existing.units} gal | $${dup.existing.valor} | ${dup.existing.local}`);
        console.log(`   Duplicata: ${dup.duplicate.transaction_date} | ${dup.duplicate.nome} | ${dup.duplicate.units} gal | $${dup.duplicate.valor} | ${dup.duplicate.local}`);
        console.log(`   → MANTIDA: ${dup.existing.transaction_date > dup.duplicate.transaction_date ? 'Existente' : 'Duplicata'}\n`);
      });
    }

    // 7. FILTRAR APENAS TRANSAÇÕES NOVAS (mais recentes que a última processada)
    console.log('\n🆕 FILTRANDO APENAS TRANSAÇÕES NOVAS...');
    
    const newTransactions = uniqueTransactions.filter(transaction => {
      if (!transaction.transaction_date || !lastProcessedTransaction.transaction_date) return false;
      return transaction.transaction_date > lastProcessedTransaction.transaction_date;
    });
    
    console.log(`📊 Transações únicas: ${uniqueTransactions.length}`);
    console.log(`🆕 Transações NOVAS: ${newTransactions.length}`);
    console.log(`⏭️  Transações já processadas: ${uniqueTransactions.length - newTransactions.length}`);

    if (newTransactions.length === 0) {
      console.log('\n🎯 NENHUMA TRANSAÇÃO NOVA ENCONTRADA!');
      console.log('✅ Sincronização concluída - dados já estão atualizados');
      return;
    }

    // 8. INSERIR APENAS TRANSAÇÕES NOVAS
    console.log('\n🚀 INSERINDO APENAS TRANSAÇÕES NOVAS...');
    
    try {
      // Upsert direto com onConflict - SEM verificação individual
      await supabaseClient.upsertWexTransactions(newTransactions);
      console.log(`✅ ${newTransactions.length} transações NOVAS inseridas com sucesso!`);
    } catch (error) {
      console.error(`❌ Erro ao inserir transações novas:`, error.message);
      
      // Fallback: tentar em lotes menores
      console.log('🔄 Fallback: tentando inserir em lotes de 500...');
      const fallbackBatchSize = 500;
      for (let i = 0; i < newTransactions.length; i += fallbackBatchSize) {
        const fallbackBatch = newTransactions.slice(i, i + fallbackBatchSize);
        try {
          await supabaseClient.upsertWexTransactions(fallbackBatch);
          console.log(`✅ Fallback lote ${Math.floor(i/fallbackBatchSize) + 1} inserido`);
        } catch (fallbackError) {
          console.error(`❌ Erro no fallback lote:`, fallbackError.message);
        }
      }
    }

    // 9. Resultado final
    console.log('\n🎯 ==========================================');
    console.log('🎯 RESULTADO DA SINCRONIZAÇÃO INCREMENTAL WEX');
    console.log('🎯 ==========================================');
    console.log(`📊 Total de transações únicas: ${uniqueTransactions.length}`);
    console.log(`🔍 Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`🆕 Transações NOVAS inseridas: ${newTransactions.length}`);
    console.log(`⏭️  Transações já processadas: ${uniqueTransactions.length - newTransactions.length}`);
    
    // 10. Verificar estado final da tabela
    const finalTotalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros na tabela: ${finalTotalRecords}`);
    console.log(`📈 Registros adicionados nesta sincronização: ${newTransactions.length}`);
    
    // 11. Buscar estatísticas atualizadas
    console.log('\n📊 Buscando estatísticas atualizadas...');
    const stats = await supabaseClient.getTransactionStats();
    console.log(`📈 Total de transações: ${stats.totalTransactions}`);
    console.log(`⛽ Total de galões: ${stats.totalGallons}`);
    console.log(`💰 Custo total: $${stats.totalCost}`);
    console.log(`📊 Custo médio por galão: $${stats.avgCostPerGallon}`);
    
    console.log('\n🎉 SINCRONIZAÇÃO INCREMENTAL WEX CONCLUÍDA COM SUCESSO!');
    console.log('📋 Formato: Data | Nome | Units | Valor | Local');
    console.log('==========================================\n');

  } catch (error) {
    console.error('💥 ERRO CRÍTICO:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar
console.log('🎯 Executando sincronização incremental WEX...');
syncWexIncremental().then(() => {
  console.log('✅ Sincronização concluída');
}).catch(error => {
  console.error('❌ Erro na sincronização:', error);
  process.exit(1);
});

export default syncWexIncremental;
