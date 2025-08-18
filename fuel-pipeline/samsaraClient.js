import fetch from 'node-fetch';
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';

class SamsaraClient {
  constructor() {
    // URLs das planilhas do Samsara
    this.idleEventsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=0";
    this.tripsUrl = "https://docs.google.com/spreadsheets/d/1YK4ui9pmcgkLMTTxym4J5yRvojqMBxWt-bIKPKazP20/export?format=csv&gid=2085020611";
    
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

  // Parse de data do Samsara
  parseSamsaraDate(dateStr) {
    if (!dateStr) return null;
    
    try {
      const cleanDateStr = dateStr.replace(/\s+(EDT|EST|CST|MST|PST|UTC|GMT)$/i, '');
      
      const dateMatch = cleanDateStr.match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)$/i);
      
      if (dateMatch) {
        const [, month, day, year, hour, minute, ampm] = dateMatch;
        
        const monthMap = {
          'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
          'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };
        
        const monthNum = monthMap[month.toLowerCase()];
        if (monthNum === undefined) {
          throw new Error(`Mês inválido: ${month}`);
        }
        
        let hourNum = parseInt(hour);
        if (ampm.toUpperCase() === 'PM' && hourNum !== 12) {
          hourNum += 12;
        } else if (ampm.toUpperCase() === 'AM' && hourNum === 12) {
          hourNum = 0;
        }
        
        const date = new Date(
          parseInt(year),
          monthNum,
          parseInt(day),
          hourNum,
          parseInt(minute)
        );
        
        if (isNaN(date.getTime())) {
          throw new Error('Data inválida após parse manual');
        }
        
        return date;
      }
      
      const date = new Date(cleanDateStr);
      if (isNaN(date.getTime())) {
        throw new Error('Data inválida - formato não reconhecido');
      }
      
      return date;
    } catch (error) {
      console.error(`Erro ao fazer parse da data Samsara: ${dateStr}`, error);
      return null;
    }
  }

  // Normalizar nomes
  normalizeName(name) {
    if (!name) return '';
    
    let normalizedName = name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    if (normalizedName.toLowerCase() === 'norim') {
      return 'Jose Honorio';
    }
    
    return normalizedName;
  }

