-- Aria agent: read-only role, per-company RLS, and query audit log.
-- The main app connects as a superuser/owner and BYPASSES RLS, so existing
-- queries are unaffected. Only the non-privileged aria_ro role is subject to the
-- SELECT-only grants and the company-isolation policy below.

-- 1. Read-only role (no login here; password/login set out-of-band so no secret
--    lives in version control).
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aria_ro') THEN
		CREATE ROLE aria_ro NOLOGIN;
	END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO aria_ro;

-- 2. Per-table: grant SELECT, enable RLS, and a policy scoping rows to the
--    company set via SET LOCAL app.aria_company (NULL when unset → no rows).
DO $$
DECLARE
	t text;
	tables text[] := ARRAY[
		'qb_invoices','qb_invoice_lines','qb_invoice_links',
		'qb_bills','qb_bill_lines','qb_bill_links',
		'qb_payments','qb_payment_links',
		'qb_bill_payments','qb_bill_payment_links',
		'qb_estimates','qb_estimate_lines','qb_estimate_links',
		'qb_purchases','qb_purchase_lines',
		'qb_vendor_credits','qb_vendor_credit_lines',
		'qb_deposits','qb_deposit_lines'
	];
BEGIN
	FOREACH t IN ARRAY tables LOOP
		EXECUTE format('GRANT SELECT ON %I TO aria_ro', t);
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
		EXECUTE format('DROP POLICY IF EXISTS aria_company_isolation ON %I', t);
		EXECUTE format(
			'CREATE POLICY aria_company_isolation ON %I FOR SELECT TO aria_ro USING (company = current_setting(''app.aria_company'', true))',
			t
		);
	END LOOP;
END
$$;

-- 3. Audit log of every query Aria runs (executed or blocked).
CREATE TABLE IF NOT EXISTS ai_query_log (
	id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         text,
	conversation_id text,
	company         text NOT NULL,
	sql             text NOT NULL,
	ok              boolean NOT NULL,
	error           text,
	row_count       int,
	duration_ms     int,
	created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_query_log_created_at ON ai_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_log_company    ON ai_query_log (company);
