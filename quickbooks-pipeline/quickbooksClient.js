import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

class QuickBooksClient {
  constructor(company = 'hvac') {
    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
    
    // Realm ID específico por empresa
    if (company === 'hvac') {
      this.realmId = process.env.HVAC_REALM_ID || process.env.REALM_ID;
      this.accessToken = process.env.HVAC_ACCESS_TOKEN;
      this.refreshToken = process.env.HVAC_REFRESH_TOKEN;
    } else if (company === 'framing') {
      this.realmId = process.env.FRAMING_REALM_ID || process.env.REALM_ID;
      this.accessToken = process.env.FRAMING_ACCESS_TOKEN;
      this.refreshToken = process.env.FRAMING_REFRESH_TOKEN;
    } else if (company === 'pcg') {
      this.realmId = process.env.PCG_REALM_ID || process.env.REALM_ID;
      this.accessToken = process.env.PCG_ACCESS_TOKEN;
      this.refreshToken = process.env.PCG_REFRESH_TOKEN;
    } else {
      // Fallback para compatibilidade
      this.realmId = process.env.REALM_ID;
      this.accessToken = process.env.ACCESS_TOKEN;
      this.refreshToken = process.env.REFRESH_TOKEN;
    }
    
    this.company = company;
    
    // URL de autorização correta para produção e sandbox
    this.authUrl = 'https://appcenter.intuit.com/connect/oauth2';
    // Endpoint de token para produção e sandbox
    this.tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    // Endpoint de API para produção
    this.apiUrl = 'https://quickbooks.api.intuit.com/v3/company';
  }

  async getAuthorizationUrl() {
    const authUrl = `${this.authUrl}?client_id=${this.clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI || 'http://localhost:3000/callback')}&state=teststate`;
    
    console.log('\n🔗 URL de Autorização OAuth2:');
    console.log(authUrl);
    console.log('\n📋 Instruções:');
    console.log('1. Acesse a URL acima no navegador');
    console.log('2. Faça login no QuickBooks');
    console.log('3. Autorize o aplicativo');
    console.log('4. Copie o código da URL de retorno');
    console.log('5. Use o código com: node getTokens.js <CODIGO>\n');
    
    return authUrl;
  }

