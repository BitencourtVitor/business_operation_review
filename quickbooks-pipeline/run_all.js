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

for (const script of scripts) {
  console.log(`\n==============================\nExecutando: ${script}\n==============================`);
  const result = spawnSync('node', [script], { stdio: 'inherit', cwd: __dirname });
  if (result.status !== 0) {
    console.error(`Erro ao executar ${script}. Parando a execução.`);
    process.exit(result.status);
  }
}

console.log('\nTodos os scripts foram executados com sucesso!'); 