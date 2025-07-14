import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import Papa from "https://esm.sh/papaparse@5.4.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

const gsheetUrl = "https://docs.google.com/spreadsheets/d/1RUV5MnaIVJCut3Syusf-0XQHbS-qFNR25LuB43D1FEQ/export?format=csv";

function normalizeUtf8String(str: string | null | undefined): string {
  if (!str) return '';
  try {
    return str.normalize('NFC').trim();
  } catch {
    return str;
  }
}

function parseNumericValue(value: any, defaultValue = 0) {
  if (!value || value === '') return defaultValue;
  try {
    const stringValue = String(value).trim();
    let cleanValue = stringValue.replace(/[$,()\s]/g, '');
    if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
      cleanValue = '-' + cleanValue;
    }
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? defaultValue : parsed;
  } catch {
    return defaultValue;
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
    // 1. Buscar CSV da planilha Google
    const res = await fetch(gsheetUrl);
    if (!res.ok) throw new Error("Erro ao buscar planilha Google");
    const csvText = await res.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as any[];

    // 2. Filtrar linhas válidas
    const validRows = rows.filter(row => {
      const desc = getField(row, "Line description");
      const amount = parseNumericValue(getField(row, "Amount"), 0);
      return desc && desc !== '' && amount !== 0;
    });

    // 3. Identificar projetos únicos
    const projectMap = new Map<string, any>();
    for (const row of validRows) {
      const num = getField(row, "Num");
      const customerFullName = getField(row, "Customer full name");
      const amount = parseNumericValue(getField(row, "Amount"), 0);
      if (!projectMap.has(customerFullName + '|' + num)) {
        const logic = parseLogic1(customerFullName);
        projectMap.set(customerFullName + '|' + num, {
          num,
          ...logic,
          final_amount: 0, // será somado depois
          added_date: new Date().toISOString().slice(0, 10),
          details: [],
        });
      }
      // Adiciona detalhes para somar depois
      projectMap.get(customerFullName + '|' + num).details.push({
        description: getField(row, "Line description"),
        price: amount,
      });
    }

    // 4. Calcular valor final de cada projeto
    for (const project of Array.from(projectMap.values())) {
      project.final_amount = project.details.reduce((acc: number, d: { price: number }) => acc + d.price, 0);
    }

    // 5. Inserir projetos e detalhes no banco
    const projectsToInsert = Array.from(projectMap.values()).map(p => ({
      num: p.num,
      category: p.category,
      jobsite: p.jobsite,
      project: p.project,
      final_amount: p.final_amount,
      added_date: p.added_date,
    }));

    // Inserir projetos e obter IDs
    const { data: insertedProjects, error: insertError } = await supabase
      .from("HVAC_Projects")
      .insert(projectsToInsert)
      .select();
    if (insertError) throw insertError;

    // Mapear Num + Customer para ID
    const idMap = new Map();
    for (const proj of insertedProjects) {
      idMap.set(proj.num + '|' + proj.category + '|' + proj.jobsite + '|' + proj.project, proj.id);
    }

    // Preparar detalhes
    const detailsToInsert = [];
    for (const project of Array.from(projectMap.values())) {
      const idKey = project.num + '|' + project.category + '|' + project.jobsite + '|' + project.project;
      const projectId = idMap.get(idKey);
      for (const d of project.details) {
        detailsToInsert.push({
          project_id: projectId,
          description: d.description,
          price: d.price,
        });
      }
    }

    // Inserir detalhes
    if (detailsToInsert.length > 0) {
      const { error: detailsError } = await supabase
        .from("HVAC_Projects_Details")
        .insert(detailsToInsert);
      if (detailsError) throw detailsError;
    }

    return new Response(JSON.stringify({ success: true, projects: projectsToInsert.length, details: detailsToInsert.length }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}); 