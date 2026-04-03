import fetch from 'node-fetch';
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';

class WexClient {
  constructor() {
    // URL da planilha WEX
    this.wexUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=168001319";
    
    this.backupDir = path.join(process.cwd(), 'backup');
  }

  // Normalizar strings UTF-8
  normalizeUtf8String(str) {
    if (!str) return '';
    
    try {
      const decoded = str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&aacute;/g, 'á')
        .replace(/&agrave;/g, 'à')
        .replace(/&atilde;/g, 'ã')
        .replace(/&acirc;/g, 'â')
        .replace(/&eacute;/g, 'é')
        .replace(/&egrave;/g, 'è')
        .replace(/&ecirc;/g, 'ê')
        .replace(/&iacute;/g, 'í')
        .replace(/&igrave;/g, 'ì')
        .replace(/&ocirc;/g, 'ô')
        .replace(/&otilde;/g, 'õ')
        .replace(/&ograve;/g, 'ò')
        .replace(/&uacute;/g, 'ú')
        .replace(/&ugrave;/g, 'ù')
        .replace(/&ccedil;/g, 'ç')
        .replace(/&Aacute;/g, 'Á')
        .replace(/&Agrave;/g, 'À')
        .replace(/&Atilde;/g, 'Ã')
        .replace(/&Acirc;/g, 'Â')
        .replace(/&Eacute;/g, 'É')
        .replace(/&Egrave;/g, 'È')
        .replace(/&Ecirc;/g, 'Ê')
        .replace(/&Iacute;/g, 'Í')
        .replace(/&Igrave;/g, 'Ì')
        .replace(/&Ocirc;/g, 'Ô')
        .replace(/&Otilde;/g, 'Õ')
        .replace(/&Ograve;/g, 'Ò')
        .replace(/&Uacute;/g, 'Ú')
        .replace(/&Ugrave;/g, 'Ù')
        .replace(/&Ccedil;/g, 'Ç');
      
      return decoded
        .replace(/\s+/g, ' ')
        .trim();
    } catch (error) {
      console.warn('Erro ao normalizar string UTF-8:', error);
      return str;
    }
  }

  // Parse de data do WEX (formato MM/DD/YYYY)
  parseWexDate(dateStr) {
    if (!dateStr) return null;
    
    try {
      // Formato: MM/DD/YYYY
      const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1, // Mês é 0-indexed
          parseInt(day)
        );
        
        if (isNaN(date.getTime())) {
          throw new Error(`Data inválida: ${dateStr}`);
        }
        
        return date;
      }
      
      throw new Error(`Formato de data inválido: ${dateStr}`);
    } catch (error) {
      console.warn(`Erro ao parsear data '${dateStr}':`, error.message);
      return null;
    }
  }

  // Parse de número decimal
  parseDecimal(value) {
    if (!value || value === '') return null;
    
    try {
      // Remover caracteres não numéricos exceto ponto e vírgula
      const cleanValue = value.toString().replace(/[^\d.,]/g, '');
      
      // Substituir vírgula por ponto se necessário
      const normalizedValue = cleanValue.replace(',', '.');
      
      const parsed = parseFloat(normalizedValue);
      
      if (isNaN(parsed)) {
        throw new Error(`Valor inválido: ${value}`);
      }
      
      return parsed;
    } catch (error) {
      console.warn(`Erro ao parsear decimal '${value}':`, error.message);
      return null;
    }
  }

  // Buscar dados da planilha WEX
  async fetchWexData() {
    try {
      console.log('📥 Buscando dados da planilha WEX...');
      
      const response = await fetch(this.wexUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log(`✅ Dados WEX obtidos: ${csvText.length} caracteres`);
      
      return csvText;
    } catch (error) {
      console.error('❌ Erro ao buscar dados WEX:', error.message);
      throw error;
    }
  }

  // Fazer backup dos dados
  async backupData(data, filename) {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const backupPath = path.join(this.backupDir, filename);
      await fs.writeFile(backupPath, data);
      console.log(`💾 Backup salvo: ${backupPath}`);
    } catch (error) {
      console.warn('⚠️  Erro ao fazer backup:', error.message);
    }
  }

  // Mapear dados CSV para estrutura da tabela (SIMPLIFICADO conforme planejamento)
  mapWexData(csvText) {
    try {
      console.log('🔄 Mapeando dados WEX (simplificado)...');
      
      const { data, errors } = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => this.normalizeUtf8String(value)
      });
      
      if (errors && errors.length > 0) {
        console.warn(`⚠️  ${errors.length} erros de parsing CSV:`, errors);
      }
      
      console.log(`📊 ${data.length} linhas CSV processadas`);
      
      const mappedData = data
        .filter(row => {
          // Filtrar linhas com dados essenciais conforme planejamento
          return row['Transaction Date'] && 
                 row['Transaction Time'] &&
                 row['Emboss Line 2'] && 
                 row['Units'] && 
                 row['Total Fuel Cost'];
        })
        .map((row, index) => {
          try {
            const transactionDate = this.parseWexDate(row['Transaction Date']);
            const units = this.parseDecimal(row['Units']);
            const valor = this.parseDecimal(row['Total Fuel Cost']);
            
            // NOVA CHAVE ÚNICA: Transaction Date + Transaction Time + Emboss Line 2 + Units
            const transactionKey = `${row['Transaction Date']}_${row['Transaction Time']}_${row['Emboss Line 2']}_${row['Units']}`.replace(/\s+/g, '_');
            
            return {
              transaction_key: transactionKey,
              transaction_date: transactionDate,
              nome: row['Emboss Line 2'], // Emboss Line 2
              units: units, // Units
              valor: valor, // Total Fuel Cost
              local: row['Merchant City'] || null // Merchant City
            };
          } catch (error) {
            console.warn(`⚠️  Erro ao mapear linha ${index + 1}:`, error.message);
            return null;
          }
        })
        .filter(item => item !== null);
      
      console.log(`✅ ${mappedData.length} transações mapeadas com sucesso (formato simplificado)`);
      console.log(`🔑 Nova chave única: Transaction Date + Transaction Time + Emboss Line 2 + Units`);
      return mappedData;
      
    } catch (error) {
      console.error('❌ Erro ao mapear dados WEX:', error.message);
      throw error;
    }
  }

  // Buscar e mapear todos os dados
  async fetchAllData() {
    try {
      const csvText = await this.fetchWexData();
      
      // Fazer backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.backupData(csvText, `wex_backup_${timestamp}.csv`);
      
      // Mapear dados
      const mappedData = this.mapWexData(csvText);
      
      return mappedData;
    } catch (error) {
      console.error('❌ Erro ao buscar todos os dados WEX:', error.message);
      throw error;
    }
  }
}

export default WexClient;