  // Parse de duração
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    
    try {
      const parts = durationStr.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        return hours + (minutes / 60) + (seconds / 3600);
      }
      return 0;
    } catch (error) {
      console.error(`Erro ao fazer parse da duração: ${durationStr}`, error);
      return 0;
    }
  }

  // Parse de valores numéricos
  parseNumericValue(value, defaultValue = 0) {
    if (!value || value === '') {
      return defaultValue;
    }
    
    try {
      const stringValue = String(value).trim();
      const parsed = parseFloat(stringValue);
      return isNaN(parsed) ? defaultValue : parsed;
    } catch (error) {
      console.error(`Erro ao fazer parse do valor: ${value}`, error);
      return defaultValue;
    }
  }

  // Buscar CSV e converter para JSON
  async fetchCsvToJson(url, name) {
    try {
      console.log(`📥 Buscando dados de ${name}...`);
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status} for ${name}`);
      }
      
      const buffer = await res.arrayBuffer();
      
      let csvText;
      try {
        csvText = new TextDecoder("utf-8").decode(buffer);
      } catch {
        try {
          csvText = new TextDecoder("utf-8-sig").decode(buffer);
        } catch {
          csvText = new TextDecoder("latin1").decode(buffer);
        }
      }
      
      return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log(`✅ ${name}: ${results.data.length} linhas carregadas`);
            resolve(results.data);
          },
          error: (err) => {
            reject(err);
          }
        });
      });
    } catch (error) {
      console.error(`❌ Erro ao buscar ${name}:`, error);
      throw error;
    }
  }

  // Buscar todos os dados do Samsara
  async fetchAllData() {
    console.log('🚀 Iniciando coleta de dados do Samsara...');
    
    const [idleEventsData, tripsData] = await Promise.all([
      this.fetchCsvToJson(this.idleEventsUrl, 'Samsara_Idle_Events'),
      this.fetchCsvToJson(this.tripsUrl, 'Samsara_Trips')
    ]);
    
    return { idleEventsData, tripsData };
  }

  // Mapear Idle Events para estrutura da tabela
  mapIdleEvents(idleEventsData) {
    console.log('🔄 Mapeando Idle Events...');
    
    const mappedData = idleEventsData.map((row) => {
      const startTime = this.getField(row, "Idle Event Start Time");
      const assetName = this.getField(row, "Asset: Name");
      const fuelConsumed = this.getField(row, "Fuel Consumed (gal)");
      
      // NOVA CHAVE ÚNICA: Idle Event Start Time + Asset: Name + Fuel Consumed
      const eventKey = `${startTime}_${assetName}_${fuelConsumed}`.replace(/\s+/g, '_');
      
      return {
        event_date: this.parseSamsaraDate(startTime),
        nome: this.normalizeName(assetName),
        local: this.getField(row, "Address"),
        distancia: 0,
        units: this.parseNumericValue(fuelConsumed, 0),
        type: 'idle',
        event_key: eventKey,
        idle_duration: this.parseDuration(this.getField(row, "Idle Event Duration (hh:mm:ss)")),
        raw_start_time: startTime,
        raw_asset_name: assetName
      };
    });
    
    console.log(`✅ ${mappedData.length} idle events mapeados com sucesso`);
    console.log(`🔑 Nova chave única: Idle Event Start Time + Asset: Name + Fuel Consumed`);
    return mappedData;
  }

  // Mapear Trips para estrutura da tabela
  mapTrips(tripsData) {
    console.log('🔄 Mapeando Trips...');
    
    const mappedData = tripsData.map((row) => {
      const startTime = this.getField(row, "Start Time");
      const assetName = this.getField(row, "Asset: Name");
      const fuelUsed = this.getField(row, "Fuel Used (gal)");
      
      // NOVA CHAVE ÚNICA: Start Time + Asset: Name + Fuel Used
      const eventKey = `${startTime}_${assetName}_${fuelUsed}`.replace(/\s+/g, '_');
      
      return {
        event_date: this.parseSamsaraDate(startTime),
        nome: this.normalizeName(assetName),
        local: this.getField(row, "Starting GPS Address"),
        distancia: this.parseNumericValue(this.getField(row, "Distance (mi)"), 0),
        units: this.parseNumericValue(fuelUsed, 0),
        type: 'trip',
        event_key: eventKey,
        raw_start_time: startTime,
        raw_asset_name: assetName
      };
    });
    
    console.log(`✅ ${mappedData.length} trips mapeados com sucesso`);
    console.log(`🔑 Nova chave única: Start Time + Asset: Name + Fuel Used`);
    return mappedData;
  }

  // Função para pegar campo mesmo com espaços extras
  getField(row, key) {
    let value = null;
    
    if (row[key] !== undefined) value = row[key];
    else if (row[` ${key}`] !== undefined) value = row[` ${key}`];
    else if (row[`${key} `] !== undefined) value = row[`${key} `];
    else {
      const foundKey = Object.keys(row).find((k) => k.replace(/\s/g, '') === key.replace(/\s/g, ''));
      if (foundKey) value = row[foundKey];
    }
    
    if (typeof value === 'string') {
      return this.normalizeUtf8String(value);
    }
    
    return value;
  }

  // Criar backup dos dados
  async createBackup(data, type) {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `samsara_${type}_backup_${timestamp}.json`);
      
      await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`💾 Backup criado: ${backupPath}`);
      
      return backupPath;
    } catch (error) {
      console.warn('⚠️  Erro ao criar backup:', error);
    }
  }
}

export default SamsaraClient;
