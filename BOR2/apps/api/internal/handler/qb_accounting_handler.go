package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBAccountingHandler struct {
	db *pgxpool.Pool
}

func NewQBAccountingHandler(db *pgxpool.Pool) *QBAccountingHandler {
	return &QBAccountingHandler{db: db}
}

// ChartPoint represents one period on the cash flow chart.
type ChartPoint struct {
	Period   string  `json:"period"`
	Received float64 `json:"received"`
	Paid     float64 `json:"paid"`
}

// ProjectCard represents one project in the carousel.
type ProjectCard struct {
	CustomerID string  `json:"customer_id"`
	Name       string  `json:"name"`
	Estimate   float64 `json:"estimate"`
	Invoiced   float64 `json:"invoiced"`
	Expenses   float64 `json:"expenses"`
	Profit     float64 `json:"profit"`
	ProfitPct  float64 `json:"profit_pct"`
}

// ── Project Detail types ──────────────────────────────────────────────────────

type EstimateLine struct {
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	UnitPrice   float64 `json:"unit_price"`
	Quantity    float64 `json:"quantity"`
	ItemName    string  `json:"item_ref_name"`
}

type EstimateInfo struct {
	DocNumber   string         `json:"doc_number"`
	TxnDate     string         `json:"txn_date"`
	TxnStatus   string         `json:"txn_status"`
	TotalAmount float64        `json:"total_amount"`
	Lines       []EstimateLine `json:"lines"`
}

type BillPaymentBrief struct {
	DocNumber   string  `json:"doc_number"`
	TxnDate     string  `json:"txn_date"`
	TotalAmount float64 `json:"total_amount"`
	PrivateNote string  `json:"private_note"`
}

type BillLine struct {
	Description    string  `json:"description"`
	Amount         float64 `json:"amount"`
	AccountRefName string  `json:"account_ref_name"`
}

type BillDetail struct {
	ExternalID  string             `json:"external_id"`
	DocNumber   string             `json:"doc_number"`
	TxnDate     string             `json:"txn_date"`
	VendorName  string             `json:"vendor_name"`
	TotalAmount float64            `json:"total_amount"`
	Lines       []BillLine         `json:"lines"`
	Payments    []BillPaymentBrief `json:"payments"`
}

type PurchaseLine struct {
	Description    string  `json:"description"`
	Amount         float64 `json:"amount"`
	AccountRefName string  `json:"account_ref_name"`
}

type PurchaseDetail struct {
	ExternalID  string         `json:"external_id"`
	TxnDate     string         `json:"txn_date"`
	PaymentType string         `json:"payment_type"`
	TotalAmount float64        `json:"total_amount"`
	PrivateNote string         `json:"private_note"`
	Lines       []PurchaseLine `json:"lines"`
}

type VendorCreditLine struct {
	Description    string  `json:"description"`
	Amount         float64 `json:"amount"`
	AccountRefName string  `json:"account_ref_name"`
}

type VendorCreditDetail struct {
	ExternalID  string             `json:"external_id"`
	DocNumber   string             `json:"doc_number"`
	TxnDate     string             `json:"txn_date"`
	VendorName  string             `json:"vendor_name"`
	TotalAmount float64            `json:"total_amount"`
	Lines       []VendorCreditLine `json:"lines"`
}

type PaymentBrief struct {
	TotalAmount float64 `json:"total_amount"`
	TxnDate     string  `json:"txn_date"`
	PaymentRef  string  `json:"payment_ref"`
	PrivateNote string  `json:"private_note"`
}

type InvoiceDetail struct {
	ExternalID  string         `json:"external_id"`
	DocNumber   string         `json:"doc_number"`
	TxnDate     string         `json:"txn_date"`
	TotalAmount float64        `json:"total_amount"`
	Balance     float64        `json:"balance"`
	Payments    []PaymentBrief `json:"payments"`
}

