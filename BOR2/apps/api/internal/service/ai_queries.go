package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// QueryResult holds the label and rows returned from a financial query.
type QueryResult struct {
	Label string           `json:"label"`
	Rows  []map[string]any `json:"rows"`
}

// AIQueryPlanner classifies a user message and runs relevant DB queries.
type AIQueryPlanner struct {
	db *pgxpool.Pool
}

func NewAIQueryPlanner(db *pgxpool.Pool) *AIQueryPlanner {
	return &AIQueryPlanner{db: db}
}

type queryCategory string

const (
	catCashFlow queryCategory = "cashflow"
	catPipeline queryCategory = "pipeline"
	catOverdue  queryCategory = "overdue"
	catProject  queryCategory = "project"
	catForecast queryCategory = "forecast"
	catBilling  queryCategory = "billing"
	catGeneral  queryCategory = "general"
	catGreeting queryCategory = "greeting" // no DB queries needed
)

var greetingKeywords = []string{
	"olá", "ola", "oi ", "oi,", "oi!", "oi.", "hello", "hi ", "hi,", "hi!", "hey",
	"bom dia", "boa tarde", "boa noite", "tudo bem", "tudo bom", "good morning", "good afternoon",
	// short follow-ups / confirmations that carry no financial intent
	"certeza", "tem certeza", "sure?", "really?", "sério", "serio", "mesmo?",
	"obrigado", "obrigada", "thanks", "thank you", "ok", "okay", "entendi", "entendido",
	"show", "ótimo", "otimo", "perfeito", "legal", "certo", "blz", "valeu",
}

var categoryKeywords = map[queryCategory][]string{
	catCashFlow: {"cash", "caixa", "fluxo", "received", "paid", "pagamento", "recebido", "net", "revenue", "receita", "expense", "despesa"},
	catPipeline: {"pipeline", "estimate", "orçamento", "projeto", "project", "andamento", "open", "aberto", "backlog"},
	catOverdue:  {"overdue", "vencido", "atraso", "late", "pending", "pendente", "unpaid", "não pago", "aging"},
	catProject:  {"project detail", "detalhe", "specific", "específico", "margin", "margem", "cost", "custo"},
	catForecast: {
		"forecast", "previsão", "predict", "futuro", "future", "next month", "próximo", "projection", "projeção", "season",
		"fecha o ano", "fechar o ano", "ano positivo", "positivo no ano", "no positivo", "break even", "breakeven",
		"end of year", "close the year", "annual", "anual", "rest of the year", "resto do ano",
		"vai fechar", "vamos fechar", "conseguimos", "consegue fechar", "bater a meta",
	},
	catBilling:  {"invoice", "bill", "nota", "fatura", "vendor", "fornecedor", "payment history", "histórico"},
}

// isGreeting returns true for short messages that are purely social (no financial intent).
func isGreeting(msg string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(msg))
	// pure greeting: short message containing a greeting keyword but no financial terms
	if len([]rune(trimmed)) > 60 {
		return false
	}
	for _, kw := range greetingKeywords {
		if strings.Contains(" "+trimmed+" ", kw) || trimmed == strings.TrimSpace(kw) {
			return true
		}
	}
	return false
}

func classifyMessage(msg string) []queryCategory {
	if isGreeting(msg) {
		return []queryCategory{catGreeting}
	}
	lower := strings.ToLower(msg)
	seen := map[queryCategory]bool{}
	var cats []queryCategory
	for cat, keywords := range categoryKeywords {
		for _, kw := range keywords {
			if strings.Contains(lower, kw) && !seen[cat] {
				seen[cat] = true
				cats = append(cats, cat)
				break
			}
		}
	}
	if len(cats) == 0 {
		return []queryCategory{catGeneral}
	}
	// Forecast questions benefit from the YTD snapshot too — add it automatically
	for _, c := range cats {
		if c == catForecast {
			seen[catGeneral] = true
			cats = append(cats, catGeneral)
			break
		}
	}
	return cats
}

