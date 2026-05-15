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
	ID       int    `json:"id"`
	Name     string `json:"name"`
	ParentID int    `json:"parent_id"`
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

	// ── Calculate week window (Sunday to Saturday) ───────────────────────────
	weekEnd := date.AddDate(0, 0, -1) // yesterday

	// Sunday of the week that contains weekEnd
	// getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday
	weekday := int(weekEnd.Weekday())
	weekStart := weekEnd.AddDate(0, 0, -weekday) // offset back to Sunday

	// If date is Sunday, weekEnd was Saturday (before weekStart) — show only today
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

	// ── Build user lookup ────────────────────────────────────────────────────
	userByID := make(map[int]string, len(qbtResp.SupplementalData.Users))
	for _, u := range qbtResp.SupplementalData.Users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		userByID[u.ID] = name
	}

	// ── Seed job code maps from supplemental_data ────────────────────────────
	jobcodeByID := make(map[int]string, len(qbtResp.SupplementalData.Jobcodes))
	jobcodeParentID := make(map[int]int, len(qbtResp.SupplementalData.Jobcodes))
	for _, jc := range qbtResp.SupplementalData.Jobcodes {
		jobcodeByID[jc.ID] = jc.Name
		if jc.ParentID != 0 {
			jobcodeParentID[jc.ID] = jc.ParentID
		}
	}

	// ── Fetch ALL job codes to resolve complete hierarchy ────────────────────
	// supplemental_data only contains job codes directly used in timesheets;
	// ancestors at any depth may be absent. One extra call gives us the full tree.
	allJCURL := fmt.Sprintf("%s/jobcodes?active=yes&per_page=200", qbtBaseURL)
	if allJCReq, err := http.NewRequestWithContext(ctx, http.MethodGet, allJCURL, nil); err == nil {
		allJCReq.Header.Set("Authorization", "Bearer "+token)
		allJCReq.Header.Set("Content-Type", "application/json")
		if allJCResp, err := s.httpClient.Do(allJCReq); err == nil {
			defer allJCResp.Body.Close()
			if allJCBody, err := io.ReadAll(allJCResp.Body); err == nil && allJCResp.StatusCode == http.StatusOK {
				var allJCData struct {
					Results struct {
						Jobcodes map[string]weeklyJobcodeItem `json:"jobcodes"`
					} `json:"results"`
				}
				if json.Unmarshal(allJCBody, &allJCData) == nil {
					for _, jc := range allJCData.Results.Jobcodes {
						jobcodeByID[jc.ID] = jc.Name
						if jc.ParentID != 0 {
							jobcodeParentID[jc.ID] = jc.ParentID
						}
					}
				}
			}
		}
	}

	// resolveJobcodePath returns the full path from root to the given job code id.
	// e.g. ["Canton, Neponset", "Normal Labor"]
	resolveJobcodePath := func(id int) []string {
		var path []string
		cur := id
		visited := make(map[int]bool)
		for cur != 0 && !visited[cur] {
			visited[cur] = true
			name := jobcodeByID[cur]
			if name == "" {
				name = fmt.Sprintf("Jobcode %d", cur)
			}
			path = append([]string{name}, path...) // prepend → top-down order
			cur = jobcodeParentID[cur]
		}
		if len(path) == 0 {
			return []string{fmt.Sprintf("Jobcode %d", id)}
		}
		return path
	}

	// ── Aggregate: employee → date → pathKey → {path, hours} ─────────────────
	type pathEntry struct {
		path  []string
		hours float64
	}
	empHours := make(map[string]map[string]map[string]pathEntry) // name → date → pathKey → entry
	empShifts := make(map[string]map[string][]domain.WeeklyReportShift)

	for _, ts := range qbtResp.Results.Timesheets {
		if ts.Type != "regular" {
			continue
		}
		name, ok := userByID[ts.UserID]
		if !ok || name == "" {
			continue
		}

		path := resolveJobcodePath(ts.JobcodeID)
		pathKey := strings.Join(path, "|")
		hours := math.Round(float64(ts.Duration)/3600.0*100) / 100

		if empHours[name] == nil {
			empHours[name] = make(map[string]map[string]pathEntry)
		}
		if empHours[name][ts.Date] == nil {
			empHours[name][ts.Date] = make(map[string]pathEntry)
		}
		e := empHours[name][ts.Date][pathKey]
		e.path = path
		e.hours += hours
		empHours[name][ts.Date][pathKey] = e

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

		for dateStr, keyMap := range dateMap {
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				continue
			}
			dayName := t.Weekday().String()

			var addrs []domain.WeeklyReportAddress
			dayTotal := 0.0
			for _, e := range keyMap {
				h := math.Round(e.hours*100) / 100
				dayTotal += h
				addrs = append(addrs, domain.WeeklyReportAddress{
					Path:  e.path,
					Hours: h,
				})
			}
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
