package service

import (
	"bytes"
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

type periodTSItem struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	JobcodeID int    `json:"jobcode_id"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Duration  int    `json:"duration"`
	Date      string `json:"date"`
	Type      string `json:"type"` // "regular" | "break"
}

type periodJobcodeItem struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	ParentID int    `json:"parent_id"`
}

type periodUserItem struct {
	ID        int     `json:"id"`
	FirstName string  `json:"first_name"`
	LastName  string  `json:"last_name"`
	PayRate   float64 `json:"pay_rate"`
}

type periodTSResp struct {
	Results struct {
		Timesheets map[string]periodTSItem `json:"timesheets"`
	} `json:"results"`
	SupplementalData struct {
		Users    map[string]periodUserItem    `json:"users"`
		Jobcodes map[string]periodJobcodeItem `json:"jobcodes"`
	} `json:"supplemental_data"`
	More bool `json:"more"`
}

type effectiveSettingsResp struct {
	Results struct {
		General struct {
			Settings struct {
				PayrollType      string `json:"payroll_type"`
				PayrollEndDate   string `json:"payroll_end_date"`
				DailyRegularHours float64 `json:"daily_regular_hours"`
				WeeklyRegularHours string `json:"weekly_regular_hours"`
			} `json:"settings"`
		} `json:"general"`
	} `json:"results"`
}

type payrollByJobcodeResp struct {
	Results struct {
		PayrollByJobcodeReport struct {
			ByUser map[string]struct {
				UserID int `json:"user_id"`
				Totals map[string]struct {
					JobcodeID      int `json:"jobcode_id"`
					TotalRESeconds int `json:"total_re_seconds"`
					TotalOTSeconds int `json:"total_ot_seconds"`
					TotalDTSeconds int `json:"total_dt_seconds"`
				} `json:"totals"`
			} `json:"by_user"`
		} `json:"payroll_by_jobcode_report"`
	} `json:"results"`
}

type usersResp struct {
	Results struct {
		Users map[string]periodUserItem `json:"users"`
	} `json:"results"`
	More bool `json:"more"`
}

// ─────────────────────────────────────────────────────────────────────────────

type PeriodReportService struct {
	httpClient *http.Client
}

func NewPeriodReportService() *PeriodReportService {
	return &PeriodReportService{httpClient: &http.Client{Timeout: 60 * time.Second}}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (s *PeriodReportService) fetchJobcodes(ctx context.Context, token string, seed map[int]periodJobcodeItem) (map[int]string, map[int]int) {
	nameByID := make(map[int]string)
	parentByID := make(map[int]int)

	for _, jc := range seed {
		nameByID[jc.ID] = jc.Name
		if jc.ParentID != 0 {
			parentByID[jc.ID] = jc.ParentID
		}
	}

	url := fmt.Sprintf("%s/jobcodes?active=yes&per_page=200", qbtBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nameByID, parentByID
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nameByID, parentByID
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var data struct {
		Results struct {
			Jobcodes map[string]periodJobcodeItem `json:"jobcodes"`
		} `json:"results"`
	}
	if json.Unmarshal(body, &data) == nil {
		for _, jc := range data.Results.Jobcodes {
			nameByID[jc.ID] = jc.Name
			if jc.ParentID != 0 {
				parentByID[jc.ID] = jc.ParentID
			}
		}
	}
	return nameByID, parentByID
}

func resolveJobcodePathPR(id int, nameByID map[int]string, parentByID map[int]int) []string {
	var path []string
	cur := id
	visited := make(map[int]bool)
	for cur != 0 && !visited[cur] {
		visited[cur] = true
		name := nameByID[cur]
		if name == "" {
			name = fmt.Sprintf("Jobcode %d", cur)
		}
		path = append([]string{name}, path...)
		cur = parentByID[cur]
	}
	if len(path) == 0 {
		return []string{fmt.Sprintf("Jobcode %d", id)}
	}
	return path
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// ── GetPayPeriods ─────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetPayPeriods(ctx context.Context, company string) (*domain.PayPeriodsResponse, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

	url := fmt.Sprintf("%s/effective_settings", qbtBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build effective_settings request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("effective_settings request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var settings effectiveSettingsResp
	if err := json.Unmarshal(body, &settings); err != nil {
		return nil, fmt.Errorf("parse effective_settings: %w (raw: %.300s)", err, string(body))
	}

	anchorStr := settings.Results.General.Settings.PayrollEndDate
	if anchorStr == "" {
		// QB Time doesn't always return payroll_end_date via effective_settings.
		// Use a known bi-weekly period end date per company as anchor.
		switch company {
		case "framing":
			anchorStr = "2026-05-17" // last known period end (Saturday)
		case "hvac":
			anchorStr = "2026-05-17"
		default:
			anchorStr = "2026-05-17"
		}
	}

	anchor, err := time.Parse("2006-01-02", anchorStr)
	if err != nil {
		return nil, fmt.Errorf("parse payroll_end_date %q: %w", anchorStr, err)
	}

	// Walk forward from anchor in 14-day steps until we're past today.
	// currentEnd will be the end of the current (or just-completed) pay period.
	today := time.Now().Truncate(24 * time.Hour)
	currentEnd := anchor
	for currentEnd.Before(today) {
		currentEnd = currentEnd.AddDate(0, 0, 14)
	}

	// Build list of last 12 periods (most recent first)
	const numPeriods = 12
	periods := make([]domain.PayPeriod, 0, numPeriods)
	for i := 0; i < numPeriods; i++ {
		end := currentEnd.AddDate(0, 0, -14*i)
		start := end.AddDate(0, 0, -13)

		startFmt := start.Format("Jan 2")
		endFmt := end.Format("Jan 2, 2006")
		// If start and end are in the same month, simplify
		if start.Month() == end.Month() && start.Year() == end.Year() {
			endFmt = end.Format("Jan 2–") + end.Format("2, 2006")
		}

		periods = append(periods, domain.PayPeriod{
			Label:     fmt.Sprintf("%s – %s", startFmt, endFmt),
			StartDate: start.Format("2006-01-02"),
			EndDate:   end.Format("2006-01-02"),
		})
	}

	return &domain.PayPeriodsResponse{Company: company, Periods: periods}, nil
}

// ── GetIntervals ──────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetIntervals(ctx context.Context, company, startDate, endDate string) (*domain.IntervalsResponse, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

	// Fetch all timesheets (regular + break) for the period, paginated
	allTS := make(map[string]periodTSItem)
	allUsers := make(map[string]periodUserItem)
	allJCSeed := make(map[int]periodJobcodeItem)

	for page := 1; ; page++ {
		url := fmt.Sprintf(
			"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=no&supplemental_data=yes&per_page=200&page=%d",
			qbtBaseURL, startDate, endDate, page,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("build timesheets request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("timesheets request: %w", err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var pageResp periodTSResp
		if err := json.Unmarshal(body, &pageResp); err != nil {
			return nil, fmt.Errorf("parse timesheets: %w", err)
		}
		for k, v := range pageResp.Results.Timesheets {
			allTS[k] = v
		}
		for k, v := range pageResp.SupplementalData.Users {
			allUsers[k] = v
		}
		for _, jc := range pageResp.SupplementalData.Jobcodes {
			allJCSeed[jc.ID] = jc
		}

		if !pageResp.More || page >= 20 {
			break
		}
	}

	nameByID, parentByID := s.fetchJobcodes(ctx, token, allJCSeed)

	// user lookup: id → "First Last"
	userByID := make(map[int]string)
	for _, u := range allUsers {
		userByID[u.ID] = strings.TrimSpace(u.FirstName + " " + u.LastName)
	}

	// aggregate: name → date → []blocks
	type empDateKey struct{ name, date string }
	blocksMap := make(map[empDateKey][]domain.PeriodBlock)

	for _, ts := range allTS {
		name := userByID[ts.UserID]
		if name == "" {
			continue
		}

		path := resolveJobcodePathPR(ts.JobcodeID, nameByID, parentByID)
		isPaid := ts.Type == "regular"
		if ts.Type == "break" {
			// paid break if jobcode name contains "paid" (case-insensitive)
			for _, p := range path {
				if strings.Contains(strings.ToLower(p), "paid") {
					isPaid = true
					break
				}
			}
		}

		durationMinutes := ts.Duration / 60

		key := empDateKey{name, ts.Date}
		blocksMap[key] = append(blocksMap[key], domain.PeriodBlock{
			Start:           ts.Start,
			End:             ts.End,
			DurationMinutes: durationMinutes,
			JobcodePath:     path,
			Type:            ts.Type,
			IsPaid:          isPaid,
		})
	}

	// sort blocks within each day by start time
	for k := range blocksMap {
		sort.Slice(blocksMap[k], func(i, j int) bool {
			return blocksMap[k][i].Start < blocksMap[k][j].Start
		})
	}

	// collect unique (name, date) pairs
	type nameDate struct{ name, date string }
	pairSet := make(map[nameDate]bool)
	for k := range blocksMap {
		pairSet[nameDate{k.name, k.date}] = true
	}

	// build per-employee map: name → []days
	empDays := make(map[string]map[string]domain.PeriodDay)
	for nd := range pairSet {
		key := empDateKey{nd.name, nd.date}
		blocks := blocksMap[key]

		t, _ := time.Parse("2006-01-02", nd.date)
		paidMinutes := 0
		for _, b := range blocks {
			if b.IsPaid {
				paidMinutes += b.DurationMinutes
			}
		}
		paidHours := round2(float64(paidMinutes) / 60.0)

		day := domain.PeriodDay{
			Date:         nd.date,
			DayName:      t.Weekday().String(),
			TotalHours:   paidHours,
			TotalMinutes: paidMinutes,
			Blocks:       blocks,
		}

		if empDays[nd.name] == nil {
			empDays[nd.name] = make(map[string]domain.PeriodDay)
		}
		empDays[nd.name][nd.date] = day
	}

	// build employees slice
	employees := make([]domain.PeriodEmployee, 0, len(empDays))
	for name, dayMap := range empDays {
		var days []domain.PeriodDay
		totalHours := 0.0
		for _, d := range dayMap {
			days = append(days, d)
			totalHours += d.TotalHours
		}
		sort.Slice(days, func(i, j int) bool { return days[i].Date < days[j].Date })

		employees = append(employees, domain.PeriodEmployee{
			Name:       name,
			TotalHours: round2(totalHours),
			Days:       days,
		})
	}
	sort.Slice(employees, func(i, j int) bool { return employees[i].Name < employees[j].Name })

	return &domain.IntervalsResponse{
		Company:   company,
		StartDate: startDate,
		EndDate:   endDate,
		Employees: employees,
	}, nil
}

// ── GetAccounting ─────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetAccounting(ctx context.Context, company, startDate, endDate string) (*domain.AccountingResponse, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

	// Fetch payroll_by_jobcode report and users in parallel
	type payrollResult struct {
		data *payrollByJobcodeResp
		err  error
	}
	type usersResult struct {
		users map[int]periodUserItem
		err   error
	}
	type jobcodesResult struct {
		nameByID   map[int]string
		parentByID map[int]int
		err        error
	}

	payrollCh := make(chan payrollResult, 1)
	usersCh := make(chan usersResult, 1)
	jobcodesCh := make(chan jobcodesResult, 1)

	// Payroll by jobcode
	go func() {
		reqBody := map[string]interface{}{
			"data": map[string]string{
				"start_date": startDate,
				"end_date":   endDate,
			},
		}
		bodyBytes, _ := json.Marshal(reqBody)
		url := fmt.Sprintf("%s/reports/payroll_by_jobcode", qbtBaseURL)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
		if err != nil {
			payrollCh <- payrollResult{err: err}
			return
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			payrollCh <- payrollResult{err: err}
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		var data payrollByJobcodeResp
		if err := json.Unmarshal(body, &data); err != nil {
			payrollCh <- payrollResult{err: fmt.Errorf("parse payroll_by_jobcode: %w", err)}
			return
		}
		payrollCh <- payrollResult{data: &data}
	}()

	// Users (for pay_rate)
	go func() {
		users := make(map[int]periodUserItem)
		for page := 1; ; page++ {
			url := fmt.Sprintf("%s/users?active=yes&per_page=200&page=%d", qbtBaseURL, page)
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				break
			}
			req.Header.Set("Authorization", "Bearer "+token)
			resp, err := s.httpClient.Do(req)
			if err != nil {
				break
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			var data usersResp
			if json.Unmarshal(body, &data) == nil {
				for _, u := range data.Results.Users {
					users[u.ID] = u
				}
				if !data.More {
					break
				}
			} else {
				break
			}
			if page >= 10 {
				break
			}
		}
		usersCh <- usersResult{users: users}
	}()

	// Jobcodes
	go func() {
		nameByID, parentByID := s.fetchJobcodes(ctx, token, nil)
		jobcodesCh <- jobcodesResult{nameByID: nameByID, parentByID: parentByID}
	}()

	// Collect results
	payrollRes := <-payrollCh
	usersRes := <-usersCh
	jobcodesRes := <-jobcodesCh

	if payrollRes.err != nil {
		return nil, payrollRes.err
	}
	if usersRes.err != nil {
		return nil, usersRes.err
	}
	if jobcodesRes.err != nil {
		return nil, jobcodesRes.err
	}

	users := usersRes.users
	nameByID := jobcodesRes.nameByID
	parentByID := jobcodesRes.parentByID

	// Build rows
	rows := make([]domain.AccountingRow, 0)

	for userIDStr, userData := range payrollRes.data.Results.PayrollByJobcodeReport.ByUser {
		_ = userIDStr
		userInfo, ok := users[userData.UserID]
		if !ok {
			continue
		}
		empName := strings.TrimSpace(userInfo.LastName + ", " + userInfo.FirstName)
		payRate := userInfo.PayRate
		otRate := round2(payRate * 1.5)

		for _, jcTotals := range userData.Totals {
			path := resolveJobcodePathPR(jcTotals.JobcodeID, nameByID, parentByID)

			regularHours := round2(float64(jcTotals.TotalRESeconds) / 3600.0)
			otHours := round2(float64(jcTotals.TotalOTSeconds) / 3600.0)

			// skip rows with zero hours
			if regularHours == 0 && otHours == 0 {
				continue
			}

			regularCost := round2(regularHours * payRate)
			otCost := round2(otHours * otRate)
			totalHours := round2(regularHours + otHours)
			totalCost := round2(regularCost + otCost)

			rows = append(rows, domain.AccountingRow{
				Employee:     empName,
				JobcodePath:  path,
				RegularHours: regularHours,
				RegularRate:  payRate,
				RegularCost:  regularCost,
				OTHours:      otHours,
				OTRate:       otRate,
				OTCost:       otCost,
				TotalHours:   totalHours,
				TotalCost:    totalCost,
			})
		}
	}

	// Sort: by employee name, then jobcode path
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Employee != rows[j].Employee {
			return rows[i].Employee < rows[j].Employee
		}
		return strings.Join(rows[i].JobcodePath, "|") < strings.Join(rows[j].JobcodePath, "|")
	})

	// Compute totals
	var totals domain.AccountingTotals
	for _, r := range rows {
		totals.RegularHours = round2(totals.RegularHours + r.RegularHours)
		totals.RegularCost = round2(totals.RegularCost + r.RegularCost)
		totals.OTHours = round2(totals.OTHours + r.OTHours)
		totals.OTCost = round2(totals.OTCost + r.OTCost)
		totals.TotalHours = round2(totals.TotalHours + r.TotalHours)
		totals.TotalCost = round2(totals.TotalCost + r.TotalCost)
	}

	return &domain.AccountingResponse{
		Company:   company,
		StartDate: startDate,
		EndDate:   endDate,
		Rows:      rows,
		Totals:    totals,
	}, nil
}
