-- Contract document numbers for PCG Bids and Contracts: PLB-00001, ELC-00002.
-- The letters say which trade issued the contract; the digits are a single
-- system-wide count of contracts issued, so they never restart per trade.
--
-- Lives in the database rather than in the browser because the number is printed
-- on paper somebody signs: two machines issuing PLB-00001 at once would put the
-- same identifier on two different contracts.
CREATE SEQUENCE IF NOT EXISTS pcg_contract_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS pcg_contract_numbers (
    id          BIGSERIAL PRIMARY KEY,
    -- The project and trade are still the browser's ids while that module lives
    -- in localStorage. Text on purpose: no foreign key to point them at yet.
    project_id  TEXT        NOT NULL,
    trade_id    TEXT        NOT NULL,
    trade_code  TEXT        NOT NULL,
    seq         BIGINT      NOT NULL,
    number      TEXT        NOT NULL,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_by   TEXT        NOT NULL DEFAULT '',
    -- One number per contract: asking twice returns the number already issued
    -- instead of burning another. This is what makes the endpoint idempotent.
    CONSTRAINT pcg_contract_numbers_project_trade_key UNIQUE (project_id, trade_id),
    -- And a number is never handed out twice, whatever happens to the sequence.
    CONSTRAINT pcg_contract_numbers_number_key UNIQUE (number)
);
