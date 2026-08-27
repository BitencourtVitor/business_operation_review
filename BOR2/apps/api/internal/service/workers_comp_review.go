package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const workersCompDateLayout = "2006-01-02"

// Fallbacks for a trigger row that has not been configured yet. They reproduce
// the cadence that was hardcoded before Settings → Email Triggers existed.
var (
	workersCompDefaultAnchor    = time.Date(2026, time.August, 13, 0, 0, 0, 0, time.UTC)
	workersCompDefaultCycleDays = 14
)

type WorkersCompReviewCheck struct {
	ID             string     `json:"id"`
	ContractorID   int        `json:"contractor_id"`
	ContractorName string     `json:"contractor_name"`
	Email          string     `json:"email"`
	Divisions      []string   `json:"divisions"`
	Status         string     `json:"status"`
	Notes          string     `json:"notes"`
	CheckedBy      *string    `json:"checked_by"`
	CheckedAt      *time.Time `json:"checked_at"`
}

type WorkersCompReviewCycle struct {
	ID                string                   `json:"id"`
	ReviewDate        string                   `json:"review_date"`
	Status            string                   `json:"status"`
	ReviewEmailSentAt *time.Time               `json:"review_email_sent_at"`
	ResultEmailSentAt *time.Time               `json:"result_email_sent_at"`
	ClosedAt          *time.Time               `json:"closed_at"`
	Checks            []WorkersCompReviewCheck `json:"checks"`
	// Neighbours on the cadence, so the screen can walk cycles without
	// guessing the anchor. Empty when there is nothing on that side.
	PrevReviewDate string `json:"prev_review_date"`
	NextReviewDate string `json:"next_review_date"`
}

type WorkersCompReviewService struct {
	db       *pgxpool.Pool
	email    EmailSender
	triggers *EmailTriggerService
}

func NewWorkersCompReviewService(db *pgxpool.Pool, email EmailSender, triggers *EmailTriggerService) *WorkersCompReviewService {
	if triggers == nil {
		triggers = NewEmailTriggerService(db)
	}
	return &WorkersCompReviewService{db: db, email: email, triggers: triggers}
}

// workersCompSchedule is the cadence as configured on the settings screen.
type workersCompSchedule struct {
	anchor    time.Time
	cycleDays int
}

func (s *WorkersCompReviewService) schedule(ctx context.Context) (workersCompSchedule, error) {
	out := workersCompSchedule{
		anchor:    workersCompDefaultAnchor,
		cycleDays: workersCompDefaultCycleDays,
	}
	review, err := s.triggers.Get(ctx, TriggerWorkersCompReview)
	if err != nil {
		return out, err
	}
	if parsed, err := time.Parse(workersCompDateLayout, review.ParamString("anchor_date", "")); err == nil {
		out.anchor = parsed
	}
	if days := review.ParamInt("cycle_days", out.cycleDays); days > 0 {
		out.cycleDays = days
	}
	return out, nil
}

func workersCompEasternDate(now time.Time) time.Time {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

func nextWorkersCompReviewDate(date time.Time, sched workersCompSchedule) time.Time {
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	if !date.After(sched.anchor) {
		return sched.anchor
	}
	days := int(date.Sub(sched.anchor).Hours() / 24)
	cycles := days / sched.cycleDays
	candidate := sched.anchor.AddDate(0, 0, cycles*sched.cycleDays)
	if candidate.Before(date) {
		candidate = candidate.AddDate(0, 0, sched.cycleDays)
	}
	return candidate
}

func (s *WorkersCompReviewService) ensureCycle(ctx context.Context, reviewDate time.Time) (string, error) {
	var cycleID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO sub_doc_workers_comp_cycles (review_date)
		VALUES ($1)
		ON CONFLICT (review_date) DO UPDATE SET updated_at = now()
		RETURNING id
	`, reviewDate).Scan(&cycleID)
	if err != nil {
		return "", fmt.Errorf("ensure workers comp cycle: %w", err)
	}

	// Opening a cycle ends every older one: a cycle lives until the next
	// review, which is the whole cadence.
	if _, err := s.db.Exec(ctx, `
		UPDATE sub_doc_workers_comp_cycles
		SET status='closed', closed_at=now(), updated_at=now()
		WHERE review_date < $1 AND status <> 'closed'
	`, reviewDate); err != nil {
		return "", fmt.Errorf("close previous workers comp cycles: %w", err)
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO sub_doc_workers_comp_checks (cycle_id, contractor_id)
		SELECT $1, c.id
		FROM sub_doc_contractors c
		WHERE c.archived = false
		  AND EXISTS (
		      SELECT 1 FROM sub_doc_records r
		      WHERE r.contractor_id = c.id
		        AND r.doc_type = 'workers_comp'
		        AND r.status = 'received'
		  )
		ON CONFLICT (cycle_id, contractor_id) DO NOTHING
	`, cycleID)
	if err != nil {
		return "", fmt.Errorf("populate workers comp cycle: %w", err)
	}
	return cycleID, nil
}

