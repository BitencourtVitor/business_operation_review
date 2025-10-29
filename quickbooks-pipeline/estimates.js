import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';
import SupabaseClient from './supabaseClient.js';

dotenv.config();

// Ler empresa do argumento da linha de comando
const company = process.argv[2] || 'hvac';
console.log(`🏢 Processando empresa: ${company.toUpperCase()}`);

const BACKUP_DIR = path.join(process.cwd(), 'backup');
const RAW_JSON = path.join(process.cwd(), `${company}_estimates.json`);

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.access(RAW_JSON);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `${company}_estimates_${timestamp}.json`);
    await fs.copyFile(RAW_JSON, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(RAW_JSON);
    console.log(`🗑️  Arquivo antigo removido: ${RAW_JSON}`);
  } catch {}
}

async function saveEstimatesBatch(estimatesBatch, append = false) {
  const maxRetries = 5;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (append && await fileExists(RAW_JSON)) {
        const prev = JSON.parse(await fs.readFile(RAW_JSON, 'utf-8'));
        await fs.writeFile(RAW_JSON, JSON.stringify([...prev, ...estimatesBatch], null, 2), 'utf-8');
      } else {
        await fs.writeFile(RAW_JSON, JSON.stringify(estimatesBatch, null, 2), 'utf-8');
      }
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⚠️  Erro ao salvar arquivo (tentativa ${attempt}/${maxRetries}). Aguardando ${delay}ms antes de tentar novamente...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mapEstimateToDbRow(estimate) {
  return {
    external_id: estimate.Id,
    updated_at: estimate.MetaData?.LastUpdatedTime || null,
    accepted_date: estimate.AcceptedDate || null,
    txn_date: estimate.TxnDate || null,
    doc_number: estimate.DocNumber || null,
    txn_status: estimate.TxnStatus || null,
    customer_name: estimate.CustomerRef?.name || null,
    customer_id: estimate.CustomerRef?.value || null,
    total_amount: estimate.TotalAmt || null,
    created_at: new Date().toISOString()
  };
}

function mapLineToDbRow(line, estimateId) {
  return {
    estimate_id: estimateId,
    line_id: line.Id || null,
    line_num: line.LineNum || null,
    description: line.Description || null,
    amount: line.Amount || null,
    unit_price: line.SalesItemLineDetail?.UnitPrice || null,
    quantity: line.SalesItemLineDetail?.Qty || null,
    item_ref_id: line.SalesItemLineDetail?.ItemRef?.value || null,
    item_ref_name: line.SalesItemLineDetail?.ItemRef?.name || null,
    tax_code_ref: line.SalesItemLineDetail?.TaxCodeRef?.value || null,
    detail_type: line.DetailType || null,
    created_at: new Date().toISOString()
  };
}

function mapLinkToDbRow(link, estimateId) {
  return {
    estimate_id: estimateId,
    txn_id: link.TxnId || null,
    txn_type: link.TxnType || null,
    created_at: new Date().toISOString()
  };
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando sincronização de Estimates ---');
  await backupAndDeleteOldJson();
  const qb = new QuickBooksClient(company);
  const sb = new SupabaseClient(company);

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allEstimates = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM Estimate ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando Estimate registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.Estimate ? response.QueryResponse.Estimate : [];
    if (batch.length === 0) break;
    allEstimates.push(...batch);
    await saveEstimatesBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ Estimates coletados: ${allEstimates.length}`);

  // 2. Transformação e upsert relacional
  const mainRows = allEstimates.map(mapEstimateToDbRow);
  let idMap;
  try {
    idMap = await sb.upsertEstimates(mainRows);
  } catch (err) {
    console.error(`❌ Erro ao upsert em ${company}_estimates:`, err.message || err);
    process.exit(1);
  }

  // 3. Linhas e links
  let linesRows = [];
  let linksRows = [];
  for (const est of allEstimates) {
    const estId = idMap[est.Id];
    if (!estId) continue;
    if (Array.isArray(est.Line)) {
      linesRows.push(...est.Line.filter(l => l.DetailType === 'SalesItemLineDetail').map(line => mapLineToDbRow(line, estId)));
    }
    if (Array.isArray(est.LinkedTxn)) {
      linksRows.push(...est.LinkedTxn.map(link => mapLinkToDbRow(link, estId)));
    }
  }

  // 4. Upsert linhas e links
  try {
    await sb.upsertEstimateLines(linesRows);
    await sb.upsertEstimateLinks(linksRows);
  } catch (err) {
    console.error('❌ Erro ao upsert em linhas/links:', err.message || err);
    process.exit(1);
  }

  // 5. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`✅ Estimates upserted: ${mainRows.length}`);
  console.log(`✅ Estimate lines upserted: ${linesRows.length}`);
  console.log(`✅ Estimate links upserted: ${linksRows.length}`);
  console.log(`⏱️  Tempo total: ${elapsed}s`);
}

main(); 