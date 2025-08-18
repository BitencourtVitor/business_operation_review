import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class SupabaseClient {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    );
  }

  // Upsert eventos do Samsara (Idle Events e Trips)
  async upsertSamsaraEvents(events) {
    if (!events || events.length === 0) return;
    
    console.log(`🔄 Inserindo ${events.length} eventos do Samsara...`);
    
    const { data, error } = await this.supabase
      .from('samsara_events')
      .upsert(events, { 
        onConflict: 'event_key', 
        ignoreDuplicates: false 
      })
      .select('id, event_key');
    
    if (error) {
      console.error('❌ Erro ao inserir eventos:', error);
      throw error;
    }
    
    console.log(`✅ ${data.length} eventos inseridos/atualizados com sucesso`);
    return data;
  }

  // Verificar se evento já existe
  async checkEventExists(eventKey) {
    const { data, error } = await this.supabase
      .from('samsara_events')
      .select('event_key')
      .eq('event_key', eventKey)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  }

  // Buscar último evento processado
  async getLastProcessedEvent() {
    const { data, error } = await this.supabase
      .from('samsara_events')
      .select('event_date, event_key')
      .order('event_date', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      return {
        event_date: new Date(data[0].event_date),
        event_key: data[0].event_key
      };
    }
    
    return { event_date: null, event_key: null };
  }

  // Contar total de registros
  async getTotalRecords() {
    const { count, error } = await this.supabase
      .from('samsara_events')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  }

  // Limpar tabela (apenas para migração inicial)
  async clearTable() {
    console.log('🗑️  Limpando tabela samsara_events...');
    const { error } = await this.supabase
      .from('samsara_events')
      .delete()
      .not('id', 'is', null);
    
    if (error) throw error;
    console.log('✅ Tabela limpa com sucesso');
  }

  // Testar conexão
  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from('samsara_events')
        .select('count', { count: 'exact', head: true });
      
      if (error) throw error;
      console.log('✅ Conexão com Supabase estabelecida com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro na conexão com Supabase:', error);
      return false;
    }
  }
}

export default SupabaseClient;
