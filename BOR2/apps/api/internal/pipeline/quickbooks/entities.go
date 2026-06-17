package quickbooks

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// upsertEntity dispatches to the correct typed upsert function.
func upsertEntity(ctx context.Context, db *pgxpool.Pool, company, entity string, rows []json.RawMessage) (int, error) {
	switch entity {
	case "Bill":
		return upsertBills(ctx, db, company, rows)
	case "BillPayment":
		return upsertBillPayments(ctx, db, company, rows)
	case "Estimate":
		return upsertEstimates(ctx, db, company, rows)
	case "Invoice":
		return upsertInvoices(ctx, db, company, rows)
	case "Payment":
		return upsertPayments(ctx, db, company, rows)
	case "Purchase":
		return upsertPurchases(ctx, db, company, rows)
	case "VendorCredit":
		return upsertVendorCredits(ctx, db, company, rows)
	case "Deposit":
		return upsertDeposits(ctx, db, company, rows)
	case "PurchaseOrder":
		return upsertPurchaseOrders(ctx, db, company, rows)
	case "Account":
		return upsertAccounts(ctx, db, company, rows)
	case "Vendor":
		return upsertVendors(ctx, db, company, rows)
	case "Customer":
		return upsertCustomers(ctx, db, company, rows)
	default:
		// Every other fetched entity is captured generically in qb_raw.
		return upsertRaw(ctx, db, company, entity, rows)
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func str(m map[string]json.RawMessage, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	var s string
	_ = json.Unmarshal(v, &s)
	return s
}

func coalesce(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func strNested(m map[string]json.RawMessage, key, field string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	var inner map[string]json.RawMessage
	if err := json.Unmarshal(v, &inner); err != nil {
		return ""
	}
	return str(inner, field)
}

func numStr(m map[string]json.RawMessage, key string) *float64 {
	v, ok := m[key]
	if !ok {
		return nil
	}
	var f float64
	if err := json.Unmarshal(v, &f); err != nil {
		return nil
	}
	return &f
}

func boolVal(m map[string]json.RawMessage, key string) *bool {
	v, ok := m[key]
	if !ok {
		return nil
	}
	var b bool
	if err := json.Unmarshal(v, &b); err != nil {
		return nil
	}
	return &b
}

func intVal(m map[string]json.RawMessage, key string) *int {
	v, ok := m[key]
	if !ok {
		return nil
	}
	var f float64
	if err := json.Unmarshal(v, &f); err != nil {
		return nil
	}
	n := int(f)
	return &n
}

func dateStr(m map[string]json.RawMessage, key string) *time.Time {
	s := str(m, key)
	if s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil
	}
	return &t
}

func tsStr(m map[string]json.RawMessage, key string) *time.Time {
	s := str(m, key)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05-07:00"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func metaUpdatedAt(m map[string]json.RawMessage) *time.Time {
	v, ok := m["MetaData"]
	if !ok {
		return nil
	}
	var meta map[string]json.RawMessage
	if err := json.Unmarshal(v, &meta); err != nil {
		return nil
	}
	return tsStr(meta, "LastUpdatedTime")
}

func lines(m map[string]json.RawMessage) []map[string]json.RawMessage {
	v, ok := m["Line"]
	if !ok {
		return nil
	}
	var raw []json.RawMessage
	if err := json.Unmarshal(v, &raw); err != nil {
		return nil
	}
	var out []map[string]json.RawMessage
	for _, r := range raw {
		var line map[string]json.RawMessage
		if err := json.Unmarshal(r, &line); err == nil {
			out = append(out, line)
		}
	}
	return out
}

func linkedTxns(m map[string]json.RawMessage) []map[string]json.RawMessage {
	v, ok := m["LinkedTxn"]
	if !ok {
		return nil
	}
	var raw []json.RawMessage
	if err := json.Unmarshal(v, &raw); err != nil {
		return nil
	}
	var out []map[string]json.RawMessage
	for _, r := range raw {
		var txn map[string]json.RawMessage
		if err := json.Unmarshal(r, &txn); err == nil {
			out = append(out, txn)
		}
	}
	return out
}

// ─── Bills ───────────────────────────────────────────────────────────────────

func upsertBills(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		externalID := str(m, "Id")
		var billID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_bills
				(company, external_id, doc_number, txn_date, due_date,
				 vendor_id, vendor_name, total_amount, balance, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number   = EXCLUDED.doc_number,
				txn_date     = EXCLUDED.txn_date,
				due_date     = EXCLUDED.due_date,
				vendor_id    = EXCLUDED.vendor_id,
				vendor_name  = EXCLUDED.vendor_name,
				total_amount = EXCLUDED.total_amount,
				balance      = EXCLUDED.balance,
				updated_at   = EXCLUDED.updated_at
			RETURNING id
		`,
			company, externalID,
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			dateStr(m, "DueDate"),
			strNested(m, "VendorRef", "value"),
			strNested(m, "VendorRef", "name"),
			numStr(m, "TotalAmt"),
			numStr(m, "Balance"),
			metaUpdatedAt(m),
		).Scan(&billID)
		if err != nil {
			continue
		}

		// Lines — full replace so QB-side edits/removals don't leave orphan rows.
		_, _ = db.Exec(ctx, `DELETE FROM qb_bill_lines WHERE company=$1 AND bill_id=$2`, company, billID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			detail, _ := line["AccountBasedExpenseLineDetail"]
			var detailMap map[string]json.RawMessage
			_ = json.Unmarshal(detail, &detailMap)

			_, _ = db.Exec(ctx, `
				INSERT INTO qb_bill_lines
					(bill_id, company, line_id, description, amount,
					 account_ref_id, account_ref_name, customer_id, customer_name)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
				ON CONFLICT (company, bill_id, line_id) DO UPDATE SET
					description      = EXCLUDED.description,
					amount           = EXCLUDED.amount,
					account_ref_id   = EXCLUDED.account_ref_id,
					account_ref_name = EXCLUDED.account_ref_name,
					customer_id      = EXCLUDED.customer_id,
					customer_name    = EXCLUDED.customer_name
			`,
				billID, company, lineID,
				str(line, "Description"),
				numStr(line, "Amount"),
				strNested(detailMap, "AccountRef", "value"),
				strNested(detailMap, "AccountRef", "name"),
				strNested(detailMap, "CustomerRef", "value"),
				strNested(detailMap, "CustomerRef", "name"),
			)
		}

		// Links — full replace.
		_, _ = db.Exec(ctx, `DELETE FROM qb_bill_links WHERE company=$1 AND bill_id=$2`, company, billID)
		for _, txn := range linkedTxns(m) {
			txnID := str(txn, "TxnId")
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_bill_links (bill_id, company, txn_id, txn_type)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (company, bill_id, txn_id) DO UPDATE SET txn_type = EXCLUDED.txn_type
			`, billID, company, txnID, str(txn, "TxnType"))
		}

		count++
	}
	return count, nil
}

