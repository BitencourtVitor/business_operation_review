package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
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
- A short reply refers to your previous message — "3" / "o terceiro" = the third option you offered, "a segunda" = the second, "esse"/"ele" = the entity just discussed, "e em %?" = redo the last answer as a percentage. Resolve it from context and answer directly; never ask the user to repeat themselves when the meaning is clear.
- When you need the user to pick between specific options, end your message with ONE line exactly in this form: [[OPTIONS: Label A | Label B | Label C]] — 2 to 4 short labels. The app turns it into clickable buttons and sends the chosen label as the next message. Keep the question text above the line, and use this only for discrete choices.
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

	primerMu    sync.Mutex
	primerCache map[string]primerEntry // per-company precomputed grounding facts
}

func NewAIService(db *pgxpool.Pool, sqlLLM, analyst *OpenRouterClient, aria *AriaSQL, dict string) *AIService {
	return &AIService{
		db: db, sqlLLM: sqlLLM, analyst: analyst, aria: aria, dict: dict,
		primerCache: make(map[string]primerEntry),
	}
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

	// Precomputed grounding facts (data coverage + annual P&L) shared by both
	// phases so year-level questions are always answerable and consistent.
	primer := s.companyPrimer(ctx, req.Company)

	// Prior conversation turns — shared by both phases so terse follow-ups
	// ("3", "o terceiro", "e em %?") are understood, not just by the analyst.
	history := s.loadHistory(ctx, convID)

	// Curated business context — what the company does, how projects map to data.
	// Feed it to BOTH phases so the SQL agent (not just the analyst) builds queries
	// that make sense for this business.
	companyCtx, _ := s.GetCompanyContext(ctx, req.Company)

	// ── 4. agentic SQL gathering (Flash writes/refines read-only queries) ──────
	queryResults := s.gatherData(ctx, userID, convID, req.Company, req.Message, primer, companyCtx, history)

	dataJSON, err := json.Marshal(queryResults)
	if err != nil {
		return nil, fmt.Errorf("marshal query results: %w", err)
	}

	// ── 5. build context ──────────────────────────────────────────────────────
	messages, err := s.buildContext(ctx, convID, req.Company, synthesized, queryResults, primer, companyCtx, history)
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

// loadHistory returns the prior conversation turns (chronological) for use in
// both the SQL-gathering and analyst phases. Errors degrade to no history.
func (s *AIService) loadHistory(ctx context.Context, convID string) []ChatMessage {
	rows, err := s.db.Query(ctx, `
		SELECT role, content_synthesized, content_response, compressed_summary, is_compressed
		FROM ai_messages
		WHERE conversation_id=$1
		ORDER BY created_at DESC
		LIMIT $2`, convID, activeMessageCount*2)
	if err != nil {
		return nil
	}
	defer rows.Close()

	type histRow struct {
		role, synthesized, response, compressedSummary string
		isCompressed                                    bool
	}
	var hist []histRow
	for rows.Next() {
		var r histRow
		_ = rows.Scan(&r.role, &r.synthesized, &r.response, &r.compressedSummary, &r.isCompressed)
		hist = append(hist, r)
	}
	// reverse to chronological
	for i, j := 0, len(hist)-1; i < j; i, j = i+1, j-1 {
		hist[i], hist[j] = hist[j], hist[i]
	}

	var msgs []ChatMessage
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
	return msgs
}

func (s *AIService) buildContext(ctx context.Context, convID, company, synthesized string, queryResults []QueryResult, primer, companyCtx string, history []ChatMessage) ([]ChatMessage, error) {
	var msgs []ChatMessage

	// system prompt
	systemPrompt := strings.ReplaceAll(ariaSystemPrompt, "{{COMPANY}}", formatCompanyName(company))

	if companyCtx != "" {
		systemPrompt += "\n\nCOMPANY CONTEXT:\n" + companyCtx
	}

	// precomputed grounding facts so year-level questions are always answerable
	systemPrompt += primer

	systemPrompt += fmt.Sprintf("\n\nToday's date: %s.", time.Now().Format("January 2, 2006"))
	msgs = append(msgs, ChatMessage{Role: "system", Content: systemPrompt})

	// prior conversation turns
	msgs = append(msgs, history...)

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

func sqlAgentPrompt(company, dict, primer, companyCtx string) string {
	ctxBlock := ""
	if companyCtx != "" {
		ctxBlock = "\n\nABOUT THIS COMPANY (use it to interpret what the data means):\n" + companyCtx
	}
	return `You are the data-gathering engine behind Aria, a financial assistant for ` + formatCompanyName(company) + `, a US construction company.` + ctxBlock + primer + `

Your job: given the user's question, gather the exact financial data needed to answer it by calling the run_sql tool with read-only SELECT queries. Think about which tables and aggregations answer the question, run the queries, inspect the results, and refine if needed.

The prior conversation is included above the latest message. Use it to resolve short follow-ups before querying: "3" or "o terceiro" means the third option Aria just offered; "e em %?" means recompute the previous answer as a percentage; "e ele?" refers to the entity just discussed. Reconstruct the user's real intent from context, then gather the data for THAT.

When you have gathered everything needed, stop calling the tool and reply with a one-line note like "done". Do NOT write the final answer to the user — another model does that. Your only output that matters is the data you fetch.

Guidelines:
- Only the run_sql tool. Read-only SELECT/WITH only. PostgreSQL syntax (see the date-function rules below).
- Don't add a company filter — the database already isolates the company.
- Prefer SUM/COUNT/GROUP BY over dumping rows. Round money to 2 decimals. For project margin/profit, follow the recipe in the data dictionary (aggregate per customer_id, then join) — one combined query, not many.
- Once you have the numbers needed, STOP and reply "done". Never re-run a query you already ran.
- If a query errors, read the error and fix the SQL.
- For greetings, the baseline facts above, or anything that needs no new data, just reply "done" without querying.

` + dict
}

// gatherData runs the agentic loop: the SQL model issues run_sql calls until it
// has enough data (or hits the iteration cap). Each query is validated, executed
// read-only with company isolation, and audit-logged. Never returns an error —
// partial/empty data is acceptable; the analyst handles "no data" gracefully.
func (s *AIService) gatherData(ctx context.Context, userID, convID, company, question, primer, companyCtx string, history []ChatMessage) []QueryResult {
	if !s.aria.Enabled() {
		logger.Error("aria sql disabled — ARIA_READONLY_DATABASE_URL not configured; answering without data")
		return nil
	}
	return s.executeGather(ctx, company, question, primer, companyCtx, history, func(sql string, res *SQLRunResult, runErr error, durMs int) {
		if runErr != nil {
			s.logQuery(ctx, userID, convID, company, sql, false, runErr.Error(), 0, durMs)
		} else {
			s.logQuery(ctx, userID, convID, company, sql, true, "", res.RowCount, durMs)
		}
	})
}

// executeGather runs the agentic run_sql loop and returns the successful query
// results. onAttempt is invoked for every run_sql call (success or error) so
// callers can audit-log (production) or capture the generated SQL (evaluation).
func (s *AIService) executeGather(
	ctx context.Context, company, question, primer, companyCtx string, history []ChatMessage,
	onAttempt func(sql string, res *SQLRunResult, runErr error, durMs int),
) []QueryResult {
	msgs := []ChatMessage{{Role: "system", Content: sqlAgentPrompt(company, s.dict, primer, companyCtx)}}
	msgs = append(msgs, history...)
	msgs = append(msgs, ChatMessage{Role: "user", Content: question})

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

			if onAttempt != nil {
				onAttempt(sql, res, runErr, durMs)
			}

			var toolContent string
			if runErr != nil {
				toolContent = "ERROR: " + runErr.Error()
			} else {
				b, _ := json.Marshal(res)
				toolContent = string(b)
				gathered = append(gathered, QueryResult{
					Label: fmt.Sprintf("Query %d", len(gathered)+1),
					Rows:  res.Rows,
				})
			}
			msgs = append(msgs, ChatMessage{Role: "tool", ToolCallID: tc.ID, Name: "run_sql", Content: toolContent})
		}
	}
	return gathered
}

