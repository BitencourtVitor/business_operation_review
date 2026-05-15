package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
)

// ── QB Time API response shapes (local) ──────────────────────────────────────

type weeklyTSItem struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	JobcodeID int    `json:"jobcode_id"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Duration  int    `json:"duration"`
	Date      string `json:"date"`
	Type      string `json:"type"`
}

type weeklyJobcodeItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type weeklyUserItem struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type weeklyQBTResp struct {
	Results struct {
		Timesheets map[string]weeklyTSItem `json:"timesheets"`
	} `json:"results"`
	SupplementalData struct {
		Users    map[string]weeklyUserItem    `json:"users"`
		Jobcodes map[string]weeklyJobcodeItem `json:"jobcodes"`
	} `json:"supplemental_data"`
}

// ─────────────────────────────────────────────────────────────────────────────

type WeeklyReportService struct {
	httpClient *http.Client
}

func NewWeeklyReportService() *WeeklyReportService {
	return &WeeklyReportService{httpClient: &http.Client{Timeout: 20 * time.Second}}
}

func (s *WeeklyReportService) GetWeeklyReport(ctx context.Context, company string, date time.Time) (*domain.WeeklyReportResponse, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token configured for company %q", company)
	}

	// ── Calculate week window ────────────────────────────────────────────────
	weekEnd := date.AddDate(0, 0, -1) // yesterday

	// Monday of the week that contains weekEnd
	weekday := int(weekEnd.Weekday())
	if weekday == 0 {
		weekday = 7 // treat Sunday as 7 so Monday offset = weekday-1
	}
	weekStart := weekEnd.AddDate(0, 0, -(weekday - 1))

	// If date is Monday, weekEnd was Sunday (before weekStart) — show only today
	if weekEnd.Before(weekStart) {
		weekStart = date
		weekEnd = date
	}

	weekStartStr := weekStart.Format("2006-01-02")
	weekEndStr := weekEnd.Format("2006-01-02")

	// ── QB Time API call ─────────────────────────────────────────────────────
	url := fmt.Sprintf(
		"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=no&supplemental_data=yes&per_page=200",
		qbtBaseURL, weekStartStr, weekEndStr,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build qbt request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("qbt api request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read qbt response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("qbt api returned %d: %s", resp.StatusCode, string(body))
	}

	var qbtResp weeklyQBTResp
	if err := json.Unmarshal(body, &qbtResp); err != nil {
		return nil, fmt.Errorf("parse qbt response: %w", err)
	}

	// ── Build lookup maps ────────────────────────────────────────────────────
	userByID := make(map[int]string, len(qbtResp.SupplementalData.Users))
	for _, u := range qbtResp.SupplementalData.Users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		userByID[u.ID] = name
	}

	jobcodeByID := make(map[int]string, len(qbtResp.SupplementalData.Jobcodes))
	for _, jc := range qbtResp.SupplementalData.Jobcodes {
		jobcodeByID[jc.ID] = jc.Name
	}

	// ── Aggregate: employee → date → jobcode → hours ─────────────────────────
	// empDayAddr[employeeName][date][jobcodeName] = hours
	_ = struct{ date, addr string }{} // unused tuple
	empHours := make(map[string]map[string]map[string]float64)
	// empShifts[employeeName][date] = []shift
	empShifts := make(map[string]map[string][]domain.WeeklyReportShift)

	for _, ts := range qbtResp.Results.Timesheets {
		if ts.Type != "regular" {
			continue
		}
		name, ok := userByID[ts.UserID]
		if !ok || name == "" {
			continue
		}
		jcName := jobcodeByID[ts.JobcodeID]
		if jcName == "" {
			jcName = fmt.Sprintf("Jobcode %d", ts.JobcodeID)
		}
		hours := math.Round(float64(ts.Duration)/3600.0*100) / 100

		if empHours[name] == nil {
			empHours[name] = make(map[string]map[string]float64)
		}
		if empHours[name][ts.Date] == nil {
			empHours[name][ts.Date] = make(map[string]float64)
		}
		empHours[name][ts.Date][jcName] += hours

		// Track raw shift start/end times for AutoLog
		if empShifts[name] == nil {
			empShifts[name] = make(map[string][]domain.WeeklyReportShift)
		}
		empShifts[name][ts.Date] = append(empShifts[name][ts.Date], domain.WeeklyReportShift{
			Start: ts.Start,
			End:   ts.End,
		})
	}

	// ── Build domain employees ────────────────────────────────────────────────
	const hoursPerDay = 8.0

	// daysRemainingInWeek: workdays Mon–Fri from date through Friday, inclusive
	daysRemaining := 0
	for d := date; ; d = d.AddDate(0, 0, 1) {
		wd := d.Weekday()
		if wd == time.Saturday || wd == time.Sunday {
			break
		}
		daysRemaining++
		if wd == time.Friday {
			break
		}
	}

	var employees []domain.WeeklyReportEmployee

	for name, dateMap := range empHours {
		var days []domain.WeeklyReportDay

		for dateStr, addrMap := range dateMap {
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				continue
			}
			dayName := t.Weekday().String()

			var addrs []domain.WeeklyReportAddress
			dayTotal := 0.0
			for addr, h := range addrMap {
				dayTotal += h
				addrs = append(addrs, domain.WeeklyReportAddress{Address: addr, Hours: math.Round(h*100) / 100})
			}
			// Sort addresses by hours descending
			sort.Slice(addrs, func(i, j int) bool { return addrs[i].Hours > addrs[j].Hours })

			var shifts []domain.WeeklyReportShift
			if s, ok := empShifts[name][dateStr]; ok {
				shifts = s
				sort.Slice(shifts, func(i, j int) bool { return shifts[i].Start < shifts[j].Start })
			}

			days = append(days, domain.WeeklyReportDay{
				Date:       dateStr,
				Day:        dayName,
				TotalHours: math.Round(dayTotal*100) / 100,
				Addresses:  addrs,
				Shifts:     shifts,
			})
		}

		// Sort days chronologically
		sort.Slice(days, func(i, j int) bool { return days[i].Date < days[j].Date })

		weekTotal := 0.0
		for _, d := range days {
			weekTotal += d.TotalHours
		}
		weekTotal = math.Round(weekTotal*100) / 100

		daysWorked := len(days)
		expectedHours := float64(daysWorked) * hoursPerDay
		weekExcess := math.Max(0, weekTotal-expectedHours)
		weekExcess = math.Round(weekExcess*100) / 100

		suggestionHours := 0.0
		if weekExcess > 0 && daysRemaining > 0 {
			suggestionHours = math.Round(weekExcess/float64(daysRemaining)*100) / 100
		}

		employees = append(employees, domain.WeeklyReportEmployee{
			Name:            name,
			Days:            days,
			WeekTotal:       weekTotal,
			WeekExcess:      weekExcess,
			SuggestionHours: suggestionHours,
		})
	}

	// Sort employees alphabetically
	sort.Slice(employees, func(i, j int) bool {
		return employees[i].Name < employees[j].Name
	})

	return &domain.WeeklyReportResponse{
		Company:     company,
		WeekStart:   weekStartStr,
		WeekEnd:     weekEndStr,
		ReportDate:  date.Format("2006-01-02"),
		HoursPerDay: hoursPerDay,
		Employees:   employees,
	}, nil
}
