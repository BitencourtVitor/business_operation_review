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
	TriggerForecastPlotPlan         = "forecast_plot_plan"
	TriggerWorkersCompReview        = "workers_comp_review"
	TriggerWorkersCompCommunication = "workers_comp_communication"
	TriggerQBTimeAbsence            = "qbtime_absence"
)

// ParamDef describes one editable parameter so the settings screen can render
// the form without knowing anything about the trigger it belongs to.
type ParamDef struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Help    string   `json:"help,omitempty"`
	Type    string   `json:"type"` // int | text | date | select
	Options []Option `json:"options,omitempty"`
	Min     *int     `json:"min,omitempty"`
	Max     *int     `json:"max,omitempty"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// TriggerDefinition is the static half of a trigger: what it is and which
// knobs it exposes. The values live in the database.
type TriggerDefinition struct {
	Key         string     `json:"key"`
	Label       string     `json:"label"`
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
		Label:       "Plot Plan due",
		Module:      "Forecast",
		Description: "Warns that a job is approaching its date and the Plot Plan has to be prepared. One e-mail per job, never repeated for the same target date.",
		When:        "Daily, for every job whose chosen date is within the configured window.",
		Schedulable: true,
		Params: []ParamDef{
			{Key: "client", Label: "Client", Type: "text", Help: "Only jobs of this client are considered. Case-insensitive."},
			{Key: "date_field", Label: "Reference date", Type: "select", Options: []Option{
				{Value: "previous_start_date", Label: "Start date"},
				{Value: "previous_beams_date", Label: "Beams date"},
				{Value: "previous_end_date", Label: "End date"},
			}},
			{Key: "offset_value", Label: "Send in advance", Type: "int", Min: intPtr(1), Max: intPtr(365)},
			{Key: "offset_unit", Label: "Unit", Type: "select", Options: []Option{
				{Value: "days", Label: "days"},
				{Value: "months", Label: "months"},
			}},
		},
	},
	{
		Key:         TriggerWorkersCompReview,
		Label:       "Workers' Comp review",
		Module:      "Subcontractor Docs",
		Description: "Opens a review cycle and sends the table of subcontractors to be checked one by one.",
		When:        "On every review date derived from the anchor and the cycle length.",
		Schedulable: true,
		Params: []ParamDef{
			{Key: "anchor_date", Label: "Anchor date", Type: "date", Help: "First review date. Every following cycle is counted from here."},
			{Key: "cycle_days", Label: "Cycle length (days)", Type: "int", Min: intPtr(1), Max: intPtr(180)},
		},
	},
	{
		Key:         TriggerWorkersCompCommunication,
		Label:       "Workers' Comp irregularities",
		Module:      "Subcontractor Docs",
		Description: "Sends the subcontractors marked Irregular in the previous review. Nothing is sent when the cycle has no irregularity.",
		When:        "The configured number of days after each review date.",
		Schedulable: true,
		Params: []ParamDef{
			{Key: "days_after_review", Label: "Days after the review", Type: "int", Min: intPtr(1), Max: intPtr(30)},
		},
	},
	{
		Key:         TriggerQBTimeAbsence,
		Label:       "Absence alert",
		Module:      "Absence Control",
		Description: "Announces employees with consecutive business days without a clock-in. One consolidated e-mail per company.",
		When:        "Right after the QB Time sync, which sets its own schedule.",
		Schedulable: false,
		Params: []ParamDef{
			{Key: "alert_days", Label: "Consecutive days to alert", Type: "int", Min: intPtr(1), Max: intPtr(30)},
			{Key: "window_days", Label: "Lookback window (days)", Type: "int", Min: intPtr(1), Max: intPtr(180)},
		},
	},
}

// TriggerConfig is a definition joined with its stored configuration. The
// values are exposed as "values" because "params" is already the schema the
// screen renders from — same name would shadow it in the JSON.
type TriggerConfig struct {
	TriggerDefinition
	Enabled    bool           `json:"enabled"`
	RunHourUTC *int           `json:"run_hour_utc"`
	Params     map[string]any `json:"values"`
	ToUserIDs  []string       `json:"to_user_ids"`
	CCUserIDs  []string       `json:"cc_user_ids"`
	UpdatedBy  *string        `json:"updated_by"`
	UpdatedAt  time.Time      `json:"updated_at"`
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

// Get returns the stored configuration for a trigger. A trigger missing from
// the table is reported as disabled rather than silently defaulting to on.
func (s *EmailTriggerService) Get(ctx context.Context, key string) (*TriggerConfig, error) {
	def, ok := definitionFor(key)
	if !ok {
		return nil, fmt.Errorf("unknown email trigger %q", key)
	}

	cfg := &TriggerConfig{TriggerDefinition: def, Params: map[string]any{}}
	var raw []byte
	err := s.db.QueryRow(ctx, `
		SELECT enabled, run_hour_utc, params, updated_by, updated_at
		FROM email_triggers WHERE key = $1
	`, key).Scan(&cfg.Enabled, &cfg.RunHourUTC, &raw, &cfg.UpdatedBy, &cfg.UpdatedAt)
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
	return cfg, rows.Err()
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
	Enabled    bool           `json:"enabled"`
	RunHourUTC *int           `json:"run_hour_utc"`
	Params     map[string]any `json:"values"`
	ToUserIDs  []string       `json:"to_user_ids"`
	CCUserIDs  []string       `json:"cc_user_ids"`
}

func (s *EmailTriggerService) Update(ctx context.Context, key string, req TriggerUpdate, actor string) (*TriggerConfig, error) {
	def, ok := definitionFor(key)
	if !ok {
		return nil, fmt.Errorf("unknown email trigger %q", key)
	}
	if !def.Schedulable {
		req.RunHourUTC = nil
	}
	if req.RunHourUTC != nil && (*req.RunHourUTC < 0 || *req.RunHourUTC > 23) {
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
		SET enabled=$2, run_hour_utc=$3, params=$4, updated_by=$5, updated_at=now()
		WHERE key=$1
	`, key, req.Enabled, req.RunHourUTC, encoded, nullableActor(actor)); err != nil {
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
	if !cfg.Schedulable || cfg.RunHourUTC == nil {
		return true, cfg, nil
	}
	return now.UTC().Hour() == *cfg.RunHourUTC, cfg, nil
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

func (c *TriggerConfig) ParamInt(key string, fallback int) int {
	if value, ok := c.Params[key]; ok {
		if number, ok := toInt(value); ok {
			return number
		}
	}
	return fallback
}