type BackchargeDetail struct {
	TxnDate     string  `json:"txn_date"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Memo        string  `json:"memo"`
}

type POLineBrief struct {
	Description    string  `json:"description"`
	Amount         float64 `json:"amount"`
	Received       float64 `json:"received"`
	AccountRefName string  `json:"account_ref_name"`
}

type PurchaseOrderDetail struct {
	ExternalID  string        `json:"external_id"`
	DocNumber   string        `json:"doc_number"`
	TxnDate     string        `json:"txn_date"`
	VendorName  string        `json:"vendor_name"`
	POStatus    string        `json:"po_status"`
	TotalAmount float64       `json:"total_amount"`
	Received    float64       `json:"received"`
	Open        float64       `json:"open"`
	Lines       []POLineBrief `json:"lines"`
}

type ProjectDetailResponse struct {
	CustomerName   string                `json:"customer_name"`
	Estimate       *EstimateInfo         `json:"estimate"`
	Bills          []BillDetail          `json:"bills"`
	Purchases      []PurchaseDetail      `json:"purchases"`
	VendorCredits  []VendorCreditDetail  `json:"vendor_credits"`
	Invoices       []InvoiceDetail       `json:"invoices"`
	Backcharges    []BackchargeDetail    `json:"backcharges"`
	PurchaseOrders []PurchaseOrderDetail `json:"purchase_orders"`
}

// GET /api/v1/qb/accounting/years?company=hvac
// Returns the distinct years that have data for the given company.
func (h *QBAccountingHandler) Years(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT DISTINCT EXTRACT(YEAR FROM txn_date)::int AS year
		FROM (
			SELECT txn_date FROM qb_estimates     WHERE company = $1 AND txn_date IS NOT NULL
			UNION
			SELECT txn_date FROM qb_payments      WHERE company = $1 AND txn_date IS NOT NULL
			UNION
			SELECT txn_date FROM qb_bills         WHERE company = $1 AND txn_date IS NOT NULL
			UNION
			SELECT txn_date FROM qb_invoices      WHERE company = $1 AND txn_date IS NOT NULL
		) t
		WHERE EXTRACT(YEAR FROM txn_date) BETWEEN 2018 AND EXTRACT(YEAR FROM NOW())::int + 1
		ORDER BY year DESC
	`, company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	var years []int
	for rows.Next() {
		var y int
		rows.Scan(&y)
		years = append(years, y)
	}
	if years == nil {
		years = []int{}
	}
	return c.JSON(fiber.Map{"data": years})
}

