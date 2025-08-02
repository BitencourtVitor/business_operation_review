import { spawnSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const scripts = [
  'bills.js',
  'bill_payments.js',
  'estimates.js',
  'invoices.js',
  'payments.js',
  'purchase.js',
  'vendor_credit.js',
  'deposit.js',
];

const companies = ['hvac', 'framing'];

for (const company of companies) {
  console.log(`\n🏢 ==========================================`);
  console.log(`🏢 PROCESSANDO EMPRESA: ${company.toUpperCase()}`);
  console.log(`🏢 ==========================================`);
  
  for (const script of scripts) {
    console.log(`\n==============================\nExecutando: ${script} para ${company.toUpperCase()}\n==============================`);
    const result = spawnSync('node', [script, company], { stdio: 'inherit', cwd: __dirname });
    if (result.status !== 0) {
      console.error(`Erro ao executar ${script} para ${company}. Parando a execução.`);
      process.exit(result.status);
    }
  }
}

console.log('\n✅ Todos os scripts foram executados com sucesso para todas as empresas!'); 