func (s *WorkersCompReviewService) Current(ctx context.Context, now time.Time) (*WorkersCompReviewCycle, error) {
	sched, err := s.schedule(ctx)
	if err != nil {
		return nil, err
	}
	date := workersCompEasternDate(now)
	reviewDate := nextWorkersCompReviewDate(date, sched)
	cycleID, err := s.ensureCycle(ctx, reviewDate)
	if err != nil {
		return nil, err
	}
	cycle, err := s.getCycle(ctx, cycleID)
	if err != nil {
		return nil, err
	}
	s.attachNeighbours(cycle, reviewDate, sched)
	return cycle, nil
}

// ByDate reads a cycle that already exists. It never creates one and never
// closes another: walking the history must not move the cadence forward.
func (s *WorkersCompReviewService) ByDate(ctx context.Context, reviewDate time.Time) (*WorkersCompReviewCycle, error) {
	sched, err := s.schedule(ctx)
	if err != nil {
		return nil, err
	}
	reviewDate = time.Date(reviewDate.Year(), reviewDate.Month(), reviewDate.Day(), 0, 0, 0, 0, time.UTC)

	var cycleID string
	err = s.db.QueryRow(ctx, `
		SELECT id FROM sub_doc_workers_comp_cycles WHERE review_date = $1
	`, reviewDate).Scan(&cycleID)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			// A cycle on the cadence that was never opened — a future one, or
			// one from before the feature existed.
			cycle := &WorkersCompReviewCycle{
				ReviewDate: reviewDate.Format(workersCompDateLayout),
				Status:     "not_opened",
				Checks:     []WorkersCompReviewCheck{},
			}
			s.attachNeighbours(cycle, reviewDate, sched)
			return cycle, nil
		}
		return nil, fmt.Errorf("find workers comp cycle by date: %w", err)
	}

	cycle, err := s.getCycle(ctx, cycleID)
	if err != nil {
		return nil, err
	}
	s.attachNeighbours(cycle, reviewDate, sched)
	return cycle, nil
}

func (s *WorkersCompReviewService) attachNeighbours(cycle *WorkersCompReviewCycle, reviewDate time.Time, sched workersCompSchedule) {
	prev := reviewDate.AddDate(0, 0, -sched.cycleDays)
	if !prev.Before(sched.anchor) {
		cycle.PrevReviewDate = prev.Format(workersCompDateLayout)
	}
	cycle.NextReviewDate = reviewDate.AddDate(0, 0, sched.cycleDays).Format(workersCompDateLayout)
}

