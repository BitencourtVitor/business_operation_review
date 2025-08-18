import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class WexSupabaseClient {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    );
  }

  // Upsert transações WEX
  async upsertWexTransactions(transactions) {
    if (!transactions || transactions.length === 0) return;
    
    console.log(`🔄 Inserindo ${transactions.length} transações WEX...`);
    
    const { data, error } = await this.supabase
      .from('wex_transactions')
      .upsert(transactions, { 
        onConflict: 'transaction_key', 
        ignoreDuplicates: false 
      })
      .select('id, transaction_key');
    
    if (error) {
      console.error('❌ Erro ao inserir transações WEX:', error);
      throw error;
    }
    
    console.log(`✅ ${data.length} transações WEX inseridas/atualizadas com sucesso`);
    return data;
  }

  // Verificar se transação já existe
  async checkTransactionExists(transactionKey) {
    const { data, error } = await this.supabase
      .from('wex_transactions')
      .select('transaction_key')
      .eq('transaction_key', transactionKey)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  }

  // Buscar última transação processada
  async getLastProcessedTransaction() {
    const { data, error } = await this.supabase
      .from('wex_transactions')
      .select('transaction_date, transaction_key')
      .order('transaction_date', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      return {
        transaction_date: new Date(data[0].transaction_date),
        transaction_key: data[0].transaction_key
      };
    }
    
    return { transaction_date: null, transaction_key: null };
  }

  // Contar total de registros
  async getTotalRecords() {
    const { count, error } = await this.supabase
      .from('wex_transactions')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  }

  // Limpar tabela (apenas para migração inicial)
  async clearTable() {
    console.log('🗑️  Limpando tabela wex_transactions...');
    const { error } = await this.supabase
      .from('wex_transactions')
      .delete()
      .not('id', 'is', null);
    
    if (error) throw error;
    console.log('✅ Tabela WEX limpa com sucesso');
  }

  // Testar conexão
  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from('wex_transactions')
        .select('count', { count: 'exact', head: true });
      
      if (error) throw error;
      console.log('✅ Conexão com Supabase estabelecida com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro na conexão com Supabase:', error);
      return false;
    }
  }

  // Buscar estatísticas das transações (simplificado)
  async getTransactionStats() {
    try {
      const { data, error } = await this.supabase
        .from('wex_transactions')
        .select('units, valor, transaction_date')
        .not('units', 'is', null)
        .not('valor', 'is', null);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const totalGallons = data.reduce((sum, row) => sum + (row.units || 0), 0);
        const totalCost = data.reduce((sum, row) => sum + (row.valor || 0), 0);
        const avgCostPerGallon = totalGallons > 0 ? totalCost / totalGallons : 0;
        
        return {
          totalTransactions: data.length,
          totalGallons: parseFloat(totalGallons.toFixed(3)),
          totalCost: parseFloat(totalCost.toFixed(2)),
          avgCostPerGallon: parseFloat(avgCostPerGallon.toFixed(2)),
          dateRange: {
            earliest: new Date(Math.min(...data.map(row => new Date(row.transaction_date)))),
            latest: new Date(Math.max(...data.map(row => new Date(row.transaction_date))))
          }
        };
      }
      
      return {
        totalTransactions: 0,
        totalGallons: 0,
        totalCost: 0,
        avgCostPerGallon: 0,
        dateRange: { earliest: null, latest: null }
      };
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      throw error;
    }
  }
}

export default WexSupabaseClient;
