package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Trigger keys. Every automatic e-mail in the system resolves its schedule,
// parameters and recipients through one of these.
const (
	TriggerForecastPlotPlan  = "forecast_plot_plan"
	TriggerWorkersCompReview = "workers_comp_review"
	TriggerQBTimeAbsence     = "qbtime_absence"
)

// ParamDef describes one editable parameter so the settings screen can render
// the form without knowing anything about the trigger it belongs to.
type ParamDef struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Help    string   `json:"help,omitempty"`
	Type    string   `json:"type"` // int | text | date | select | multiselect
	Options []Option `json:"options,omitempty"`
	Min     *int     `json:"min,omitempty"`
	Max     *int     `json:"max,omitempty"`
	// Inline renders the field on the same row as the previous one.
	Inline bool `json:"inline,omitempty"`
	// Group splits the form into blocks: "timing" is when the e-mail goes out,
	// everything else describes what it looks at. Empty means "parameters".
	Group string `json:"group,omitempty"`
	// OptionsSource fills Options from live data instead of a fixed list.
	OptionsSource string `json:"-"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// TriggerDefinition is the static half of a trigger: what it is and which
// knobs it exposes. The values live in the database.
type TriggerDefinition struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	// Icon names the system the trigger belongs to. The screen maps it to an
	// image or a glyph; the backend stays out of that choice.
	Icon        string     `json:"icon"`
	Module      string     `json:"module"`
	Description string     `json:"description"`
	When        string     `json:"when"`
	Schedulable bool       `json:"schedulable"`
	Params      []ParamDef `json:"params"`
}

func intPtr(v int) *int { return &v }

var triggerDefinitions = []TriggerDefinition{
	{
		Key:         TriggerForecastPlotPlan,
		Label:       "Fieldwire Docs Missing",
		Icon:        "fieldwire",
		Module:      "Framing Forecast",
		Description: "Warns that a job is approaching its date with Fieldwire documents still missing. Only the selected documents count, and a document marked completed or dispensed is not missing. One e-mail per job, never repeated for the same target date.",
		When:        "Daily, for every job of the selected clients whose chosen date is within the configured window.",
		Schedulable: true,
		Params: []ParamDef{
			{Key: "clients", Label: "Clients", Type: "multiselect", OptionsSource: "clients",
				Help: "Only jobs of these clients are considered."},
			{Key: "documents", Label: "Documents", Type: "multiselect", OptionsSource: "fieldwire_documents",
				Help: "A job is alerted when any of these is missing. A document with no row at all counts as missing."},
			// Ordered so the row reads as one sentence: 2 months before the
			// start date, at 08:00.
			{Key: "date_field", Label: "Reference date", Type: "select", Group: "timing", Options: []Option{
				{Value: "previous_start_date", Label: "Start date"},
				{Value: "previous_beams_date", Label: "Beams date"},
				{Value: "previous_end_date", Label: "End date"},
			}},
			{Key: "offset_value", Label: "Send in advance", Type: "int", Group: "timing", Min: intPtr(1), Max: intPtr(365)},
			{Key: "offset_unit", Label: "Unit", Type: "select", Group: "timing", Inline: true, Options: []Option{
				{Value: "days", Label: "days"},
				{Value: "months", Label: "months"},
			}},
		},
	},
	{
		Key:         TriggerWorkersCompReview,
		Label:       "Workers' Comp review",
		Icon:        "sub_docs",
		Module:      "Subcontractor Docs",
		Description: "Opens a review cycle and sends the table of subcontractors to be checked one by one.",
		When:        "On every review date derived from the anchor and the cycle length.",
		Schedulable: true,
		Params: []ParamDef{
			{Key: "anchor_date", Label: "Anchor date", Type: "date", Group: "timing", Help: "First review date. Every following cycle is counted from here."},
			{Key: "cycle_days", Label: "Cycle length (days)", Type: "int", Group: "timing", Min: intPtr(1), Max: intPtr(180)},
		},
	},
	{
		Key:         TriggerQBTimeAbsence,
		Label:       "Absence alert",
		Icon:        "absence",
		Module:      "Absence Control",
		Description: "Announces employees with consecutive business days without a clock-in. One consolidated e-mail per company.",
		When:        "Right after the QB Time sync, which sets its own schedule.",
		Schedulable: false,
		Params: []ParamDef{
			{Key: "alert_days", Label: "Consecutive days to alert", Type: "int", Min: intPtr(1), Max: intPtr(30),
				Help: "Each absence is announced once. While the same person keeps missing, no new e-mail is sent — only a new absence is."},
		},
	},
}

// TriggerConfig is a definition joined with its stored configuration. The
// values are exposed as "values" because "params" is already the schema the
// screen renders from — same name would shadow it in the JSON.
type TriggerConfig struct {
	TriggerDefinition
	Enabled      bool           `json:"enabled"`
	RunHourLocal *int           `json:"run_hour_local"`
	Params       map[string]any `json:"values"`
	ToUserIDs    []string       `json:"to_user_ids"`
	CCUserIDs    []string       `json:"cc_user_ids"`
	UpdatedBy    *string        `json:"updated_by"`
	UpdatedAt    time.Time      `json:"updated_at"`
	// Lets the history block state how much it holds without loading it.
	DeliveryCount int `json:"delivery_count"`
}

type TriggerDelivery struct {
	TriggerKey string    `json:"trigger_key"`
	Subject    string    `json:"subject"`
	To         []string  `json:"to"`
	CC         []string  `json:"cc"`
	Context    string    `json:"context"`
	Status     string    `json:"status"`
	Error      string    `json:"error"`
	SentAt     time.Time `json:"sent_at"`
}

// EmailTriggerService is the single place that answers "should this e-mail go
// out, with which parameters, to whom" — and records what actually went out.
type EmailTriggerService struct {
	db *pgxpool.Pool
}

func NewEmailTriggerService(db *pgxpool.Pool) *EmailTriggerService {
	return &EmailTriggerService{db: db}
}

func Definitions() []TriggerDefinition { return triggerDefinitions }

func definitionFor(key string) (TriggerDefinition, bool) {
	for _, def := range triggerDefinitions {
		if def.Key == key {
			return def, true
		}
	}
	return TriggerDefinition{}, false
}

// resolveOptions fills the option lists that come from live data. A source
// that fails to load yields an empty list rather than breaking the screen.
// The parameter slice is copied first: the definitions are package-level and
// writing into them would leak one request's options into every other.
func (s *EmailTriggerService) resolveOptions(ctx context.Context, def *TriggerDefinition) {
	def.Params = append([]ParamDef(nil), def.Params...)
	for index, param := range def.Params {
		if param.OptionsSource == "" {
			continue
		}
		var query string
		switch param.OptionsSource {
		case "clients":
			query = `SELECT name FROM catalog_clients ORDER BY name`
		case "fieldwire_documents":
			query = `SELECT DISTINCT trim(document) FROM forecast_fieldwire
			         WHERE trim(document) <> '' AND upper(trim(document)) <> 'N/A'
			         ORDER BY 1`
		default:
			continue
		}
		rows, err := s.db.Query(ctx, query)
		if err != nil {
			continue
		}
		options := []Option{}
		for rows.Next() {
			var value string
			if err := rows.Scan(&value); err == nil {
				options = append(options, Option{Value: value, Label: value})
			}
		}
		rows.Close()
		def.Params[index].Options = options
	}
}

// Get returns the stored configuration for a trigger. A trigger missing from
// the table is reported as disabled rather than silently defaulting to on.
func (s *EmailTriggerService) Get(ctx context.Context, key string) (*TriggerConfig, error) {
	def, ok := definitionFor(key)
	if !ok {
		return nil, fmt.Errorf("unknown email trigger %q", key)
	}

	cfg := &TriggerConfig{TriggerDefinition: def, Params: map[string]any{}}
	s.resolveOptions(ctx, &cfg.TriggerDefinition)
	var raw []byte
	err := s.db.QueryRow(ctx, `
		SELECT enabled, run_hour_local, params, updated_by, updated_at
		FROM email_triggers WHERE key = $1
	`, key).Scan(&cfg.Enabled, &cfg.RunHourLocal, &raw, &cfg.UpdatedBy, &cfg.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("load email trigger %s: %w", key, err)
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &cfg.Params); err != nil {
			return nil, fmt.Errorf("decode params of %s: %w", key, err)
		}
	}

	rows, err := s.db.Query(ctx, `
		SELECT recipient_type, user_id FROM email_trigger_recipients WHERE trigger_key = $1
	`, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cfg.ToUserIDs, cfg.CCUserIDs = []string{}, []string{}
	for rows.Next() {
		var kind, userID string
		if err := rows.Scan(&kind, &userID); err != nil {
			return nil, err
		}
		if kind == "to" {
			cfg.ToUserIDs = append(cfg.ToUserIDs, userID)
		} else {
			cfg.CCUserIDs = append(cfg.CCUserIDs, userID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Test sends are excluded: the count answers "how many alerts went out".
	_ = s.db.QueryRow(ctx, `
		SELECT count(*) FROM email_trigger_deliveries
		WHERE trigger_key = $1 AND status <> 'test'
	`, key).Scan(&cfg.DeliveryCount)
	return cfg, nil
}

func (s *EmailTriggerService) List(ctx context.Context) ([]*TriggerConfig, error) {
	out := make([]*TriggerConfig, 0, len(triggerDefinitions))
	for _, def := range triggerDefinitions {
		cfg, err := s.Get(ctx, def.Key)
		if err != nil {
			return nil, err
		}
		out = append(out, cfg)
	}
	return out, nil
}

type TriggerUpdate struct {
	Enabled      bool           `json:"enabled"`
	RunHourLocal *int           `json:"run_hour_local"`
	Params       map[string]any `json:"values"`
	ToUserIDs    []string       `json:"to_user_ids"`
	CCUserIDs    []string       `json:"cc_user_ids"`
}

func (s *EmailTriggerService) Update(ctx context.Context, key string, req TriggerUpdate, actor string) (*TriggerConfig, error) {
	def, ok := definitionFor(key)
	if !ok {
		return nil, fmt.Errorf("unknown email trigger %q", key)
	}
	s.resolveOptions(ctx, &def)
	if !def.Schedulable {
		req.RunHourLocal = nil
	}
	if req.RunHourLocal != nil && (*req.RunHourLocal < 0 || *req.RunHourLocal > 23) {
		return nil, fmt.Errorf("run hour must be between 0 and 23")
	}

	// Only declared parameters are persisted — an unknown key in the payload
	// would otherwise sit in the JSON forever with nothing reading it.
	clean := map[string]any{}
	for _, param := range def.Params {
		value, present := req.Params[param.Key]
		if !present {
			continue
		}
		switch param.Type {
		case "int":
			number, ok := toInt(value)
			if !ok {
				return nil, fmt.Errorf("%s must be a whole number", param.Label)
			}
			if param.Min != nil && number < *param.Min {
				return nil, fmt.Errorf("%s must be at least %d", param.Label, *param.Min)
			}
			if param.Max != nil && number > *param.Max {
				return nil, fmt.Errorf("%s must be at most %d", param.Label, *param.Max)
			}
			clean[param.Key] = number
		case "select":
			text := fmt.Sprint(value)
			allowed := false
			for _, option := range param.Options {
				if option.Value == text {
					allowed = true
				}
			}
			if !allowed {
				return nil, fmt.Errorf("%s has an invalid option", param.Label)
			}
			clean[param.Key] = text
		case "multiselect":
			list, ok := value.([]any)
			if !ok {
				return nil, fmt.Errorf("%s must be a list", param.Label)
			}
			allowed := map[string]bool{}
			for _, option := range param.Options {
				allowed[option.Value] = true
			}
			selected := []string{}
			for _, item := range list {
				text := strings.TrimSpace(fmt.Sprint(item))
				// An option can disappear from the catalogue after being
				// selected; rejecting the whole save would strand the screen.
				if text == "" || !allowed[text] {
					continue
				}
				selected = append(selected, text)
			}
			if len(selected) == 0 {
				return nil, fmt.Errorf("%s needs at least one option", param.Label)
			}
			clean[param.Key] = selected
		case "date":
			text := strings.TrimSpace(fmt.Sprint(value))
			if _, err := time.Parse("2006-01-02", text); err != nil {
				return nil, fmt.Errorf("%s must be a valid date", param.Label)
			}
			clean[param.Key] = text
		default:
			clean[param.Key] = strings.TrimSpace(fmt.Sprint(value))
		}
	}

	encoded, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE email_triggers
		SET enabled=$2, run_hour_local=$3, params=$4, updated_by=$5, updated_at=now()
		WHERE key=$1
	`, key, req.Enabled, req.RunHourLocal, encoded, nullableActor(actor)); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM email_trigger_recipients WHERE trigger_key=$1`, key); err != nil {
		return nil, err
	}
	for _, group := range []struct {
		kind string
		ids  []string
	}{{"to", req.ToUserIDs}, {"cc", req.CCUserIDs}} {
		for _, userID := range group.ids {
			if _, err := tx.Exec(ctx, `
				INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
				VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
			`, key, group.kind, userID); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.Get(ctx, key)
}

func nullableActor(actor string) any {
	if strings.TrimSpace(actor) == "" {
		return nil
	}
	return actor
}

func toInt(value any) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return int(typed), true
	case int:
		return typed, true
	case json.Number:
		number, err := typed.Int64()
		return int(number), err == nil
	case string:
		var number int
		_, err := fmt.Sscanf(strings.TrimSpace(typed), "%d", &number)
		return number, err == nil
	}
	return 0, false
}

// Recipients resolves the addresses of a trigger. Users without an e-mail on
// file are skipped rather than producing an invalid recipient.
func (s *EmailTriggerService) Recipients(ctx context.Context, key string) ([]string, []string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT r.recipient_type, u.email
		FROM email_trigger_recipients r
		JOIN users u ON u.id = r.user_id
		WHERE r.trigger_key = $1 AND trim(u.email) <> ''
		ORDER BY r.recipient_type DESC, u.name
	`, key)
	if err != nil {
		return nil, nil, fmt.Errorf("trigger recipients: %w", err)
	}
	defer rows.Close()

	to, cc := []string{}, []string{}
	for rows.Next() {
		var kind, address string
		if err := rows.Scan(&kind, &address); err != nil {
			return nil, nil, err
		}
		if kind == "to" {
			to = append(to, address)
		} else {
			cc = append(cc, address)
		}
	}
	return to, cc, rows.Err()
}

