package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
	db  *pgxpool.Pool
	llm *OpenRouterClient
}

func NewAIQueryPlanner(db *pgxpool.Pool, llm *OpenRouterClient) *AIQueryPlanner {
	return &AIQueryPlanner{db: db, llm: llm}
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

const classifySystemPrompt = `You are the query router for Aria, a financial assistant for Premium Group — a US-based construction company.
Your ONLY job: decide which query tools to run based on the user's message, then return their names as a JSON array.
Output NOTHING except a valid JSON array. No explanation, no prose, no markdown fences.

━━━ QUICKBOOKS DATA AVAILABLE ━━━

The following tables are synced daily from QuickBooks. Understanding them helps you pick the right tool.

qb_payments        — Money RECEIVED from customers. Each row = one customer payment. Fields: txn_date, total_amount, customer_name.
qb_bill_payments   — Money PAID to vendors. Each row = one vendor payment made. Fields: txn_date, total_amount.
qb_invoices        — Invoices ISSUED to customers. Fields: doc_number, txn_date, due_date, customer_name, total_amount, balance.
                     balance > 0 means partially or fully unpaid. due_date < today + balance > 0 = overdue receivable.
qb_estimates       — Project estimates / quotes sent to customers. Fields: doc_number, txn_date, txn_status, accepted_date, customer_name, total_amount.
                     txn_status: Pending, Accepted, Closed, Rejected. Active pipeline = NOT Closed AND NOT Rejected.
qb_bills           — Bills RECEIVED from vendors (money we owe). Fields: doc_number, txn_date, due_date, vendor_name, total_amount, balance.
                     balance > 0 = unpaid. due_date < today + balance > 0 = overdue payable.
qb_bill_lines      — Line items inside vendor bills, each optionally linked to a customer/project via customer_id. Used for project cost attribution.
qb_purchase_lines  — Line items from non-bill purchases (credit card, cash), also linked to customer/project. Used for project costs.
qb_vendor_credit_lines — Line items from vendor credits. Negative cost adjustments per project.

━━━ AVAILABLE QUERY TOOLS ━━━

"cashflow"
  Queries: qb_payments (received) + qb_bill_payments (paid) + qb_invoices (invoiced), last 12 months, grouped by month.
  Returns: monthly received / paid / invoiced totals.
  Use for: cash flow analysis, how much we received vs spent, monthly revenue trend, net cash per month,
           "como está o caixa", "quanto recebemos", "fluxo de caixa", "gastando mais do que recebendo".

"pipeline"
  Queries: qb_estimates WHERE status NOT IN (Closed, Rejected), ordered by value DESC.
  Returns: customer name, estimate value, estimate date, accepted date, status.
  Use for: open pipeline, backlog, pending proposals, work not yet started,
           "o que temos no pipeline", "orçamentos em aberto", "quais projetos estão pendentes".

"overdue"
  Queries: qb_invoices WHERE due_date < now AND balance > 0 (overdue receivables)
           AND qb_bills WHERE due_date < now AND balance > 0 (overdue payables).
  Returns: who owes US money + who WE owe, with days overdue for each.
  Use for: overdue invoices, late payments from customers, unpaid vendor bills, aging,
           "quem está devendo", "faturas vencidas", "contas em atraso", "aging report".

"project"
  Queries: qb_estimates + qb_invoices + qb_bill_lines + qb_purchase_lines + qb_vendor_credit_lines, grouped by customer/project.
  Returns: per-project breakdown — estimate vs invoiced vs total expenses vs gross margin.
  Use for: project profitability, margin analysis, cost vs revenue per client,
           "margem do projeto", "como está o projeto X", "custo por cliente", "lucro por obra".

"forecast"
  Queries: qb_estimates (pipeline total) + qb_payments (24-month history) + qb_payments (seasonality avg for next 3 months).
  Returns: total open pipeline value, historical monthly revenue, average monthly revenue for upcoming months.
  Use for: revenue forecast, end-of-year projection, break-even analysis, annual targets,
           "vamos fechar o ano positivo", "previsão de receita", "conseguimos bater a meta",
           "how will we close the year", "rest of year outlook".
  NOTE: always include "general" when using "forecast".

"billing"
  Queries: qb_invoices (last 20, any status) + qb_bills (last 20, any status).
  Returns: recent invoices issued to customers and recent vendor bills received.
  Use for: billing history, invoice records, vendor bill listing, not filtered by payment status,
           "histórico de faturas", "últimas notas", "quais faturas emitimos recentemente".

"general"
  Queries: YTD totals from qb_invoices + qb_payments + qb_bill_payments + qb_estimates.
  Returns: total invoiced YTD, total received YTD, total paid YTD, total active pipeline value.
  Use for: overall business health, YTD performance snapshot, vague financial questions,
           "como estamos indo", "resumo geral", "how are we doing", "give me an overview".
  Also required: always include "general" alongside "forecast".

"greeting"
  No queries. Use for:
  - Greetings and small talk: "olá", "oi", "bom dia", "obrigado", "ok", "entendi", "perfeito", "valeu", "show"
  - Short follow-up questions that reference something already discussed: "e percentualmente?", "e em %?",
    "qual a porcentagem?", "e ele?", "e isso?", "como assim?", "pode detalhar?", "explica melhor",
    "e os outros?", "e o restante?", "quanto isso representa?", "em relação a quê?"
  - Confirmations and reactions: "certeza?", "sério?", "mesmo?", "tem certeza?"
  These messages rely on conversation history — no new data is needed.
  NEVER combine with any financial category.

━━━ RULES ━━━

1. Return ONLY a JSON array, e.g. ["cashflow","overdue"] or ["greeting"]
2. "greeting" is mutually exclusive with all other categories
3. Always add "general" when "forecast" is present
4. Return multiple categories when the question spans multiple topics
5. Prefer specific categories over "general" when intent is clear
6. Default to ["general"] for any financial question that doesn't fit a specific category
7. The user may write in Portuguese or English — handle both equally
8. Short messages using pronouns like "isso", "ele", "ela", "eles" without a new financial topic = "greeting" (answer from context)`

// classifyWithLLM calls a lightweight LLM to classify the user message.
// Falls back to ["general"] on any error.
func (p *AIQueryPlanner) classifyWithLLM(ctx context.Context, message string) []queryCategory {
	if p.llm == nil {
		return []queryCategory{catGeneral}
	}

	resp, err := p.llm.Chat(ctx, []ChatMessage{
		{Role: "system", Content: classifySystemPrompt},
		{Role: "user", Content: message},
	})
	if err != nil {
		log.Printf("classifyWithLLM: llm error: %v — falling back to general", err)
		return []queryCategory{catGeneral}
	}

	// Parse JSON array from response text (strip markdown fences if present)
	raw := strings.TrimSpace(resp.Text)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var names []string
	if err := json.Unmarshal([]byte(raw), &names); err != nil {
		log.Printf("classifyWithLLM: parse error (%v) raw=%q — falling back to general", err, raw)
		return []queryCategory{catGeneral}
	}

	valid := map[string]queryCategory{
		"greeting": catGreeting,
		"cashflow": catCashFlow,
		"pipeline": catPipeline,
		"overdue":  catOverdue,
		"project":  catProject,
		"forecast": catForecast,
		"billing":  catBilling,
		"general":  catGeneral,
	}

	seen := map[queryCategory]bool{}
	var cats []queryCategory
	for _, name := range names {
		if cat, ok := valid[strings.ToLower(strings.TrimSpace(name))]; ok && !seen[cat] {
			seen[cat] = true
			cats = append(cats, cat)
		}
	}
	if len(cats) == 0 {
		return []queryCategory{catGeneral}
	}
	return cats
}

// Run classifies the message with LLM and executes relevant DB queries for the company.
func (p *AIQueryPlanner) Run(ctx context.Context, company, message string) ([]QueryResult, error) {
	cats := p.classifyWithLLM(ctx, message)
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
	invoices, err := p.fetchRows(ctx, `
		SELECT
			customer_name,
			doc_number,
			ROUND(total_amount::numeric, 2)             AS amount,
			ROUND(balance::numeric, 2)                  AS balance_due,
			due_date,
			DATE_PART('day', NOW() - due_date)::int     AS days_overdue
		FROM qb_invoices
		WHERE company=$1
		  AND due_date < NOW()
		  AND balance > 0
		ORDER BY days_overdue DESC
		LIMIT 20`, company)
	if err != nil {
		return nil, err
	}

	bills, err := p.fetchRows(ctx, `
		SELECT
			vendor_name,
			doc_number,
			ROUND(total_amount::numeric, 2)             AS amount,
			ROUND(balance::numeric, 2)                  AS balance_due,
			due_date,
			DATE_PART('day', NOW() - due_date)::int     AS days_overdue
		FROM qb_bills
		WHERE company=$1
		  AND due_date < NOW()
		  AND balance > 0
		ORDER BY days_overdue DESC
		LIMIT 20`, company)
	if err != nil {
		return nil, err
	}

	return []QueryResult{
		{Label: "Overdue Invoices (receivables)", Rows: invoices},
		{Label: "Overdue Bills (payables)", Rows: bills},
	}, nil
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
