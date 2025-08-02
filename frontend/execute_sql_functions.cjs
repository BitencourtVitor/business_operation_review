const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase
const supabaseUrl = 'https://zsqbejfmbyuanetoxewt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NDk5MjQsImV4cCI6MjA2NjQyNTkyNH0.YB7OWzXXX7B9moO6rTmcQA2AvnJNAO_VoGEpPHC-AQ0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSQLFunctions() {
  try {
    console.log('Executando funções SQL...');

    // Ler os arquivos SQL
    const projectChartSQL = fs.readFileSync(path.join(__dirname, 'backend', 'ProjectChart_datafunction.sql'), 'utf8');
    const projectCarouselSQL = fs.readFileSync(path.join(__dirname, 'backend', 'ProjectCarousel_data_function.sql'), 'utf8');

    // Dividir o SQL em comandos individuais
    const projectChartCommands = projectChartSQL.split(';').filter(cmd => cmd.trim());
    const projectCarouselCommands = projectCarouselSQL.split(';').filter(cmd => cmd.trim());

    console.log('Executando comandos do ProjectChart_datafunction.sql...');
    for (let i = 0; i < projectChartCommands.length; i++) {
      const command = projectChartCommands[i].trim();
      if (command) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: command });
          if (error) {
            console.error(`Erro no comando ${i + 1}:`, error);
          } else {
            console.log(`Comando ${i + 1} executado com sucesso`);
          }
        } catch (err) {
          console.error(`Erro ao executar comando ${i + 1}:`, err);
        }
      }
    }

    console.log('Executando comandos do ProjectCarousel_data_function.sql...');
    for (let i = 0; i < projectCarouselCommands.length; i++) {
      const command = projectCarouselCommands[i].trim();
      if (command) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: command });
          if (error) {
            console.error(`Erro no comando ${i + 1}:`, error);
          } else {
            console.log(`Comando ${i + 1} executado com sucesso`);
          }
        } catch (err) {
          console.error(`Erro ao executar comando ${i + 1}:`, err);
        }
      }
    }

    console.log('Todas as funções SQL foram executadas!');
  } catch (error) {
    console.error('Erro ao executar funções SQL:', error);
  }
}

executeSQLFunctions(); 