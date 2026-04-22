-- AI Chat: conversations, messages, company context

CREATE TABLE ai_conversations (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company    TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT 'New conversation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_user_company ON ai_conversations(user_id, company);

CREATE TABLE ai_messages (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id     TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('user', 'assistant')),

    -- user turn
    content_original    TEXT,          -- raw input (stored only, never sent to AI)
    content_synthesized TEXT,          -- condensed input sent to AI context

    -- assistant turn
    content_response    TEXT,          -- what the user sees
    content_data        JSONB,         -- raw query results attached to this turn

    -- compression (applied to old messages)
    is_compressed       BOOLEAN NOT NULL DEFAULT FALSE,
    compressed_summary  TEXT,          -- replaces content_data when compressed

    -- billing
    tokens_input        INTEGER,
    tokens_output       INTEGER,
    cost_usd            NUMERIC(14, 8),
    model               TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);

-- Theoretical context per company (manually maintained)
CREATE TABLE ai_company_context (
    company    TEXT PRIMARY KEY,
    context    TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
