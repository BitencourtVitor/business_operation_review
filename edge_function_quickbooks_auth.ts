import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// Função para gerar URL de autorização
function generateAuthUrl(clientId: string, redirectUri: string) {
  const scope = "com.intuit.quickbooks.accounting";
  const state = "teststate";
  
  return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

// Função para trocar código por tokens
async function exchangeCodeForTokens(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao trocar código por tokens: ${response.status} - ${errorText}`);
  }
  
  const tokens = await response.json();
  
  if (!tokens.access_token || !tokens.refresh_token || !tokens.realmId) {
    throw new Error('Resposta inválida do QuickBooks OAuth');
  }
  
  return tokens;
}

// Função para salvar tokens no banco
async function saveTokens(supabase: any, tokens: any) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  
  const { data, error } = await supabase
    .from("quickbooks_tokens")
    .upsert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      realm_id: tokens.realmId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    });
  
  if (error) {
    throw new Error(`Erro ao salvar tokens: ${error.message}`);
  }
  
  return data;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verificar variáveis de ambiente
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
    const redirectUri = Deno.env.get("QUICKBOOKS_REDIRECT_URI") || "http://localhost:3000/callback";

    if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
      return new Response(JSON.stringify({
        error: "Configuração incompleta do servidor"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Criar cliente Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obter dados da requisição
    const body = await req.json();
    const { action, code } = body;

    if (action === "generate_auth_url") {
      // Gerar URL de autorização
      const authUrl = generateAuthUrl(clientId, redirectUri);
      
      return new Response(JSON.stringify({
        authUrl: authUrl
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    else if (action === "exchange_code") {
      if (!code) {
        return new Response(JSON.stringify({
          error: "Código de autorização não fornecido"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        // Trocar código por tokens
        const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
        
        // Salvar tokens no banco
        await saveTokens(supabase, tokens);
        
        return new Response(JSON.stringify({
          success: true,
          message: "Autenticação realizada com sucesso",
          realmId: tokens.realmId
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    
    else {
      return new Response(JSON.stringify({
        error: "Ação não reconhecida"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
  } catch (error) {
    console.error("Erro interno:", error);
    return new Response(JSON.stringify({
      error: error.message || "Erro interno do servidor"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}); 