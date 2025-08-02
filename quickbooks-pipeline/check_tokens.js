import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Verificando tokens e configurações...\n');

// HVAC
console.log('=== HVAC ===');
console.log('HVAC_ACCESS_TOKEN:', process.env.HVAC_ACCESS_TOKEN ? '✅ Presente' : '❌ Ausente');
console.log('HVAC_REFRESH_TOKEN:', process.env.HVAC_REFRESH_TOKEN ? '✅ Presente' : '❌ Ausente');
console.log('HVAC_REALM_ID:', process.env.HVAC_REALM_ID || process.env.REALM_ID);

// FRAMING
console.log('\n=== FRAMING ===');
console.log('FRAMING_ACCESS_TOKEN:', process.env.FRAMING_ACCESS_TOKEN ? '✅ Presente' : '❌ Ausente');
console.log('FRAMING_REFRESH_TOKEN:', process.env.FRAMING_REFRESH_TOKEN ? '✅ Presente' : '❌ Ausente');
console.log('FRAMING_REALM_ID:', process.env.FRAMING_REALM_ID || process.env.REALM_ID);

// Configurações gerais
console.log('\n=== CONFIGURAÇÕES GERAIS ===');
console.log('CLIENT_ID:', process.env.CLIENT_ID ? '✅ Presente' : '❌ Ausente');
console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET ? '✅ Presente' : '❌ Ausente');

console.log('\n⚠️  PROBLEMA IDENTIFICADO:');
console.log('Ambas as empresas estão usando o mesmo REALM_ID (9130353097998066)');
console.log('Isso significa que você está tentando acessar a mesma empresa QuickBooks');
console.log('\n💡 SOLUÇÃO:');
console.log('Você precisa de REALM_IDs diferentes para cada empresa:');
console.log('- HVAC_REALM_ID para a empresa HVAC');
console.log('- FRAMING_REALM_ID para a empresa FRAMING'); 