// ─── Bill Payments ────────────────────────────────────────────────────────────

func upsertBillPayments(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var bpID string
		var checkMap, ccMap map[string]json.RawMessage
		if v, ok := m["CheckPayment"]; ok {
			_ = json.Unmarshal(v, &checkMap)
		}
		if v, ok := m["CreditCardPayment"]; ok {
			_ = json.Unmarshal(v, &ccMap)
		}

		err := db.QueryRow(ctx, `
			INSERT INTO qb_bill_payments
				(company, external_id, vendor_id, vendor_name, pay_type, total_amount,
				 currency, txn_date, doc_number, private_note,
				 bank_account_id, bank_account_name, cc_account_id, cc_account_name, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			ON CONFLICT (company, external_id) DO UPDATE SET
				vendor_id        = EXCLUDED.vendor_id,
				vendor_name      = EXCLUDED.vendor_name,
				pay_type         = EXCLUDED.pay_type,
				total_amount     = EXCLUDED.total_amount,
				currency         = EXCLUDED.currency,
				txn_date         = EXCLUDED.txn_date,
				doc_number       = EXCLUDED.doc_number,
				private_note     = EXCLUDED.private_note,
				bank_account_id  = EXCLUDED.bank_account_id,
				bank_account_name= EXCLUDED.bank_account_name,
				cc_account_id    = EXCLUDED.cc_account_id,
				cc_account_name  = EXCLUDED.cc_account_name,
				updated_at       = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			strNested(m, "VendorRef", "value"),
			strNested(m, "VendorRef", "name"),
			str(m, "PayType"),
			numStr(m, "TotalAmt"),
			strNested(m, "CurrencyRef", "value"),
			dateStr(m, "TxnDate"),
			str(m, "DocNumber"),
			str(m, "PrivateNote"),
			strNested(checkMap, "BankAccountRef", "value"),
			strNested(checkMap, "BankAccountRef", "name"),
			strNested(ccMap, "CCAccountRef", "value"),
			strNested(ccMap, "CCAccountRef", "name"),
			metaUpdatedAt(m),
		).Scan(&bpID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_bill_payment_links WHERE company=$1 AND bill_payment_id=$2`, company, bpID)
		for _, line := range lines(m) {
			for _, txn := range linkedTxns(line) {
				txnID := str(txn, "TxnId")
				_, _ = db.Exec(ctx, `
					INSERT INTO qb_bill_payment_links (bill_payment_id, company, txn_id, txn_type, amount)
					VALUES ($1,$2,$3,$4,$5)
					ON CONFLICT (company, bill_payment_id, txn_id) DO UPDATE SET
						txn_type = EXCLUDED.txn_type, amount = EXCLUDED.amount
				`, bpID, company, txnID, str(txn, "TxnType"), numStr(line, "Amount"))
			}
		}

		count++
	}
	return count, nil
}

