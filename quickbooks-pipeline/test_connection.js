import QuickBooksClient from './quickbooksClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('🔍 Testando conexão...');
  
  // Testar HVAC primeiro
  console.log('\n=== TESTANDO HVAC ===');
  const qbHvac = new QuickBooksClient('hvac');
  console.log('HVAC Access Token:', qbHvac.accessToken ? '✅ Presente' : '❌ Ausente');
  console.log('HVAC Refresh Token:', qbHvac.refreshToken ? '✅ Presente' : '❌ Ausente');
  console.log('HVAC Realm ID:', qbHvac.realmId);
  
  try {
    const response = await qbHvac.makeRequest('preferences');
    console.log('✅ HVAC - Conexão bem-sucedida!');
    console.log('📊 Preferências obtidas');
  } catch (error) {
    console.error('❌ HVAC - Erro na conexão:', error.message);
  }
  
  // Testar FRAMING
  console.log('\n=== TESTANDO FRAMING ===');
  const qbFraming = new QuickBooksClient('framing');
  console.log('FRAMING Access Token:', qbFraming.accessToken ? '✅ Presente' : '❌ Ausente');
  console.log('FRAMING Refresh Token:', qbFraming.refreshToken ? '✅ Presente' : '❌ Ausente');
  console.log('FRAMING Realm ID:', qbFraming.realmId);
  
  try {
    const response = await qbFraming.makeRequest('preferences');
    console.log('✅ FRAMING - Conexão bem-sucedida!');
    console.log('📊 Preferências obtidas');
  } catch (error) {
    console.error('❌ FRAMING - Erro na conexão:', error.message);
  }
}

testConnection(); 