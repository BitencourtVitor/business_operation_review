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
const DATA_FILE = path.join(PIPELINE_DIR, `${company}_vendor_credits.json`);
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
      const backupPath = path.join(BACKUP_DIR, `${company}_vendor_credits_backup_${getTimestamp()}.json`);
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

async function saveVendorCreditsBatch(batch, append = false) {
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

function transformVendorCredits(json) {
  const vendor_credits = [];
  const vendor_credit_lines = [];
  
  for (const vendorCredit of json) {
    vendor_credits.push({
      external_id: vendorCredit.Id,
      doc_number: vendorCredit.DocNumber || null,
      txn_date: vendorCredit.TxnDate || null,
      vendor_id: vendorCredit.VendorRef?.value || null,
      vendor_name: vendorCredit.VendorRef?.name || null,
      total_amount: vendorCredit.TotalAmt || null,
      currency: vendorCredit.CurrencyRef?.value || null,
      ap_account_id: vendorCredit.APAccountRef?.value || null,
      ap_account_name: vendorCredit.APAccountRef?.name || null,
      created_at: vendorCredit.MetaData?.CreateTime || null,
      updated_at: vendorCredit.MetaData?.LastUpdatedTime || null
    });

    // Processar linhas do vendor credit
    if (Array.isArray(vendorCredit.Line)) {
      for (const line of vendorCredit.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail') {
          // Extrair apenas o terceiro pedaço do customer_name (índice 2)
          const fullCustomerName = line.AccountBasedExpenseLineDetail?.CustomerRef?.name || null;
          const customerNameParts = fullCustomerName ? fullCustomerName.split(':') : [];
          const projectName = customerNameParts.length >= 3 ? customerNameParts[2].trim() : fullCustomerName;
          
          vendor_credit_lines.push({
            external_id: vendorCredit.Id,
            external_line_id: line.Id || null,
            line_num: line.LineNum || null,
            description: line.Description || null,
            amount: line.Amount || null,
            detail_type: line.DetailType || null,
            account_ref_id: line.AccountBasedExpenseLineDetail?.AccountRef?.value || null,
            account_ref_name: line.AccountBasedExpenseLineDetail?.AccountRef?.name || null,
            customer_id: line.AccountBasedExpenseLineDetail?.CustomerRef?.value || null,
            customer_name: projectName,
            billable_status: line.AccountBasedExpenseLineDetail?.BillableStatus || null,
            tax_code_ref: line.AccountBasedExpenseLineDetail?.TaxCodeRef?.value || null
          });
        }
      }
    }
  }

  return { vendor_credits, vendor_credit_lines };
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando sincronização de Vendor Credits ---');
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient(company);
  const sb = new SupabaseClient(company);

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allVendorCredits = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM VendorCredit ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando VendorCredit registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.VendorCredit ? response.QueryResponse.VendorCredit : [];
    if (batch.length === 0) break;
    allVendorCredits.push(...batch);
    await saveVendorCreditsBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ Vendor Credits coletados: ${allVendorCredits.length}`);

  // 2. Transformação
  let vendor_credits, vendor_credit_lines;
  try {
    ({ vendor_credits, vendor_credit_lines } = transformVendorCredits(allVendorCredits));
    console.log(`🔄 Transformação concluída: ${vendor_credits.length} vendor credits, ${vendor_credit_lines.length} linhas.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert vendor credits principais e obter mapping external_id -> id
  let idMap;
  try {
    idMap = await sb.upsertVendorCredits(vendor_credits);
    console.log(`✅ Vendor Credits upserted: ${vendor_credits.length}`);
  } catch (err) {
    console.error(`❌ Erro ao upsert em ${company}_vendor_credits:`, err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nas linhas, removendo external_id dos objetos finais
  const linesWithFK = [];
  for (const line of vendor_credit_lines) {
    const { external_id, ...rest } = line;
    const vendor_credit_id = idMap[line.external_id];
    if (!vendor_credit_id) continue;
    linesWithFK.push({ ...rest, vendor_credit_id });
  }

  // 5. Upsert linhas em lote
  try {
    await sb.upsertVendorCreditLines(linesWithFK);
    console.log(`✅ Vendor Credit lines upserted: ${linesWithFK.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em linhas:', err.message || err);
    process.exit(1);
  }

  // 6. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log(`📊 Dados coletados: ${vendor_credits.length} vendor credits, ${vendor_credit_lines.length} linhas`);
  console.log(`💾 Arquivo salvo: ${DATA_FILE}`);
}

main(); 