package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

const (
	maxInputChars      = 2000
	activeMessageCount = 10 // messages kept uncompressed in context
)

// system prompt for Aria
const ariaSystemPrompt = `You are Aria — a sharp, direct financial assistant embedded inside the Business Operations Review platform used by Premium Group, a US-based construction company.

You analyze real financial data from QuickBooks (synced daily) and help the team understand cash flow, project margins, billing, overdue receivables, pipeline, and revenue forecasts.

━━━ YOUR DATA SOURCES ━━━

When a financially relevant question is asked, structured data is automatically retrieved and injected below your last user message under the tag [Financial data retrieved for this question]. Each result set has a label and rows. Use only what is provided — never invent numbers.

Available data sets and what they cover:
• Cash Flow (last 12 months) — monthly received (customer payments), paid (vendor bill payments), and invoiced amounts
• Open Pipeline — active estimates not yet closed or rejected, with customer, value, and status
• Overdue Invoices (receivables) — customer invoices past due date with outstanding balance and days overdue
• Overdue Bills (payables) — vendor bills past due date with outstanding balance and days overdue
• Project Financial Summary — per-project breakdown: estimate vs invoiced vs expenses vs gross margin
• Forecast — current pipeline total + historical monthly revenue + seasonality averages for next 3 months
• Recent Invoices / Recent Bills — latest 20 invoices and vendor bills regardless of payment status
• YTD Financial Snapshot — year-to-date totals: invoiced, received, paid, pipeline

If data was retrieved but is empty, say so honestly. If no data was retrieved for a question, answer from context or say you need a more specific question.

CRITICAL: Never ask the user for data you already have. If financial data is present in this conversation, use it to answer directly. Only ask for clarification when information is genuinely absent from the data — for example, an internal target or a budget not tracked in QuickBooks.

━━━ WHEN TO USE DATA ━━━

Use data when the user asks something financial — even indirectly ("how are we doing?", "any problems?", "tô preocupado com o caixa").
Do NOT use data for greetings, small talk, confirmations, or off-topic questions. Just respond naturally.
If the question is ambiguous, ask one short clarifying question before pulling conclusions.

━━━ FORECAST AND OUTLOOK QUESTIONS ━━━

When asked about year-end results, targets, or projections: always commit to a verdict. Calculate using the data you have — do not just list it. Structure: current position → projection → risks → one-sentence conclusion. Risks must be specific and quantified from the actual data, never generic.

━━━ HOW TO ANSWER RISK QUESTIONS ━━━

When the user asks "onde estão os riscos", "what are the risks", or similar:
- Never give generic answers ("market conditions", "economic uncertainty")
- Risks must come from the actual data: overdue receivables aging, pipeline not converting, expense spikes, months with negative net flow, projects with losses
- Quantify each risk with the actual dollar amount at stake

━━━ BOUNDARIES ━━━

You only discuss financials for {{COMPANY}}. You do not:
- Give legal, tax, or investment advice
- Compare companies or disclose data from other entities
- Guarantee future performance — forecasts are estimates based on historical patterns
- Answer questions unrelated to business finance (personal questions, general knowledge, etc.) — redirect briefly and move on

━━━ COMMUNICATION STYLE ━━━

- Match the user's language (Portuguese or English) and register (formal or casual) — they may switch mid-conversation
- Be direct. Skip filler phrases like "Great question!" or "Certainly!"
- Use numbers with USD formatting ($12,500) and percentages where relevant
- Format with GitHub-flavored Markdown — the chat renders it (tables, lists, bold). Use a **Markdown table** for top-N lists, multi-row breakdowns, or side-by-side comparisons; bullet points or short sections for the rest. Don't write walls of text.
- When the user explicitly asks for a table ("cria uma tabela", "em formato de tabela", "as a table", "list the top N"), you MUST answer with a Markdown table containing the relevant columns.
- When uncertain about data, say so. When data is missing, say so. Never fabricate.
- If the user is vague or informal, interpret charitably and respond — don't demand perfect phrasing
- Short conversational messages get short conversational replies
- Conclude analytical responses with a clear bottom line — don't leave the user to draw their own conclusions from raw numbers

━━━ COMPANY CONTEXT ━━━

You are analyzing data for: {{COMPANY}}`

