import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';
import SupabaseClient from './supabaseClient.js';

dotenv.config();

// Ler empresa do argumento da linha de comando
const company = process.argv[2] || 'hvac';
console.log(`🏢 Processando empresa: ${company.toUpperCase()}`);

const PIPELINE_DIR = process.cwd();
const DATA_FILE = path.join(PIPELINE_DIR, `${company}_billpayments.json`);
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
    const backupPath = path.join(BACKUP_DIR, `${company}_billpayments_backup_${getTimestamp()}.json`);
    await fs.copyFile(DATA_FILE, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(DATA_FILE);
    console.log(`🗑️  Arquivo antigo removido: ${DATA_FILE}`);
  } catch {}
}

async function prepareDataFile() {
  await fs.writeFile(DATA_FILE, '[]', 'utf-8');
}

async function saveBillPaymentsBatch(batch, append = false) {
  if (append && await fileExists(DATA_FILE)) {
    const prev = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
    await fs.writeFile(DATA_FILE, JSON.stringify([...prev, ...batch], null, 2), 'utf-8');
  } else {
    await fs.writeFile(DATA_FILE, JSON.stringify(batch, null, 2), 'utf-8');
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

function transformBillPayments(json) {
  const bill_payments = [];
  const bill_payment_links = [];
  for (const bp of json) {
    bill_payments.push({
      external_id: bp.Id, // id do QuickBooks
      vendor_id: bp.VendorRef?.value,
      vendor_name: bp.VendorRef?.name || null,
      pay_type: bp.PayType,
      total_amount: bp.TotalAmt,
      currency: bp.CurrencyRef?.value || null,
      txn_date: bp.TxnDate,
      doc_number: bp.DocNumber || null,
      private_note: bp.PrivateNote || null,
      bank_account_id: bp.PayType === 'Check' ? bp.CheckPayment?.BankAccountRef?.value || null : null,
      bank_account_name: bp.PayType === 'Check' ? bp.CheckPayment?.BankAccountRef?.name || null : null,
      cc_account_id: bp.PayType === 'CreditCard' ? bp.CreditCardPayment?.CCAccountRef?.value || null : null,
      cc_account_name: bp.PayType === 'CreditCard' ? bp.CreditCardPayment?.CCAccountRef?.name || null : null,
      created_at: bp.MetaData?.CreateTime || null,
      updated_at: bp.MetaData?.LastUpdatedTime || null,
    });
    if (Array.isArray(bp.Line)) {
      for (const line of bp.Line) {
        if (Array.isArray(line.LinkedTxn)) {
          for (const linked of line.LinkedTxn) {
            bill_payment_links.push({
              external_id: bp.Id, // para mapear depois
              txn_id: linked.TxnId,
              txn_type: linked.TxnType,
              amount: line.Amount,
            });
          }
        }
      }
    }
  }
  return { bill_payments, bill_payment_links };
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando sincronização de Bill Payments ---');
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient(company);
  const sb = new SupabaseClient(company);

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allBillPayments = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM BillPayment ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando BillPayment registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.BillPayment ? response.QueryResponse.BillPayment : [];
    if (batch.length === 0) break;
    allBillPayments.push(...batch);
    await saveBillPaymentsBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ BillPayments coletados: ${allBillPayments.length}`);

  // 2. Transformação
  let bill_payments, bill_payment_links;
  try {
    ({ bill_payments, bill_payment_links } = transformBillPayments(allBillPayments));
    console.log(`🔄 Transformação concluída: ${bill_payments.length} bill_payments, ${bill_payment_links.length} links.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert bill_payments principais e obter mapping external_id -> id (UUID)
  let idMap;
  try {
    idMap = await sb.upsertBillPayments(bill_payments);
    console.log(`✅ BillPayments upserted: ${bill_payments.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em bill_payments:', err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nos links, removendo external_id e usando bill_payment_id (UUID)
  const linksWithFK = bill_payment_links.map(link => {
    const { external_id, ...rest } = link;
    const bill_payment_id = idMap[link.external_id];
    if (!bill_payment_id) return null;
    return { ...rest, bill_payment_id };
  }).filter(Boolean);

  // 5. Upsert bill_payment_links
  try {
    await sb.upsertBillPaymentLinks(linksWithFK);
    console.log(`✅ BillPayment links upserted: ${linksWithFK.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em bill_payment_links:', err.message || err);
    process.exit(1);
  }

  // 5. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
}

main(); 