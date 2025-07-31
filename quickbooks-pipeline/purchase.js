import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';
import SupabaseClient from './supabaseClient.js';

dotenv.config();

const PIPELINE_DIR = process.cwd();
const DATA_FILE = path.join(PIPELINE_DIR, 'hvac_purchases.json');
const BACKUP_DIR = path.join(PIPELINE_DIR, 'backup');

function getTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function backupAndDeleteOldJson() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    // Verificar se o arquivo existe antes de tentar fazer backup
    const fileExists = await fs.access(DATA_FILE).then(() => true).catch(() => false);
    
    if (fileExists) {
      const backupPath = path.join(BACKUP_DIR, `hvac_purchases_backup_${getTimestamp()}.json`);
      await fs.copyFile(DATA_FILE, backupPath);
      console.log(`🗄️  Backup criado: ${backupPath}`);
      await fs.unlink(DATA_FILE);
      console.log(`🗑️  Arquivo antigo removido: ${DATA_FILE}`);
    } else {
      console.log(`ℹ️  Arquivo ${DATA_FILE} não existe, pulando backup`);
    }
  } catch (error) {
    console.log(`⚠️  Erro no backup: ${error.message}`);
  }
}

async function prepareDataFile() {
  try {
    // Garantir que o diretório existe
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    // Criar o arquivo com array vazio
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
    console.log(`📄 Arquivo de dados preparado: ${DATA_FILE}`);
  } catch (error) {
    console.error(`❌ Erro ao preparar arquivo de dados: ${error.message}`);
    throw error;
  }
}

async function savePurchasesBatch(batch, append = false) {
  try {
    if (append && await fileExists(DATA_FILE)) {
      const prev = JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
      await fs.writeFile(DATA_FILE, JSON.stringify([...prev, ...batch], null, 2), 'utf-8');
    } else {
      await fs.writeFile(DATA_FILE, JSON.stringify(batch, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error(`❌ Erro ao salvar batch: ${error.message}`);
    throw error;
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

function transformPurchases(json) {
  const purchases = [];
  const purchase_lines = [];
  
  for (const purchase of json) {
    purchases.push({
      external_id: purchase.Id,
      payment_type: purchase.PaymentType || null,
      total_amount: purchase.TotalAmt || null,
      currency: purchase.CurrencyRef?.value || null,
      txn_date: purchase.TxnDate || null,
      private_note: purchase.PrivateNote || null,
      account_ref_id: purchase.AccountRef?.value || null,
      account_ref_name: purchase.AccountRef?.name || null,
      created_at: purchase.MetaData?.CreateTime || null,
      updated_at: purchase.MetaData?.LastUpdatedTime || null
    });

    // Processar linhas do purchase
    if (Array.isArray(purchase.Line)) {
      for (const line of purchase.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail') {
          purchase_lines.push({
            external_id: purchase.Id,
            external_line_id: line.Id || null,
            description: line.Description || null,
            amount: line.Amount || null,
            detail_type: line.DetailType || null,
            account_ref_id: line.AccountBasedExpenseLineDetail?.AccountRef?.value || null,
            account_ref_name: line.AccountBasedExpenseLineDetail?.AccountRef?.name || null,
            customer_id: line.AccountBasedExpenseLineDetail?.CustomerRef?.value || null,
            customer_name: line.AccountBasedExpenseLineDetail?.CustomerRef?.name || null,
            billable_status: line.AccountBasedExpenseLineDetail?.BillableStatus || null,
            tax_code_ref: line.AccountBasedExpenseLineDetail?.TaxCodeRef?.value || null
          });
        }
      }
    }
  }

  return { purchases, purchase_lines };
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando sincronização de Purchases ---');
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient();
  const sb = new SupabaseClient();

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allPurchases = [];
  let startPosition = 1;
  const maxResults = 100;
  
  try {
    while (true) {
      let query = `SELECT * FROM Purchase ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      console.log(`📥 Buscando Purchase registros da posição ${startPosition}...`);
      
      const response = await qb.makeRequest('query', { query });
      const batch = response.QueryResponse && response.QueryResponse.Purchase ? response.QueryResponse.Purchase : [];
      
      if (batch.length === 0) break;
      
      allPurchases.push(...batch);
      await savePurchasesBatch(batch, startPosition > 1);
      
      if (batch.length < maxResults) break;
      startPosition += maxResults;
    }
    console.log(`✅ Purchases coletados: ${allPurchases.length}`);
  } catch (error) {
    console.error(`❌ Erro na coleta de dados: ${error.message}`);
    throw error;
  }

  // 2. Transformação
  let purchases, purchase_lines;
  try {
    ({ purchases, purchase_lines } = transformPurchases(allPurchases));
    console.log(`🔄 Transformação concluída: ${purchases.length} purchases, ${purchase_lines.length} linhas.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert purchases principais e obter mapping external_id -> id
  let idMap;
  try {
    idMap = await sb.upsertPurchases(purchases);
    console.log(`✅ Purchases upserted: ${purchases.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em hvac_purchases:', err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nas linhas, removendo external_id dos objetos finais
  const linesWithFK = [];
  for (const line of purchase_lines) {
    const { external_id, ...rest } = line;
    const purchase_id = idMap[line.external_id];
    if (!purchase_id) continue;
    linesWithFK.push({ ...rest, purchase_id });
  }

  // 5. Upsert linhas em lote
  try {
    await sb.upsertPurchaseLines(linesWithFK);
    console.log(`✅ Purchase lines upserted: ${linesWithFK.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em linhas:', err.message || err);
    process.exit(1);
  }

  // 6. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log(`📊 Dados coletados: ${purchases.length} purchases, ${purchase_lines.length} linhas`);
  console.log(`💾 Arquivo salvo: ${DATA_FILE}`);
}

main();
