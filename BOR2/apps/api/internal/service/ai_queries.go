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
	Label string         `json:"label"`
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
	catCashFlow  queryCategory = "cashflow"
	catPipeline  queryCategory = "pipeline"
	catOverdue   queryCategory = "overdue"
	catProject   queryCategory = "project"
	catForecast  queryCategory = "forecast"
	catBilling   queryCategory = "billing"
	catGeneral   queryCategory = "general"
)

var categoryKeywords = map[queryCategory][]string{
	catCashFlow: {"cash", "caixa", "fluxo", "received", "paid", "pagamento", "recebido", "net", "revenue", "receita", "expense", "despesa"},
	catPipeline: {"pipeline", "estimate", "orçamento", "projeto", "project", "andamento", "open", "aberto", "backlog"},
	catOverdue:  {"overdue", "vencido", "atraso", "late", "pending", "pendente", "unpaid", "não pago", "aging"},
	catProject:  {"project detail", "detalhe", "specific", "específico", "margin", "margem", "cost", "custo"},
	catForecast: {"forecast", "previsão", "predict", "futuro", "future", "next month", "próximo", "projection", "projeção", "season"},
	catBilling:  {"invoice", "bill", "nota", "fatura", "vendor", "fornecedor", "payment history", "histórico"},
}

