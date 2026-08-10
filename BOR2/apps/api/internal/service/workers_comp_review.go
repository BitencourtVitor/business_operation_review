package service

import (
	"context"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const workersCompDateLayout = "2006-01-02"

var workersCompReviewAnchor = time.Date(2026, time.August, 13, 0, 0, 0, 0, time.UTC)

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
	ID                  string                   `json:"id"`
	ReviewDate          string                   `json:"review_date"`
	CommunicationDate   string                   `json:"communication_date"`
	Status              string                   `json:"status"`
	ReviewEmailSentAt   *time.Time               `json:"review_email_sent_at"`
	CommunicationSentAt *time.Time               `json:"communication_sent_at"`
	Checks              []WorkersCompReviewCheck `json:"checks"`
}

type WorkersCompReviewService struct {
	db    *pgxpool.Pool
	email EmailSender
}

func NewWorkersCompReviewService(db *pgxpool.Pool, email EmailSender) *WorkersCompReviewService {
	return &WorkersCompReviewService{db: db, email: email}
}

func workersCompEasternDate(now time.Time) time.Time {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

func nextWorkersCompReviewDate(date time.Time) time.Time {
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	if !date.After(workersCompReviewAnchor) {
		return workersCompReviewAnchor
	}
	days := int(date.Sub(workersCompReviewAnchor).Hours() / 24)
	cycles := days / 14
	candidate := workersCompReviewAnchor.AddDate(0, 0, cycles*14)
	if candidate.Before(date) {
		candidate = candidate.AddDate(0, 0, 14)
	}
	return candidate
}

func (s *WorkersCompReviewService) ensureCycle(ctx context.Context, reviewDate time.Time) (string, error) {
	var cycleID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO sub_doc_workers_comp_cycles (review_date, communication_date)
		VALUES ($1, $2)
		ON CONFLICT (review_date) DO UPDATE SET updated_at = now()
		RETURNING id
	`, reviewDate, reviewDate.AddDate(0, 0, 1)).Scan(&cycleID)
	if err != nil {
		return "", fmt.Errorf("ensure workers comp cycle: %w", err)
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
	date := workersCompEasternDate(now)
	reviewDate := nextWorkersCompReviewDate(date)
	cycleID, err := s.ensureCycle(ctx, reviewDate)
	if err != nil {
		return nil, err
	}
	return s.getCycle(ctx, cycleID)
}

func (s *WorkersCompReviewService) getCycle(ctx context.Context, cycleID string) (*WorkersCompReviewCycle, error) {
	cycle := &WorkersCompReviewCycle{ID: cycleID, Checks: []WorkersCompReviewCheck{}}
	var reviewDate, communicationDate time.Time
	err := s.db.QueryRow(ctx, `
		SELECT review_date, communication_date, status, review_email_sent_at, communication_sent_at
		FROM sub_doc_workers_comp_cycles WHERE id = $1
	`, cycleID).Scan(&reviewDate, &communicationDate, &cycle.Status, &cycle.ReviewEmailSentAt, &cycle.CommunicationSentAt)
	if err != nil {
		return nil, fmt.Errorf("get workers comp cycle: %w", err)
	}
	cycle.ReviewDate = reviewDate.Format(workersCompDateLayout)
	cycle.CommunicationDate = communicationDate.Format(workersCompDateLayout)

	rows, err := s.db.Query(ctx, `
		SELECT ch.id, c.id, c.name, c.email,
		       COALESCE(array_agg(DISTINCT d.division) FILTER (WHERE d.division IS NOT NULL), '{}'),
		       ch.status, ch.notes, u.name, ch.checked_at
		FROM sub_doc_workers_comp_checks ch
		JOIN sub_doc_contractors c ON c.id = ch.contractor_id
		LEFT JOIN sub_doc_contractor_divisions d ON d.contractor_id = c.id
		LEFT JOIN users u ON u.id = ch.checked_by
		WHERE ch.cycle_id = $1
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

func (s *WorkersCompReviewService) recipients(ctx context.Context) ([]string, []string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT r.recipient_type, u.email
		FROM sub_doc_email_recipients r
		JOIN users u ON u.id = r.user_id
		WHERE r.alert_type = 'workers_comp' AND trim(u.email) <> ''
		ORDER BY r.recipient_type DESC, u.name
	`)
	if err != nil {
		return nil, nil, fmt.Errorf("workers comp recipients: %w", err)
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

func workersCompEmailTable(checks []WorkersCompReviewCheck) (string, string) {
	var textRows, htmlRows strings.Builder
	for _, check := range checks {
		divisions := strings.Join(check.Divisions, ", ")
		textRows.WriteString(fmt.Sprintf("- %s | %s | %s\n", check.ContractorName, divisions, strings.ToUpper(check.Status)))
		htmlRows.WriteString("<tr><td>" + html.EscapeString(check.ContractorName) + "</td><td>" + html.EscapeString(divisions) + "</td><td>" + html.EscapeString(strings.ToUpper(check.Status)) + "</td></tr>")
	}
	htmlTable := `<table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:8px">Subcontractor</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:8px">Divisions</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:8px">Status</th></tr></thead><tbody>` + htmlRows.String() + `</tbody></table>`
	return textRows.String(), htmlTable
}

func (s *WorkersCompReviewService) sendReview(ctx context.Context, cycle *WorkersCompReviewCycle) error {
	if cycle.ReviewEmailSentAt != nil {
		return nil
	}
	to, cc, err := s.recipients(ctx)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("workers-comp-review: no primary recipients, skipping", "cycle", cycle.ID)
		return nil
	}
	textRows, htmlTable := workersCompEmailTable(cycle.Checks)
	subject := "Workers' Compensation review — " + cycle.ReviewDate
	delivery, err := s.email.Send(ctx, EmailMessage{
		To: to, CC: cc, Subject: subject,
		Text: "Review each eligible subcontractor below and record Regular or Irregular in BOR.\n\n" + textRows,
		HTML: "<p>Review each eligible subcontractor below and record <strong>Regular</strong> or <strong>Irregular</strong> in BOR.</p>" + htmlTable,
	})
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE sub_doc_workers_comp_cycles SET review_email_sent_at=now(), updated_at=now() WHERE id=$1`, cycle.ID)
	logger.Info("workers comp review email accepted", "cycle", cycle.ID, "delivery_id", delivery.ID, "checks", len(cycle.Checks))
	return err
}

func (s *WorkersCompReviewService) sendCommunication(ctx context.Context, cycle *WorkersCompReviewCycle) error {
	if cycle.CommunicationSentAt != nil {
		return nil
	}
	irregular := make([]WorkersCompReviewCheck, 0)
	for _, check := range cycle.Checks {
		if check.Status == "irregular" {
			irregular = append(irregular, check)
		}
	}
	if len(irregular) == 0 {
		_, err := s.db.Exec(ctx, `UPDATE sub_doc_workers_comp_cycles SET status='closed', communication_sent_at=now(), updated_at=now() WHERE id=$1`, cycle.ID)
		return err
	}
	to, cc, err := s.recipients(ctx)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		return nil
	}
	textRows, htmlTable := workersCompEmailTable(irregular)
	delivery, err := s.email.Send(ctx, EmailMessage{
		To: to, CC: cc, Subject: "Workers' Compensation irregularities — " + cycle.CommunicationDate,
		Text: "The following subcontractors were marked irregular and require communication today.\n\n" + textRows,
		HTML: "<p>The following subcontractors were marked <strong>Irregular</strong> and require communication today.</p>" + htmlTable,
	})
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE sub_doc_workers_comp_cycles SET status='closed', communication_sent_at=now(), updated_at=now() WHERE id=$1`, cycle.ID)
	logger.Info("workers comp communication email accepted", "cycle", cycle.ID, "delivery_id", delivery.ID, "irregular", len(irregular))
	return err
}

func (s *WorkersCompReviewService) RunDaily(ctx context.Context, now time.Time) error {
	today := workersCompEasternDate(now)
	if today.Equal(nextWorkersCompReviewDate(today)) {
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

	reviewDate := today.AddDate(0, 0, -1)
	if reviewDate.Equal(nextWorkersCompReviewDate(reviewDate)) {
		var cycleID string
		if err := s.db.QueryRow(ctx, `SELECT id FROM sub_doc_workers_comp_cycles WHERE review_date=$1`, reviewDate).Scan(&cycleID); err != nil {
			return fmt.Errorf("find workers comp communication cycle: %w", err)
		}
		cycle, err := s.getCycle(ctx, cycleID)
		if err != nil {
			return err
		}
		return s.sendCommunication(ctx, cycle)
	}
	return nil
}