// Run classifies the message and executes relevant queries for the company.
func (p *AIQueryPlanner) Run(ctx context.Context, company, message string) ([]QueryResult, error) {
	cats := classifyMessage(message)
	var results []QueryResult

	for _, cat := range cats {
		var qrs []QueryResult
		var err error
		switch cat {
		case catGreeting:
			continue // no data needed — Aria responds conversationally
		case catCashFlow:
			qrs, err = p.queryCashFlow(ctx, company)
		case catPipeline:
			qrs, err = p.queryPipeline(ctx, company)
		case catOverdue:
			qrs, err = p.queryOverdue(ctx, company)
		case catProject:
			qrs, err = p.queryProjectSummary(ctx, company)
		case catForecast:
			qrs, err = p.queryForecast(ctx, company)
		case catBilling:
			qrs, err = p.queryBillingHistory(ctx, company)
		default:
			qrs, err = p.querySnapshot(ctx, company)
		}
		if err != nil {
			return nil, fmt.Errorf("ai queries [%s]: %w", cat, err)
		}
		results = append(results, qrs...)
	}
	return results, nil
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
// Uses qb_payments (received) and qb_bill_payments (paid) — same source as the
// accounting chart handler.

func (p *AIQueryPlanner) queryCashFlow(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			TO_CHAR(DATE_TRUNC('month', txn_date), 'YYYY-MM') AS month,
			ROUND(SUM(CASE WHEN type='Received' THEN total_amount ELSE 0 END)::numeric, 2) AS received,
			ROUND(SUM(CASE WHEN type='Paid'     THEN total_amount ELSE 0 END)::numeric, 2) AS paid,
			ROUND(SUM(CASE WHEN type='Invoiced' THEN total_amount ELSE 0 END)::numeric, 2) AS invoiced
		FROM (
			SELECT txn_date, total_amount, 'Received' AS type FROM qb_payments      WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL
			SELECT txn_date, total_amount, 'Paid'     FROM qb_bill_payments          WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL
			SELECT txn_date, total_amount, 'Invoiced' FROM qb_invoices               WHERE company=$1 AND txn_date IS NOT NULL
		) t
		WHERE txn_date >= NOW() - INTERVAL '12 months'
		GROUP BY 1 ORDER BY 1`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Cash Flow (last 12 months)", Rows: rows}}, nil
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
// qb_estimates columns: doc_number, txn_date, txn_status, accepted_date,
//   customer_id, customer_name, total_amount

func (p *AIQueryPlanner) queryPipeline(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			customer_name,
			ROUND(total_amount::numeric, 2) AS estimate_value,
			txn_date                        AS estimate_date,
			accepted_date,
			txn_status                      AS status
		FROM qb_estimates
		WHERE company=$1
		  AND txn_status NOT IN ('Closed','Rejected')
		ORDER BY total_amount DESC
		LIMIT 20`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Open Pipeline (estimates)", Rows: rows}}, nil
}

// ── Overdue invoices ──────────────────────────────────────────────────────────
// qb_invoices columns: doc_number, txn_date, due_date, customer_id,
//   customer_name, total_amount, balance

func (p *AIQueryPlanner) queryOverdue(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			customer_name,
			doc_number,
			ROUND(total_amount::numeric, 2)                      AS amount,
			ROUND(balance::numeric, 2)                           AS balance_due,
			due_date,
			DATE_PART('day', NOW() - due_date)::int              AS days_overdue
		FROM qb_invoices
		WHERE company=$1
		  AND due_date < NOW()
		  AND balance > 0
		ORDER BY days_overdue DESC
		LIMIT 20`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Overdue Invoices", Rows: rows}}, nil
}

// ── Project financial summary ─────────────────────────────────────────────────
// Costs come from lines tables (bill_lines + purchase_lines + vendor_credit_lines)
// linked by customer_id — same logic as the accounting Projects handler.

func (p *AIQueryPlanner) queryProjectSummary(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		WITH estimates AS (
			SELECT customer_id, MAX(customer_name) AS customer_name, SUM(total_amount) AS estimate
			FROM qb_estimates
			WHERE company=$1
			  AND txn_status NOT IN ('Closed','Rejected')
			  AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		invoiced AS (
			SELECT customer_id, SUM(total_amount) AS total
			FROM qb_invoices
			WHERE company=$1 AND customer_id IS NOT NULL AND customer_id <> ''
			GROUP BY customer_id
		),
		expenses AS (
			SELECT customer_id, SUM(total) AS total FROM (
				SELECT customer_id, SUM(amount) AS total
				FROM qb_bill_lines
				WHERE company=$1 AND customer_id IS NOT NULL AND customer_id <> ''
				GROUP BY customer_id
				UNION ALL
				SELECT customer_id, SUM(amount) AS total
				FROM qb_purchase_lines
				WHERE company=$1 AND customer_id IS NOT NULL AND customer_id <> ''
				GROUP BY customer_id
				UNION ALL
				SELECT customer_id, SUM(amount) AS total
				FROM qb_vendor_credit_lines
				WHERE company=$1 AND customer_id IS NOT NULL AND customer_id <> ''
				GROUP BY customer_id
			) x GROUP BY customer_id
		)
		SELECT
			e.customer_name,
			ROUND(e.estimate::numeric, 2)                                        AS estimate,
			ROUND(COALESCE(i.total, 0)::numeric, 2)                             AS invoiced,
			ROUND(COALESCE(exp.total, 0)::numeric, 2)                           AS expenses,
			ROUND((COALESCE(i.total,0) - COALESCE(exp.total,0))::numeric, 2)   AS gross_margin
		FROM estimates e
		LEFT JOIN invoiced  i   ON i.customer_id   = e.customer_id
		LEFT JOIN expenses  exp ON exp.customer_id = e.customer_id
		ORDER BY e.estimate DESC
		LIMIT 15`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Project Financial Summary", Rows: rows}}, nil
}

// ── Forecast ──────────────────────────────────────────────────────────────────

func (p *AIQueryPlanner) queryForecast(ctx context.Context, company string) ([]QueryResult, error) {
	pipeline, err := p.fetchRows(ctx, `
		SELECT
			ROUND(SUM(total_amount)::numeric, 2) AS total_pipeline,
			COUNT(*)                              AS open_estimates
		FROM qb_estimates
		WHERE company=$1
		  AND txn_status NOT IN ('Closed','Rejected')`, company)
	if err != nil {
		return nil, err
	}

	historical, err := p.fetchRows(ctx, `
		SELECT
			TO_CHAR(DATE_TRUNC('month', txn_date), 'Mon YYYY') AS month,
			ROUND(SUM(total_amount)::numeric, 2)               AS revenue
		FROM qb_payments
		WHERE company=$1 AND txn_date >= NOW() - INTERVAL '24 months'
		GROUP BY DATE_TRUNC('month', txn_date)
		ORDER BY DATE_TRUNC('month', txn_date)`, company)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	seasonality, err := p.fetchRows(ctx, `
		SELECT
			EXTRACT(MONTH FROM txn_date)::int  AS month_num,
			TO_CHAR(txn_date, 'Month')          AS month_name,
			ROUND(AVG(monthly_rev)::numeric, 2) AS avg_revenue
		FROM (
			SELECT DATE_TRUNC('month', txn_date) AS txn_date, SUM(total_amount) AS monthly_rev
			FROM qb_payments WHERE company=$1
			GROUP BY 1
		) t
		WHERE EXTRACT(MONTH FROM txn_date) IN ($2,$3,$4)
		GROUP BY 1,2 ORDER BY 1`,
		company,
		int(now.Month())+1,
		int(now.Month())+2,
		int(now.Month())+3,
	)
	if err != nil {
		return nil, err
	}

	return []QueryResult{
		{Label: "Current Pipeline", Rows: pipeline},
		{Label: "Historical Monthly Revenue (payments received)", Rows: historical},
		{Label: "Seasonality — Next 3 Months (historical avg)", Rows: seasonality},
	}, nil
}

// ── Billing history ───────────────────────────────────────────────────────────

func (p *AIQueryPlanner) queryBillingHistory(ctx context.Context, company string) ([]QueryResult, error) {
	invoices, err := p.fetchRows(ctx, `
		SELECT doc_number, customer_name,
			ROUND(total_amount::numeric,2) AS amount,
			ROUND(balance::numeric,2)      AS balance,
			txn_date, due_date
		FROM qb_invoices
		WHERE company=$1
		ORDER BY txn_date DESC LIMIT 20`, company)
	if err != nil {
		return nil, err
	}

	bills, err := p.fetchRows(ctx, `
		SELECT doc_number, vendor_name,
			ROUND(total_amount::numeric,2) AS amount,
			ROUND(balance::numeric,2)      AS balance,
			txn_date, due_date
		FROM qb_bills
		WHERE company=$1
		ORDER BY txn_date DESC LIMIT 20`, company)
	if err != nil {
		return nil, err
	}

	return []QueryResult{
		{Label: "Recent Invoices", Rows: invoices},
		{Label: "Recent Bills", Rows: bills},
	}, nil
}

// ── General snapshot (YTD) ────────────────────────────────────────────────────
// Uses qb_payments (received) and qb_bill_payments (paid) — same as chart.

func (p *AIQueryPlanner) querySnapshot(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			ROUND(SUM(CASE WHEN type='Invoiced'  THEN amount ELSE 0 END)::numeric,2) AS total_invoiced_ytd,
			ROUND(SUM(CASE WHEN type='Received'  THEN amount ELSE 0 END)::numeric,2) AS total_received_ytd,
			ROUND(SUM(CASE WHEN type='Paid'      THEN amount ELSE 0 END)::numeric,2) AS total_paid_ytd,
			ROUND(SUM(CASE WHEN type='Pipeline'  THEN amount ELSE 0 END)::numeric,2) AS total_pipeline
		FROM (
			SELECT total_amount AS amount, 'Invoiced' AS type
			FROM qb_invoices
			WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Received'
			FROM qb_payments
			WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Paid'
			FROM qb_bill_payments
			WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Pipeline'
			FROM qb_estimates
			WHERE company=$1 AND txn_status NOT IN ('Closed','Rejected')
		) t`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "YTD Financial Snapshot", Rows: rows}}, nil
}

// ── fetchRows ─────────────────────────────────────────────────────────────────

func (p *AIQueryPlanner) fetchRows(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := p.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	result := make([]map[string]any, 0)
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(map[string]any, len(fields))
		for i, f := range fields {
			row[string(f.Name)] = vals[i]
		}
		result = append(result, row)
	}
	return result, rows.Err()
}
