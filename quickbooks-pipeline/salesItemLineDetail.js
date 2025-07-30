import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import QuickBooksClient from './quickbooksClient.js';

dotenv.config();

const PIPELINE_DIR = process.cwd();
const DATA_FILE = path.join(PIPELINE_DIR, 'hvac_SalesItemLineDetail.json');
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
    const backupPath = path.join(BACKUP_DIR, `hvac_SalesItemLineDetail_backup_${getTimestamp()}.json`);
    await fs.copyFile(DATA_FILE, backupPath);
    console.log(`🗄️  Backup criado: ${backupPath}`);
    await fs.unlink(DATA_FILE);
    console.log(`🗑️  Arquivo antigo removido: ${DATA_FILE}`);
  } catch {}
}

async function prepareDataFile() {
  await fs.writeFile(DATA_FILE, '[]', 'utf-8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractSalesItemLineDetails(estimates) {
  const salesItemLineDetails = [];
  
  for (const estimate of estimates) {
    if (Array.isArray(estimate.Line)) {
      for (const line of estimate.Line) {
        if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail) {
          const detail = line.SalesItemLineDetail;
          
          salesItemLineDetails.push({
            estimate_id: estimate.Id,
            line_id: line.Id || null,
            line_num: line.LineNum || null,
            description: line.Description || null,
            amount: line.Amount || null,
            
            // Dados do SalesItemLineDetail
            unit_price: detail.UnitPrice || null,
            quantity: detail.Qty || null,
            item_ref_id: detail.ItemRef?.value || null,
            item_ref_name: detail.ItemRef?.name || null,
            item_account_ref_id: detail.ItemAccountRef?.value || null,
            item_account_ref_name: detail.ItemAccountRef?.name || null,
            tax_code_ref: detail.TaxCodeRef?.value || null,
            tax_classification_ref: detail.TaxClassificationRef?.value || null,
            service_date: detail.ServiceDate || null,
            
            // Dados do customer
            customer_id: estimate.CustomerRef?.value || null,
            customer_name: estimate.CustomerRef?.name || null,
            
            // Dados da estimate
            doc_number: estimate.DocNumber || null,
            txn_date: estimate.TxnDate || null,
            txn_status: estimate.TxnStatus || null,
            total_amount: estimate.TotalAmt || null,
            
            // Campos customizados se disponíveis
            custom_extensions: line.CustomExtensions ? JSON.stringify(line.CustomExtensions) : null,
            
            // Metadados
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }
  
  return salesItemLineDetails;
}

async function main() {
  const startTime = Date.now();
  console.log('--- Iniciando coleta de SalesItemLineDetail de Estimates ---');
  await backupAndDeleteOldJson();
  await prepareDataFile();
  const qb = new QuickBooksClient();

  // Coletar apenas Estimates
  console.log(`📥 Coletando Estimates...`);
  
  let allEstimates = [];
  let startPosition = 1;
  const maxResults = 100;
  
  while (true) {
    let query = `SELECT * FROM Estimate ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    console.log(`📥 Buscando Estimate registros da posição ${startPosition}...`);
    
    try {
      const response = await qb.makeRequest('query', { query });
      const batch = response.QueryResponse && response.QueryResponse.Estimate ? response.QueryResponse.Estimate : [];
      
      if (batch.length === 0) break;
      
      allEstimates.push(...batch);
      
      if (batch.length < maxResults) break;
      startPosition += maxResults;
    } catch (error) {
      console.log(`⚠️  Erro ao buscar Estimates:`, error.message);
      break;
    }
  }
  
  console.log(`✅ Estimates coletados: ${allEstimates.length}`);
  
  // Extrair SalesItemLineDetails dos Estimates
  const salesItemLineDetails = extractSalesItemLineDetails(allEstimates);
  console.log(`✅ SalesItemLineDetails extraídos: ${salesItemLineDetails.length}`);

  // Salvar dados coletados
  await fs.writeFile(DATA_FILE, JSON.stringify(salesItemLineDetails, null, 2), 'utf-8');
  console.log(`💾 Dados salvos em: ${DATA_FILE}`);

  // Logs finais
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('--- Coleta finalizada ---');
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log(`📊 Total de SalesItemLineDetails: ${salesItemLineDetails.length}`);
}

main(); 