// GET /api/v1/qb/accounting/chart?company=hvac[&year=2025][&month=04]
// Returns paid vs received per period. Year is optional — omit for all-time monthly view.
func (h *QBAccountingHandler) Chart(c *fiber.Ctx) error {
	company  := c.Query("company")
	yearStr  := c.Query("year")
	monthStr := c.Query("month")

	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}

	hasYear := yearStr != ""
	var year int
	if hasYear {
		var err error
		year, err = strconv.Atoi(yearStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid year")
		}
	}

	// Day-level only when a specific year AND month are provided
	byDay := hasYear && monthStr != ""
	var month int
	if byDay {
		var err error
		month, err = strconv.Atoi(monthStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid month")
		}
	}

	var truncFmt, labelFmt string
	if byDay {
		truncFmt = "day"
		labelFmt = "YYYY-MM-DD"
	} else {
		truncFmt = "month"
		labelFmt = "YYYY-MM"
	}

	// ── Received ──────────────────────────────────────────────────────────────
	receivedQ := `SELECT TO_CHAR(DATE_TRUNC($1, txn_date), $2) as period, COALESCE(SUM(total_amount), 0)
		FROM qb_payments WHERE company = $3`
	args := []any{truncFmt, labelFmt, company}
	if hasYear {
		receivedQ += ` AND EXTRACT(YEAR FROM txn_date) = $4`
		args = append(args, year)
		if byDay {
			receivedQ += ` AND EXTRACT(MONTH FROM txn_date) = $5`
			args = append(args, month)
		}
	}
	receivedQ += ` GROUP BY 1 ORDER BY 1`

	rows, err := h.db.Query(c.Context(), receivedQ, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	received := map[string]float64{}
	for rows.Next() {
		var period string; var amount float64
		rows.Scan(&period, &amount)
		received[period] = amount
	}
	rows.Close()

	// ── Paid ──────────────────────────────────────────────────────────────────
	paidQ := `SELECT TO_CHAR(DATE_TRUNC($1, txn_date), $2) as period, COALESCE(SUM(total_amount), 0)
		FROM qb_bill_payments WHERE company = $3`
	paidArgs := []any{truncFmt, labelFmt, company}
	if hasYear {
		paidQ += ` AND EXTRACT(YEAR FROM txn_date) = $4`
		paidArgs = append(paidArgs, year)
		if byDay {
			paidQ += ` AND EXTRACT(MONTH FROM txn_date) = $5`
			paidArgs = append(paidArgs, month)
		}
	}
	paidQ += ` GROUP BY 1 ORDER BY 1`

	rows2, err := h.db.Query(c.Context(), paidQ, paidArgs...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	paid := map[string]float64{}
	for rows2.Next() {
		var period string; var amount float64
		rows2.Scan(&period, &amount)
		paid[period] = amount
	}
	rows2.Close()

	// ── Merge periods ─────────────────────────────────────────────────────────
	periods := map[string]bool{}
	for k := range received { periods[k] = true }
	for k := range paid     { periods[k] = true }

	// When a specific year is selected (not all-time), fill all 12 months
	if hasYear && !byDay {
		for m := 1; m <= 12; m++ {
			key := time.Date(year, time.Month(m), 1, 0, 0, 0, 0, time.UTC).Format("2006-01")
			periods[key] = true
		}
	}

	points := make([]ChartPoint, 0, len(periods))
	for p := range periods {
		points = append(points, ChartPoint{Period: p, Received: received[p], Paid: paid[p]})
	}
	for i := 0; i < len(points); i++ {
		for j := i + 1; j < len(points); j++ {
			if points[i].Period > points[j].Period {
				points[i], points[j] = points[j], points[i]
			}
		}
	}

	return c.JSON(fiber.Map{"data": points})
}

// GET /api/v1/qb/accounting/projects?company=hvac[&year=2025]
// Returns one card per project grouped by customer_id — identical logic to BOR1.
func (h *QBAccountingHandler) Projects(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	yearStr := c.Query("year")

	args := []any{company}
	yearFilter := ""

	if yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid year")
		}
		args = append(args, year)
		yearFilter = " AND EXTRACT(YEAR FROM txn_date) = $2"
	}

	query := `
		WITH estimates AS (
			SELECT customer_id, MAX(customer_name) AS customer_name, SUM(total_amount) AS total
			FROM qb_estimates
			WHERE company = $1` + yearFilter + `
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		invoices AS (
			SELECT customer_id, SUM(total_amount) AS total
			FROM qb_invoices
			WHERE company = $1
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		backcharges AS (
			SELECT customer_id, SUM(amount) AS total
			FROM qb_deposit_lines
			WHERE company = $1
			  AND customer_id IS NOT NULL AND customer_id <> ''
			  AND amount < 0
			GROUP BY customer_id
		),
		bill_exp AS (
			SELECT customer_id, SUM(amount) AS total
			FROM qb_bill_lines
			WHERE company = $1
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		purchase_exp AS (
			SELECT customer_id, SUM(amount) AS total
			FROM qb_purchase_lines
			WHERE company = $1
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		vendor_credit_exp AS (
			SELECT customer_id, SUM(amount) AS total
			FROM qb_vendor_credit_lines
			WHERE company = $1
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		expenses AS (
			SELECT customer_id, SUM(total) AS total
			FROM (
				SELECT customer_id, total FROM bill_exp
				UNION ALL
				SELECT customer_id, total FROM purchase_exp
				UNION ALL
				SELECT customer_id, total FROM vendor_credit_exp
			) x
			GROUP BY customer_id
		)
		SELECT
			e.customer_id,
			e.customer_name,
			e.total                                                    AS estimate,
			COALESCE(i.total, 0) + COALESCE(bc.total, 0)             AS invoiced,
			COALESCE(exp.total, 0)                                     AS expenses
		FROM estimates e
		LEFT JOIN invoices    i   ON i.customer_id   = e.customer_id
		LEFT JOIN backcharges bc  ON bc.customer_id  = e.customer_id
		LEFT JOIN expenses    exp ON exp.customer_id = e.customer_id
		WHERE e.customer_name IS NOT NULL AND e.customer_name <> ''
		ORDER BY e.total DESC
	`

	rows, err := h.db.Query(c.Context(), query, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	var projects []ProjectCard
	for rows.Next() {
		var p ProjectCard
		rows.Scan(&p.CustomerID, &p.Name, &p.Estimate, &p.Invoiced, &p.Expenses)
		p.Profit = p.Invoiced - p.Expenses
		if p.Invoiced > 0 {
			p.ProfitPct = (p.Profit / p.Invoiced) * 100
		}
		projects = append(projects, p)
	}
	if projects == nil {
		projects = []ProjectCard{}
	}

	return c.JSON(fiber.Map{"data": projects})
}

