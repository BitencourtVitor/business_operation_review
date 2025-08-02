-- Deletar dados de FRAMING exceto bills
-- Execute este SQL no painel do Supabase

-- Deletar dados de bill_payments (mantém bills)
DELETE FROM public.framing_bill_payment_links;
DELETE FROM public.framing_bill_payments;

-- Deletar dados de estimates
DELETE FROM public.framing_estimate_links;
DELETE FROM public.framing_estimate_lines;
DELETE FROM public.framing_estimates;

-- Deletar dados de invoices
DELETE FROM public.framing_invoice_links;
DELETE FROM public.framing_invoice_lines;
DELETE FROM public.framing_invoices;

-- Deletar dados de payments
DELETE FROM public.framing_payment_links;
DELETE FROM public.framing_payments;

-- Deletar dados de purchases
DELETE FROM public.framing_purchase_lines;
DELETE FROM public.framing_purchases;

-- Deletar dados de vendor_credits
DELETE FROM public.framing_vendor_credit_lines;
DELETE FROM public.framing_vendor_credits;

-- Deletar dados de deposits
DELETE FROM public.framing_deposit_lines;
DELETE FROM public.framing_deposits; 