// AIService orchestrates the full chat pipeline: an agentic SQL gathering phase
// (sqlLLM writes/refines read-only queries via the run_sql tool) followed by an
// analytical synthesis phase (analyst turns the gathered data into the answer).
type AIService struct {
	db      *pgxpool.Pool
	sqlLLM  *OpenRouterClient // agentic SQL loop — e.g. Gemini Flash
	analyst *OpenRouterClient // final analytical answer — e.g. Claude Sonnet
	aria    *AriaSQL          // read-only query executor (validation + RLS scope)
	dict    string            // data dictionary injected into the SQL agent prompt
}

func NewAIService(db *pgxpool.Pool, sqlLLM, analyst *OpenRouterClient, aria *AriaSQL, dict string) *AIService {
	return &AIService{db: db, sqlLLM: sqlLLM, analyst: analyst, aria: aria, dict: dict}
}

// ── Conversation CRUD ─────────────────────────────────────────────────────────

type Conversation struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Company   string    `json:"company"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (s *AIService) ListConversations(ctx context.Context, userID, company string) ([]Conversation, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, user_id, company, title, created_at, updated_at
		 FROM ai_conversations
		 WHERE user_id=$1 AND company=$2
		 ORDER BY updated_at DESC`, userID, company)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	convs := make([]Conversation, 0)
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.UserID, &c.Company, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}

func (s *AIService) DeleteConversation(ctx context.Context, id, userID string) error {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM ai_conversations WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("conversation not found")
	}
	return nil
}

func (s *AIService) UpdateTitle(ctx context.Context, id, userID, title string) error {
	tag, err := s.db.Exec(ctx,
		`UPDATE ai_conversations SET title=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`,
		title, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("conversation not found")
	}
	return nil
}

// ── Message history ───────────────────────────────────────────────────────────

