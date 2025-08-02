import QuickBooksClient from './quickbooksClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugRequest() {
  console.log('🔍 Debugando requisição...\n');
  
  const qb = new QuickBooksClient('hvac');
  
  console.log('=== CONFIGURAÇÕES ===');
  console.log('Company:', qb.company);
  console.log('Realm ID:', qb.realmId);
  console.log('API URL:', qb.apiUrl);
  console.log('Access Token:', qb.accessToken ? '✅ Presente' : '❌ Ausente');
  console.log('Client ID:', qb.clientId ? '✅ Presente' : '❌ Ausente');
  
  // Construir URL manualmente
  const url = new URL(`${qb.apiUrl}/${qb.realmId}/companyinfo`);
  console.log('\n=== URL CONSTRUÍDA ===');
  console.log('URL completa:', url.toString());
  
  console.log('\n=== TESTANDO REQUISIÇÃO ===');
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${qb.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Erro completo:', errorText);
    } else {
      const data = await response.json();
      console.log('Resposta:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Erro na requisição:', error.message);
  }
}

debugRequest(); 