// ShouldRun answers the two questions every job asks before doing any work:
// is this trigger on, and is this its hour. Triggers with no schedule of their
// own only answer the first.
func (s *EmailTriggerService) ShouldRun(ctx context.Context, key string, now time.Time) (bool, *TriggerConfig, error) {
	cfg, err := s.Get(ctx, key)
	if err != nil {
		return false, nil, err
	}
	if !cfg.Enabled {
		return false, cfg, nil
	}
	if !cfg.Schedulable || cfg.RunHourLocal == nil {
		return true, cfg, nil
	}
	// The hour is the company's own, not UTC: 08:00 stays 08:00 in Hopedale
	// on both sides of daylight saving.
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	return now.In(loc).Hour() == *cfg.RunHourLocal, cfg, nil
}

func (s *EmailTriggerService) LogDelivery(ctx context.Context, entry TriggerDelivery) {
	status := entry.Status
	if status == "" {
		status = "sent"
	}
	_, _ = s.db.Exec(ctx, `
		INSERT INTO email_trigger_deliveries
			(trigger_key, subject, to_addresses, cc_addresses, context, status, error)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, entry.TriggerKey, entry.Subject, entry.To, entry.CC, entry.Context, status, entry.Error)
}

func (s *EmailTriggerService) History(ctx context.Context, key string, limit int) ([]TriggerDelivery, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.Query(ctx, `
		SELECT trigger_key, subject, to_addresses, cc_addresses, context, status, error, sent_at
		FROM email_trigger_deliveries
		WHERE trigger_key = $1
		ORDER BY sent_at DESC
		LIMIT $2
	`, key, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TriggerDelivery{}
	for rows.Next() {
		var entry TriggerDelivery
		if err := rows.Scan(&entry.TriggerKey, &entry.Subject, &entry.To, &entry.CC,
			&entry.Context, &entry.Status, &entry.Error, &entry.SentAt); err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

// ParamString / ParamInt read a stored parameter with a fallback, so a job
// never crashes on a trigger row that predates a new parameter.
func (c *TriggerConfig) ParamString(key, fallback string) string {
	if value, ok := c.Params[key]; ok {
		if text := strings.TrimSpace(fmt.Sprint(value)); text != "" {
			return text
		}
	}
	return fallback
}

// ParamStrings reads a multiselect parameter. Values stored before the
// parameter became a list are accepted as a single-item list.
func (c *TriggerConfig) ParamStrings(key string) []string {
	value, ok := c.Params[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case []any:
		out := []string{}
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				out = append(out, text)
			}
		}
		return out
	case []string:
		return typed
	case string:
		if text := strings.TrimSpace(typed); text != "" {
			return []string{text}
		}
	}
	return nil
}

// Preview renders what this trigger would send, from invented data, using the
// configuration passed in — so an unsaved edit can be previewed too.
func (s *EmailTriggerService) Preview(ctx context.Context, key string, req TriggerUpdate) (EmailBody, error) {
	cfg, err := s.Get(ctx, key)
	if err != nil {
		return EmailBody{}, err
	}
	if req.Params != nil {
		cfg.Params = req.Params
	}
	return previewSample(key, cfg), nil
}

// SendTest delivers the preview to the caller's own address and nobody else.
// It never touches the configured recipients: the point is to prove delivery
// works without notifying anyone.
func (s *EmailTriggerService) SendTest(ctx context.Context, key string, req TriggerUpdate, actorID string, sender EmailSender) (string, error) {
	if sender == nil {
		return "", fmt.Errorf("email delivery is not configured")
	}
	var address string
	if err := s.db.QueryRow(ctx, `SELECT COALESCE(email, '') FROM users WHERE id = $1`, actorID).Scan(&address); err != nil {
		return "", fmt.Errorf("could not resolve your user")
	}
	if strings.TrimSpace(address) == "" {
		return "", fmt.Errorf("your user has no e-mail address on file")
	}

	body, err := s.Preview(ctx, key, req)
	if err != nil {
		return "", err
	}

	const notice = "This is a test sent from Settings → Email Triggers. The data below is invented."
	message := EmailMessage{
		To:      []string{address},
		Subject: "[TEST] " + body.Subject,
		Text:    notice + "\n\n" + body.Text,
		HTML:    `<p style="padding:8px 12px;background:#fff3cd;color:#664d03;font-size:13px">` + notice + `</p>` + body.HTML,
	}

	delivery, err := sender.Send(ctx, message)
	if err != nil {
		s.LogDelivery(ctx, TriggerDelivery{
			TriggerKey: key, Subject: message.Subject, To: message.To,
			Context: "test", Status: "failed", Error: err.Error(),
		})
		return "", err
	}
	s.LogDelivery(ctx, TriggerDelivery{
		TriggerKey: key, Subject: message.Subject, To: message.To,
		Context: "test", Status: "test",
	})
	_ = delivery
	return address, nil
}

func (c *TriggerConfig) ParamInt(key string, fallback int) int {
	if value, ok := c.Params[key]; ok {
		if number, ok := toInt(value); ok {
			return number
		}
	}
	return fallback
}