type Message struct {
	ID                 string          `json:"id"`
	ConversationID     string          `json:"conversation_id"`
	Role               string          `json:"role"`
	ContentOriginal    *string         `json:"content_original,omitempty"`
	ContentSynthesized *string         `json:"content_synthesized,omitempty"`
	ContentResponse    *string         `json:"content_response,omitempty"`
	ContentData        json.RawMessage `json:"content_data,omitempty"`
	IsCompressed       bool            `json:"is_compressed"`
	TokensInput        *int            `json:"tokens_input,omitempty"`
	TokensOutput       *int            `json:"tokens_output,omitempty"`
	CostUSD            *float64        `json:"cost_usd,omitempty"`
	Model              *string         `json:"model,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
}

func (s *AIService) ListMessages(ctx context.Context, convID, userID string) ([]Message, error) {
	// verify ownership
	var ownerID string
	if err := s.db.QueryRow(ctx,
		`SELECT user_id FROM ai_conversations WHERE id=$1`, convID).Scan(&ownerID); err != nil {
		return nil, fmt.Errorf("conversation not found")
	}
	if ownerID != userID {
		return nil, fmt.Errorf("forbidden")
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, conversation_id, role,
			content_original, content_synthesized, content_response,
			content_data, is_compressed,
			tokens_input, tokens_output, cost_usd, model, created_at
		FROM ai_messages WHERE conversation_id=$1
		ORDER BY created_at ASC`, convID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	msgs := make([]Message, 0)
	for rows.Next() {
		var m Message
		var dataRaw []byte
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.Role,
			&m.ContentOriginal, &m.ContentSynthesized, &m.ContentResponse,
			&dataRaw, &m.IsCompressed,
			&m.TokensInput, &m.TokensOutput, &m.CostUSD, &m.Model, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		if dataRaw != nil {
			m.ContentData = json.RawMessage(dataRaw)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// ── Chat ──────────────────────────────────────────────────────────────────────

type ChatRequest struct {
	Company        string `json:"company"`
	Message        string `json:"message"`
	ConversationID string `json:"conversation_id"`
}

type ChatReply struct {
	ConversationID string  `json:"conversation_id"`
	MessageID      string  `json:"message_id"`
	Response       string  `json:"response"`
	TokensInput    int     `json:"tokens_input"`
	TokensOutput   int     `json:"tokens_output"`
	CostUSD        float64 `json:"cost_usd"`
	Model          string  `json:"model"`
}

func (s *AIService) Chat(ctx context.Context, userID string, req ChatRequest) (*ChatReply, error) {
	// ── 1. validate input ─────────────────────────────────────────────────────
	if len([]rune(req.Message)) > maxInputChars {
		return nil, fmt.Errorf("message exceeds %d characters", maxInputChars)
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		return nil, fmt.Errorf("empty message")
	}

	// ── 2. resolve or create conversation ─────────────────────────────────────
	convID := req.ConversationID
	// A provided conversation id that no longer exists or isn't owned by the user
	// (e.g. deleted in another tab) self-heals into a fresh conversation instead of
	// failing the send.
	createNew := convID == ""
	if !createNew {
		var ownerID string
		err := s.db.QueryRow(ctx,
			`SELECT user_id FROM ai_conversations WHERE id=$1`, convID).Scan(&ownerID)
		if err != nil || ownerID != userID {
			createNew = true
		}
	}
	if createNew {
		convID = ""
		err := s.db.QueryRow(ctx,
			`INSERT INTO ai_conversations (user_id, company, title)
			 VALUES ($1, $2, $3) RETURNING id`,
			userID, req.Company, titleFromMessage(req.Message),
		).Scan(&convID)
		if err != nil {
			return nil, fmt.Errorf("create conversation: %w", err)
		}
	}

	// ── 3. synthesize user message ─────────────────────────────────────────────
	synthesized := synthesizeInput(req.Message)

	// ── 4. agentic SQL gathering (Flash writes/refines read-only queries) ──────
	queryResults := s.gatherData(ctx, userID, convID, req.Company, req.Message)

	dataJSON, err := json.Marshal(queryResults)
	if err != nil {
		return nil, fmt.Errorf("marshal query results: %w", err)
	}

	// ── 5. build context ──────────────────────────────────────────────────────
	messages, err := s.buildContext(ctx, convID, req.Company, synthesized, queryResults)
	if err != nil {
		return nil, fmt.Errorf("build context: %w", err)
	}

	// ── 6. call analyst LLM ───────────────────────────────────────────────────
	resp, err := s.analyst.Chat(ctx, messages)
	if err != nil {
		return nil, fmt.Errorf("llm: %w", err)
	}

	costUSD := estimateCost(resp.TokensInput, resp.TokensOutput)

	// ── 7. save user message ──────────────────────────────────────────────────
	if _, err := s.db.Exec(ctx, `
		INSERT INTO ai_messages (conversation_id, role, content_original, content_synthesized)
		VALUES ($1, 'user', $2, $3)`,
		convID, req.Message, synthesized,
	); err != nil {
		return nil, fmt.Errorf("save user message: %w", err)
	}

	// ── 8. save assistant message ─────────────────────────────────────────────
	var msgID string
	if err := s.db.QueryRow(ctx, `
		INSERT INTO ai_messages
			(conversation_id, role, content_response, content_data,
			 tokens_input, tokens_output, cost_usd, model)
		VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7)
		RETURNING id`,
		convID, resp.Text, dataJSON,
		resp.TokensInput, resp.TokensOutput, costUSD, resp.Model,
	).Scan(&msgID); err != nil {
		return nil, fmt.Errorf("save assistant message: %w", err)
	}

	// ── 9. touch conversation updated_at ──────────────────────────────────────
	_, _ = s.db.Exec(ctx, `UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1`, convID)

	// ── 10. compress old messages if needed ───────────────────────────────────
	go s.compressOldMessages(context.Background(), convID)

	return &ChatReply{
		ConversationID: convID,
		MessageID:      msgID,
		Response:       resp.Text,
		TokensInput:    resp.TokensInput,
		TokensOutput:   resp.TokensOutput,
		CostUSD:        costUSD,
		Model:          resp.Model,
	}, nil
}

// ── Context builder ───────────────────────────────────────────────────────────

func (s *AIService) buildContext(ctx context.Context, convID, company, synthesized string, queryResults []QueryResult) ([]ChatMessage, error) {
	var msgs []ChatMessage

	// system prompt
	systemPrompt := strings.ReplaceAll(ariaSystemPrompt, "{{COMPANY}}", formatCompanyName(company))

	// theoretical company context
	var theoreticalCtx string
	_ = s.db.QueryRow(ctx,
		`SELECT context FROM ai_company_context WHERE company=$1`, company).Scan(&theoreticalCtx)
	if theoreticalCtx != "" {
		systemPrompt += "\n\nCOMPANY CONTEXT:\n" + theoreticalCtx
	}

	systemPrompt += fmt.Sprintf("\n\nToday's date: %s.", time.Now().Format("January 2, 2006"))
	msgs = append(msgs, ChatMessage{Role: "system", Content: systemPrompt})

	// history (last N messages, oldest compressed)
	history, err := s.db.Query(ctx, `
		SELECT role, content_synthesized, content_response, compressed_summary, is_compressed
		FROM ai_messages
		WHERE conversation_id=$1
		ORDER BY created_at DESC
		LIMIT $2`, convID, activeMessageCount*2)
	if err != nil {
		return nil, err
	}
	defer history.Close()

	type histRow struct {
		role, synthesized, response, compressedSummary string
		isCompressed                                    bool
	}
	var hist []histRow
	for history.Next() {
		var r histRow
		_ = history.Scan(&r.role, &r.synthesized, &r.response, &r.compressedSummary, &r.isCompressed)
		hist = append(hist, r)
	}
	// reverse to chronological
	for i, j := 0, len(hist)-1; i < j; i, j = i+1, j-1 {
		hist[i], hist[j] = hist[j], hist[i]
	}
	for _, h := range hist {
		switch h.role {
		case "user":
			if h.synthesized != "" {
				msgs = append(msgs, ChatMessage{Role: "user", Content: h.synthesized})
			}
		case "assistant":
			content := h.response
			if h.isCompressed && h.compressedSummary != "" {
				content = "[summary] " + h.compressedSummary
			}
			if content != "" {
				msgs = append(msgs, ChatMessage{Role: "assistant", Content: content})
			}
		}
	}

	// current turn: synthesized user message + fresh query data
	dataText := formatQueryResults(queryResults)
	userContent := synthesized
	if dataText != "" {
		userContent += "\n\n[Financial data retrieved for this question]\n" + dataText
	}

	// Inject a reminder when forecast data is present — the model tends to list
	// data without concluding unless reminded immediately before generating.
	if isForecastContext(queryResults) {
		userContent += "\n\n[INSTRUCTION: The question above asks for a forward-looking assessment. Do NOT stop after listing data. You MUST: (1) calculate a projected net result using the numbers above, (2) state a clear verdict — positive or negative — with the key number that drives it, (3) list 2-4 specific risks found in the data with dollar amounts, (4) close with a one-sentence bottom line. Complete all four parts.]"
	}

	msgs = append(msgs, ChatMessage{Role: "user", Content: userContent})

	return msgs, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// isForecastContext returns true when the query results include forecast datasets,
// signalling that the model should produce a full analytical response.
func isForecastContext(results []QueryResult) bool {
	for _, r := range results {
		if strings.Contains(r.Label, "Historical") || strings.Contains(r.Label, "Seasonality") || strings.Contains(r.Label, "Pipeline") {
			return true
		}
	}
	return false
}

// synthesizeInput condenses a user message for context storage.
// For messages ≤120 chars we keep them as-is; longer ones are trimmed to key sentences.
func synthesizeInput(msg string) string {
	runes := []rune(msg)
	if len(runes) <= 120 {
		return msg
	}
	// keep first 100 chars + ellipsis — good enough for a ≤2000 char input
	return string(runes[:100]) + "…"
}

func titleFromMessage(msg string) string {
	runes := []rune(strings.TrimSpace(msg))
	if len(runes) <= 50 {
		return string(runes)
	}
	return string(runes[:47]) + "..."
}

func formatQueryResults(results []QueryResult) string {
	if len(results) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, r := range results {
		sb.WriteString("### " + r.Label + "\n")
		b, _ := json.MarshalIndent(r.Rows, "", "  ")
		sb.Write(b)
		sb.WriteString("\n\n")
	}
	return sb.String()
}

// companyDisplayNames maps slug → display name for the system prompt.
// Acronyms (≤4 chars) stay uppercase; longer names are title-cased.
var companyDisplayNames = map[string]string{
	"framing": "Framing",
	"hvac":    "HVAC",
	"pcg":     "PCG",
}

func formatCompanyName(company string) string {
	lower := strings.ToLower(strings.TrimSpace(company))
	if name, ok := companyDisplayNames[lower]; ok {
		return name
	}
	// fallback: short = UPPER (acronym), long = Title Case
	if len([]rune(lower)) <= 4 {
		return strings.ToUpper(lower)
	}
	if len(lower) == 0 {
		return company
	}
	return strings.ToUpper(lower[:1]) + lower[1:]
}

// estimateCost returns approximate USD cost for Gemini Flash 2.0 via OpenRouter.
// Adjust rates when switching models.
func estimateCost(in, out int) float64 {
	const inputRate = 0.10 / 1_000_000  // $0.10 per 1M input tokens
	const outputRate = 0.40 / 1_000_000 // $0.40 per 1M output tokens
	return float64(in)*inputRate + float64(out)*outputRate
}

// compressOldMessages summarizes content_data for messages older than the active window.
func (s *AIService) compressOldMessages(ctx context.Context, convID string) {
	rows, err := s.db.Query(ctx, `
		SELECT id, content_data FROM ai_messages
		WHERE conversation_id=$1 AND role='assistant'
			AND is_compressed=FALSE AND content_data IS NOT NULL
		ORDER BY created_at DESC
		OFFSET $2`, convID, activeMessageCount)
	if err != nil {
		return
	}
	defer rows.Close()

	type toCompress struct {
		id   string
		data []byte
	}
	var items []toCompress
	for rows.Next() {
		var item toCompress
		_ = rows.Scan(&item.id, &item.data)
		items = append(items, item)
	}

	for _, item := range items {
		summary := compressSummary(item.data)
		_, _ = s.db.Exec(ctx,
			`UPDATE ai_messages SET is_compressed=TRUE, compressed_summary=$1, content_data=NULL WHERE id=$2`,
			summary, item.id)
	}
}

// compressSummary produces a short text summary of raw query result JSON.
func compressSummary(data []byte) string {
	var results []QueryResult
	if err := json.Unmarshal(data, &results); err != nil {
		return "[data compressed]"
	}
	var parts []string
	for _, r := range results {
		parts = append(parts, fmt.Sprintf("%s: %d row(s)", r.Label, len(r.Rows)))
	}
	return strings.Join(parts, "; ")
}

// ── Company context ───────────────────────────────────────────────────────────

func (s *AIService) GetCompanyContext(ctx context.Context, company string) (string, error) {
	var ctx2 string
	err := s.db.QueryRow(ctx,
		`SELECT context FROM ai_company_context WHERE company=$1`, company).Scan(&ctx2)
	if err != nil {
		return "", nil // not found is ok
	}
	return ctx2, nil
}

func (s *AIService) UpsertCompanyContext(ctx context.Context, company, text string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO ai_company_context (company, context, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (company) DO UPDATE SET context=$2, updated_at=NOW()`,
		company, text)
	return err
}

// ── Agentic SQL gathering ───────────────────────────────────────────────────────

const maxSQLIterations = 5

var runSQLTool = Tool{
	Type: "function",
	Function: ToolFunction{
		Name:        "run_sql",
		Description: "Run a single read-only PostgreSQL SELECT against the financial database and get the rows back. Call it as many times as needed to gather the exact numbers to answer the user. Results are capped at 150 rows, so prefer aggregation.",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"sql":{"type":"string","description":"A single read-only SELECT (CTEs allowed). Do not add a company filter — the database scopes it automatically."}},"required":["sql"]}`),
	},
}

func sqlAgentPrompt(company, dict string) string {
	return `You are the data-gathering engine behind Aria, a financial assistant for ` + formatCompanyName(company) + `, a US construction company.

Your job: given the user's question, gather the exact financial data needed to answer it by calling the run_sql tool with read-only SELECT queries. Think about which tables and aggregations answer the question, run the queries, inspect the results, and refine if needed.

When you have gathered everything needed, stop calling the tool and reply with a one-line note like "done". Do NOT write the final answer to the user — another model does that. Your only output that matters is the data you fetch.

Guidelines:
- Only the run_sql tool. Read-only SELECT/WITH only.
- Don't add a company filter — the database already isolates the company.
- Prefer SUM/COUNT/GROUP BY over dumping rows. Round money to 2 decimals.
- If a query errors, read the error and fix the SQL.
- For greetings or questions that need no data, just reply "done" without querying.

` + dict
}

// gatherData runs the agentic loop: the SQL model issues run_sql calls until it
// has enough data (or hits the iteration cap). Each query is validated, executed
// read-only with company isolation, and audit-logged. Never returns an error —
// partial/empty data is acceptable; the analyst handles "no data" gracefully.
func (s *AIService) gatherData(ctx context.Context, userID, convID, company, question string) []QueryResult {
	if !s.aria.Enabled() {
		logger.Error("aria sql disabled — ARIA_READONLY_DATABASE_URL not configured; answering without data")
		return nil
	}
	msgs := []ChatMessage{
		{Role: "system", Content: sqlAgentPrompt(company, s.dict)},
		{Role: "user", Content: question},
	}

	var gathered []QueryResult
	for i := 0; i < maxSQLIterations; i++ {
		resp, err := s.sqlLLM.ChatWithTools(ctx, msgs, []Tool{runSQLTool})
		if err != nil {
			logger.Error("aria sql agent: llm error", "error", fmt.Sprintf("%v", err))
			break
		}
		if len(resp.ToolCalls) == 0 {
			break // agent has enough data
		}

		msgs = append(msgs, ChatMessage{Role: "assistant", Content: resp.Text, ToolCalls: resp.ToolCalls})
		for _, tc := range resp.ToolCalls {
			sql := extractSQLArg(tc.Function.Arguments)
			start := time.Now()
			res, runErr := s.aria.Run(ctx, company, sql)
			durMs := int(time.Since(start).Milliseconds())

			var toolContent string
			if runErr != nil {
				toolContent = "ERROR: " + runErr.Error()
				s.logQuery(ctx, userID, convID, company, sql, false, runErr.Error(), 0, durMs)
			} else {
				b, _ := json.Marshal(res)
				toolContent = string(b)
				gathered = append(gathered, QueryResult{
					Label: fmt.Sprintf("Query %d", len(gathered)+1),
					Rows:  res.Rows,
				})
				s.logQuery(ctx, userID, convID, company, sql, true, "", res.RowCount, durMs)
			}
			msgs = append(msgs, ChatMessage{Role: "tool", ToolCallID: tc.ID, Name: "run_sql", Content: toolContent})
		}
	}
	return gathered
}

// extractSQLArg pulls the "sql" field out of the tool-call arguments JSON.
func extractSQLArg(arguments string) string {
	var a struct {
		SQL string `json:"sql"`
	}
	_ = json.Unmarshal([]byte(arguments), &a)
	return a.SQL
}

// logQuery records every executed/blocked query for audit and debugging.
func (s *AIService) logQuery(ctx context.Context, userID, convID, company, sql string, ok bool, errMsg string, rowCount, durMs int) {
	_, err := s.db.Exec(ctx, `
		INSERT INTO ai_query_log (user_id, conversation_id, company, sql, ok, error, row_count, duration_ms)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6,''), $7, $8)`,
		userID, convID, company, sql, ok, errMsg, rowCount, durMs)
	if err != nil {
		logger.Error("aria: audit log insert failed", "error", fmt.Sprintf("%v", err))
	}
}
