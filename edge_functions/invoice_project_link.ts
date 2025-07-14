import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeUtf8String(str: string | null | undefined): string {
  if (!str) return '';
  try {
    return str.normalize('NFC').trim();
  } catch {
    return str;
  }
}

function parseLogic1(customerFullName: string) {
  const parts = customerFullName.split(":");
  if (parts.length === 2) {
    // Case 3: Particular
    return {
      category: "Particular",
      jobsite: parts[0].trim(),
      project: parts[1].trim(),
    };
  } else if (parts.length >= 3) {
    // Case 1 e 2: Empresa
    return {
      category: parts[0].trim(),
      jobsite: parts[1].trim(),
      project: parts.slice(2).join(":").trim(),
    };
  } else {
    // Fallback
    return {
      category: "Desconhecido",
      jobsite: customerFullName.trim(),
      project: customerFullName.trim(),
    };
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  try {
    // Buscar invoices sem project_id
    const { data: invoices, error: invError } = await supabase
      .from("hvac_invoices")
      .select("id, customer_full_name")
      .is("project_id", null);
    if (invError) throw invError;
    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: "Nenhuma invoice para atualizar." }), { status: 200 });
    }

    let updated = 0;
    for (const inv of invoices) {
      const logic = parseLogic1(inv.customer_full_name);
      const { data: projects, error: projError } = await supabase
        .from("hvac_projects")
        .select("id")
        .eq("category", logic.category)
        .eq("jobsite", logic.jobsite)
        .eq("project", logic.project)
        .limit(1);
      if (projError) continue;
      if (projects && projects.length > 0) {
        const project_id = projects[0].id;
        const { error: updError } = await supabase
          .from("hvac_invoices")
          .update({ project_id })
          .eq("id", inv.id);
        if (!updError) updated++;
      }
    }
    return new Response(JSON.stringify({ success: true, updated }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}); 