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
const DATA_FILE = path.join(PIPELINE_DIR, `${company}_deposits.json`);
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
      const backupPath = path.join(BACKUP_DIR, `${company}_deposits_backup_${getTimestamp()}.json`);
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

async function saveDepositsBatch(batch, append = false) {
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

function transformDeposits(json) {
  const deposits = [];
  const deposit_lines = [];
  
  for (const deposit of json) {
    deposits.push({
      external_id: deposit.Id,
      doc_number: deposit.DocNumber || null,
      txn_date: deposit.TxnDate || null,
      total_amount: deposit.TotalAmt || null,
      currency: deposit.CurrencyRef?.value || null,
      private_note: deposit.PrivateNote || null,
      deposit_account_id: deposit.DepositToAccountRef?.value || null,
      deposit_account_name: deposit.DepositToAccountRef?.name || null,
      created_at: deposit.MetaData?.CreateTime || null,
      updated_at: deposit.MetaData?.LastUpdatedTime || null
    });

    // Processar linhas do deposit (onde estão os Back Charges)
    if (Array.isArray(deposit.Line)) {
      for (const line of deposit.Line) {
        // Extrair customer_id e customer_name do DepositLineDetail.Entity
        let customer_id = null;
        let customer_name = null;
        
        if (line.DepositLineDetail?.Entity?.type === 'CUSTOMER') {
          customer_id = line.DepositLineDetail.Entity.value;
          customer_name = line.DepositLineDetail.Entity.name;
          
          // Tratar o customer_name para extrair apenas o terceiro pedaço (índice 2)
          if (customer_name) {
            const customerNameParts = customer_name.split(':');
            customer_name = customerNameParts.length >= 3 ? customerNameParts[2].trim() : customer_name;
          }
        }
        
        deposit_lines.push({
          external_id: deposit.Id,
          external_line_id: line.Id || null,
          line_num: line.LineNum || null,
          description: line.Description || null,
          amount: line.Amount || null,
          memo: line.Memo || null,
          payment_method_id: line.PaymentMethodRef?.value || null,
          payment_method_name: line.PaymentMethodRef?.name || null,
          customer_id: customer_id,
          customer_name: customer_name,
          account_id: line.AccountRef?.value || null,
          account_name: line.AccountRef?.name || null
        });
      }
    }
  }

  return { deposits, deposit_lines };
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando sincronização de Deposits ---');
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient(company);
  const sb = new SupabaseClient(company);

  // 1. Coleta paginada e salvamento incremental do JSON bruto
  let allDeposits = [];
  let startPosition = 1;
  const maxResults = 100;
  while (true) {
    let query = `SELECT * FROM Deposit ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando Deposit registros da posição ${startPosition}...`);
    const response = await qb.makeRequest('query', { query });
    const batch = response.QueryResponse && response.QueryResponse.Deposit ? response.QueryResponse.Deposit : [];
    if (batch.length === 0) break;
    allDeposits.push(...batch);
    await saveDepositsBatch(batch, startPosition > 1);
    if (batch.length < maxResults) break;
    startPosition += maxResults;
  }
  console.log(`✅ Deposits coletados: ${allDeposits.length}`);

  // 2. Transformação
  let deposits, deposit_lines;
  try {
    ({ deposits, deposit_lines } = transformDeposits(allDeposits));
    console.log(`🔄 Transformação concluída: ${deposits.length} deposits, ${deposit_lines.length} linhas.`);
  } catch (err) {
    console.error('❌ Erro na transformação dos dados:', err.message || err);
    process.exit(1);
  }

  // 3. Upsert deposits principais e obter mapping external_id -> id
  let idMap;
  try {
    idMap = await sb.upsertDeposits(deposits);
    console.log(`✅ Deposits upserted: ${deposits.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em hvac_deposits:', err.message || err);
    process.exit(1);
  }

  // 4. Ajustar FKs nas linhas, removendo external_id dos objetos finais
  const linesWithFK = [];
  for (const line of deposit_lines) {
    const { external_id, ...rest } = line;
    const deposit_id = idMap[line.external_id];
    if (!deposit_id) continue;
    linesWithFK.push({ ...rest, deposit_id });
  }

  // 5. Upsert linhas em lote
  try {
    await sb.upsertDepositLines(linesWithFK);
    console.log(`✅ Deposit lines upserted: ${linesWithFK.length}`);
  } catch (err) {
    console.error('❌ Erro ao upsert em linhas:', err.message || err);
    process.exit(1);
  }

  // 6. Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Sincronização finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log(`📊 Dados coletados: ${deposits.length} deposits, ${deposit_lines.length} linhas`);
  console.log(`💾 Arquivo salvo: ${DATA_FILE}`);
}

main(); 