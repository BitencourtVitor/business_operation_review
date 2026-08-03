CREATE TABLE inventory_history_sources (
    source          TEXT PRIMARY KEY,
    reset_date      DATE NOT NULL,
    backup_through  DATE NOT NULL,
    movement_count  INTEGER NOT NULL,
    item_count      INTEGER NOT NULL,
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_history_balances (
    source               TEXT NOT NULL REFERENCES inventory_history_sources(source) ON DELETE CASCADE,
    reference_month      DATE NOT NULL,
    product_id           TEXT NOT NULL,
    product_name         TEXT NOT NULL,
    minimum_balance      NUMERIC NOT NULL,
    accumulated_balance  NUMERIC NOT NULL,
    below_minimum        BOOLEAN NOT NULL,
    PRIMARY KEY (source, reference_month, product_id)
);

CREATE TABLE inventory_history_withdrawals (
    source                   TEXT NOT NULL REFERENCES inventory_history_sources(source) ON DELETE CASCADE,
    original_item_id         TEXT NOT NULL,
    original_movement_id     TEXT NOT NULL,
    movement_date            TIMESTAMPTZ NOT NULL,
    project_id               TEXT NOT NULL,
    project_name             TEXT NOT NULL,
    house_model_name         TEXT NOT NULL,
    product_id               TEXT NOT NULL,
    product_name             TEXT NOT NULL,
    responsible_user         TEXT NOT NULL,
    recipient_id             TEXT,
    withdrawn_quantity       NUMERIC NOT NULL,
    quantity_limit           NUMERIC NOT NULL,
    accumulated_consumption  NUMERIC NOT NULL,
    exceeded_at_movement     BOOLEAN NOT NULL,
    unit_price               NUMERIC NOT NULL,
    PRIMARY KEY (source, original_item_id)
);

CREATE INDEX inventory_history_balances_month_idx ON inventory_history_balances (reference_month);
CREATE INDEX inventory_history_withdrawals_date_idx ON inventory_history_withdrawals (movement_date);
