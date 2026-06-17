package quickbooks

import (
	"context"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// reconcileTarget maps a QB entity to its local header table, the lines/links
// child tables that reference it, and the FK column children use.
type reconcileTarget struct {
	header   string
	fk       string
	children []string
}

// ReconcileEntities are the transaction entities whose deletions must propagate
// to keep financials accurate. Headers (Account/Vendor/Customer) are rarely
// deleted and lower-impact, so they're intentionally excluded for now.
var reconcileTargets = map[string]reconcileTarget{
	"Bill":          {"qb_bills", "bill_id", []string{"qb_bill_lines", "qb_bill_links"}},
	"Purchase":      {"qb_purchases", "purchase_id", []string{"qb_purchase_lines"}},
	"VendorCredit":  {"qb_vendor_credits", "vendor_credit_id", []string{"qb_vendor_credit_lines"}},
	"Invoice":       {"qb_invoices", "invoice_id", []string{"qb_invoice_lines", "qb_invoice_links"}},
	"Estimate":      {"qb_estimates", "estimate_id", []string{"qb_estimate_lines", "qb_estimate_links"}},
	"Deposit":       {"qb_deposits", "deposit_id", []string{"qb_deposit_lines"}},
	"PurchaseOrder": {"qb_purchase_orders", "po_id", []string{"qb_purchase_order_lines", "qb_purchase_order_links"}},
	"Payment":       {"qb_payments", "payment_id", []string{"qb_payment_links"}},
	"BillPayment":   {"qb_bill_payments", "bill_payment_id", []string{"qb_bill_payment_links"}},
}

// ReconcileEntities is the ordered list of entities reconciled after each sync.
var ReconcileEntities = []string{
	"Bill", "Purchase", "VendorCredit", "Invoice",
	"Estimate", "Deposit", "PurchaseOrder", "Payment", "BillPayment",
}

// ReconcileDeletions removes local rows for transactions that no longer exist in
// QuickBooks (deleted at the source). Upsert alone never catches deletions, so
// without this every deleted bill/invoice/credit lingers forever and inflates the
// numbers. Runs per company × entity, bounded by the syncer's semaphore.
//
// Safety: a company+entity is reconciled ONLY if the full QB id list was fetched
// cleanly AND is non-empty. A transient API error or an empty page therefore can
// never wipe local data — it just skips that pass.
func (s *Syncer) ReconcileDeletions(ctx context.Context, clients []*Client, entities []string) {
	for _, client := range clients {
		for _, entity := range entities {
			tgt, ok := reconcileTargets[entity]
			if !ok {
				continue
			}
			s.sem <- struct{}{}
			start := time.Now()
			removed, err := s.reconcileOne(ctx, client, entity, tgt)
			<-s.sem
			if err != nil {
				logger.Error("qb reconcile skipped",
					"company", client.Company(), "entity", entity, "error", err)
			} else if removed > 0 {
				logger.Info("qb reconcile removed deleted records",
					"company", client.Company(), "entity", entity,
					"removed", removed, "duration", time.Since(start))
			}
		}
	}
}

func (s *Syncer) reconcileOne(ctx context.Context, client *Client, entity string, tgt reconcileTarget) (int, error) {
	company := string(client.Company())

	ids, ok := client.QueryAllIDs(ctx, entity)
	if !ok {
		return 0, fmt.Errorf("incomplete id fetch — not safe to delete")
	}
	if len(ids) == 0 {
		return 0, fmt.Errorf("QB returned 0 ids — refusing to delete everything")
	}

	// Internal ids of local headers whose external_id is no longer in QB.
	rows, err := s.db.Query(ctx,
		fmt.Sprintf(`SELECT id FROM %s WHERE company=$1 AND external_id <> ALL($2)`, tgt.header),
		company, ids)
	if err != nil {
		return 0, err
	}
	var dead []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		dead = append(dead, id)
	}
	rows.Close()
	if len(dead) == 0 {
		return 0, nil
	}

	// Children first (FK references the header's internal id), then the header.
	for _, child := range tgt.children {
		if _, err := s.db.Exec(ctx,
			fmt.Sprintf(`DELETE FROM %s WHERE company=$1 AND %s = ANY($2)`, child, tgt.fk),
			company, dead); err != nil {
			return 0, err
		}
	}
	if _, err := s.db.Exec(ctx,
		fmt.Sprintf(`DELETE FROM %s WHERE company=$1 AND id = ANY($2)`, tgt.header),
		company, dead); err != nil {
		return 0, err
	}
	return len(dead), nil
}