// SQLAttempt is one run_sql call the agent made, captured for evaluation.
type SQLAttempt struct {
	SQL        string
	RowCount   int
	Truncated  bool
	Err        string
	DurationMs int
}

// GatherDebug runs only the SQL-gathering phase for a question and returns every
// query the agent generated (no analyst, no audit log). For prompt evaluation.
func (s *AIService) GatherDebug(ctx context.Context, company, question string) []SQLAttempt {
	if !s.aria.Enabled() {
		return nil
	}
	primer := s.companyPrimer(ctx, company)
	companyCtx, _ := s.GetCompanyContext(ctx, company)
	var out []SQLAttempt
	s.executeGather(ctx, company, question, primer, companyCtx, nil, func(sql string, res *SQLRunResult, runErr error, durMs int) {
		a := SQLAttempt{SQL: sql, DurationMs: durMs}
		if runErr != nil {
			a.Err = runErr.Error()
		} else if res != nil {
			a.RowCount = res.RowCount
			a.Truncated = res.Truncated
		}
		out = append(out, a)
	})
	return out
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

// ── Grounding primer ────────────────────────────────────────────────────────────
// A small block of precomputed facts (data coverage + annual P&L) injected into
// every conversation so year-level questions are answered consistently and the
// model never claims it only has current-year data. Cached per company.

type primerEntry struct {
	text string
	at   time.Time
}

const primerTTL = 15 * time.Minute

// WarmPrimers precomputes primers for the given companies (called at boot so the
// first user question is already grounded). Safe to call in a goroutine.
func (s *AIService) WarmPrimers(ctx context.Context, companies ...string) {
	for _, co := range companies {
		_ = s.companyPrimer(ctx, co)
	}
}

func (s *AIService) companyPrimer(ctx context.Context, company string) string {
	s.primerMu.Lock()
	if e, ok := s.primerCache[company]; ok && time.Since(e.at) < primerTTL {
		s.primerMu.Unlock()
		return e.text
	}
	s.primerMu.Unlock()

	text := s.buildPrimer(ctx, company)

	s.primerMu.Lock()
	s.primerCache[company] = primerEntry{text: text, at: time.Now()}
	s.primerMu.Unlock()
	return text
}

func (s *AIService) buildPrimer(ctx context.Context, company string) string {
	var minY, maxY int
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(MIN(EXTRACT(YEAR FROM txn_date))::int, 0),
		       COALESCE(MAX(EXTRACT(YEAR FROM txn_date))::int, 0)
		FROM (
			SELECT txn_date FROM qb_payments      WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL SELECT txn_date FROM qb_bill_payments WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL SELECT txn_date FROM qb_invoices      WHERE company=$1 AND txn_date IS NOT NULL
		) t
		WHERE EXTRACT(YEAR FROM txn_date) BETWEEN 2018 AND EXTRACT(YEAR FROM NOW())::int + 1`,
		company).Scan(&minY, &maxY)
	if err != nil || maxY == 0 {
		return ""
	}

	rows, err := s.db.Query(ctx, `
		SELECT EXTRACT(YEAR FROM txn_date)::int AS yr,
			ROUND(SUM(CASE WHEN k='r' THEN amt ELSE 0 END))::bigint  AS received,
			ROUND(SUM(CASE WHEN k='p' THEN amt ELSE 0 END))::bigint  AS paid,
			ROUND(SUM(CASE WHEN k='r' THEN amt ELSE -amt END))::bigint AS net
		FROM (
			SELECT txn_date, total_amount AS amt, 'r' AS k FROM qb_payments      WHERE company=$1 AND txn_date IS NOT NULL
			UNION ALL SELECT txn_date, total_amount, 'p' FROM qb_bill_payments WHERE company=$1 AND txn_date IS NOT NULL
		) t
		WHERE EXTRACT(YEAR FROM txn_date) BETWEEN 2018 AND EXTRACT(YEAR FROM NOW())::int + 1
		GROUP BY 1 ORDER BY 1`, company)
	if err != nil {
		return ""
	}
	defer rows.Close()

	type yearRow struct {
		year                 int
		received, paid, net  int64
	}
	var ys []yearRow
	for rows.Next() {
		var y yearRow
		if err := rows.Scan(&y.year, &y.received, &y.paid, &y.net); err != nil {
			return ""
		}
		ys = append(ys, y)
	}
	if len(ys) == 0 {
		return ""
	}

	cur := time.Now().Year()
	var best, worst *yearRow // best/worst over COMPLETE years only (exclude partial current year)
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("\n\n━━━ BASELINE FACTS (precomputed for %s) ━━━\n", formatCompanyName(company)))
	sb.WriteString(fmt.Sprintf("Financial data covers years %d–%d. The current year (%d) is partial (year-to-date) — do not rank it against full years.\n", minY, maxY, cur))
	sb.WriteString("Annual net cash = customer payments received − vendor bill payments paid (USD, rounded):\n")
	for i := range ys {
		y := ys[i]
		tag := ""
		if y.year >= cur {
			tag = " (partial, YTD)"
		} else {
			if best == nil || y.net > best.net {
				best = &ys[i]
			}
			if worst == nil || y.net < worst.net {
				worst = &ys[i]
			}
		}
		sb.WriteString(fmt.Sprintf("- %d: received $%s, paid $%s, net $%s%s\n",
			y.year, commaInt(y.received), commaInt(y.paid), commaInt(y.net), tag))
	}
	if best != nil && worst != nil {
		sb.WriteString(fmt.Sprintf("Among complete years, by this net-cash measure the strongest is %d ($%s) and the weakest is %d ($%s).\n",
			best.year, commaInt(best.net), worst.year, commaInt(worst.net)))
	}
	sb.WriteString("These year-level figures are authoritative — answer year questions directly from them and NEVER claim you only have current-year data. For other profit definitions or deeper detail, run additional queries.\n")
	return sb.String()
}

// commaInt formats an int64 with thousands separators, e.g. -1234567 → "-1,234,567".
func commaInt(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	digits := fmt.Sprintf("%d", n)
	var out []byte
	for i := 0; i < len(digits); i++ {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, digits[i])
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}
