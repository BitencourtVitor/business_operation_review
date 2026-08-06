package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

const (
	// How far back the detector recomputes. Kept under the 30 days the period
	// report re-syncs, so every day it looks at has settled timesheet data.
	absenceWindowDays = 21
	// Business days without a punch that trigger the alert.
	absenceAlertDays = 2
	// Granting this permission is what subscribes a user to the alert.
	absencePermKey = "absence_control"
)

// AbsenceCompanies mirrors the QB Time workspaces the sync already covers.
// "hvacing" is the Framing crew under a separate QB Time account.
var AbsenceCompanies = []string{"framing", "hvac", "pcg", "hvacing"}

type QBTimeAbsenceService struct {
	repo     repository.QBTimeAbsenceRepository
	notifSvc *NotificationService
}

func NewQBTimeAbsenceService(repo repository.QBTimeAbsenceRepository, notifSvc *NotificationService) *QBTimeAbsenceService {
	return &QBTimeAbsenceService{repo: repo, notifSvc: notifSvc}
}

func easternNow() time.Time {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return time.Now().UTC()
	}
	return time.Now().In(loc)
}

// candidateDays lists the business days in the window, oldest first. Today is
// excluded: the day is still running and everyone would look absent.
func candidateDays(now time.Time, windowDays int) []time.Time {
	var days []time.Time
	for i := windowDays; i >= 1; i-- {
		d := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -i)
		switch d.Weekday() {
		case time.Saturday, time.Sunday:
			continue
		}
		days = append(days, d)
	}
	return days
}

// evaluatedDays drops any candidate day the company as a whole did not punch on.
// A holiday or a failed sync would otherwise read as everybody being absent.
func (s *QBTimeAbsenceService) evaluatedDays(ctx context.Context, company string, now time.Time) ([]time.Time, error) {
	candidates := candidateDays(now, absenceWindowDays)
	active, err := s.repo.DaysWithActivity(ctx, company, candidates)
	if err != nil {
		return nil, err
	}
	var out []time.Time
	for _, d := range candidates {
		if active[d.Format("2006-01-02")] {
			out = append(out, d)
		}
	}
	return out, nil
}

// DetectCompany recomputes the whole window and replaces the stored events, so
// a timesheet corrected after the fact shrinks or removes its absence instead
// of leaving a stale one behind.
func (s *QBTimeAbsenceService) DetectCompany(ctx context.Context, company string) (int, error) {
	now := easternNow()
	days, err := s.evaluatedDays(ctx, company, now)
	if err != nil {
		return 0, err
	}
	if len(days) == 0 {
		logger.Info("absence-detect: no evaluated days", "company", company)
		return 0, nil
	}

	type person struct {
		name string
		team string
		// index into days, ascending
		missed []int
	}
	people := map[int64]*person{}

	for i, day := range days {
		absent, err := s.repo.AbsentOn(ctx, company, day)
		if err != nil {
			return 0, err
		}
		for _, a := range absent {
			p, ok := people[a.QBTUserID]
			if !ok {
				p = &person{}
				people[a.QBTUserID] = p
			}
			// Last seen name/team wins — the roster sync keeps them current.
			p.name = a.EmployeeName
			p.team = a.TeamName
			p.missed = append(p.missed, i)
		}
	}

	var events []repository.AbsenceEventInput
	for userID, p := range people {
		sort.Ints(p.missed)
		for start := 0; start < len(p.missed); {
			end := start
			// Consecutive in the evaluated list, not in the calendar: a skipped
			// holiday in the middle must not split one absence into two.
			for end+1 < len(p.missed) && p.missed[end+1] == p.missed[end]+1 {
				end++
			}
			events = append(events, repository.AbsenceEventInput{
				QBTUserID:    userID,
				EmployeeName: p.name,
				TeamName:     p.team,
				StartDate:    days[p.missed[start]],
				EndDate:      days[p.missed[end]],
				DaysCount:    end - start + 1,
			})
			start = end + 1
		}
	}

	if err := s.repo.ReplaceWindow(ctx, company, days[0], days[len(days)-1], events); err != nil {
		return 0, err
	}
	return len(events), nil
}

