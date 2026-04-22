package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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
• Overdue Invoices — invoices past due date with outstanding balance and days overdue
• Project Financial Summary — per-project breakdown: estimate vs invoiced vs expenses vs gross margin
• Forecast — current pipeline total + historical monthly revenue + seasonality averages for next 3 months
• Recent Invoices / Recent Bills — latest 20 invoices and vendor bills
• YTD Financial Snapshot — year-to-date totals: invoiced, received, paid, pipeline

If data was retrieved but is empty, say so honestly. If no data was retrieved for a question, answer from context or say you need a more specific question.

━━━ WHEN TO USE DATA ━━━

Use data when the user asks something financial — even indirectly ("how are we doing?", "any problems?", "tô preocupado com o caixa").
Do NOT use data for greetings, small talk, confirmations, or off-topic questions. Just respond naturally.
If the question is ambiguous, ask one short clarifying question before pulling conclusions.

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
- For complex answers use bullet points or short structured sections — don't write walls of text
- When uncertain about data, say so. When data is missing, say so. Never fabricate.
- If the user is vague or informal, interpret charitably and respond — don't demand perfect phrasing
- Short conversational messages get short conversational replies

━━━ COMPANY CONTEXT ━━━

You are analyzing data for: {{COMPANY}}`

// AIService orchestrates the full chat pipeline.
type AIService struct {
	db      *pgxpool.Pool
	llm     *OpenRouterClient
	planner *AIQueryPlanner
	model   string
}

func NewAIService(db *pgxpool.Pool, llm *OpenRouterClient, model string) *AIService {
	return &AIService{
		db:      db,
		llm:     llm,
		planner: NewAIQueryPlanner(db),
		model:   model,
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
	if convID == "" {
		err := s.db.QueryRow(ctx,
			`INSERT INTO ai_conversations (user_id, company, title)
			 VALUES ($1, $2, $3) RETURNING id`,
			userID, req.Company, titleFromMessage(req.Message),
		).Scan(&convID)
		if err != nil {
			return nil, fmt.Errorf("create conversation: %w", err)
		}
	} else {
		// verify ownership
		var ownerID string
		err := s.db.QueryRow(ctx,
			`SELECT user_id FROM ai_conversations WHERE id=$1`, convID).Scan(&ownerID)
		if err != nil || ownerID != userID {
			return nil, fmt.Errorf("conversation not found")
		}
	}

	// ── 3. synthesize user message ─────────────────────────────────────────────
	synthesized := synthesizeInput(req.Message)

	// ── 4. run query planner ──────────────────────────────────────────────────
	queryResults, err := s.planner.Run(ctx, req.Company, req.Message)
	if err != nil {
		return nil, fmt.Errorf("query planner: %w", err)
	}

	dataJSON, err := json.Marshal(queryResults)
	if err != nil {
		return nil, fmt.Errorf("marshal query results: %w", err)
	}

	// ── 5. build context ──────────────────────────────────────────────────────
	messages, err := s.buildContext(ctx, convID, req.Company, synthesized, queryResults)
	if err != nil {
		return nil, fmt.Errorf("build context: %w", err)
	}

	// ── 6. call LLM ───────────────────────────────────────────────────────────
	resp, err := s.llm.Chat(ctx, messages)
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
	msgs = append(msgs, ChatMessage{Role: "user", Content: userContent})

	return msgs, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
