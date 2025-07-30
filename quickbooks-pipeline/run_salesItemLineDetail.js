import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runSalesItemLineDetail() {
  try {
    console.log('🚀 Iniciando coleta de SalesItemLineDetail...');
    
    const { stdout, stderr } = await execAsync('node salesItemLineDetail.js', {
      cwd: process.cwd()
    });
    
    if (stdout) {
      console.log('✅ Saída:', stdout);
    }
    
    if (stderr) {
      console.log('⚠️  Avisos:', stderr);
    }
    
    console.log('✅ Coleta de SalesItemLineDetail concluída!');
    
  } catch (error) {
    console.error('❌ Erro ao executar coleta de SalesItemLineDetail:', error.message);
  }
}

runSalesItemLineDetail(); 