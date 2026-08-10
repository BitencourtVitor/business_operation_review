CREATE TABLE IF NOT EXISTS sub_doc_workers_comp_cycles (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_date           date NOT NULL UNIQUE,
    communication_date    date NOT NULL,
    status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    review_email_sent_at  timestamptz,
    communication_sent_at timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_doc_workers_comp_checks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id      uuid NOT NULL REFERENCES sub_doc_workers_comp_cycles(id) ON DELETE CASCADE,
    contractor_id int NOT NULL REFERENCES sub_doc_contractors(id) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'regular', 'irregular')),
    notes         text NOT NULL DEFAULT '',
    checked_by    text REFERENCES users(id) ON DELETE SET NULL,
    checked_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cycle_id, contractor_id)
);

CREATE INDEX IF NOT EXISTS sub_doc_workers_comp_checks_cycle_status_idx
    ON sub_doc_workers_comp_checks (cycle_id, status);
