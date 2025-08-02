-- Adicionar constraints UNIQUE compostas para tabelas FRAMING
-- Execute este SQL no painel do Supabase

-- Constraints para framing_bill_lines
ALTER TABLE public.framing_bill_lines 
ADD CONSTRAINT framing_bill_lines_bill_id_line_id_unique 
UNIQUE (bill_id, line_id);

-- Constraints para framing_bill_links
ALTER TABLE public.framing_bill_links 
ADD CONSTRAINT framing_bill_links_bill_id_txn_id_unique 
UNIQUE (bill_id, txn_id);

-- Constraints para framing_bill_payment_links
ALTER TABLE public.framing_bill_payment_links 
ADD CONSTRAINT framing_bill_payment_links_bill_payment_id_txn_id_unique 
UNIQUE (bill_payment_id, txn_id);

-- Constraints para framing_estimate_lines
ALTER TABLE public.framing_estimate_lines 
ADD CONSTRAINT framing_estimate_lines_estimate_id_line_id_unique 
UNIQUE (estimate_id, line_id);

-- Constraints para framing_estimate_links
ALTER TABLE public.framing_estimate_links 
ADD CONSTRAINT framing_estimate_links_estimate_id_txn_id_unique 
UNIQUE (estimate_id, txn_id);

-- Constraints para framing_invoice_lines
ALTER TABLE public.framing_invoice_lines 
ADD CONSTRAINT framing_invoice_lines_invoice_id_external_line_id_unique 
UNIQUE (invoice_id, external_line_id);

-- Constraints para framing_invoice_links
ALTER TABLE public.framing_invoice_links 
ADD CONSTRAINT framing_invoice_links_invoice_id_linked_txn_id_unique 
UNIQUE (invoice_id, linked_txn_id);

-- Constraints para framing_payment_links
ALTER TABLE public.framing_payment_links 
ADD CONSTRAINT framing_payment_links_payment_id_txn_id_unique 
UNIQUE (payment_id, txn_id);

-- Constraints para framing_purchase_lines
ALTER TABLE public.framing_purchase_lines 
ADD CONSTRAINT framing_purchase_lines_purchase_id_external_line_id_unique 
UNIQUE (purchase_id, external_line_id);

-- Constraints para framing_vendor_credit_lines
ALTER TABLE public.framing_vendor_credit_lines 
ADD CONSTRAINT framing_vendor_credit_lines_vendor_credit_id_external_line_id_unique 
UNIQUE (vendor_credit_id, external_line_id);

-- Constraints para framing_deposit_lines
ALTER TABLE public.framing_deposit_lines 
ADD CONSTRAINT framing_deposit_lines_deposit_id_external_line_id_unique 
UNIQUE (deposit_id, external_line_id); 