func classifyMessage(msg string) []queryCategory {
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

func (p *AIQueryPlanner) queryCashFlow(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			TO_CHAR(DATE_TRUNC('month', txn_date), 'YYYY-MM') AS month,
			ROUND(SUM(CASE WHEN type='Invoice' THEN total_amount ELSE 0 END)::numeric, 2) AS invoiced,
			ROUND(SUM(CASE WHEN type='Payment' THEN total_amount ELSE 0 END)::numeric, 2) AS received,
			ROUND(SUM(CASE WHEN type IN ('Bill','Purchase') THEN total_amount ELSE 0 END)::numeric, 2) AS expenses
		FROM (
			SELECT txn_date, total_amount, 'Invoice' AS type FROM qb_invoices WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL
			SELECT txn_date, total_amount, 'Payment' FROM qb_payments WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL
			SELECT txn_date, total_amount, 'Bill' FROM qb_bills WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL
			SELECT txn_date, total_amount, 'Purchase' FROM qb_purchases WHERE company=$1 AND txn_date IS NOT NULL
		) t
		WHERE txn_date >= NOW() - INTERVAL '12 months'
		GROUP BY 1 ORDER BY 1`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Cash Flow (last 12 months)", Rows: rows}}, nil
}

func (p *AIQueryPlanner) queryPipeline(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			customer_name,
			ROUND(total_amount::numeric, 2) AS estimate_value,
			txn_date AS estimate_date,
			expiry_date,
			txn_status AS status
		FROM qb_estimates
		WHERE company=$1 AND txn_status NOT IN ('Closed','Rejected')
		ORDER BY total_amount DESC
		LIMIT 20`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Open Pipeline (estimates)", Rows: rows}}, nil
}

func (p *AIQueryPlanner) queryOverdue(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			customer_name,
			doc_number,
			ROUND(total_amount::numeric, 2) AS amount,
			ROUND(balance::numeric, 2) AS balance_due,
			due_date,
			DATE_PART('day', NOW() - due_date)::int AS days_overdue
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

func (p *AIQueryPlanner) queryProjectSummary(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			e.customer_name,
			ROUND(e.total_amount::numeric, 2) AS estimate,
			ROUND(COALESCE(SUM(i.total_amount), 0)::numeric, 2) AS invoiced,
			ROUND(COALESCE(SUM(b.total_amount), 0)::numeric, 2) AS billed_costs,
			ROUND((COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(b.total_amount), 0))::numeric, 2) AS gross_margin
		FROM qb_estimates e
		LEFT JOIN qb_invoices i ON i.company=e.company AND i.customer_name=e.customer_name
		LEFT JOIN qb_bills b ON b.company=e.company AND b.customer_id=e.customer_id
		WHERE e.company=$1 AND e.status NOT IN ('Closed','Rejected')
		GROUP BY e.customer_name, e.total_amount
		ORDER BY e.total_amount DESC
		LIMIT 15`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "Project Financial Summary", Rows: rows}}, nil
}

func (p *AIQueryPlanner) queryForecast(ctx context.Context, company string) ([]QueryResult, error) {
	// Pipeline value + historical avg monthly revenue for next-3-months forecast
	pipeline, err := p.fetchRows(ctx, `
		SELECT
			ROUND(SUM(total_amount)::numeric, 2) AS total_pipeline,
			COUNT(*) AS open_estimates
		FROM qb_estimates
		WHERE company=$1 AND txn_status NOT IN ('Closed','Rejected')`, company)
	if err != nil {
		return nil, err
	}

	historical, err := p.fetchRows(ctx, `
		SELECT
			TO_CHAR(DATE_TRUNC('month', txn_date), 'Mon') AS month,
			ROUND(AVG(monthly_rev)::numeric, 2) AS avg_monthly_revenue
		FROM (
			SELECT DATE_TRUNC('month', txn_date) AS txn_date, SUM(total_amount) AS monthly_rev
			FROM qb_invoices WHERE company=$1 AND txn_date >= NOW() - INTERVAL '24 months'
			GROUP BY 1
		) t
		GROUP BY 1
		ORDER BY MIN(t.txn_date)`, company)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	seasonality, err := p.fetchRows(ctx, `
		SELECT
			EXTRACT(MONTH FROM txn_date)::int AS month_num,
			TO_CHAR(txn_date, 'Month') AS month_name,
			ROUND(AVG(monthly_rev)::numeric, 2) AS avg_revenue
		FROM (
			SELECT DATE_TRUNC('month', txn_date) AS txn_date, SUM(total_amount) AS monthly_rev
			FROM qb_invoices WHERE company=$1
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
		{Label: "Historical Monthly Revenue (avg by month)", Rows: historical},
		{Label: "Seasonality — Next 3 Months (historical avg)", Rows: seasonality},
	}, nil
}

func (p *AIQueryPlanner) queryBillingHistory(ctx context.Context, company string) ([]QueryResult, error) {
	invoices, err := p.fetchRows(ctx, `
		SELECT doc_number, customer_name,
			ROUND(total_amount::numeric,2) AS amount,
			ROUND(balance::numeric,2) AS balance,
			txn_date, due_date
		FROM qb_invoices WHERE company=$1
		ORDER BY txn_date DESC LIMIT 20`, company)
	if err != nil {
		return nil, err
	}
	bills, err := p.fetchRows(ctx, `
		SELECT doc_number, vendor_name,
			ROUND(total_amount::numeric,2) AS amount,
			txn_date, due_date
		FROM qb_bills WHERE company=$1
		ORDER BY txn_date DESC LIMIT 20`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{
		{Label: "Recent Invoices", Rows: invoices},
		{Label: "Recent Bills", Rows: bills},
	}, nil
}

func (p *AIQueryPlanner) querySnapshot(ctx context.Context, company string) ([]QueryResult, error) {
	rows, err := p.fetchRows(ctx, `
		SELECT
			ROUND(SUM(CASE WHEN type='Invoice' THEN amount ELSE 0 END)::numeric,2) AS total_invoiced_ytd,
			ROUND(SUM(CASE WHEN type='Payment' THEN amount ELSE 0 END)::numeric,2) AS total_received_ytd,
			ROUND(SUM(CASE WHEN type='Bill' THEN amount ELSE 0 END)::numeric,2) AS total_billed_ytd,
			ROUND(SUM(CASE WHEN type='Estimate' THEN amount ELSE 0 END)::numeric,2) AS total_pipeline
		FROM (
			SELECT total_amount AS amount, 'Invoice' AS type FROM qb_invoices WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Payment' FROM qb_payments WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Bill' FROM qb_bills WHERE company=$1 AND EXTRACT(YEAR FROM txn_date)=EXTRACT(YEAR FROM NOW())
			UNION ALL
			SELECT total_amount, 'Estimate' FROM qb_estimates WHERE company=$1 AND txn_status NOT IN ('Closed','Rejected')
		) t`, company)
	if err != nil {
		return nil, err
	}
	return []QueryResult{{Label: "YTD Financial Snapshot", Rows: rows}}, nil
}

// fetchRows runs a query and returns a slice of column→value maps.
func (p *AIQueryPlanner) fetchRows(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := p.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	var result []map[string]any
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