// ─── Estimates ────────────────────────────────────────────────────────────────

func upsertEstimates(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var estID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_estimates
				(company, external_id, doc_number, txn_date, txn_status,
				 accepted_date, customer_id, customer_name, total_amount, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number    = EXCLUDED.doc_number,
				txn_date      = EXCLUDED.txn_date,
				txn_status    = EXCLUDED.txn_status,
				accepted_date = EXCLUDED.accepted_date,
				customer_id   = EXCLUDED.customer_id,
				customer_name = EXCLUDED.customer_name,
				total_amount  = EXCLUDED.total_amount,
				updated_at    = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			str(m, "TxnStatus"),
			dateStr(m, "AcceptedDate"),
			strNested(m, "CustomerRef", "value"),
			strNested(m, "CustomerRef", "name"),
			numStr(m, "TotalAmt"),
			metaUpdatedAt(m),
		).Scan(&estID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_estimate_lines WHERE company=$1 AND estimate_id=$2`, company, estID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			var detail map[string]json.RawMessage
			if v, ok := line["SalesItemLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_estimate_lines
					(estimate_id, company, line_id, line_num, description, amount,
					 unit_price, quantity, item_ref_id, item_ref_name, tax_code_ref, detail_type)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
				ON CONFLICT (company, estimate_id, line_id) DO UPDATE SET
					line_num      = EXCLUDED.line_num,
					description   = EXCLUDED.description,
					amount        = EXCLUDED.amount,
					unit_price    = EXCLUDED.unit_price,
					quantity      = EXCLUDED.quantity,
					item_ref_id   = EXCLUDED.item_ref_id,
					item_ref_name = EXCLUDED.item_ref_name,
					tax_code_ref  = EXCLUDED.tax_code_ref,
					detail_type   = EXCLUDED.detail_type
			`,
				estID, company, lineID,
				numStr(line, "LineNum"),
				str(line, "Description"),
				numStr(line, "Amount"),
				numStr(detail, "UnitPrice"),
				numStr(detail, "Qty"),
				strNested(detail, "ItemRef", "value"),
				strNested(detail, "ItemRef", "name"),
				strNested(detail, "TaxCodeRef", "value"),
				str(line, "DetailType"),
			)
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_estimate_links WHERE company=$1 AND estimate_id=$2`, company, estID)
		for _, txn := range linkedTxns(m) {
			txnID := str(txn, "TxnId")
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_estimate_links (estimate_id, company, txn_id, txn_type)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (company, estimate_id, txn_id) DO UPDATE SET txn_type = EXCLUDED.txn_type
			`, estID, company, txnID, str(txn, "TxnType"))
		}

		count++
	}
	return count, nil
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

