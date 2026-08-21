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
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// Fallbacks used until the trigger row is read. Both are editable in
	// Settings → Email Triggers; these values are what shipped before it.
	//
	// How far back the detector recomputes. Kept under the 30 days the period
	// report re-syncs, so every day it looks at has settled timesheet data.
	absenceWindowDays = 21
	// Business days without a punch that trigger the alert.
	absenceAlertDays = 2
	// Granting this permission is what subscribes a user to the alert.
	absencePermKey = "absence_control"
	// An absence is a calendar fact — dates travel as plain YYYY-MM-DD.
	dateOnly = "2006-01-02"
)

// AbsenceCompanies mirrors the QB Time workspaces the sync already covers.
// "hvacing" is the Framing crew under a separate QB Time account.
var AbsenceCompanies = []string{"framing", "hvac", "pcg", "hvacing"}

type QBTimeAbsenceService struct {
	repo       repository.QBTimeAbsenceRepository
	notifSvc   *NotificationService
	email      EmailSender
	recipients *AlertRecipientDirectory
	triggers   *EmailTriggerService
}

func NewQBTimeAbsenceService(repo repository.QBTimeAbsenceRepository, notifSvc *NotificationService, deps ...any) *QBTimeAbsenceService {
	svc := &QBTimeAbsenceService{repo: repo, notifSvc: notifSvc}
	if len(deps) >= 2 {
		svc.email, _ = deps[0].(EmailSender)
		svc.recipients, _ = deps[1].(*AlertRecipientDirectory)
	}
	if len(deps) >= 3 {
		svc.triggers, _ = deps[2].(*EmailTriggerService)
	}
	if svc.email == nil || svc.recipients == nil || svc.triggers == nil {
		if provider, ok := repo.(interface{ Pool() *pgxpool.Pool }); ok {
			if svc.email == nil {
				svc.email = NewGmailAPISenderFromEnv()
			}
			if svc.recipients == nil {
				svc.recipients = NewAlertRecipientDirectory(provider.Pool())
			}
			if svc.triggers == nil {
				svc.triggers = NewEmailTriggerService(provider.Pool())
			}
		}
	}
	return svc
}

// absenceParams reads the configured thresholds. On any failure it falls back
// to the shipped constants — a settings problem must not stop detection.
func (s *QBTimeAbsenceService) absenceParams(ctx context.Context) (alertDays, windowDays int) {
	alertDays, windowDays = absenceAlertDays, absenceWindowDays
	if s.triggers == nil {
		return
	}
	cfg, err := s.triggers.Get(ctx, TriggerQBTimeAbsence)
	if err != nil {
		return
	}
	if value := cfg.ParamInt("alert_days", alertDays); value > 0 {
		alertDays = value
	}
	if value := cfg.ParamInt("window_days", windowDays); value > 0 {
		windowDays = value
	}
	return
}

