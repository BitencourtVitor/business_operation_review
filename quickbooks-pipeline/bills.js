import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';
import SupabaseClient from './supabaseClient.js';

dotenv.config();

// Pegar empresa do argumento da linha de comando ou usar 'hvac' como padrão
const company = process.argv[2] || 'hvac';
console.log(`🏢 Processando empresa: ${company.toUpperCase()}`);

const PIPELINE_DIR = process.cwd();
const DATA_FILE = path.join(PIPELINE_DIR, `${company}_bills.json`);
const BACKUP_DIR = path.join(PIPELINE_DIR, 'backup');

function getTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.access(DATA_FILE);
    const backupPath = path.join(BACKUP_DIR, `${company}_bills_backup_${getTimestamp()}.json`);
    await fs.copyFile(DATA_FILE, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(DATA_FILE);
    console.log(`🗑️  Arquivo antigo removido: ${DATA_FILE}`);
  } catch {}
}

async function prepareDataFile() {
  await fs.writeFile(DATA_FILE, '[]', 'utf-8');
}

async function saveBillsBatch(batch, append = false) {
  const maxRetries = 5;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (append && await fileExists(DATA_FILE)) {
        const prev = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
        await fs.writeFile(DATA_FILE, JSON.stringify([...prev, ...batch], null, 2), 'utf-8');
      } else {
        await fs.writeFile(DATA_FILE, JSON.stringify(batch, null, 2), 'utf-8');
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

function transformBills(json) {
  const bills = [];
  const lines = [];
  const links = [];
  for (const bill of json) {
    bills.push({
      external_id: bill.Id,
      updated_at: bill.MetaData?.LastUpdatedTime || null,
      created_at: bill.MetaData?.CreateTime || null,
      doc_number: bill.DocNumber || null,
      txn_date: bill.TxnDate || null,
      due_date: bill.DueDate || null,
      vendor_id: bill.VendorRef?.value || null,
      vendor_name: bill.VendorRef?.name || null,
      total_amount: bill.TotalAmt || null,
      balance: bill.Balance || null
    });
    if (Array.isArray(bill.Line)) {
      for (const line of bill.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail') {
          let customer_id = null;
          let customer_name = null;
          const custRef = line.AccountBasedExpenseLineDetail?.CustomerRef;
          if (custRef) {
            customer_id = custRef.value || null;
            if (custRef.name) {
              const parts = custRef.name.split(':');
              customer_name = parts[parts.length - 1].trim();
            }
          }
          lines.push({
            external_id: bill.Id,
            line_id: line.Id || null,
            description: line.Description || null,
            amount: line.Amount || null,
            account_ref_id: line.AccountBasedExpenseLineDetail?.AccountRef?.value || null,
            account_ref_name: line.AccountBasedExpenseLineDetail?.AccountRef?.name || null,
            customer_id,
            customer_name
          });
        }
      }
    }
    if (Array.isArray(bill.LinkedTxn)) {
      for (const link of bill.LinkedTxn) {
        links.push({
          external_id: bill.Id,
          txn_id: link.TxnId || null,
          txn_type: link.TxnType || null
        });
      }
    }
  }
  return { bills, lines, links };
}

async function main() {
  const startTime = Date.now();
  console.log(`--- Iniciando sincronização de Bills (${company.toUpperCase()}) ---`);
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient(company);
  const sb = new SupabaseClient(company);

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allBills = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM Bill ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando Bill registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.Bill ? response.QueryResponse.Bill : [];
    if (batch.length === 0) break;
    allBills.push(...batch);
    await saveBillsBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ Bills coletados: ${allBills.length}`);

  // 2. Transformação
  let bills, lines, links;
  try {
    ({ bills, lines, links } = transformBills(allBills));
    console.log(`🔄 Transformação concluída: ${bills.length} bills, ${lines.length} linhas, ${links.length} links.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert bills principais e obter mapping external_id -> id
  let idMap;
  try {
    idMap = await sb.upsertBills(bills);
    console.log(`✅ Bills upserted: ${bills.length}`);
  } catch (err) {
    console.error(`❌ Erro ao upsert em ${company}_bills:`, err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nas linhas e links, removendo external_id dos objetos finais
  const linesWithFK = [];
  for (const line of lines) {
    const { external_id, ...rest } = line;
    const bill_id = idMap[line.external_id];
    if (!bill_id) continue;
    linesWithFK.push({ ...rest, bill_id });
  }
  const linksWithFK = [];
  for (const link of links) {
    const { external_id, ...rest } = link;
    const bill_id = idMap[link.external_id];
    if (!bill_id) continue;
    linksWithFK.push({ ...rest, bill_id });
  }

  // 5. Upsert linhas e links em lote
  try {
    await sb.upsertBillLines(linesWithFK);
    await sb.upsertBillLinks(linksWithFK);
    console.log(`✅ Bill lines upserted: ${linesWithFK.length}`);
    console.log(`✅ Bill links upserted: ${linksWithFK.length}`);
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