func upsertInvoices(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var invID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_invoices
				(company, external_id, doc_number, txn_date, due_date,
				 customer_id, customer_name, total_amount, balance, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number    = EXCLUDED.doc_number,
				txn_date      = EXCLUDED.txn_date,
				due_date      = EXCLUDED.due_date,
				customer_id   = EXCLUDED.customer_id,
				customer_name = EXCLUDED.customer_name,
				total_amount  = EXCLUDED.total_amount,
				balance       = EXCLUDED.balance,
				updated_at    = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			dateStr(m, "DueDate"),
			strNested(m, "CustomerRef", "value"),
			strNested(m, "CustomerRef", "name"),
			numStr(m, "TotalAmt"),
			numStr(m, "Balance"),
			metaUpdatedAt(m),
		).Scan(&invID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_invoice_lines WHERE company=$1 AND invoice_id=$2`, company, invID)
		for _, line := range lines(m) {
			// Only real item lines carry financial detail; skip SubTotal/Group/Discount
			// summary lines (they repeat the total and double-count otherwise).
			if str(line, "DetailType") != "SalesItemLineDetail" {
				continue
			}
			lineID := str(line, "Id")
			var itemID, itemName string
			if d, ok := line["SalesItemLineDetail"]; ok {
				var detail map[string]json.RawMessage
				if json.Unmarshal(d, &detail) == nil {
					itemID = strNested(detail, "ItemRef", "value")
					itemName = strNested(detail, "ItemRef", "name")
				}
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_invoice_lines
					(invoice_id, company, external_line_id, description, amount, item_ref_id, item_ref_name)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT (company, invoice_id, external_line_id) DO UPDATE SET
					description = EXCLUDED.description, amount = EXCLUDED.amount,
					item_ref_id = EXCLUDED.item_ref_id, item_ref_name = EXCLUDED.item_ref_name
			`, invID, company, lineID, str(line, "Description"), numStr(line, "Amount"),
				itemID, itemName)
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_invoice_links WHERE company=$1 AND invoice_id=$2`, company, invID)
		for _, txn := range linkedTxns(m) {
			txnID := str(txn, "TxnId")
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_invoice_links (invoice_id, company, linked_txn_id, linked_txn_type)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (company, invoice_id, linked_txn_id) DO UPDATE SET linked_txn_type = EXCLUDED.linked_txn_type
			`, invID, company, txnID, str(txn, "TxnType"))
		}

		count++
	}
	return count, nil
}

// ─── Payments ─────────────────────────────────────────────────────────────────