// excludedFromEmail lists, lowercased, the employees this company never
// announces by e-mail. The list is one entry per person, and each entry may be
// narrowed to the companies it applies to: someone registered in three
// companies but punching in only one is excluded in the other two, so the
// company that actually expects them still gets the alert.
//
// The stored shape is "name" — every company the person is registered in — or
// "name::hvac,pcg" when the picker has turned some of the logos off.
//
// It is deliberately the last filter in the chain: the absence is still
// detected, still recorded, and still shows on the Absences screen and in the
// in-app notification — it just does not leave the building.
//
// Not to be confused with qbtime_whos_working_exceptions, which cuts before
// detection and makes the person vanish from the absence history entirely.
func (s *QBTimeAbsenceService) excludedFromEmail(ctx context.Context, company string) map[string]bool {
	out := map[string]bool{}
	if s.triggers == nil {
		return out
	}
	cfg, err := s.triggers.Get(ctx, TriggerQBTimeAbsence)
	if err != nil {
		return out
	}
	company = strings.ToLower(strings.TrimSpace(company))
	for _, entry := range cfg.ParamStrings("excluded_employees") {
		name := strings.ToLower(strings.TrimSpace(entry))
		scoped := false
		applies := false
		if index := strings.Index(name, "::"); index >= 0 {
			scoped = true
			for _, tag := range strings.Split(name[index+2:], ",") {
				if strings.TrimSpace(tag) == company {
					applies = true
				}
			}
			name = strings.TrimSpace(name[:index])
		}
		// Tolerates the earlier "company|name" shape so a value saved before
		// the list was unified still excludes the person it names.
		if index := strings.LastIndex(name, "|"); index >= 0 {
			name = strings.TrimSpace(name[index+1:])
		}
		if name != "" && (!scoped || applies) {
			out[name] = true
		}
	}
	return out
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
	_, windowDays := s.absenceParams(ctx)
	candidates := candidateDays(now, windowDays)
	active, err := s.repo.DaysWithActivity(ctx, company, candidates)
	if err != nil {
		return nil, err
	}
	var out []time.Time
	for _, d := range candidates {
		if active[d.Format(dateOnly)] {
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

// NotifyCompany does two independent things, on purpose:
//
//   - the in-app notification is news — it fires once per absence, when the
//     block first crosses the threshold, and notified_at keeps it from
//     repeating while the same absence drags on;
//   - the e-mail is a state report — every run it lists everyone still missing
//     on the last evaluated day, so somebody who stopped punching a week ago
//     stays on the list until they come back, instead of being mentioned once
//     and silently dropping off it.
func (s *QBTimeAbsenceService) NotifyCompany(ctx context.Context, company string) error {
	alertDays, _ := s.absenceParams(ctx)
	if err := s.notifyInApp(ctx, company, alertDays); err != nil {
		return err
	}
	return s.emailOpenAbsences(ctx, company, alertDays)
}

// notifyInApp raises the bell for absences that crossed the threshold and were
// never announced — one notification per company per run, not per person.
func (s *QBTimeAbsenceService) notifyInApp(ctx context.Context, company string, alertDays int) error {
	pending, err := s.repo.PendingNotification(ctx, company, alertDays)
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
	if _, err := s.notifSvc.Create(ctx, &domain.Notification{
		Title:      fmt.Sprintf("%s — %d employee(s) without clock-in", label, len(pending)),
		Content:    fmt.Sprintf("No punch for %d+ business days:\n\n%s", alertDays, strings.Join(lines, "\n")),
		Recipients: recipients,
		Link:       &link,
		CreatedBy:  "system",
	}); err != nil {
		return fmt.Errorf("create absence notification: %w", err)
	}

	return s.repo.MarkNotified(ctx, ids)
}

// emailOpenAbsences sends the day's list: everyone on the active roster whose
// absence is still open on the last evaluated day and already at or over the
// threshold, minus the people the trigger never announces by e-mail.
func (s *QBTimeAbsenceService) emailOpenAbsences(ctx context.Context, company string, alertDays int) error {
	if s.email == nil || s.triggers == nil {
		return fmt.Errorf("absence email dependencies are not configured")
	}
	// Only the e-mail is gated by the trigger. The in-app notification follows
	// the absence_control permission and stays independent of it.
	emailDue, _, err := s.triggers.ShouldRun(ctx, TriggerQBTimeAbsence, time.Now())
	if err != nil {
		return err
	}
	if !emailDue {
		return nil
	}
	to, cc, err := s.triggers.Recipients(ctx, TriggerQBTimeAbsence)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		return nil
	}

	// "Still absent" is measured against the last day the company actually
	// punched on: today is still running, and a holiday proves nothing.
	evaluated, err := s.evaluatedDays(ctx, company, easternNow())
	if err != nil {
		return err
	}
	if len(evaluated) == 0 {
		logger.Info("absence email skipped: no evaluated day in the window", "company", company)
		return nil
	}

	open, err := s.repo.OpenAtOrOver(ctx, company, alertDays, evaluated[len(evaluated)-1])
	if err != nil {
		return err
	}

	excluded := s.excludedFromEmail(ctx, company)
	rows := make([]AbsenceRow, 0, len(open))
	for _, event := range open {
		if excluded[strings.ToLower(strings.TrimSpace(event.EmployeeName))] {
			continue
		}
		rows = append(rows, AbsenceRow{
			EmployeeName: event.EmployeeName,
			TeamName:     event.TeamName,
			DaysCount:    event.DaysCount,
			StartDate:    event.StartDate,
		})
	}
	// Nobody is missing, or everyone missing is on the exclusion list. Either
	// way, an e-mail saying so would be noise.
	if len(rows) == 0 {
		logger.Info("absence email skipped: nothing to announce", "company", company, "open", len(open))
		return nil
	}

	label := strings.ToUpper(company)
	body := BuildAbsenceEmail(company, alertDays, rows)
	delivery, err := s.email.Send(ctx, EmailMessage{
		To: to, CC: cc, Subject: body.Subject, Text: body.Text, HTML: body.HTML,
	})
	if err != nil {
		s.triggers.LogDelivery(ctx, TriggerDelivery{
			TriggerKey: TriggerQBTimeAbsence, Subject: body.Subject, To: to, CC: cc,
			Context: label, Status: "failed", Error: err.Error(),
		})
		return fmt.Errorf("send absence email: %w", err)
	}
	s.triggers.LogDelivery(ctx, TriggerDelivery{
		TriggerKey: TriggerQBTimeAbsence, Subject: body.Subject, To: to, CC: cc, Context: label,
	})
	logger.Info("absence email accepted", "company", company, "delivery_id", delivery.ID,
		"announced", len(rows), "excluded", len(open)-len(rows))
	return nil
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

// How far back the grid looks past the week it renders, so a streak that
// started earlier is already at its real length on Monday.
const attendanceLookbackDays = 21

func mondayOf(d time.Time) time.Time {
	d = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
	offset := (int(d.Weekday()) + 6) % 7 // Monday = 0
	return d.AddDate(0, 0, -offset)
}

func businessDaysBetween(from, to time.Time) []time.Time {
	var out []time.Time
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		switch d.Weekday() {
		case time.Saturday, time.Sunday:
			continue
		}
		out = append(out, d)
	}
	return out
}

// Attendance builds the weekly grid: every team, every person on the roster,
// present or not. Absence is a state inside the grid, not a separate list.
func (s *QBTimeAbsenceService) Attendance(ctx context.Context, company string, week string) (*domain.AttendanceResponse, error) {
	ref := easternNow()
	if week != "" {
		parsed, err := time.Parse(dateOnly, week)
		if err != nil {
			return nil, fmt.Errorf("invalid week %q: expected YYYY-MM-DD", week)
		}
		ref = parsed
	}
	weekStart := mondayOf(ref)
	// Sunday. The weekend is shown because people do work it sometimes, but it
	// is never judged — only weekdays can produce an absence.
	weekEnd := weekStart.AddDate(0, 0, 6)
	// The grid flags on the same threshold the alert uses, so the screen and
	// the e-mail never disagree about who is flagged.
	flagAtDays, _ := s.absenceParams(ctx)

	lookbackStart := weekStart.AddDate(0, 0, -attendanceLookbackDays)
	span := businessDaysBetween(lookbackStart, weekEnd)

	active, err := s.repo.DaysWithActivity(ctx, company, span)
	if err != nil {
		return nil, err
	}
	punched, err := s.repo.PunchedDays(ctx, company, lookbackStart, weekEnd)
	if err != nil {
		return nil, err
	}
	roster, err := s.repo.Roster(ctx, company)
	if err != nil {
		return nil, err
	}

	// Today is still running: whoever has not punched yet has not missed the
	// day. Counting it would flag most of the roster every morning.
	todayISO := easternNow().Format(dateOnly)

	// Every day of the week gets a column; only the weekdays get judged.
	var weekDays []time.Time
	for d := weekStart; !d.After(weekEnd); d = d.AddDate(0, 0, 1) {
		weekDays = append(weekDays, d)
	}

	headers := make([]domain.AttendanceDayHeader, 0, len(weekDays))
	inWeek := map[string]bool{}
	for _, d := range weekDays {
		iso := d.Format(dateOnly)
		weekend := d.Weekday() == time.Saturday || d.Weekday() == time.Sunday
		if !weekend {
			inWeek[iso] = true
		}
		headers = append(headers, domain.AttendanceDayHeader{
			Date:      iso,
			Weekday:   d.Format("Mon"),
			Evaluated: !weekend && active[iso] && iso < todayISO,
			Weekend:   weekend,
		})
	}

	byTeam := map[string][]domain.AttendanceEmployee{}
	totalAbsent, totalFlagged := 0, 0

	for _, person := range roster {
		mine := punched[person.QBTUserID]
		streak := 0
		absentCount := 0

		type cell struct {
			status string
			streak int
		}
		judged := map[string]cell{}

		// Walk the weekdays of the whole span, so the streak entering Monday is
		// already at its real length instead of restarting at the week border.
		for _, d := range span {
			iso := d.Format(dateOnly)

			// Today and anything after it have not happened yet.
			if iso >= todayISO {
				if inWeek[iso] {
					judged[iso] = cell{status: "pending"}
				}
				continue
			}

			// A day nobody in the company punched proves nothing about this
			// person — it neither breaks the streak nor counts as an absence.
			if !active[iso] {
				if inWeek[iso] {
					judged[iso] = cell{status: "skipped"}
				}
				continue
			}

			status := "present"
			if mine[iso] {
				streak = 0
			} else {
				status = "absent"
				streak++
			}

			if inWeek[iso] {
				if status == "absent" {
					absentCount++
				}
				judged[iso] = cell{status: status, streak: streak}
			}
		}

		// Emit one cell per calendar day. Weekends carry punches only: no
		// weekend absence exists, so an empty Saturday says nothing.
		days := make([]domain.AttendanceDay, 0, len(weekDays))
		for _, d := range weekDays {
			iso := d.Format(dateOnly)
			day := domain.AttendanceDay{Date: iso, Weekday: d.Format("Mon")}

			if c, ok := judged[iso]; ok {
				day.Status, day.Streak = c.status, c.streak
			} else if mine[iso] {
				day.Status = "present"
			} else if iso >= todayISO {
				day.Status = "pending"
			} else {
				day.Status = "off"
			}
			days = append(days, day)
		}

		if absentCount > 0 {
			totalAbsent++
		}
		// Flag on the streak visible this week, not on history already closed.
		weekStreak := 0
		for _, d := range days {
			if d.Streak > weekStreak {
				weekStreak = d.Streak
			}
		}
		if weekStreak >= flagAtDays {
			totalFlagged++
		}

		byTeam[person.TeamName] = append(byTeam[person.TeamName], domain.AttendanceEmployee{
			QBTUserID:   person.QBTUserID,
			Name:        person.EmployeeName,
			Days:        days,
			AbsentCount: absentCount,
			MaxStreak:   weekStreak,
		})
	}

	teamNames := make([]string, 0, len(byTeam))
	for team := range byTeam {
		teamNames = append(teamNames, team)
	}
	sort.Slice(teamNames, func(i, j int) bool {
		if (teamNames[i] == "Unassigned") != (teamNames[j] == "Unassigned") {
			return teamNames[j] == "Unassigned"
		}
		return teamNames[i] < teamNames[j]
	})

	teams := make([]domain.AttendanceTeam, 0, len(teamNames))
	for _, name := range teamNames {
		list := byTeam[name]
		sort.Slice(list, func(i, j int) bool {
			// Alphabetical inside the team: the grid is read to look somebody
			// up, and a row that moves as the streak changes is hard to find.
			return list[i].Name < list[j].Name
		})
		teams = append(teams, domain.AttendanceTeam{Team: name, Employees: list})
	}

	return &domain.AttendanceResponse{
		Company:      company,
		WeekStart:    weekStart.Format(dateOnly),
		WeekEnd:      weekEnd.Format(dateOnly),
		Days:         headers,
		Teams:        teams,
		RosterSize:   len(roster),
		TotalAbsent:  totalAbsent,
		TotalFlagged: totalFlagged,
	}, nil
}

// Get builds the screen payload: events grouped by team, open ones first.
func (s *QBTimeAbsenceService) Get(ctx context.Context, company string, days int) (*domain.QBTimeAbsenceResponse, error) {
	_, windowDays := s.absenceParams(ctx)
	if days <= 0 || days > windowDays {
		days = windowDays
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
		iso := d.Format(dateOnly)
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
