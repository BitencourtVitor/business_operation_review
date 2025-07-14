import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const gsheetUrl = "https://docs.google.com/spreadsheets/d/1GdxVBbRSpCPLZ7Bpfu9mnzINWAU4GxQBD6UiwbHgl60/export?format=csv";

function normalizeUtf8String(str: string | null | undefined): string {
  if (!str) return '';
  try {
    return str.normalize('NFC').trim();
  } catch {
    return str;
  }
}

function getField(row: any, key: string) {
  let value = null;
  if (row[key] !== undefined) value = row[key];
  else if (row[` ${key}`] !== undefined) value = row[` ${key}`];
  else if (row[`${key} `] !== undefined) value = row[`${key} `];
  else {
    const foundKey = Object.keys(row).find((k) => k.replace(/\s/g, '') === key.replace(/\s/g, ''));
    if (foundKey) value = row[foundKey];
  }
  if (typeof value === 'string') {
    return normalizeUtf8String(value);
  }
  return value;
}

function parseAmount(str: string | null | undefined): number | null {
  if (!str) return null;
  const clean = str.replace(/,/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  try {
    const res = await fetch(gsheetUrl);
    if (!res.ok) throw new Error("Erro ao buscar planilha Google");
    const csvText = await res.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as any[];

    const batchSize = 50;
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const invoicesToInsert = [];
      for (const row of batch) {
        invoicesToInsert.push({
          date: getField(row, "date"),
          due_date: getField(row, "due_date"),
          customer_full_name: getField(row, "Customer full name"),
          invoice_num: getField(row, "invoice_num"),
          amount: parseAmount(getField(row, "amount")),
          payment_status: getField(row, "payment_status"),
          create_at: new Date().toISOString(),
        });
      }
      if (invoicesToInsert.length > 0) {
        const insertResult = await supabase
          .from("hvac_invoices")
          .insert(invoicesToInsert);
        if (!insertResult || typeof insertResult !== 'object') {
          console.log("Resultado da inserção é undefined ou não é objeto", { invoicesToInsert });
          throw new Error("Resultado da inserção é undefined ou não é objeto");
        }
        const { error: insertError } = insertResult;
        if (insertError) {
          console.log("Erro ao inserir invoices:", insertError.message);
          throw insertError;
        }
        totalInserted += invoicesToInsert.length;
      }
    }
    return new Response(JSON.stringify({ success: true, inserted: totalInserted }), { status: 200 });
  } catch (error: any) {
    console.log("Erro geral:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}); 