  async exchangeCodeForTokens(authorizationCode) {
    try {
      console.log('🔄 Trocando código por tokens...');
      
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: process.env.REDIRECT_URI || 'http://localhost:3000/callback'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to exchange code for tokens: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      console.log('✅ Tokens obtidos com sucesso!');
      console.log('📝 Adicione ao seu arquivo .env:');
      
      if (this.company === 'hvac') {
        console.log(`HVAC_ACCESS_TOKEN=${data.access_token}`);
        console.log(`HVAC_REFRESH_TOKEN=${data.refresh_token}`);
      } else if (this.company === 'framing') {
        console.log(`FRAMING_ACCESS_TOKEN=${data.access_token}`);
        console.log(`FRAMING_REFRESH_TOKEN=${data.refresh_token}`);
      } else if (this.company === 'pcg') {
        console.log(`PCG_ACCESS_TOKEN=${data.access_token}`);
        console.log(`PCG_REFRESH_TOKEN=${data.refresh_token}`);
      } else {
        console.log(`ACCESS_TOKEN=${data.access_token}`);
        console.log(`REFRESH_TOKEN=${data.refresh_token}`);
      }
      
      console.log(`\n⏰ Access Token expira em: ${data.expires_in} segundos`);
      console.log(`🔄 Refresh Token expira em: ${data.refresh_token_expires_in} segundos (${Math.round(data.refresh_token_expires_in / 86400)} dias)`);
      
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      
      return data;
    } catch (error) {
      console.error('❌ Erro ao trocar código por tokens:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {     
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      
      console.log('✅ Access token renovado com sucesso');
      console.log(`⏰ Novo token expira em: ${data.expires_in} segundos`);
      
      // Atualizar variáveis de ambiente se possível
      if (this.company === 'hvac') {
        if (process.env.HVAC_ACCESS_TOKEN) {
          process.env.HVAC_ACCESS_TOKEN = this.accessToken;
        }
        if (process.env.HVAC_REFRESH_TOKEN) {
          process.env.HVAC_REFRESH_TOKEN = this.refreshToken;
        }
      } else if (this.company === 'framing') {
        if (process.env.FRAMING_ACCESS_TOKEN) {
          process.env.FRAMING_ACCESS_TOKEN = this.accessToken;
        }
        if (process.env.FRAMING_REFRESH_TOKEN) {
          process.env.FRAMING_REFRESH_TOKEN = this.refreshToken;
        }
      } else if (this.company === 'pcg') {
        if (process.env.PCG_ACCESS_TOKEN) {
          process.env.PCG_ACCESS_TOKEN = this.accessToken;
        }
        if (process.env.PCG_REFRESH_TOKEN) {
          process.env.PCG_REFRESH_TOKEN = this.refreshToken;
        }
      } else {
        if (process.env.ACCESS_TOKEN) {
          process.env.ACCESS_TOKEN = this.accessToken;
        }
        if (process.env.REFRESH_TOKEN) {
          process.env.REFRESH_TOKEN = this.refreshToken;
        }
      }
      
      return this.accessToken;
    } catch (error) {
      console.error('❌ Erro ao renovar access token:', error);
      throw error;
    }
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const url = new URL(`${this.apiUrl}/${this.realmId}/${endpoint}`);
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        console.log('🔑 Token expirado, renovando...');
        await this.refreshAccessToken();
        return this.makeRequest(endpoint, params);
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Erro na requisição para ${endpoint}:`, error);
      throw error;
    }
  }

  async fetchAllRecords(entity, startDate = null, endDate = null) {
    const records = [];
    let startPosition = 1;
    const maxResults = parseInt(process.env.BATCH_SIZE) || 100;

    while (true) {
      let query = `SELECT * FROM ${entity} ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      if (startDate && endDate) {
        query = `SELECT * FROM ${entity} WHERE MetaData.LastUpdatedTime >= '${startDate}' AND MetaData.LastUpdatedTime <= '${endDate}' ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      } else if (startDate) {
        query = `SELECT * FROM ${entity} WHERE MetaData.LastUpdatedTime >= '${startDate}' ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      } else if (endDate) {
        query = `SELECT * FROM ${entity} WHERE MetaData.LastUpdatedTime <= '${endDate}' ORDER BY MetaData.LastUpdatedTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      }

      console.log(`📥 Buscando ${entity} registros da posição ${startPosition}...`);
      const response = await this.makeRequest('query', { query });

      if (!response.QueryResponse || !response.QueryResponse[entity]) {
        break;
      }

      const batch = response.QueryResponse[entity];
      records.push(...batch);

      if (batch.length < maxResults) {
        break;
      }

      startPosition += maxResults;
    }

    console.log(`✅ Total de ${entity} registros obtidos: ${records.length}`);
    return records;
  }

  async fetchUpdatedRecords(entity, lastUpdatedTime) {
    const records = [];
    let startPosition = 1;
    const maxResults = parseInt(process.env.BATCH_SIZE) || 100;

    while (true) {
      console.log(`📥 Buscando ${entity} atualizados da posição ${startPosition}...`);
      
      const response = await this.makeRequest(`query`, {
        query: `SELECT * FROM ${entity} WHERE MetaData.LastUpdatedTime >= '${lastUpdatedTime}' ORDER BY MetaData.LastUpdatedTime DESC`
      });

      if (!response.QueryResponse || !response.QueryResponse[entity]) {
        break;
      }

      const batch = response.QueryResponse[entity];
      records.push(...batch);

      if (batch.length < maxResults) {
        break;
      }

      startPosition += maxResults;
    }

    console.log(`✅ Total de ${entity} atualizados obtidos: ${records.length}`);
    return records;
  }

  async getEntities() {
    return ['Estimate', 'Invoice', 'Payment', 'Bill', 'BillPayment'];
  }

  async validateConnection() {
    try {
      console.log('🔍 Validando conexão com QuickBooks...');
      const response = await this.makeRequest('companyinfo');
      console.log('✅ Conexão válida!');
      console.log(`🏢 Empresa: ${response.CompanyInfo.CompanyName}`);
      return true;
    } catch (error) {
      console.error('❌ Erro na validação da conexão:', error);
      return false;
    }
  }
}

export default QuickBooksClient; 