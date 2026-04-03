# Fuel Pipeline - Samsara + WEX

Pipeline para sincronização de dados de combustível do Samsara e WEX com Supabase.

## 🚀 Funcionalidades

### Samsara
- **Idle Events**: Eventos de veículo parado
- **Trips**: Deslocamentos de veículos
- Sincronização incremental inteligente
- Migração histórica completa

### WEX
- **Transações de combustível**: Abastecimentos registrados
- Sincronização incremental inteligente
- Migração histórica completa
- Estatísticas detalhadas

## 📊 Estrutura das Tabelas

### `samsara_events`
Tabela unificada para eventos do Samsara (Idle Events + Trips):
- `event_key`: Chave única (data + nome)
- `event_date`: Data do evento
- `nome`: Nome do responsável
- `local`: Endereço ou localização GPS
- `distancia`: Distância percorrida (0 para idle)
- `units`: Combustível consumido em galões
- `type`: Tipo do evento ('idle' ou 'trip')

### `wex_transactions`
Tabela para transações de combustível do WEX:
- `transaction_key`: Chave única (data + hora + nome)
- `transaction_date`: Data da transação
- `emboss_line_2`: Nome do responsável
- `units`: Quantidade em galões
- `total_fuel_cost`: Valor total do abastecimento
- `merchant_city`: Cidade do abastecimento

### `employee_names`
Tabela de normalização de nomes entre WEX e Samsara:
- `wex_name`: Nome do funcionário no sistema WEX
- `samsara_name`: Nome do funcionário no sistema Samsara
- `normalized_name`: Nome normalizado para uso interno
- `vehicle_model`: Modelo do veículo do funcionário
- `vehicle_min_consumption`: Consumo mínimo estimado em MPG
- `vehicle_max_consumption`: Consumo máximo estimado em MPG

## 🛠️ Instalação

```bash
cd fuel-pipeline
npm install
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
# ou
SUPABASE_KEY=sua_chave_anon
```

## 📋 Scripts Disponíveis

### Samsara
```bash
# Migração histórica completa
npm run migrate-samsara

# Sincronização incremental
npm run sync-samsara

# Pipeline completo
npm run run-all-samsara
```

### WEX
```bash
# Migração histórica completa
npm run migrate-wex

# Sincronização incremental
npm run sync-wex

# Pipeline completo
npm run run-all-wex
```

### Todos os Dados
```bash
# Pipeline completo Samsara + WEX
npm run run-all
```

## 🔄 Atualizações Recentes

### Novas Colunas de Veículo
A tabela `employee_names` agora inclui informações sobre os veículos dos funcionários:

- **`vehicle_model`**: Modelo do veículo (ex: "Ford F-150", "Chevrolet Silverado")
- **`vehicle_min_consumption`**: Consumo mínimo estimado em MPG (ex: 15)
- **`vehicle_max_consumption`**: Consumo máximo estimado em MPG (ex: 20)

Essas informações são usadas na tabela de Fuel Control para mostrar:
- Modelo do veículo de cada motorista
- Performance estimada no formato "15 - 20" MPG

### Script de Atualização
Execute o script `edge_functions/update_employee_names_table.sql` no seu banco Supabase para adicionar as novas colunas.

## 🔄 Como Funciona

### Migração Histórica
1. Busca todos os dados das planilhas
2. Remove duplicatas
3. Insere na tabela correspondente
4. Gera backup dos dados originais

### Sincronização Incremental
1. Verifica última transação/evento processado
2. Busca apenas dados novos
3. Insere apenas registros não existentes
4. Mantém dados sempre atualizados

## 📁 Estrutura de Arquivos

```
fuel-pipeline/
├── schemas/
│   ├── samsara.sql          # Schema da tabela Samsara
│   └── wex.sql             # Schema da tabela WEX
├── samsaraClient.js         # Cliente para dados Samsara
├── wexClient.js            # Cliente para dados WEX
├── supabaseClient.js       # Cliente Supabase para Samsara
├── wexSupabaseClient.js    # Cliente Supabase para WEX
├── migrate_historical.js   # Migração histórica Samsara
├── migrate_wex_historical.js # Migração histórica WEX
├── sync_incremental.js     # Sincronização incremental Samsara
├── sync_wex_incremental.js # Sincronização incremental WEX
├── run_all.js              # Pipeline completo Samsara
├── run_all_wex.js          # Pipeline completo WEX
└── README.md
```

## 🎯 URLs das Planilhas

### Samsara
- **Idle Events**: `gid=0`
- **Trips**: `gid=2085020611`

### WEX
- **Transactions**: `gid=168001319`

## 📊 Estatísticas

### Samsara
- Total de eventos únicos
- Consumo de combustível por período
- Análise de eficiência

### WEX
- Total de transações
- Consumo total em galões
- Custo total e médio por galão
- Período de dados disponíveis

## 🚨 Tratamento de Erros

- **Fallback automático**: Se inserção em lote falhar, tenta em lotes menores
- **Inserção individual**: Último recurso para transações problemáticas
- **Logs detalhados**: Rastreamento completo de todas as operações
- **Backup automático**: Dados originais sempre preservados

## 🔧 Manutenção

### Limpeza de Tabelas
```bash
# Limpar tabela Samsara (apenas para migração)
npm run clear-samsara

# Limpar tabela WEX (apenas para migração)
npm run clear-wex
```

### Verificação de Status
```bash
# Verificar registros Samsara
npm run status-samsara

# Verificar registros WEX
npm run status-wex
```

## 📝 Logs

Todos os scripts geram logs detalhados com:
- ✅ Operações bem-sucedidas
- ⚠️ Avisos e duplicatas
- ❌ Erros e falhas
- 📊 Estatísticas e resumos

## 🎉 Próximos Passos

1. Execute a migração histórica para cada sistema
2. Configure cron jobs para sincronização incremental
3. Monitore logs para verificar funcionamento
4. Ajuste configurações conforme necessário