func (s *WorkersCompReviewService) getCycle(ctx context.Context, cycleID string) (*WorkersCompReviewCycle, error) {
	cycle := &WorkersCompReviewCycle{ID: cycleID, Checks: []WorkersCompReviewCheck{}}
	var reviewDate time.Time
	err := s.db.QueryRow(ctx, `
		SELECT review_date, status, review_email_sent_at, result_email_sent_at, closed_at
		FROM sub_doc_workers_comp_cycles WHERE id = $1
	`, cycleID).Scan(&reviewDate, &cycle.Status, &cycle.ReviewEmailSentAt, &cycle.ResultEmailSentAt, &cycle.ClosedAt)
	if err != nil {
		return nil, fmt.Errorf("get workers comp cycle: %w", err)
	}
	cycle.ReviewDate = reviewDate.Format(workersCompDateLayout)

	// Off-boarding happens after the cycle was populated, so the archived
	// filter has to live here too — otherwise a subcontractor we no longer
	// work with keeps showing up in the review and in its e-mails.
	rows, err := s.db.Query(ctx, `
		SELECT ch.id, c.id, c.name, c.email,
		       COALESCE(array_agg(DISTINCT d.division) FILTER (WHERE d.division IS NOT NULL), '{}'),
		       ch.status, ch.notes, u.name, ch.checked_at
		FROM sub_doc_workers_comp_checks ch
		JOIN sub_doc_contractors c ON c.id = ch.contractor_id
		LEFT JOIN sub_doc_contractor_divisions d ON d.contractor_id = c.id
		LEFT JOIN users u ON u.id = ch.checked_by
		WHERE ch.cycle_id = $1
		  AND c.archived = false
		GROUP BY ch.id, c.id, c.name, c.email, ch.status, ch.notes, u.name, ch.checked_at
		ORDER BY CASE ch.status WHEN 'irregular' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, c.name
	`, cycleID)
	if err != nil {
		return nil, fmt.Errorf("list workers comp checks: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var check WorkersCompReviewCheck
		if err := rows.Scan(&check.ID, &check.ContractorID, &check.ContractorName, &check.Email, &check.Divisions, &check.Status, &check.Notes, &check.CheckedBy, &check.CheckedAt); err != nil {
			return nil, fmt.Errorf("scan workers comp check: %w", err)
		}
		cycle.Checks = append(cycle.Checks, check)
	}
	return cycle, rows.Err()
}

func (s *WorkersCompReviewService) UpdateCheck(ctx context.Context, checkID, status, notes, actorID string) error {
	if status != "pending" && status != "regular" && status != "irregular" {
		return fmt.Errorf("invalid workers comp check status")
	}
	var checkedBy any
	var checkedAt any
	if status != "pending" {
		checkedBy = actorID
		checkedAt = time.Now().UTC()
	}
	command, err := s.db.Exec(ctx, `
		UPDATE sub_doc_workers_comp_checks
		SET status=$2, notes=$3, checked_by=$4, checked_at=$5, updated_at=now()
		WHERE id=$1
	`, checkID, status, strings.TrimSpace(notes), checkedBy, checkedAt)
	if err != nil {
		return fmt.Errorf("update workers comp check: %w", err)
	}
	if command.RowsAffected() == 0 {
		return fmt.Errorf("workers comp check not found")
	}
	return nil
}

func (s *WorkersCompReviewService) recipients(ctx context.Context, triggerKey string) ([]string, []string, error) {
	return s.triggers.Recipients(ctx, triggerKey)
}

func workersCompRows(checks []WorkersCompReviewCheck) []WorkersCompRow {
	rows := make([]WorkersCompRow, 0, len(checks))
	for _, check := range checks {
		rows = append(rows, WorkersCompRow{
			ContractorName: check.ContractorName,
			Divisions:      strings.Join(check.Divisions, ", "),
		})
	}
	return rows
}

func (s *WorkersCompReviewService) sendReview(ctx context.Context, cycle *WorkersCompReviewCycle) error {
	if cycle.ReviewEmailSentAt != nil {
		return nil
	}
	to, cc, err := s.recipients(ctx, TriggerWorkersCompReview)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("workers-comp-review: no primary recipients, skipping", "cycle", cycle.ID)
		return nil
	}
	body := BuildWorkersCompReviewEmail(cycle.ReviewDate, workersCompRows(cycle.Checks))
	subject := body.Subject
	delivery, err := s.email.Send(ctx, EmailMessage{
		To: to, CC: cc, Subject: subject, Text: body.Text, HTML: body.HTML,
	})
	if err != nil {
		s.triggers.LogDelivery(ctx, TriggerDelivery{
			TriggerKey: TriggerWorkersCompReview, Subject: subject, To: to, CC: cc,
			Context: fmt.Sprintf("%d subcontractors", len(cycle.Checks)), Status: "failed", Error: err.Error(),
		})
		return err
	}
	s.triggers.LogDelivery(ctx, TriggerDelivery{
		TriggerKey: TriggerWorkersCompReview, Subject: subject, To: to, CC: cc,
		Context: fmt.Sprintf("%d subcontractors", len(cycle.Checks)),
	})
	_, err = s.db.Exec(ctx, `UPDATE sub_doc_workers_comp_cycles SET review_email_sent_at=now(), updated_at=now() WHERE id=$1`, cycle.ID)
	logger.Info("workers comp review email accepted", "cycle", cycle.ID, "delivery_id", delivery.ID, "checks", len(cycle.Checks))
	return err
}

