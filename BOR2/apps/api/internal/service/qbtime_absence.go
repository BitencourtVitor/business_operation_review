package service

import (
	"context"
	"fmt"
	"html"
	"sort"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
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
}

func NewQBTimeAbsenceService(repo repository.QBTimeAbsenceRepository, notifSvc *NotificationService, deps ...any) *QBTimeAbsenceService {
	svc := &QBTimeAbsenceService{repo: repo, notifSvc: notifSvc}
	if len(deps) >= 2 {
		svc.email, _ = deps[0].(EmailSender)
		svc.recipients, _ = deps[1].(*AlertRecipientDirectory)
	}
	if svc.email == nil || svc.recipients == nil {
		if provider, ok := repo.(interface{ Pool() *pgxpool.Pool }); ok {
			svc.email = NewGmailAPISenderFromEnv()
			svc.recipients = NewAlertRecipientDirectory(provider.Pool())
		}
	}
	return svc
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

	if s.email == nil || s.recipients == nil {
		return fmt.Errorf("absence email dependencies are not configured")
	}
	to, cc, err := s.recipients.Resolve(ctx)
	if err != nil {
		return err
	}
	if len(to) > 0 {
		var htmlRows strings.Builder
		for _, event := range pending {
			htmlRows.WriteString("<tr><td>" + html.EscapeString(event.EmployeeName) + "</td><td>" + html.EscapeString(event.TeamName) + "</td><td>" + fmt.Sprint(event.DaysCount) + "</td><td>" + html.EscapeString(event.StartDate) + "</td></tr>")
		}
		delivery, err := s.email.Send(ctx, EmailMessage{
			To: to, CC: cc, Subject: title, Text: content,
			HTML: "<p>No clock-in was found for two consecutive evaluated business days.</p><table style=\"border-collapse:collapse;width:100%\"><thead><tr><th align=\"left\">Employee</th><th align=\"left\">Team</th><th align=\"left\">Days</th><th align=\"left\">Since</th></tr></thead><tbody>" + htmlRows.String() + "</tbody></table>",
		})
		if err != nil {
			return fmt.Errorf("send absence email: %w", err)
		}
		logger.Info("absence email accepted", "company", company, "delivery_id", delivery.ID, "events", len(pending))
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
		if weekStreak >= absenceAlertDays {
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
			// Worst first, so the eye lands on who needs attention.
			if list[i].MaxStreak != list[j].MaxStreak {
				return list[i].MaxStreak > list[j].MaxStreak
			}
			if list[i].AbsentCount != list[j].AbsentCount {
				return list[i].AbsentCount > list[j].AbsentCount
			}
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
