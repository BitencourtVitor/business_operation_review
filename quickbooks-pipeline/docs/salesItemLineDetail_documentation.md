# SalesItemLineDetail Collector

## Objetivo

Este script coleta especificamente os dados do `SalesItemLineDetail` de todas as transações do QuickBooks que possuem este tipo de linha. O objetivo é obter informações detalhadas sobre produtos/serviços vendidos, incluindo possíveis dados de custo que podem estar armazenados em campos customizados.

## O que é SalesItemLineDetail?

`SalesItemLineDetail` é uma estrutura de dados do QuickBooks que contém informações detalhadas sobre produtos ou serviços em uma transação. Inclui:

- **UnitPrice**: Preço unitário
- **Qty**: Quantidade
- **ItemRef**: Referência ao item/produto
- **ItemAccountRef**: Conta associada ao item
- **TaxCodeRef**: Código de imposto
- **ServiceDate**: Data do serviço
- **CustomExtensions**: Campos customizados (onde podem estar os dados de custo)

## Entidades Coletadas

O script coleta dados de todas as seguintes entidades do QuickBooks:

1. **Estimate** - Orçamentos
2. **Invoice** - Faturas
3. **Bill** - Contas a pagar
4. **Purchase** - Compras
5. **Payment** - Pagamentos
6. **Deposit** - Depósitos
7. **VendorCredit** - Créditos de fornecedor

## Campos Coletados

Para cada `SalesItemLineDetail` encontrado, o script coleta:

### Dados Básicos
- `external_id`: ID da transação principal
- `entity_type`: Tipo da entidade (Estimate, Invoice, etc.)
- `line_id`: ID da linha
- `line_num`: Número da linha
- `description`: Descrição
- `amount`: Valor total

### Dados do SalesItemLineDetail
- `unit_price`: Preço unitário
- `quantity`: Quantidade
- `item_ref_id`: ID do item
- `item_ref_name`: Nome do item
- `item_account_ref_id`: ID da conta do item
- `item_account_ref_name`: Nome da conta do item
- `tax_code_ref`: Código de imposto
- `tax_classification_ref`: Classificação de imposto
- `service_date`: Data do serviço

### Dados de Relacionamento
- `customer_id`: ID do cliente
- `customer_name`: Nome do cliente
- `vendor_id`: ID do fornecedor
- `vendor_name`: Nome do fornecedor

### Dados da Transação Principal
- `doc_number`: Número do documento
- `txn_date`: Data da transação
- `txn_status`: Status da transação
- `total_amount`: Valor total da transação

### Campos Customizados
- `custom_extensions`: Campos customizados em formato JSON (onde podem estar os dados de custo)

## Como Executar

```bash
# Executar diretamente
node salesItemLineDetail.js

# Ou usar o script wrapper
node run_salesItemLineDetail.js
```

## Arquivo de Saída

O script gera o arquivo `hvac_SalesItemLineDetail.json` contendo todos os dados coletados.

## Análise dos Dados de Custo

Após executar o script, você pode analisar o arquivo JSON gerado para procurar:

1. **Campos customizados** que podem conter dados de custo
2. **Padrões nos dados** que indiquem informações de custo
3. **Diferenças entre preços** que possam indicar markup

## Próximos Passos

1. Execute o script para coletar os dados
2. Analise o arquivo JSON gerado
3. Procure por campos customizados que contenham dados de custo
4. Identifique padrões nos dados que possam indicar informações de markup
5. Se necessário, modifique o script para coletar campos específicos encontrados 