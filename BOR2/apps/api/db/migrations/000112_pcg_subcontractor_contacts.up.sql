-- Contato do subcontratado como o PCG Bids and Contracts precisa dele.
--
-- A fonte é a roster do Subcontractor Docs. O que é escrito aqui cobre uma
-- lacuna dela (sub sem dono, sem e-mail ou sem telefone) ou corrige o dado para
-- o papel que o PCG emite — e não volta para o cadastro: escrever aqui nunca
-- altera sub_doc_contractors.
--
-- A chave é o nome da empresa, porque é isso que o evento do bid guarda: o
-- picker grava texto, não id.
CREATE TABLE IF NOT EXISTS pcg_subcontractor_contacts (
    subcontractor TEXT PRIMARY KEY,
    owner_name    TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL DEFAULT '',
    phone         TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