// NotifyCompany announces every event that crossed the threshold and has not
// been announced yet — one notification per company per run, not per person.
func (s *QBTimeAbsenceService) NotifyCompany(ctx context.Context, company string) error {
	pending, err := s.repo.PendingNotification(ctx, company, absenceAlertDays)
	if err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	recipients, err := s.repo.RecipientsFor(ctx, absencePermKey)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		logger.Info("absence-notify: nobody holds the permission, skipping",
			"company", company, "perm", absencePermKey, "events", len(pending))
		return nil
	}

	var lines []string
	ids := make([]string, 0, len(pending))
	for _, e := range pending {
		lines = append(lines, fmt.Sprintf("%s (%s) — %d business days, since %s",
			e.EmployeeName, e.TeamName, e.DaysCount, e.StartDate))
		ids = append(ids, e.ID)
	}

	label := strings.ToUpper(company)
	link := "/qbtime/absences?company=" + company
	title := fmt.Sprintf("%s — %d employee(s) without clock-in", label, len(pending))
	content := fmt.Sprintf(
		"No punch for %d+ business days:\n\n%s",
		absenceAlertDays, strings.Join(lines, "\n"),
	)

	if _, err := s.notifSvc.Create(ctx, &domain.Notification{
		Title:      title,
		Content:    content,
		Recipients: recipients,
		Link:       &link,
		CreatedBy:  "system",
	}); err != nil {
		return fmt.Errorf("create absence notification: %w", err)
	}

	return s.repo.MarkNotified(ctx, ids)
}

// Run is the daily entry point: detect then notify, every company.
func (s *QBTimeAbsenceService) Run(ctx context.Context) (map[string]int, error) {
	out := map[string]int{}
	var firstErr error
	for _, company := range AbsenceCompanies {
		count, err := s.DetectCompany(ctx, company)
		if err != nil {
			logger.Error("absence-detect failed", "company", company, "error", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		out[company] = count
		if err := s.NotifyCompany(ctx, company); err != nil {
			logger.Error("absence-notify failed", "company", company, "error", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return out, firstErr
}

// Get builds the screen payload: events grouped by team, open ones first.
func (s *QBTimeAbsenceService) Get(ctx context.Context, company string, days int) (*domain.QBTimeAbsenceResponse, error) {
	if days <= 0 || days > absenceWindowDays {
		days = absenceWindowDays
	}
	now := easternNow()
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -days)

	events, err := s.repo.List(ctx, company, since)
	if err != nil {
		return nil, err
	}

	evaluated, err := s.evaluatedDays(ctx, company, now)
	if err != nil {
		return nil, err
	}
	lastEvaluated := ""
	evaluatedISO := make([]string, 0, len(evaluated))
	for _, d := range evaluated {
		iso := d.Format("2006-01-02")
		evaluatedISO = append(evaluatedISO, iso)
		lastEvaluated = iso
	}

	byTeam := map[string][]domain.QBTimeAbsenceEvent{}
	totalOpen := 0
	for _, e := range events {
		e.Open = lastEvaluated != "" && e.EndDate >= lastEvaluated
		if e.Open {
			totalOpen++
		}
		byTeam[e.TeamName] = append(byTeam[e.TeamName], *e)
	}

	teams := make([]string, 0, len(byTeam))
	for team := range byTeam {
		teams = append(teams, team)
	}
	sort.Slice(teams, func(i, j int) bool {
		// Unassigned always last; otherwise alphabetical.
		if (teams[i] == "Unassigned") != (teams[j] == "Unassigned") {
			return teams[j] == "Unassigned"
		}
		return teams[i] < teams[j]
	})

	groups := make([]domain.QBTimeAbsenceGroup, 0, len(teams))
	for _, team := range teams {
		list := byTeam[team]
		sort.Slice(list, func(i, j int) bool {
			if list[i].Open != list[j].Open {
				return list[i].Open
			}
			if list[i].DaysCount != list[j].DaysCount {
				return list[i].DaysCount > list[j].DaysCount
			}
			return list[i].EmployeeName < list[j].EmployeeName
		})
		groups = append(groups, domain.QBTimeAbsenceGroup{Team: team, Events: list})
	}

	return &domain.QBTimeAbsenceResponse{
		Company:       company,
		Groups:        groups,
		TotalOpen:     totalOpen,
		TotalEvents:   len(events),
		EvaluatedDays: evaluatedISO,
	}, nil
}