// GET /api/v1/qb/accounting/projects/detail?company=framing&customer_id=xxx
// Returns full project detail: estimate lines, bills+payments, purchases,
// vendor credits, invoices+payments, backcharges — mirrors BOR1 modal data.
func (h *QBAccountingHandler) ProjectDetail(c *fiber.Ctx) error {
	company    := c.Query("company")
	customerID := c.Query("customer_id")
	if company == "" || customerID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and customer_id are required")
	}
	ctx := c.Context()

	var result ProjectDetailResponse

	// ── 1. Estimate (highest total for this customer) ─────────────────────────
	var estInternalID string
	var estExternalID string
	estRow := h.db.QueryRow(ctx, `
		SELECT id::text, external_id,
		       COALESCE(doc_number,''), to_char(txn_date,'YYYY-MM-DD'),
		       COALESCE(txn_status,''), COALESCE(total_amount,0),
		       COALESCE(customer_name,'')
		FROM qb_estimates
		WHERE company=$1 AND customer_id=$2
		ORDER BY total_amount DESC LIMIT 1
	`, company, customerID)

	var est EstimateInfo
	err := estRow.Scan(
		&estInternalID, &estExternalID,
		&est.DocNumber, &est.TxnDate, &est.TxnStatus, &est.TotalAmount,
		&result.CustomerName,
	)
	if err == nil {
		_ = estExternalID // reserved for future use
		// ── Estimate lines ────────────────────────────────────────────────────
		lRows, lerr := h.db.Query(ctx, `
			SELECT COALESCE(description,''), COALESCE(amount,0),
			       COALESCE(unit_price,0), COALESCE(quantity,0),
			       COALESCE(item_ref_name,'')
			FROM qb_estimate_lines
			WHERE company=$1 AND estimate_id=$2
			  AND COALESCE(detail_type,'') <> 'SubTotalLineDetail'
			ORDER BY line_num, created_at
		`, company, estInternalID)
		if lerr == nil {
			for lRows.Next() {
				var l EstimateLine
				lRows.Scan(&l.Description, &l.Amount, &l.UnitPrice, &l.Quantity, &l.ItemName)
				est.Lines = append(est.Lines, l)
			}
			lRows.Close()
		}
		if est.Lines == nil {
			est.Lines = []EstimateLine{}
		}
		result.Estimate = &est
	}

	// ── 2. Bills (lines tagged to this customer) ──────────────────────────────
	billRows, err := h.db.Query(ctx, `
		SELECT DISTINCT b.id::text, b.external_id,
		       COALESCE(b.doc_number,''), to_char(b.txn_date,'YYYY-MM-DD'),
		       COALESCE(b.vendor_name,''), COALESCE(b.total_amount,0)
		FROM qb_bills b
		JOIN qb_bill_lines bl ON bl.bill_id = b.id
		WHERE b.company=$1 AND bl.customer_id=$2
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	type billMeta struct {
		internalID string
		detail     BillDetail
	}
	var bills []billMeta
	for billRows.Next() {
		var m billMeta
		billRows.Scan(
			&m.internalID, &m.detail.ExternalID,
			&m.detail.DocNumber, &m.detail.TxnDate,
			&m.detail.VendorName, &m.detail.TotalAmount,
		)
		m.detail.Lines    = []BillLine{}
		m.detail.Payments = []BillPaymentBrief{}
		bills = append(bills, m)
	}
	billRows.Close()

	if len(bills) > 0 {
		// Collect internal IDs and external IDs
		billInternalIDs := make([]string, len(bills))
		billExternalIDs := make([]string, len(bills))
		billIdxByInternal := map[string]int{}
		billIdxByExternal := map[string]int{}
		for i, b := range bills {
			billInternalIDs[i] = b.internalID
			billExternalIDs[i] = b.detail.ExternalID
			billIdxByInternal[b.internalID] = i
			billIdxByExternal[b.detail.ExternalID] = i
		}

		// Bill lines (only for this customer)
		blRows, _ := h.db.Query(ctx, `
			SELECT bill_id::text, COALESCE(description,''),
			       COALESCE(amount,0), COALESCE(account_ref_name,'')
			FROM qb_bill_lines
			WHERE company=$1 AND customer_id=$2 AND bill_id::text = ANY($3)
			ORDER BY bill_id
		`, company, customerID, billInternalIDs)
		for blRows.Next() {
			var billID string
			var l BillLine
			blRows.Scan(&billID, &l.Description, &l.Amount, &l.AccountRefName)
			if idx, ok := billIdxByInternal[billID]; ok {
				bills[idx].detail.Lines = append(bills[idx].detail.Lines, l)
			}
		}
		blRows.Close()

		// Recalculate each bill's total from customer-specific lines only.
		// b.total_amount is the full bill; we only want this customer's portion.
		for i := range bills {
			var t float64
			for _, l := range bills[i].detail.Lines {
				t += l.Amount
			}
			bills[i].detail.TotalAmount = t
		}

		// Bill payments via bill_payment_links (txn_id = bill.external_id).
		// Use bpl.amount (portion allocated to this bill), not bp.total_amount
		// (which is the full payment that may cover multiple bills).
		bpRows, _ := h.db.Query(ctx, `
			SELECT bpl.txn_id,
			       COALESCE(bp.doc_number,''), to_char(bp.txn_date,'YYYY-MM-DD'),
			       COALESCE(bpl.amount, bp.total_amount, 0), COALESCE(bp.private_note,'')
			FROM qb_bill_payment_links bpl
			JOIN qb_bill_payments bp ON bp.id = bpl.bill_payment_id
			WHERE bp.company=$1 AND bpl.txn_id = ANY($2)
			ORDER BY bp.txn_date
		`, company, billExternalIDs)
		for bpRows.Next() {
			var txnID string
			var p BillPaymentBrief
			bpRows.Scan(&txnID, &p.DocNumber, &p.TxnDate, &p.TotalAmount, &p.PrivateNote)
			if idx, ok := billIdxByExternal[txnID]; ok {
				bills[idx].detail.Payments = append(bills[idx].detail.Payments, p)
			}
		}
		bpRows.Close()
	}

	result.Bills = make([]BillDetail, len(bills))
	for i, b := range bills {
		result.Bills[i] = b.detail
	}

	// ── 3. Purchases (lines tagged to this customer) ──────────────────────────
	pRows, err := h.db.Query(ctx, `
		SELECT DISTINCT p.id::text, p.external_id,
		       to_char(p.txn_date,'YYYY-MM-DD'), COALESCE(p.payment_type,''),
		       COALESCE(p.total_amount,0), COALESCE(p.private_note,'')
		FROM qb_purchases p
		JOIN qb_purchase_lines pl ON pl.purchase_id = p.id
		WHERE p.company=$1 AND pl.customer_id=$2
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	type purchMeta struct {
		internalID string
		detail     PurchaseDetail
	}
	var purchases []purchMeta
	for pRows.Next() {
		var m purchMeta
		pRows.Scan(
			&m.internalID, &m.detail.ExternalID,
			&m.detail.TxnDate, &m.detail.PaymentType,
			&m.detail.TotalAmount, &m.detail.PrivateNote,
		)
		m.detail.Lines = []PurchaseLine{}
		purchases = append(purchases, m)
	}
	pRows.Close()

	if len(purchases) > 0 {
		purchInternalIDs := make([]string, len(purchases))
		purchIdxByInternal := map[string]int{}
		for i, p := range purchases {
			purchInternalIDs[i] = p.internalID
			purchIdxByInternal[p.internalID] = i
		}
		plRows, _ := h.db.Query(ctx, `
			SELECT purchase_id::text, COALESCE(description,''),
			       COALESCE(amount,0), COALESCE(account_ref_name,'')
			FROM qb_purchase_lines
			WHERE company=$1 AND customer_id=$2 AND purchase_id::text = ANY($3)
			ORDER BY purchase_id
		`, company, customerID, purchInternalIDs)
		for plRows.Next() {
			var pID string
			var l PurchaseLine
			plRows.Scan(&pID, &l.Description, &l.Amount, &l.AccountRefName)
			if idx, ok := purchIdxByInternal[pID]; ok {
				purchases[idx].detail.Lines = append(purchases[idx].detail.Lines, l)
			}
		}
		plRows.Close()

		// Recalculate each purchase's total from customer-specific lines only.
		for i := range purchases {
			var t float64
			for _, l := range purchases[i].detail.Lines {
				t += l.Amount
			}
			purchases[i].detail.TotalAmount = t
		}
	}

	result.Purchases = make([]PurchaseDetail, len(purchases))
	for i, p := range purchases {
		result.Purchases[i] = p.detail
	}

	// ── 4. Vendor Credits (lines tagged to this customer) ─────────────────────
	vcRows, err := h.db.Query(ctx, `
		SELECT DISTINCT vc.id::text, vc.external_id,
		       COALESCE(vc.doc_number,''), to_char(vc.txn_date,'YYYY-MM-DD'),
		       COALESCE(vc.vendor_name,''), COALESCE(vc.total_amount,0)
		FROM qb_vendor_credits vc
		JOIN qb_vendor_credit_lines vcl ON vcl.vendor_credit_id = vc.id
		WHERE vc.company=$1 AND vcl.customer_id=$2
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	type vcMeta struct {
		internalID string
		detail     VendorCreditDetail
	}
	var vendorCredits []vcMeta
	for vcRows.Next() {
		var m vcMeta
		vcRows.Scan(
			&m.internalID, &m.detail.ExternalID,
			&m.detail.DocNumber, &m.detail.TxnDate,
			&m.detail.VendorName, &m.detail.TotalAmount,
		)
		m.detail.Lines = []VendorCreditLine{}
		vendorCredits = append(vendorCredits, m)
	}
	vcRows.Close()

	if len(vendorCredits) > 0 {
		vcInternalIDs := make([]string, len(vendorCredits))
		vcIdxByInternal := map[string]int{}
		for i, v := range vendorCredits {
			vcInternalIDs[i] = v.internalID
			vcIdxByInternal[v.internalID] = i
		}
		vclRows, _ := h.db.Query(ctx, `
			SELECT vendor_credit_id::text, COALESCE(description,''),
			       COALESCE(amount,0), COALESCE(account_ref_name,'')
			FROM qb_vendor_credit_lines
			WHERE company=$1 AND customer_id=$2 AND vendor_credit_id::text = ANY($3)
			ORDER BY vendor_credit_id
		`, company, customerID, vcInternalIDs)
		for vclRows.Next() {
			var vcID string
			var l VendorCreditLine
			vclRows.Scan(&vcID, &l.Description, &l.Amount, &l.AccountRefName)
			if idx, ok := vcIdxByInternal[vcID]; ok {
				vendorCredits[idx].detail.Lines = append(vendorCredits[idx].detail.Lines, l)
			}
		}
		vclRows.Close()

		// Recalculate each vendor credit's total from customer-specific lines only.
		for i := range vendorCredits {
			var t float64
			for _, l := range vendorCredits[i].detail.Lines {
				t += l.Amount
			}
			vendorCredits[i].detail.TotalAmount = t
		}
	}

	result.VendorCredits = make([]VendorCreditDetail, len(vendorCredits))
	for i, v := range vendorCredits {
		result.VendorCredits[i] = v.detail
	}

	// ── 5. Invoices + payments ────────────────────────────────────────────────
	invRows, err := h.db.Query(ctx, `
		SELECT id::text, external_id, COALESCE(doc_number,''),
		       to_char(txn_date,'YYYY-MM-DD'),
		       COALESCE(total_amount,0), COALESCE(balance,0)
		FROM qb_invoices
		WHERE company=$1 AND customer_id=$2
		ORDER BY txn_date
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	type invMeta struct {
		internalID string
		detail     InvoiceDetail
	}
	var invoices []invMeta
	for invRows.Next() {
		var m invMeta
		invRows.Scan(
			&m.internalID, &m.detail.ExternalID,
			&m.detail.DocNumber, &m.detail.TxnDate,
			&m.detail.TotalAmount, &m.detail.Balance,
		)
		m.detail.Payments = []PaymentBrief{}
		invoices = append(invoices, m)
	}
	invRows.Close()

	if len(invoices) > 0 {
		invExternalIDs := make([]string, len(invoices))
		invIdxByExternal := map[string]int{}
		for i, inv := range invoices {
			invExternalIDs[i] = inv.detail.ExternalID
			invIdxByExternal[inv.detail.ExternalID] = i
		}
		// Payments via payment_links (txn_id = invoice.external_id)
		payRows, _ := h.db.Query(ctx, `
			SELECT pl.txn_id,
			       COALESCE(p.total_amount,0), to_char(p.txn_date,'YYYY-MM-DD'),
			       COALESCE(p.payment_ref,''), COALESCE(p.private_note,'')
			FROM qb_payment_links pl
			JOIN qb_payments p ON p.id = pl.payment_id
			WHERE p.company=$1 AND pl.txn_id = ANY($2)
			ORDER BY p.txn_date
		`, company, invExternalIDs)
		for payRows.Next() {
			var txnID string
			var pay PaymentBrief
			payRows.Scan(&txnID, &pay.TotalAmount, &pay.TxnDate, &pay.PaymentRef, &pay.PrivateNote)
			if idx, ok := invIdxByExternal[txnID]; ok {
				invoices[idx].detail.Payments = append(invoices[idx].detail.Payments, pay)
			}
		}
		payRows.Close()
	}

	result.Invoices = make([]InvoiceDetail, len(invoices))
	for i, inv := range invoices {
		result.Invoices[i] = inv.detail
	}

	// ── 6. Backcharges (deposit lines with negative amount) ───────────────────
	bcRows, err := h.db.Query(ctx, `
		SELECT to_char(d.txn_date,'YYYY-MM-DD'),
		       COALESCE(dl.amount,0), COALESCE(dl.description,''), COALESCE(dl.memo,'')
		FROM qb_deposit_lines dl
		JOIN qb_deposits d ON d.id = dl.deposit_id
		WHERE dl.company=$1 AND dl.customer_id=$2 AND dl.amount < 0
		ORDER BY d.txn_date
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	result.Backcharges = []BackchargeDetail{}
	for bcRows.Next() {
		var bc BackchargeDetail
		bcRows.Scan(&bc.TxnDate, &bc.Amount, &bc.Description, &bc.Memo)
		result.Backcharges = append(result.Backcharges, bc)
	}
	bcRows.Close()

	// ── 7. Purchase Orders (lines tagged to this customer) ────────────────────
	poRows, err := h.db.Query(ctx, `
		SELECT DISTINCT o.id::text, o.external_id,
		       COALESCE(o.doc_number,''), to_char(o.txn_date,'YYYY-MM-DD'),
		       COALESCE(o.vendor_name,''), COALESCE(o.po_status,'')
		FROM qb_purchase_orders o
		JOIN qb_purchase_order_lines pol ON pol.po_id = o.id
		WHERE o.company=$1 AND pol.customer_id=$2
		ORDER BY o.external_id
	`, company, customerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	type poMeta struct {
		internalID string
		detail     PurchaseOrderDetail
	}
	var pos []poMeta
	for poRows.Next() {
		var m poMeta
		poRows.Scan(
			&m.internalID, &m.detail.ExternalID,
			&m.detail.DocNumber, &m.detail.TxnDate,
			&m.detail.VendorName, &m.detail.POStatus,
		)
		m.detail.Lines = []POLineBrief{}
		pos = append(pos, m)
	}
	poRows.Close()

	if len(pos) > 0 {
		poInternalIDs := make([]string, len(pos))
		poIdxByInternal := map[string]int{}
		for i, p := range pos {
			poInternalIDs[i] = p.internalID
			poIdxByInternal[p.internalID] = i
		}
		polRows, _ := h.db.Query(ctx, `
			SELECT po_id::text, COALESCE(description,''),
			       COALESCE(amount,0), COALESCE(received,0), COALESCE(account_ref_name,'')
			FROM qb_purchase_order_lines
			WHERE company=$1 AND customer_id=$2 AND po_id::text = ANY($3)
			ORDER BY po_id
		`, company, customerID, poInternalIDs)
		for polRows.Next() {
			var poID string
			var l POLineBrief
			polRows.Scan(&poID, &l.Description, &l.Amount, &l.Received, &l.AccountRefName)
			if idx, ok := poIdxByInternal[poID]; ok {
				pos[idx].detail.Lines = append(pos[idx].detail.Lines, l)
			}
		}
		polRows.Close()

		// Totals from this customer's lines only; open = committed-not-yet-billed for Open POs.
		for i := range pos {
			var amt, recv float64
			for _, l := range pos[i].detail.Lines {
				amt += l.Amount
				recv += l.Received
			}
			pos[i].detail.TotalAmount = amt
			pos[i].detail.Received = recv
			if pos[i].detail.POStatus == "Open" && amt > recv {
				pos[i].detail.Open = amt - recv
			}
		}
	}

	result.PurchaseOrders = make([]PurchaseOrderDetail, len(pos))
	for i, p := range pos {
		result.PurchaseOrders[i] = p.detail
	}

	return c.JSON(fiber.Map{"data": result})
}
