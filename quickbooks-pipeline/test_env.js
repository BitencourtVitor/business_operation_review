import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Verificando variáveis de ambiente do Supabase...\n');

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Presente' : '❌ Ausente');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ Presente' : '❌ Ausente');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Presente' : '❌ Ausente');

if (process.env.SUPABASE_URL) {
  console.log('URL:', process.env.SUPABASE_URL.substring(0, 50) + '...');
}

if (process.env.SUPABASE_KEY) {
  console.log('Key:', process.env.SUPABASE_KEY.substring(0, 20) + '...');
}

console.log('\n💡 Dica: Se as variáveis estão ausentes, verifique se o arquivo .env está na pasta correta'); 