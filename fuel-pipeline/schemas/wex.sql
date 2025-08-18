-- Schema para tabela WEX (transações de combustível)
CREATE TABLE IF NOT EXISTS wex_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_key TEXT UNIQUE NOT NULL,
    transaction_date DATE NOT NULL,
    nome TEXT NOT NULL, -- Emboss Line 2
    units DECIMAL(10,3) NOT NULL, -- quantidade em galões
    valor DECIMAL(10,2) NOT NULL, -- valor total do abastecimento
    local TEXT, -- Merchant City
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_key ON wex_transactions(transaction_key);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_date ON wex_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_nome ON wex_transactions(nome);

-- Comentários para documentação
COMMENT ON TABLE wex_transactions IS 'Transações de combustível do sistema WEX (simplificada)';
COMMENT ON COLUMN wex_transactions.transaction_key IS 'Chave única: Transaction Date + Transaction Time + Emboss Line 2 + Units';
COMMENT ON COLUMN wex_transactions.nome IS 'Nome do responsável pelo abastecimento';
COMMENT ON COLUMN wex_transactions.units IS 'Quantidade de combustível em galões';
COMMENT ON COLUMN wex_transactions.valor IS 'Valor total do abastecimento';
COMMENT ON COLUMN wex_transactions.local IS 'Cidade onde aconteceu o abastecimento';