func upsertPayments(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var payID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_payments
				(company, external_id, customer_id, customer_name, total_amount,
				 currency, payment_ref, payment_method_id, deposit_account_id, private_note, txn_date, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			ON CONFLICT (company, external_id) DO UPDATE SET
				customer_id        = EXCLUDED.customer_id,
				customer_name      = EXCLUDED.customer_name,
				total_amount       = EXCLUDED.total_amount,
				currency           = EXCLUDED.currency,
				payment_ref        = EXCLUDED.payment_ref,
				payment_method_id  = EXCLUDED.payment_method_id,
				deposit_account_id = EXCLUDED.deposit_account_id,
				private_note       = EXCLUDED.private_note,
				txn_date           = EXCLUDED.txn_date,
				updated_at         = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			strNested(m, "CustomerRef", "value"),
			strNested(m, "CustomerRef", "name"),
			numStr(m, "TotalAmt"),
			strNested(m, "CurrencyRef", "value"),
			str(m, "PaymentRefNum"),
			strNested(m, "PaymentMethodRef", "value"),
			strNested(m, "DepositToAccountRef", "value"),
			str(m, "PrivateNote"),
			dateStr(m, "TxnDate"),
			metaUpdatedAt(m),
		).Scan(&payID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_payment_links WHERE company=$1 AND payment_id=$2`, company, payID)
		for _, line := range lines(m) {
			for _, txn := range linkedTxns(line) {
				txnID := str(txn, "TxnId")
				_, _ = db.Exec(ctx, `
					INSERT INTO qb_payment_links (payment_id, company, txn_id, txn_type, amount)
					VALUES ($1,$2,$3,$4,$5)
					ON CONFLICT (company, payment_id, txn_id) DO UPDATE SET
						txn_type = EXCLUDED.txn_type, amount = EXCLUDED.amount
				`, payID, company, txnID, str(txn, "TxnType"), numStr(line, "Amount"))
			}
		}

		count++
	}
	return count, nil
}

// ─── Purchases ────────────────────────────────────────────────────────────────

func upsertPurchases(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var purID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_purchases
				(company, external_id, payment_type, total_amount, currency,
				 txn_date, private_note, account_ref_id, account_ref_name, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				payment_type     = EXCLUDED.payment_type,
				total_amount     = EXCLUDED.total_amount,
				currency         = EXCLUDED.currency,
				txn_date         = EXCLUDED.txn_date,
				private_note     = EXCLUDED.private_note,
				account_ref_id   = EXCLUDED.account_ref_id,
				account_ref_name = EXCLUDED.account_ref_name,
				updated_at       = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "PaymentType"),
			numStr(m, "TotalAmt"),
			strNested(m, "CurrencyRef", "value"),
			dateStr(m, "TxnDate"),
			str(m, "PrivateNote"),
			strNested(m, "AccountRef", "value"),
			strNested(m, "AccountRef", "name"),
			metaUpdatedAt(m),
		).Scan(&purID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_purchase_lines WHERE company=$1 AND purchase_id=$2`, company, purID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			var detail map[string]json.RawMessage
			if v, ok := line["AccountBasedExpenseLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_purchase_lines
					(purchase_id, company, external_line_id, description, amount,
					 detail_type, account_ref_id, account_ref_name,
					 billable_status, tax_code_ref, customer_id, customer_name)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
				ON CONFLICT (company, purchase_id, external_line_id) DO UPDATE SET
					description      = EXCLUDED.description,
					amount           = EXCLUDED.amount,
					detail_type      = EXCLUDED.detail_type,
					account_ref_id   = EXCLUDED.account_ref_id,
					account_ref_name = EXCLUDED.account_ref_name,
					billable_status  = EXCLUDED.billable_status,
					tax_code_ref     = EXCLUDED.tax_code_ref,
					customer_id      = EXCLUDED.customer_id,
					customer_name    = EXCLUDED.customer_name
			`,
				purID, company, lineID,
				str(line, "Description"),
				numStr(line, "Amount"),
				str(line, "DetailType"),
				strNested(detail, "AccountRef", "value"),
				strNested(detail, "AccountRef", "name"),
				str(detail, "BillableStatus"),
				strNested(detail, "TaxCodeRef", "value"),
				coalesce(strNested(detail, "CustomerRef", "value"), strNested(m, "CustomerRef", "value")),
				coalesce(strNested(detail, "CustomerRef", "name"), strNested(m, "CustomerRef", "name")),
			)
		}

		count++
	}
	return count, nil
}

// ─── Vendor Credits ───────────────────────────────────────────────────────────

func upsertVendorCredits(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var vcID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_vendor_credits
				(company, external_id, doc_number, txn_date, vendor_id, vendor_name,
				 total_amount, currency, ap_account_id, ap_account_name, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number      = EXCLUDED.doc_number,
				txn_date        = EXCLUDED.txn_date,
				vendor_id       = EXCLUDED.vendor_id,
				vendor_name     = EXCLUDED.vendor_name,
				total_amount    = EXCLUDED.total_amount,
				currency        = EXCLUDED.currency,
				ap_account_id   = EXCLUDED.ap_account_id,
				ap_account_name = EXCLUDED.ap_account_name,
				updated_at      = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			strNested(m, "VendorRef", "value"),
			strNested(m, "VendorRef", "name"),
			numStr(m, "TotalAmt"),
			strNested(m, "CurrencyRef", "value"),
			strNested(m, "APAccountRef", "value"),
			strNested(m, "APAccountRef", "name"),
			metaUpdatedAt(m),
		).Scan(&vcID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_vendor_credit_lines WHERE company=$1 AND vendor_credit_id=$2`, company, vcID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			var detail map[string]json.RawMessage
			if v, ok := line["AccountBasedExpenseLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_vendor_credit_lines
					(vendor_credit_id, company, external_line_id, line_num, description, amount,
					 detail_type, account_ref_id, account_ref_name,
					 customer_id, customer_name, billable_status, tax_code_ref)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
				ON CONFLICT (company, vendor_credit_id, external_line_id) DO UPDATE SET
					line_num         = EXCLUDED.line_num,
					description      = EXCLUDED.description,
					amount           = EXCLUDED.amount,
					detail_type      = EXCLUDED.detail_type,
					account_ref_id   = EXCLUDED.account_ref_id,
					account_ref_name = EXCLUDED.account_ref_name,
					customer_id      = EXCLUDED.customer_id,
					customer_name    = EXCLUDED.customer_name,
					billable_status  = EXCLUDED.billable_status,
					tax_code_ref     = EXCLUDED.tax_code_ref
			`,
				vcID, company, lineID,
				numStr(line, "LineNum"),
				str(line, "Description"),
				numStr(line, "Amount"),
				str(line, "DetailType"),
				strNested(detail, "AccountRef", "value"),
				strNested(detail, "AccountRef", "name"),
				strNested(detail, "CustomerRef", "value"),
				strNested(detail, "CustomerRef", "name"),
				str(detail, "BillableStatus"),
				strNested(detail, "TaxCodeRef", "value"),
			)
		}

		count++
	}
	return count, nil
}

// ─── Deposits ─────────────────────────────────────────────────────────────────

func upsertDeposits(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var depID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_deposits
				(company, external_id, doc_number, txn_date, total_amount,
				 currency, private_note, deposit_account_id, deposit_account_name, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number           = EXCLUDED.doc_number,
				txn_date             = EXCLUDED.txn_date,
				total_amount         = EXCLUDED.total_amount,
				currency             = EXCLUDED.currency,
				private_note         = EXCLUDED.private_note,
				deposit_account_id   = EXCLUDED.deposit_account_id,
				deposit_account_name = EXCLUDED.deposit_account_name,
				updated_at           = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			numStr(m, "TotalAmt"),
			strNested(m, "CurrencyRef", "value"),
			str(m, "PrivateNote"),
			strNested(m, "DepositToAccountRef", "value"),
			strNested(m, "DepositToAccountRef", "name"),
			metaUpdatedAt(m),
		).Scan(&depID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_deposit_lines WHERE company=$1 AND deposit_id=$2`, company, depID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			var detail map[string]json.RawMessage
			if v, ok := line["DepositLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_deposit_lines
					(deposit_id, company, external_line_id, line_num, description, amount,
					 memo, payment_method_id, payment_method_name,
					 customer_id, customer_name, account_id, account_name)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
				ON CONFLICT (company, deposit_id, external_line_id) DO UPDATE SET
					line_num            = EXCLUDED.line_num,
					description         = EXCLUDED.description,
					amount              = EXCLUDED.amount,
					memo                = EXCLUDED.memo,
					payment_method_id   = EXCLUDED.payment_method_id,
					payment_method_name = EXCLUDED.payment_method_name,
					customer_id         = EXCLUDED.customer_id,
					customer_name       = EXCLUDED.customer_name,
					account_id          = EXCLUDED.account_id,
					account_name        = EXCLUDED.account_name
			`,
				depID, company, lineID,
				numStr(line, "LineNum"),
				str(line, "Description"),
				numStr(line, "Amount"),
				str(line, "Memo"),
				strNested(detail, "PaymentMethodRef", "value"),
				strNested(detail, "PaymentMethodRef", "name"),
				strNested(detail, "Entity", "value"),
				strNested(detail, "Entity", "name"),
				strNested(detail, "AccountRef", "value"),
				strNested(detail, "AccountRef", "name"),
			)
		}

		count++
	}
	return count, nil
}

// ─── Purchase Orders ───────────────────────────────────────────────────────────

func upsertPurchaseOrders(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}

		var poID string
		err := db.QueryRow(ctx, `
			INSERT INTO qb_purchase_orders
				(company, external_id, doc_number, txn_date, po_status,
				 vendor_id, vendor_name, ap_account_id, ap_account_name,
				 total_amount, private_note, memo, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT (company, external_id) DO UPDATE SET
				doc_number      = EXCLUDED.doc_number,
				txn_date        = EXCLUDED.txn_date,
				po_status       = EXCLUDED.po_status,
				vendor_id       = EXCLUDED.vendor_id,
				vendor_name     = EXCLUDED.vendor_name,
				ap_account_id   = EXCLUDED.ap_account_id,
				ap_account_name = EXCLUDED.ap_account_name,
				total_amount    = EXCLUDED.total_amount,
				private_note    = EXCLUDED.private_note,
				memo            = EXCLUDED.memo,
				updated_at      = EXCLUDED.updated_at
			RETURNING id
		`,
			company, str(m, "Id"),
			str(m, "DocNumber"),
			dateStr(m, "TxnDate"),
			str(m, "POStatus"),
			strNested(m, "VendorRef", "value"),
			strNested(m, "VendorRef", "name"),
			strNested(m, "APAccountRef", "value"),
			strNested(m, "APAccountRef", "name"),
			numStr(m, "TotalAmt"),
			str(m, "PrivateNote"),
			str(m, "Memo"),
			metaUpdatedAt(m),
		).Scan(&poID)
		if err != nil {
			continue
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_purchase_order_lines WHERE company=$1 AND po_id=$2`, company, poID)
		for _, line := range lines(m) {
			lineID := str(line, "Id")
			// PO lines carry either an account-based or item-based expense detail.
			var detail map[string]json.RawMessage
			if v, ok := line["AccountBasedExpenseLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			} else if v, ok := line["ItemBasedExpenseLineDetail"]; ok {
				_ = json.Unmarshal(v, &detail)
			}
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_purchase_order_lines
					(po_id, company, line_id, description, amount, received, detail_type,
					 account_ref_id, account_ref_name, item_ref_id, item_ref_name,
					 customer_id, customer_name, class_ref_id, class_ref_name,
					 project_ref, billable_status, tax_code_ref)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
				ON CONFLICT (company, po_id, line_id) DO UPDATE SET
					description      = EXCLUDED.description,
					amount           = EXCLUDED.amount,
					received         = EXCLUDED.received,
					detail_type      = EXCLUDED.detail_type,
					account_ref_id   = EXCLUDED.account_ref_id,
					account_ref_name = EXCLUDED.account_ref_name,
					item_ref_id      = EXCLUDED.item_ref_id,
					item_ref_name    = EXCLUDED.item_ref_name,
					customer_id      = EXCLUDED.customer_id,
					customer_name    = EXCLUDED.customer_name,
					class_ref_id     = EXCLUDED.class_ref_id,
					class_ref_name   = EXCLUDED.class_ref_name,
					project_ref      = EXCLUDED.project_ref,
					billable_status  = EXCLUDED.billable_status,
					tax_code_ref     = EXCLUDED.tax_code_ref
			`,
				poID, company, lineID,
				str(line, "Description"),
				numStr(line, "Amount"),
				numStr(line, "Received"),
				str(line, "DetailType"),
				strNested(detail, "AccountRef", "value"),
				strNested(detail, "AccountRef", "name"),
				strNested(detail, "ItemRef", "value"),
				strNested(detail, "ItemRef", "name"),
				strNested(detail, "CustomerRef", "value"),
				strNested(detail, "CustomerRef", "name"),
				strNested(detail, "ClassRef", "value"),
				strNested(detail, "ClassRef", "name"),
				strNested(line, "ProjectRef", "value"),
				str(detail, "BillableStatus"),
				strNested(detail, "TaxCodeRef", "value"),
			)
		}

		_, _ = db.Exec(ctx, `DELETE FROM qb_purchase_order_links WHERE company=$1 AND po_id=$2`, company, poID)
		for _, txn := range linkedTxns(m) {
			txnID := str(txn, "TxnId")
			_, _ = db.Exec(ctx, `
				INSERT INTO qb_purchase_order_links (po_id, company, txn_id, txn_type)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (company, po_id, txn_id) DO UPDATE SET txn_type = EXCLUDED.txn_type
			`, poID, company, txnID, str(txn, "TxnType"))
		}

		count++
	}
	return count, nil
}

// ─── Accounts (chart of accounts) ──────────────────────────────────────────────

func upsertAccounts(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		_, err := db.Exec(ctx, `
			INSERT INTO qb_accounts
				(company, external_id, name, fully_qualified_name, acct_num,
				 account_type, account_sub_type, classification, current_balance,
				 active, sub_account, parent_id, parent_name, description, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			ON CONFLICT (company, external_id) DO UPDATE SET
				name                 = EXCLUDED.name,
				fully_qualified_name = EXCLUDED.fully_qualified_name,
				acct_num             = EXCLUDED.acct_num,
				account_type         = EXCLUDED.account_type,
				account_sub_type     = EXCLUDED.account_sub_type,
				classification       = EXCLUDED.classification,
				current_balance      = EXCLUDED.current_balance,
				active               = EXCLUDED.active,
				sub_account          = EXCLUDED.sub_account,
				parent_id            = EXCLUDED.parent_id,
				parent_name          = EXCLUDED.parent_name,
				description          = EXCLUDED.description,
				updated_at           = EXCLUDED.updated_at
		`,
			company, str(m, "Id"),
			str(m, "Name"),
			str(m, "FullyQualifiedName"),
			str(m, "AcctNum"),
			str(m, "AccountType"),
			str(m, "AccountSubType"),
			str(m, "Classification"),
			numStr(m, "CurrentBalance"),
			boolVal(m, "Active"),
			boolVal(m, "SubAccount"),
			strNested(m, "ParentRef", "value"),
			strNested(m, "ParentRef", "name"),
			str(m, "Description"),
			metaUpdatedAt(m),
		)
		if err != nil {
			continue
		}
		count++
	}
	return count, nil
}

// ─── Vendors (subcontractor master) ────────────────────────────────────────────

func upsertVendors(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		_, err := db.Exec(ctx, `
			INSERT INTO qb_vendors
				(company, external_id, display_name, company_name, active,
				 vendor_1099, balance, email, phone, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (company, external_id) DO UPDATE SET
				display_name = EXCLUDED.display_name,
				company_name = EXCLUDED.company_name,
				active       = EXCLUDED.active,
				vendor_1099  = EXCLUDED.vendor_1099,
				balance      = EXCLUDED.balance,
				email        = EXCLUDED.email,
				phone        = EXCLUDED.phone,
				updated_at   = EXCLUDED.updated_at
		`,
			company, str(m, "Id"),
			str(m, "DisplayName"),
			str(m, "CompanyName"),
			boolVal(m, "Active"),
			boolVal(m, "Vendor1099"),
			numStr(m, "Balance"),
			strNested(m, "PrimaryEmailAddr", "Address"),
			strNested(m, "PrimaryPhone", "FreeFormNumber"),
			metaUpdatedAt(m),
		)
		if err != nil {
			continue
		}
		count++
	}
	return count, nil
}

// ─── Customers (project / job master) ──────────────────────────────────────────

func upsertCustomers(ctx context.Context, db *pgxpool.Pool, company string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		_, err := db.Exec(ctx, `
			INSERT INTO qb_customers
				(company, external_id, display_name, fully_qualified_name, company_name,
				 active, job, parent_id, parent_name, balance, balance_with_jobs,
				 email, level, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
			ON CONFLICT (company, external_id) DO UPDATE SET
				display_name         = EXCLUDED.display_name,
				fully_qualified_name = EXCLUDED.fully_qualified_name,
				company_name         = EXCLUDED.company_name,
				active               = EXCLUDED.active,
				job                  = EXCLUDED.job,
				parent_id            = EXCLUDED.parent_id,
				parent_name          = EXCLUDED.parent_name,
				balance              = EXCLUDED.balance,
				balance_with_jobs    = EXCLUDED.balance_with_jobs,
				email                = EXCLUDED.email,
				level                = EXCLUDED.level,
				updated_at           = EXCLUDED.updated_at
		`,
			company, str(m, "Id"),
			str(m, "DisplayName"),
			str(m, "FullyQualifiedName"),
			str(m, "CompanyName"),
			boolVal(m, "Active"),
			boolVal(m, "Job"),
			strNested(m, "ParentRef", "value"),
			strNested(m, "ParentRef", "name"),
			numStr(m, "Balance"),
			numStr(m, "BalanceWithJobs"),
			strNested(m, "PrimaryEmailAddr", "Address"),
			intVal(m, "Level"),
			metaUpdatedAt(m),
		)
		if err != nil {
			continue
		}
		count++
	}
	return count, nil
}

// ─── Generic raw capture ───────────────────────────────────────────────────────
// Stores the full QB payload for any entity without a dedicated table, so structured
// views can be derived later without re-fetching from QuickBooks.

func upsertRaw(ctx context.Context, db *pgxpool.Pool, company, entity string, rows []json.RawMessage) (int, error) {
	count := 0
	for _, raw := range rows {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		externalID := str(m, "Id")
		if externalID == "" {
			continue
		}
		_, err := db.Exec(ctx, `
			INSERT INTO qb_raw (company, entity, external_id, data, synced_at)
			VALUES ($1,$2,$3,$4::jsonb,now())
			ON CONFLICT (company, entity, external_id) DO UPDATE SET
				data = EXCLUDED.data, synced_at = now()
		`, company, entity, externalID, string(raw))
		if err != nil {
			continue
		}
		count++
	}
	return count, nil
}
