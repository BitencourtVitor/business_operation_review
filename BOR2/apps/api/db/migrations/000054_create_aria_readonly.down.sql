-- Reverse the Aria read-only role, RLS policies, and audit log.

DROP TABLE IF EXISTS ai_query_log;

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
		EXECUTE format('DROP POLICY IF EXISTS aria_company_isolation ON %I', t);
		EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
		EXECUTE format('REVOKE SELECT ON %I FROM aria_ro', t);
	END LOOP;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aria_ro') THEN
		REVOKE USAGE ON SCHEMA public FROM aria_ro;
		DROP ROLE aria_ro;
	END IF;
END
$$;