// sendResult reports how a cycle came out. It only reads: the cycle it reports
// on was opened by the review days earlier, and reporting must never move the
// cadence forward or reopen anything.
func (s *WorkersCompReviewService) sendResult(ctx context.Context, cycle *WorkersCompReviewCycle) error {
	if cycle.ResultEmailSentAt != nil {
		return nil
	}
	to, cc, err := s.recipients(ctx, TriggerWorkersCompResult)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("workers-comp-result: no primary recipients, skipping", "cycle", cycle.ID)
		return nil
	}

	var irregular, pending, regular []WorkersCompResultRow
	for _, check := range cycle.Checks {
		row := WorkersCompResultRow{
			ContractorName: check.ContractorName,
			Divisions:      strings.Join(check.Divisions, ", "),
			Notes:          check.Notes,
		}
		switch check.Status {
		case "irregular":
			irregular = append(irregular, row)
		case "regular":
			regular = append(regular, row)
		default:
			pending = append(pending, row)
		}
	}

	body := BuildWorkersCompResultEmail(cycle.ReviewDate, irregular, pending, regular)
	summary := fmt.Sprintf("%d irregular, %d not checked, %d regular", len(irregular), len(pending), len(regular))
	delivery, err := s.email.Send(ctx, EmailMessage{
		To: to, CC: cc, Subject: body.Subject, Text: body.Text, HTML: body.HTML,
	})
	if err != nil {
		s.triggers.LogDelivery(ctx, TriggerDelivery{
			TriggerKey: TriggerWorkersCompResult, Subject: body.Subject, To: to, CC: cc,
			Context: summary, Status: "failed", Error: err.Error(),
		})
		return err
	}
	s.triggers.LogDelivery(ctx, TriggerDelivery{
		TriggerKey: TriggerWorkersCompResult, Subject: body.Subject, To: to, CC: cc, Context: summary,
	})
	_, err = s.db.Exec(ctx,
		`UPDATE sub_doc_workers_comp_cycles SET result_email_sent_at=now(), updated_at=now() WHERE id=$1`, cycle.ID)
	logger.Info("workers comp result email accepted", "cycle", cycle.ID, "delivery_id", delivery.ID,
		"irregular", len(irregular), "pending", len(pending), "regular", len(regular))
	return err
}

// RunDaily is called hourly. Each of the two e-mails checks its own trigger:
// either can be switched off or moved to another hour without touching the
// other, and the cycle itself keeps being opened either way.
func (s *WorkersCompReviewService) RunDaily(ctx context.Context, now time.Time) error {
	sched, err := s.schedule(ctx)
	if err != nil {
		return err
	}
	today := workersCompEasternDate(now)

	if today.Equal(nextWorkersCompReviewDate(today, sched)) {
		reviewDue, _, err := s.triggers.ShouldRun(ctx, TriggerWorkersCompReview, now)
		if err != nil {
			return err
		}
		if !reviewDue {
			return nil
		}
		cycleID, err := s.ensureCycle(ctx, today)
		if err != nil {
			return err
		}
		cycle, err := s.getCycle(ctx, cycleID)
		if err != nil {
			return err
		}
		return s.sendReview(ctx, cycle)
	}

	return s.runResult(ctx, now, today, sched)
}

// runResult fires on review date + N. The offset is counted backwards from
// today and the result only goes out if that lands exactly on a review date —
// so the e-mail follows the cycle rather than a weekday, and changing the
// anchor moves both e-mails together.
func (s *WorkersCompReviewService) runResult(ctx context.Context, now, today time.Time, sched workersCompSchedule) error {
	resultDue, _, err := s.triggers.ShouldRun(ctx, TriggerWorkersCompResult, now)
	if err != nil {
		return err
	}
	if !resultDue {
		return nil
	}

	offset := 1
	if cfg, err := s.triggers.Get(ctx, TriggerWorkersCompResult); err == nil {
		if days := cfg.ParamInt("days_after_review", offset); days > 0 {
			offset = days
		}
	}

	origin := today.AddDate(0, 0, -offset)
	if origin.Before(sched.anchor) || !origin.Equal(nextWorkersCompReviewDate(origin, sched)) {
		return nil
	}

	cycle, err := s.ByDate(ctx, origin)
	if err != nil || cycle == nil || cycle.ID == "" {
		// ByDate answers "not_opened" with an empty ID when no cycle exists on
		// that date — the review never ran, so there is no result to report.
		return nil
	}
	return s.sendResult(ctx, cycle)
}
