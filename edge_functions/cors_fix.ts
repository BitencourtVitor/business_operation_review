import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  // Handle CORS preflight - CRÍTICO: status 200 e headers corretos
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Get the Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const url = new URL(req.url);
    const path = url.pathname.replace('/cors_fix', '');
    
    // Forward to actual Supabase API
    const targetUrl = `${supabaseUrl}${path}${url.search}`;
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });

    const data = await response.text();
    
    return new Response(data, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      status: response.status,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
