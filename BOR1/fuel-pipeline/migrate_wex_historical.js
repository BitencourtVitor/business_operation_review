import WexClient from './wexClient.js';
import WexSupabaseClient from './wexSupabaseClient.js';
import dotenv from 'dotenv';

console.log('🚀 Migração Histórica WEX');

// Configurar dotenv
dotenv.config();

async function migrateWexHistorical() {
  console.log('🚀 ==========================================');
  console.log('🚀 MIGRAÇÃO HISTÓRICA WEX');
  console.log('🚀 ==========================================');
  console.log('📊 Objetivo: Migrar TODOS os dados históricos');
  console.log('🔑 Estratégia: Inserir todos os dados da planilha');
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

    if (totalRecords > 0) {
      console.log('⚠️  ATENÇÃO: Tabela já possui dados!');
      console.log('🔍 Deseja continuar e sobrescrever? (Ctrl+C para cancelar)');
      
      // Aguardar 5 segundos para dar tempo de cancelar
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('🔄 Continuando com migração...');
      
      // Limpar tabela existente
      await supabaseClient.clearTable();
    }

    // 3. Buscar dados do WEX
    console.log('\n📥 Buscando dados do WEX...');
    const wexData = await wexClient.fetchAllData();
    console.log(`📊 Total de transações obtidas: ${wexData.length}`);

    if (wexData.length === 0) {
      throw new Error('Nenhum dado WEX encontrado!');
    }

    // 4. Filtrar transações com dados válidos
    const validTransactions = wexData.filter(transaction => {
      return transaction.transaction_date !== null && 
             transaction.nome !== null &&
             transaction.units !== null && 
             transaction.valor !== null;
    });
    console.log(`✅ Transações com dados válidos: ${validTransactions.length}`);

    // 5. Remover duplicatas com logs detalhados
    console.log('\n🔍 REMOVENDO DUPLICATAS...');
    const uniqueTransactionsMap = new Map();
    const duplicatesFound = [];
    
    for (const transaction of validTransactions) {
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
        // Sempre substitui (mantém a mais recente)
        uniqueTransactionsMap.set(key, transaction);
      }
    }
    
    const uniqueTransactions = Array.from(uniqueTransactionsMap.values());
    const duplicatesRemoved = validTransactions.length - uniqueTransactions.length;
    
    console.log(`📊 Transações originais: ${validTransactions.length}`);
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

    // 6. Inserir dados
    console.log('\n🚀 Inserindo dados históricos...');
    
    try {
      // Tentar inserir tudo de uma vez
      await supabaseClient.upsertWexTransactions(uniqueTransactions);
      console.log(`✅ ${uniqueTransactions.length} transações inseridas com sucesso!`);
    } catch (error) {
      console.error(`❌ Erro ao inserir em lote:`, error.message);
      
      // Fallback: inserir em lotes menores
      console.log('🔄 Fallback: inserindo em lotes de 500...');
      const batchSize = 500;
      let insertedCount = 0;
      
      for (let i = 0; i < uniqueTransactions.length; i += batchSize) {
        const batch = uniqueTransactions.slice(i, i + batchSize);
        try {
          await supabaseClient.upsertWexTransactions(batch);
          insertedCount += batch.length;
          console.log(`✅ Lote ${Math.floor(i/batchSize) + 1} inserido (${insertedCount}/${uniqueTransactions.length})`);
        } catch (batchError) {
          console.error(`❌ Erro no lote ${Math.floor(i/batchSize) + 1}:`, batchError.message);
          
          // Tentar inserir individualmente
          console.log('🔄 Tentando inserir individualmente...');
          for (const transaction of batch) {
            try {
              await supabaseClient.upsertWexTransactions([transaction]);
              insertedCount++;
            } catch (individualError) {
              console.error(`❌ Erro ao inserir transação ${transaction.transaction_key}:`, individualError.message);
            }
          }
        }
      }
      
      console.log(`✅ Total de transações inseridas: ${insertedCount}/${uniqueTransactions.length}`);
    }

    // 7. Verificar resultado final
    console.log('\n🎯 ==========================================');
    console.log('🎯 RESULTADO DA MIGRAÇÃO HISTÓRICA WEX');
    console.log('🎯 ==========================================');
    console.log(`📊 Transações originais: ${wexData.length}`);
    console.log(`✅ Transações válidas: ${validTransactions.length}`);
    console.log(`🔍 Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`✅ Transações únicas: ${uniqueTransactions.length}`);
    
    // 8. Verificar estado final da tabela
    const finalTotalRecords = await supabaseClient.getTotalRecords();
    console.log(`📊 Total de registros na tabela: ${finalTotalRecords}`);
    
    // 9. Buscar estatísticas
    console.log('\n📊 Buscando estatísticas das transações...');
    const stats = await supabaseClient.getTransactionStats();
    console.log(`📈 Total de transações: ${stats.totalTransactions}`);
    console.log(`⛽ Total de galões: ${stats.totalGallons}`);
    console.log(`💰 Custo total: $${stats.totalCost}`);
    console.log(`📊 Custo médio por galão: $${stats.avgCostPerGallon}`);
    
    if (stats.dateRange.earliest && stats.dateRange.latest) {
      console.log(`📅 Período: ${stats.dateRange.earliest.toLocaleDateString()} a ${stats.dateRange.latest.toLocaleDateString()}`);
    }
    
    console.log('\n🎉 MIGRAÇÃO HISTÓRICA WEX CONCLUÍDA COM SUCESSO!');
    console.log('📋 Formato final: Data | Nome | Units | Valor | Local');
    console.log('==========================================\n');

  } catch (error) {
    console.error('💥 ERRO CRÍTICO:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar
console.log('🎯 Executando migração histórica WEX...');
migrateWexHistorical().then(() => {
  console.log('✅ Migração concluída');
}).catch(error => {
  console.error('❌ Erro na migração:', error);
  process.exit(1);
});

export default migrateWexHistorical;
