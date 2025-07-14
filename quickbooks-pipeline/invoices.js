import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';
import SupabaseClient from './supabaseClient.js';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backup');
const RAW_JSON = path.join(process.cwd(), 'hvac_invoices.json');

function getTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.access(RAW_JSON);
    const backupPath = path.join(BACKUP_DIR, `hvac_invoices_backup_${getTimestamp()}.json`);
    await fs.copyFile(RAW_JSON, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(RAW_JSON);
    console.log(`🗑️  Arquivo antigo removido: ${RAW_JSON}`);
  } catch {}
}

async function saveInvoicesBatch(batch, append = false) {
  if (append && await fileExists(RAW_JSON)) {
    const prev = JSON.parse(await fs.readFile(RAW_JSON, 'utf-8'));
    await fs.writeFile(RAW_JSON, JSON.stringify([...prev, ...batch], null, 2), 'utf-8');
  } else {
    await fs.writeFile(RAW_JSON, JSON.stringify(batch, null, 2), 'utf-8');
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
  console.log('--- Iniciando sincronização de Invoices ---');
  await backupAndDeleteOldJson();
  const qb = new QuickBooksClient();
  const sb = new SupabaseClient();

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allInvoices = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM Invoice ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando Invoice registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.Invoice ? response.QueryResponse.Invoice : [];
    if (batch.length === 0) break;
    allInvoices.push(...batch);
    await saveInvoicesBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ Invoices coletados: ${allInvoices.length}`);

  // 2. Transformação
  let invoices, lines, links;
  try {
    ({ invoices, lines, links } = transformInvoices(allInvoices));
    console.log(`🔄 Transformação concluída: ${invoices.length} invoices, ${lines.length} itens, ${links.length} links.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert invoices principais e obter mapping external_id -> id
  let idMap;
  try {
    idMap = await sb.upsertInvoices(invoices);
    console.log(`✅ Invoices upserted: ${invoices.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em hvac_invoices:', err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nas linhas e links, removendo external_id dos objetos finais
  const linesWithFK = lines.map(line => {
    const { external_id, ...rest } = line;
    return {
      ...rest,
      invoice_id: idMap[line.external_id]
    };
  });
  const linksWithFK = links.map(link => {
    const { external_id, ...rest } = link;
    return {
      ...rest,
      invoice_id: idMap[link.external_id]
    };
  });

  // 5. Upsert linhas e links
  try {
    await sb.upsertInvoiceLines(linesWithFK);
    await sb.upsertInvoiceLinks(linksWithFK);
    console.log(`✅ Invoice lines upserted: ${linesWithFK.length}`);
    console.log(`✅ Invoice links upserted: ${linksWithFK.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em linhas/links:', err.message || err);
    process.exit(1);
  }

  // 6. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
}

main(); 