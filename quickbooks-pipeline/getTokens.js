import QuickBooksClient from './quickbooksClient.js';

const company = process.argv[2];
const authorizationCode = process.argv[3];

if (!company) {
  console.log('❌ Uso: node getTokens.js <empresa> [código_autorização]');
  console.log('📋 Empresas disponíveis: hvac, framing');
  console.log('📋 Exemplo: node getTokens.js hvac');
  console.log('📋 Exemplo: node getTokens.js hvac <código>');
  process.exit(1);
}

if (!['hvac', 'framing'].includes(company)) {
  console.log('❌ Empresa inválida. Use: hvac ou framing');
  process.exit(1);
}

async function main() {
  const qb = new QuickBooksClient(company);
  
  if (!authorizationCode) {
    // Gerar URL de autorização
    await qb.getAuthorizationUrl();
  } else {
    // Trocar código por tokens
    try {
      await qb.exchangeCodeForTokens(authorizationCode);
      console.log('\n✅ Tokens obtidos com sucesso!');
      console.log(`📝 Adicione as variáveis ao seu arquivo .env para a empresa ${company.toUpperCase()}:`);
    } catch (error) {
      console.error('❌ Erro ao obter tokens:', error.message);
      process.exit(1);
    }
  }
}

main(); 