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
const RAW_JSON = path.join(process.cwd(), `${company}_invoices.json`);

function getTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.access(RAW_JSON);
    const backupPath = path.join(BACKUP_DIR, `${company}_invoices_backup_${getTimestamp()}.json`);
    await fs.copyFile(RAW_JSON, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(RAW_JSON);
    console.log(`🗑️  Arquivo antigo removido: ${RAW_JSON}`);
  } catch {}
}

async function saveInvoicesBatch(batch, append = false) {
  const maxRetries = 5;
  const baseDelay = 1000; // 1 segundo
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (append && await fileExists(RAW_JSON)) {
        const prev = JSON.parse(await fs.readFile(RAW_JSON, 'utf-8'));
        await fs.writeFile(RAW_JSON, JSON.stringify([...prev, ...batch], null, 2), 'utf-8');
      } else {
        await fs.writeFile(RAW_JSON, JSON.stringify(batch, null, 2), 'utf-8');
      }
      return; // Sucesso - sai da função
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Última tentativa falhou, propaga o erro
      }
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
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

function transformInvoices(json) {
  // invoices principais
  const invoices = [];
  const lines = [];
  const links = [];
  for (const inv of json) {
    invoices.push({
      external_id: inv.Id,
      doc_number: inv.DocNumber || null,
      txn_date: inv.TxnDate || null,
      due_date: inv.DueDate || null,
      customer_id: inv.CustomerRef?.value || null,
      customer_name: inv.CustomerRef?.name || null,
      total_amount: inv.TotalAmt || null,
      balance: inv.Balance || null,
      last_updated_at: inv.MetaData?.LastUpdatedTime || null
    });
    // linhas
    if (Array.isArray(inv.Line)) {
      for (const line of inv.Line) {
        if (line.DetailType === 'SalesItemLineDetail') {
          lines.push({
            external_id: inv.Id,
            external_line_id: line.Id || null,
            description: line.Description || null,
            amount: line.Amount || null
          });
        }
      }
    }
    // links
    if (Array.isArray(inv.LinkedTxn)) {
      for (const link of inv.LinkedTxn) {
        links.push({
          external_id: inv.Id,
          linked_txn_id: link.TxnId || null,
          linked_txn_type: link.TxnType || null
        });
      }
    }
  }
  return { invoices, lines, links };
}

async function main() {
  const startTime = Date.now();
  const runId = process.env.QB_RUN_ID || null;
  let rowsFetched = 0, rowsSent = 0;
  const sb = new SupabaseClient(company);

  try {
    console.log(`--- Iniciando sincronização de Invoices (${company.toUpperCase()}) ---`);
    await backupAndDeleteOldJson();
    const qb = new QuickBooksClient(company);

    // 1. Coleta paginada
    let allInvoices = [];
    let startPosition = 1;
    const maxResults = 100;
    while (true) {
      const query = `SELECT * FROM Invoice ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      console.log(`📥 Buscando Invoice registros da posição ${startPosition}...`);
      const response = await qb.makeRequest('query', { query });
      const batch = response.QueryResponse?.Invoice ?? [];
      if (batch.length === 0) break;
      allInvoices.push(...batch);
      await saveInvoicesBatch(batch, startPosition > 1);
      if (batch.length < maxResults) break;
      startPosition += maxResults;
    }
    rowsFetched = allInvoices.length;
    console.log(`✅ Invoices coletados: ${rowsFetched}`);

    // 2. Transformação
    const { invoices, lines, links } = transformInvoices(allInvoices);
    rowsSent = invoices.length;
    console.log(`🔄 Transformação concluída: ${invoices.length} invoices, ${lines.length} itens, ${links.length} links.`);

    // 3. Upsert invoices principais
    const idMap = await sb.upsertInvoices(invoices);
    console.log(`✅ Invoices upserted: ${invoices.length}`);

    // 4. FKs
    const linesWithFK = lines.map(line => {
      const { external_id, ...rest } = line;
      return { ...rest, invoice_id: idMap[line.external_id] };
    });
    const linksWithFK = links.map(link => {
      const { external_id, ...rest } = link;
      return { ...rest, invoice_id: idMap[link.external_id] };
    });

    // 5. Upsert linhas e links
    await sb.upsertInvoiceLines(linesWithFK);
    await sb.upsertInvoiceLinks(linksWithFK);
    console.log(`✅ Invoice lines upserted: ${linesWithFK.length}`);
    console.log(`✅ Invoice links upserted: ${linksWithFK.length}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('--- Sincronização finalizada ---');
    console.log(`⏱️  Tempo total: ${elapsed}s`);

    await sb.logSync({ runId, script: 'invoices', rowsFetched, rowsSent, status: 'success', durationMs: Date.now() - startTime });
  } catch (err) {
    console.error('❌ Erro fatal:', err.message || err);
    await sb.logSync({ runId, script: 'invoices', rowsFetched, rowsSent, status: 'error', errorMessage: err.message || String(err), durationMs: Date.now() - startTime });
    process.exit(1);
  }
}

main(); 