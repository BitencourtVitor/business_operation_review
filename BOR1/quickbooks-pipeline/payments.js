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
const DATA_FILE = path.join(PIPELINE_DIR, `${company}_payments.json`);
const BACKUP_DIR = path.join(PIPELINE_DIR, 'backup');

function getTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    // Verificar se o arquivo existe antes de tentar acessá-lo
    if (await fileExists(DATA_FILE)) {
      const backupPath = path.join(BACKUP_DIR, `${company}_payments_backup_${getTimestamp()}.json`);
      await fs.copyFile(DATA_FILE, backupPath);
      console.log(`🗄️  Backup criado: ${backupPath}`);
      
      // Aguardar um pouco antes de tentar deletar o arquivo
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.unlink(DATA_FILE);
      console.log(`🗑️  Arquivo antigo removido: ${DATA_FILE}`);
    } else {
      console.log(`ℹ️  Arquivo ${DATA_FILE} não existe, pulando backup`);
    }
  } catch (error) {
    console.error(`⚠️  Erro durante backup: ${error.message}`);
    // Não falhar se o backup der erro
  }
}

async function prepareDataFile() {
  try {
    // Garantir que o diretório existe
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    // Tentar criar o arquivo com tratamento de erro mais robusto
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
    console.log(`✅ Arquivo de dados preparado: ${DATA_FILE}`);
  } catch (error) {
    console.error(`❌ Erro ao preparar arquivo de dados: ${error.message}`);
    throw error;
  }
}

async function savePaymentsBatch(batch, append = false) {
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

function parseLineExAny(lineEx) {
  // LineEx.any pode ser um array ou objeto
  if (!lineEx || !lineEx.any) return {};
  let anyArr = Array.isArray(lineEx.any) ? lineEx.any : [lineEx.any];
  let result = {};
  for (const anyObj of anyArr) {
    if (anyObj && anyObj['@name'] === 'TxnOpenBalance') {
      result.txnOpenBalance = anyObj['#text'] || null;
    }
    if (anyObj && anyObj['@name'] === 'TxnReferenceNumber') {
      result.txnReferenceNumber = anyObj['#text'] || null;
    }
  }
  return result;
}

function transformPayments(json) {
  const payments = [];
  const payment_links = [];
  for (const payment of json) {
    payments.push({
      id: payment.Id,
      customer_id: payment.CustomerRef?.value || null,
      customer_name: payment.CustomerRef?.name || null,
      total_amount: payment.TotalAmt || null,
      currency: payment.CurrencyRef?.name || null,
      payment_ref: payment.PaymentRefNum || null,
      payment_method_id: payment.PaymentMethodRef?.value || null,
      deposit_account_id: payment.DepositToAccountRef?.value || null,
      private_note: payment.PrivateNote || null,
      txn_date: payment.TxnDate || null,
      created_at: payment.MetaData?.CreateTime || null,
      updated_at: payment.MetaData?.LastUpdatedTime || null
    });
    if (Array.isArray(payment.Line)) {
      for (const line of payment.Line) {
        if (Array.isArray(line.LinkedTxn)) {
          for (const linked of line.LinkedTxn) {
            const extra = parseLineExAny(line.LineEx);
            payment_links.push({
              payment_id: payment.Id,
              txn_id: linked.TxnId || null,
              txn_type: linked.TxnType || null,
              amount: line.Amount || null,
              open_balance: extra.txnOpenBalance || null,
              reference_number: extra.txnReferenceNumber || null
            });
          }
        }
      }
    }
  }
  return { payments, payment_links };
}

async function main() {
  const startTime = Date.now();
  const runId = process.env.QB_RUN_ID || null;
  let rowsFetched = 0, rowsSent = 0;
  const sb = new SupabaseClient(company);

  try {
    console.log(`--- Iniciando sincronização de Payments (${company.toUpperCase()}) ---`);
    await backupAndDeleteOldJson();
    await prepareDataFile();
    const qb = new QuickBooksClient(company);

    // 1. Coleta paginada
    let allPayments = [];
    let startPosition = 1;
    const maxResults = 100;
    while (true) {
      const query = `SELECT * FROM Payment ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      console.log(`📥 Buscando Payment registros da posição ${startPosition}...`);
      const response = await qb.makeRequest('query', { query });
      const batch = response.QueryResponse?.Payment ?? [];
      if (batch.length === 0) break;
      allPayments.push(...batch);
      if (batch.length < maxResults) break;
      startPosition += maxResults;
    }
    rowsFetched = allPayments.length;
    console.log(`✅ Payments coletados: ${rowsFetched}`);

    // 2. Transformação
    const { payments, payment_links } = transformPayments(allPayments);
    rowsSent = payments.length;
    console.log(`🔄 Transformação concluída: ${payments.length} payments, ${payment_links.length} links.`);

    // 3. Upsert payments principais
    await sb.upsertPayments(payments);
    console.log(`✅ Payments upserted: ${payments.length}`);

    // 4. Upsert payment_links
    await sb.upsertPaymentLinks(payment_links);
    console.log(`✅ Payment links upserted: ${payment_links.length}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('--- Sincronização finalizada ---');
    console.log(`⏱️  Tempo total: ${elapsed}s`);

    await sb.logSync({ runId, script: 'payments', rowsFetched, rowsSent, status: 'success', durationMs: Date.now() - startTime });
  } catch (err) {
    console.error('❌ Erro fatal:', err.message || err);
    await sb.logSync({ runId, script: 'payments', rowsFetched, rowsSent, status: 'error', errorMessage: err.message || String(err), durationMs: Date.now() - startTime });
    process.exit(1);
  }
}

main(); 