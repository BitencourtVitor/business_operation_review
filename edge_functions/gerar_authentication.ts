import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: corsHeaders
    });
  }
  
  try {
    // Buscar usuários da tabela usuarios
    const { data: usuarios, error: fetchError } = await supabase
      .from('usuarios')
      .select('email, senha_hash, nome_completo')
      .not('email', 'is', null)
      .neq('email', '');
    
    if (fetchError) throw new Error(`Erro ao buscar usuários: ${fetchError.message}`);
    
    const results = [];
    let created = 0;
    let skipped = 0;
    
    // Processar cada usuário
    for (const usuario of usuarios || []) {
      try {
        // Criar usuário com os dados da tabela
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: usuario.email,
          password: usuario.senha_hash,
          email_confirm: true,
          user_metadata: {
            name: usuario.nome_completo,
            full_name: usuario.nome_completo,
            nome_completo: usuario.nome_completo
          }
        });
        
        if (createError) {
          // Se der erro de email já existir, pular
          if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
            results.push({
              email: usuario.email,
              success: false,
              message: 'Email já existe na autenticação',
              action: 'skipped'
            });
            skipped++;
          } else {
            results.push({
              email: usuario.email,
              success: false,
              message: `Erro: ${createError.message}`,
              action: 'error'
            });
          }
        } else {
          results.push({
            email: usuario.email,
            success: true,
            message: 'Usuário criado com sucesso',
            action: 'created',
            user_id: newUser.user?.id
          });
          created++;
        }
        
      } catch (error) {
        results.push({
          email: usuario.email,
          success: false,
          message: `Erro: ${error.message}`,
          action: 'error'
        });
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização concluída. Execute o SQL para atualizar display names.",
      summary: {
        total: usuarios?.length || 0,
        created,
        skipped,
        errors: results.filter(r => r.action === 'error').length
      },
      results
    }), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
