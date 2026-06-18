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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

// pathSepPR matches the frontend's formatPath join so stored "unpaid address"
// strings line up with what is displayed.
const pathSepPR = " › "

// ── QB Time API response shapes (local) ──────────────────────────────────────

type periodTSItem struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	JobcodeID int    `json:"jobcode_id"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Duration  int    `json:"duration"`
	Date      string `json:"date"`
	Type      string `json:"type"`   // "regular" | "break"
	Active    bool   `json:"active"` // false = deleted in QB Time
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
	teamRepo   repository.QBTimeTeamRepository
	cacheRepo  repository.QBTimePeriodCacheRepository
	unpaidRepo repository.QBTimeUnpaidAddressRepository

	// Background-refresh guard: viewing the report kicks off a throttled cache
	// refresh so corrections in QuickBooks land without a manual button.
	syncMu   sync.Mutex
	syncing  map[string]bool
	lastSync map[string]time.Time
}

func NewPeriodReportService(
	teamRepo repository.QBTimeTeamRepository,
	cacheRepo repository.QBTimePeriodCacheRepository,
	unpaidRepo repository.QBTimeUnpaidAddressRepository,
) *PeriodReportService {
	return &PeriodReportService{
		httpClient: &http.Client{Timeout: 60 * time.Second},
		teamRepo:   teamRepo,
		cacheRepo:  cacheRepo,
		unpaidRepo: unpaidRepo,
		syncing:    make(map[string]bool),
		lastSync:   make(map[string]time.Time),
	}
}

// backgroundRefresh kicks off a recent-window cache refresh for a company when
// the report is viewed — throttled (≤ once / 15 min per company) and guarded
// against concurrent runs, so reads stay fast while the cache self-heals.
func (s *PeriodReportService) backgroundRefresh(company string) {
	if s.cacheRepo == nil {
		return
	}
	s.syncMu.Lock()
	if s.syncing[company] || time.Since(s.lastSync[company]) < 15*time.Minute {
		s.syncMu.Unlock()
		return
	}
	s.syncing[company] = true
	s.syncMu.Unlock()

	go func() {
		defer func() {
			s.syncMu.Lock()
			s.syncing[company] = false
			s.lastSync[company] = time.Now()
			s.syncMu.Unlock()
		}()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		_ = s.SyncCompany(ctx, company, 14)
	}()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func joinPathPR(p []string) string {
	return strings.Join(p, pathSepPR)
}

func (s *PeriodReportService) fetchJobcodes(ctx context.Context, token string, seed map[int]periodJobcodeItem) (map[int]string, map[int]int) {
	nameByID := make(map[int]string)
	parentByID := make(map[int]int)

	for _, jc := range seed {
		nameByID[jc.ID] = jc.Name
		if jc.ParentID != 0 {
			parentByID[jc.ID] = jc.ParentID
		}
	}

	// Page through ALL jobcodes (active + inactive) to backfill any names the
	// timesheet supplemental data did not already include.
	for page := 1; ; page++ {
		url := fmt.Sprintf("%s/jobcodes?active=both&per_page=200&page=%d", qbtBaseURL, page)
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

		var data struct {
			Results struct {
				Jobcodes map[string]periodJobcodeItem `json:"jobcodes"`
			} `json:"results"`
			More bool `json:"more"`
		}
		if json.Unmarshal(body, &data) != nil {
			break
		}
		for _, jc := range data.Results.Jobcodes {
			nameByID[jc.ID] = jc.Name
			if jc.ParentID != 0 {
				parentByID[jc.ID] = jc.ParentID
			}
		}
		if !data.More || page >= 20 {
			break
		}
	}
	return nameByID, parentByID
}

// fetchJobcodesByIDs resolves the given jobcode IDs and their full ancestor
// chain by querying QB Time for the exact IDs. Unlike paging the whole jobcode
// list this also resolves archived jobcodes and never truncates, which is what
// the payroll-by-jobcode report needs (it carries no supplemental jobcode data).
func (s *PeriodReportService) fetchJobcodesByIDs(ctx context.Context, token string, ids []int) (map[int]string, map[int]int) {
	nameByID := make(map[int]string)
	parentByID := make(map[int]int)

	pending := make([]int, 0, len(ids))
	seen := make(map[int]bool)
	queue := func(id int) {
		if id != 0 && !seen[id] {
			seen[id] = true
			pending = append(pending, id)
		}
	}
	for _, id := range ids {
		queue(id)
	}

	for len(pending) > 0 {
		n := len(pending)
		if n > 100 {
			n = 100
		}
		batch := pending[:n]
		pending = pending[n:]

		strs := make([]string, len(batch))
		for i, id := range batch {
			strs[i] = strconv.Itoa(id)
		}
		url := fmt.Sprintf("%s/jobcodes?ids=%s&per_page=100", qbtBaseURL, strings.Join(strs, ","))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := s.httpClient.Do(req)
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var data struct {
			Results struct {
				Jobcodes map[string]periodJobcodeItem `json:"jobcodes"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &data) != nil {
			continue
		}
		for _, jc := range data.Results.Jobcodes {
			nameByID[jc.ID] = jc.Name
			if jc.ParentID != 0 {
				parentByID[jc.ID] = jc.ParentID
				if _, ok := nameByID[jc.ParentID]; !ok {
					queue(jc.ParentID) // resolve the parent's name on a later pass
				}
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

// ── Pay periods ────────────────────────────────────────────────────────────────

type periodRange struct{ start, end string }

func payPeriodAnchorPR(company string) time.Time {
	// Bi-weekly pay-period anchors (period END date) per company, matching the
	// schedules configured in QuickBooks Time. The cadence is fixed, so one known
	// end date deterministically defines every period; HVAC and Framing are offset
	// from each other by one week.
	str := map[string]string{
		"framing": "2026-06-13", // period 05/31 – 06/13
		"hvacing": "2026-06-13", // same crew, same pay cycle as framing
		"hvac":    "2026-06-20", // period 06/07 – 06/20
		"pcg":     "2026-06-20",
	}[strings.ToLower(company)]
	if str == "" {
		str = "2026-06-20"
	}
	t, _ := time.Parse("2006-01-02", str)
	return t
}

// recentPayPeriods returns the most recent `count` pay periods (newest first),
// aligned to the company anchor regardless of where "today" sits.
func recentPayPeriods(company string, count int) []periodRange {
	anchor := payPeriodAnchorPR(company)
	today := time.Now().Truncate(24 * time.Hour)
	offset := ((int(math.Round(today.Sub(anchor).Hours()/24)) % 14) + 14) % 14
	currentEnd := today
	if offset != 0 {
		currentEnd = today.AddDate(0, 0, 14-offset)
	}
	out := make([]periodRange, 0, count)
	for i := 0; i < count; i++ {
		end := currentEnd.AddDate(0, 0, -14*i)
		start := end.AddDate(0, 0, -13)
		out = append(out, periodRange{
			start: start.Format("2006-01-02"),
			end:   end.Format("2006-01-02"),
		})
	}
	return out
}

func payPeriodsOverlapping(company, startDate, endDate string) []periodRange {
	var out []periodRange
	for _, p := range recentPayPeriods(company, 10) {
		if p.end >= startDate && p.start <= endDate { // YYYY-MM-DD compares lexically
			out = append(out, p)
		}
	}
	return out
}

func formatPeriodLabelPR(start, end time.Time) string {
	switch {
	case start.Year() != end.Year():
		return fmt.Sprintf("%s – %s", start.Format("Jan 2, 2006"), end.Format("Jan 2, 2006"))
	case start.Month() == end.Month():
		return fmt.Sprintf("%s–%d, %d", start.Format("Jan 2"), end.Day(), end.Year())
	default:
		return fmt.Sprintf("%s – %s", start.Format("Jan 2"), end.Format("Jan 2, 2006"))
	}
}

// ── GetPayPeriods ─────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetPayPeriods(ctx context.Context, company string) (*domain.PayPeriodsResponse, error) {
	ranges := recentPayPeriods(company, 12)
	periods := make([]domain.PayPeriod, 0, len(ranges))
	for _, r := range ranges {
		start, _ := time.Parse("2006-01-02", r.start)
		end, _ := time.Parse("2006-01-02", r.end)
		periods = append(periods, domain.PayPeriod{
			Label:     formatPeriodLabelPR(start, end),
			StartDate: r.start,
			EndDate:   r.end,
		})
	}
	return &domain.PayPeriodsResponse{Company: company, Periods: periods}, nil
}

// ── Live timesheet fetch ───────────────────────────────────────────────────────

func (s *PeriodReportService) fetchTimesheetsLive(ctx context.Context, company, startDate, endDate string) ([]domain.QBTimesheetRow, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

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

		// Cap is a runaway backstop, not a data limit — a 3-month backfill for a
		// busy company runs well past 20 pages, and QB Time returns oldest-first,
		// so a low cap silently drops the most recent punches.
		if !pageResp.More || page >= 200 {
			break
		}
	}

	nameByID, parentByID := s.fetchJobcodes(ctx, token, allJCSeed)

	userByID := make(map[int]string)
	for _, u := range allUsers {
		userByID[u.ID] = strings.TrimSpace(u.FirstName + " " + u.LastName)
	}

	rows := make([]domain.QBTimesheetRow, 0, len(allTS))
	for _, ts := range allTS {
		name := userByID[ts.UserID]
		if name == "" {
			continue
		}
		path := resolveJobcodePathPR(ts.JobcodeID, nameByID, parentByID)
		isPaid := ts.Type == "regular"
		if ts.Type == "break" {
			for _, p := range path {
				if strings.Contains(strings.ToLower(p), "paid") {
					isPaid = true
					break
				}
			}
		}
		rows = append(rows, domain.QBTimesheetRow{
			Company:     company,
			QBTID:       int64(ts.ID),
			UserID:      int64(ts.UserID),
			UserName:    name,
			JobcodeID:   int64(ts.JobcodeID),
			JobcodePath: path,
			WorkDate:    ts.Date,
			Start:       ts.Start,
			End:         ts.End,
			DurationMin: ts.Duration / 60,
			Type:        ts.Type,
			IsPaid:      isPaid,
		})
	}
	return rows, nil
}

// ── Delta timesheet fetch (modified_after) ────────────────────────────────────

// fetchTimesheetsDelta returns only timesheets modified since modifiedAfter.
// Inactive entries (active=false) are deletions in QB Time; the caller handles
// them separately. Users and jobcodes come from supplemental_data as usual.
type deltaResult struct {
	upserts []domain.QBTimesheetRow
	deletes []int64 // qbt_ids to remove from cache
}

func (s *PeriodReportService) fetchTimesheetsDelta(ctx context.Context, company string, modifiedAfter time.Time) (*deltaResult, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

	modStr := modifiedAfter.UTC().Format(time.RFC3339)
	allTS := make(map[string]periodTSItem)
	allUsers := make(map[string]periodUserItem)
	allJCSeed := make(map[int]periodJobcodeItem)

	for page := 1; ; page++ {
		url := fmt.Sprintf(
			"%s/timesheets?modified_after=%s&active=both&supplemental_data=yes&per_page=200&page=%d",
			qbtBaseURL, modStr, page,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("build delta timesheets request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("delta timesheets request: %w", err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var pageResp periodTSResp
		if err := json.Unmarshal(body, &pageResp); err != nil {
			return nil, fmt.Errorf("parse delta timesheets: %w", err)
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
		if !pageResp.More || page >= 200 {
			break
		}
	}

	nameByID, parentByID := s.fetchJobcodes(ctx, token, allJCSeed)
	userByID := make(map[int]string)
	for _, u := range allUsers {
		userByID[u.ID] = strings.TrimSpace(u.FirstName + " " + u.LastName)
	}

	result := &deltaResult{}
	for _, ts := range allTS {
		if !ts.Active {
			result.deletes = append(result.deletes, int64(ts.ID))
			continue
		}
		name := userByID[ts.UserID]
		if name == "" {
			continue
		}
		path := resolveJobcodePathPR(ts.JobcodeID, nameByID, parentByID)
		isPaid := ts.Type == "regular"
		if ts.Type == "break" {
			for _, p := range path {
				if strings.Contains(strings.ToLower(p), "paid") {
					isPaid = true
					break
				}
			}
		}
		result.upserts = append(result.upserts, domain.QBTimesheetRow{
			Company:     company,
			QBTID:       int64(ts.ID),
			UserID:      int64(ts.UserID),
			UserName:    name,
			JobcodeID:   int64(ts.JobcodeID),
			JobcodePath: path,
			WorkDate:    ts.Date,
			Start:       ts.Start,
			End:         ts.End,
			DurationMin: ts.Duration / 60,
			Type:        ts.Type,
			IsPaid:      isPaid,
		})
	}
	return result, nil
}

// ── Assemble intervals from rows (cache or live) ───────────────────────────────

func (s *PeriodReportService) assembleIntervals(ctx context.Context, company, startDate, endDate string, rows []domain.QBTimesheetRow, unpaid map[string]bool) *domain.IntervalsResponse {
	type empDateKey struct{ name, date string }
	blocksMap := make(map[empDateKey][]domain.PeriodBlock)

	for _, r := range rows {
		if r.UserName == "" {
			continue
		}
		// Operator override (Pillar 2): a flagged address forces unpaid regardless
		// of the QB Time type.
		effectivePaid := r.IsPaid && !unpaid[joinPathPR(r.JobcodePath)]

		key := empDateKey{r.UserName, r.WorkDate}
		blocksMap[key] = append(blocksMap[key], domain.PeriodBlock{
			Start:           r.Start,
			End:             r.End,
			DurationMinutes: r.DurationMin,
			JobcodePath:     r.JobcodePath,
			Type:            r.Type,
			IsPaid:          effectivePaid,
		})
	}

	for k := range blocksMap {
		sort.Slice(blocksMap[k], func(i, j int) bool {
			return blocksMap[k][i].Start < blocksMap[k][j].Start
		})
	}

	// BOR2 team per employee (members stored as "First Last"). Best-effort.
	nameToTeam := make(map[string]string)
	if s.teamRepo != nil {
		if teams, err := s.teamRepo.List(ctx, strings.ToLower(company)); err == nil {
			for _, t := range teams {
				for _, m := range t.Members {
					nameToTeam[strings.ToLower(strings.TrimSpace(m))] = t.Name
				}
			}
		}
	}

	empDays := make(map[string]map[string]domain.PeriodDay)
	for key, blocks := range blocksMap {
		t, _ := time.Parse("2006-01-02", key.date)
		paidMinutes := 0
		for _, b := range blocks {
			if b.IsPaid {
				paidMinutes += b.DurationMinutes
			}
		}
		day := domain.PeriodDay{
			Date:         key.date,
			DayName:      t.Weekday().String(),
			TotalHours:   round2(float64(paidMinutes) / 60.0),
			TotalMinutes: paidMinutes,
			Blocks:       blocks,
		}
		if empDays[key.name] == nil {
			empDays[key.name] = make(map[string]domain.PeriodDay)
		}
		empDays[key.name][key.date] = day
	}

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
			Team:       nameToTeam[strings.ToLower(name)],
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
	}
}

// ── GetIntervals ──────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetIntervals(ctx context.Context, company, startDate, endDate string) (*domain.IntervalsResponse, error) {
	defer s.backgroundRefresh(company)
	unpaid := s.unpaidSet(ctx, company)

	// Read from the cache when the requested range is fully covered by a sync.
	if s.cacheRepo != nil {
		// Covered when the period STARTS within the synced window. max_date is the
		// synced-through date (≈ today), so in-progress periods whose end is in the
		// future still read from cache — future days simply have no punches.
		if st, _ := s.cacheRepo.GetSyncState(ctx, company); st != nil && st.MinDate != "" &&
			startDate >= st.MinDate && startDate <= st.MaxDate {
			if rows, err := s.cacheRepo.GetTimesheets(ctx, company, startDate, endDate); err == nil {
				return s.assembleIntervals(ctx, company, startDate, endDate, rows, unpaid), nil
			}
		}
	}

	rows, err := s.fetchTimesheetsLive(ctx, company, startDate, endDate)
	if err != nil {
		return nil, err
	}
	return s.assembleIntervals(ctx, company, startDate, endDate, rows, unpaid), nil
}

// ── Live payroll fetch ─────────────────────────────────────────────────────────

func (s *PeriodReportService) fetchPayrollLive(ctx context.Context, company, startDate, endDate string) ([]domain.QBPayrollRow, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token for company %q", company)
	}

	type payrollResult struct {
		data *payrollByJobcodeResp
		err  error
	}
	type usersResult struct {
		users map[int]periodUserItem
		err   error
	}

	payrollCh := make(chan payrollResult, 1)
	usersCh := make(chan usersResult, 1)

	go func() {
		reqBody := map[string]interface{}{
			"data": map[string]string{"start_date": startDate, "end_date": endDate},
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

	payrollRes := <-payrollCh
	usersRes := <-usersCh
	if payrollRes.err != nil {
		return nil, payrollRes.err
	}
	users := usersRes.users

	idSet := make(map[int]bool)
	for _, userData := range payrollRes.data.Results.PayrollByJobcodeReport.ByUser {
		for _, jcTotals := range userData.Totals {
			idSet[jcTotals.JobcodeID] = true
		}
	}
	ids := make([]int, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	nameByID, parentByID := s.fetchJobcodesByIDs(ctx, token, ids)

	rows := make([]domain.QBPayrollRow, 0)
	for _, userData := range payrollRes.data.Results.PayrollByJobcodeReport.ByUser {
		userInfo, ok := users[userData.UserID]
		if !ok {
			continue
		}
		empName := strings.TrimSpace(userInfo.LastName + ", " + userInfo.FirstName)
		for _, jcTotals := range userData.Totals {
			if jcTotals.TotalRESeconds == 0 && jcTotals.TotalOTSeconds == 0 {
				continue
			}
			rows = append(rows, domain.QBPayrollRow{
				Company:     company,
				PeriodEnd:   endDate,
				UserID:      int64(userData.UserID),
				UserName:    empName,
				PayRate:     userInfo.PayRate,
				JobcodeID:   int64(jcTotals.JobcodeID),
				JobcodePath: resolveJobcodePathPR(jcTotals.JobcodeID, nameByID, parentByID),
				RegSeconds:  jcTotals.TotalRESeconds,
				OTSeconds:   jcTotals.TotalOTSeconds,
			})
		}
	}
	return rows, nil
}

// ── Assemble accounting from rows (cache or live) ──────────────────────────────

func assembleAccounting(company, startDate, endDate string, prRows []domain.QBPayrollRow) *domain.AccountingResponse {
	rows := make([]domain.AccountingRow, 0, len(prRows))
	for _, pr := range prRows {
		regularHours := round2(float64(pr.RegSeconds) / 3600.0)
		otHours := round2(float64(pr.OTSeconds) / 3600.0)
		if regularHours == 0 && otHours == 0 {
			continue
		}
		otRate := round2(pr.PayRate * 1.5)
		regularCost := round2(regularHours * pr.PayRate)
		otCost := round2(otHours * otRate)
		rows = append(rows, domain.AccountingRow{
			Employee:     pr.UserName,
			JobcodePath:  pr.JobcodePath,
			RegularHours: regularHours,
			RegularRate:  pr.PayRate,
			RegularCost:  regularCost,
			OTHours:      otHours,
			OTRate:       otRate,
			OTCost:       otCost,
			TotalHours:   round2(regularHours + otHours),
			TotalCost:    round2(regularCost + otCost),
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Employee != rows[j].Employee {
			return rows[i].Employee < rows[j].Employee
		}
		return strings.Join(rows[i].JobcodePath, "|") < strings.Join(rows[j].JobcodePath, "|")
	})

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
	}
}

// CurrentPeriod returns the open pay period's start/end for a company without
// hitting QB Time — used to always surface the observed window, even when a
// project has no mapping or no hours logged yet.
func (s *PeriodReportService) CurrentPeriod(company string) (string, string) {
	periods := recentPayPeriods(company, 1)
	if len(periods) == 0 {
		return "", ""
	}
	return periods[0].start, periods[0].end
}

// CurrentPeriodPayroll returns the open (in-progress) pay period's payroll rows
// for a company, fetched LIVE from QB Time so near-real-time accrual is visible
// without waiting for the daily cache sync (the budget labor forecast needs the
// hours logged "right now"). The period is resolved deterministically from the
// company anchor — not from the cache's MAX(period_end), which can carry stale
// duplicate rows after an anchor change. Falls back to the cached period on a
// live error or empty result. Returns the rows plus the resolved start/end.
func (s *PeriodReportService) CurrentPeriodPayroll(ctx context.Context, company string) ([]domain.QBPayrollRow, string, string, error) {
	periods := recentPayPeriods(company, 1)
	if len(periods) == 0 {
		return nil, "", "", fmt.Errorf("no pay period for company %q", company)
	}
	start, end := periods[0].start, periods[0].end

	rows, err := s.fetchPayrollLive(ctx, company, start, end)
	if err != nil || len(rows) == 0 {
		if s.cacheRepo != nil {
			if cached, cerr := s.cacheRepo.GetPayroll(ctx, company, end); cerr == nil && len(cached) > 0 {
				return cached, start, end, nil
			}
		}
		if err != nil {
			return nil, start, end, err
		}
	}
	return rows, start, end, nil
}

// ── GetAccounting ─────────────────────────────────────────────────────────────

func (s *PeriodReportService) GetAccounting(ctx context.Context, company, startDate, endDate string) (*domain.AccountingResponse, error) {
	defer s.backgroundRefresh(company)
	if s.cacheRepo != nil {
		if rows, err := s.cacheRepo.GetPayroll(ctx, company, endDate); err == nil && len(rows) > 0 {
			return assembleAccounting(company, startDate, endDate, rows), nil
		}
	}

	rows, err := s.fetchPayrollLive(ctx, company, startDate, endDate)
	if err != nil {
		return nil, err
	}
	return assembleAccounting(company, startDate, endDate, rows), nil
}

// ── Sync (daily cron) ──────────────────────────────────────────────────────────

// SyncCompany refreshes the QB Time cache for a company.
//
// Delta mode (fast): when the cache already has a last_run_at, only records
// modified since that timestamp are fetched from QB Time — typically a handful
// of punches. Deletions (active=false) are removed; everything else is upserted.
//
// Full mode (cold start / explicit backfill): when there is no prior sync state,
// or when days > 14 is explicitly requested, the last `days` are replaced wholesale.
func (s *PeriodReportService) SyncCompany(ctx context.Context, company string, days int) error {
	if s.cacheRepo == nil {
		return fmt.Errorf("cache repository not configured")
	}
	if days <= 0 {
		days = 14
	}

	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	today := time.Now().In(loc)
	endDate := today.Format("2006-01-02")
	startDate := today.AddDate(0, 0, -days).Format("2006-01-02")

	// Determine whether we can do a delta sync.
	state, _ := s.cacheRepo.GetSyncState(ctx, company)
	useDelta := state != nil && !state.LastRunAt.IsZero() && days <= 14

	if useDelta {
		delta, err := s.fetchTimesheetsDelta(ctx, company, state.LastRunAt)
		if err != nil {
			return fmt.Errorf("fetch timesheet delta: %w", err)
		}
		if err := s.cacheRepo.UpsertTimesheets(ctx, company, delta.upserts); err != nil {
			return fmt.Errorf("upsert timesheets: %w", err)
		}
		if err := s.cacheRepo.DeleteTimesheets(ctx, company, delta.deletes); err != nil {
			return fmt.Errorf("delete timesheets: %w", err)
		}
	} else {
		tsRows, err := s.fetchTimesheetsLive(ctx, company, startDate, endDate)
		if err != nil {
			return fmt.Errorf("fetch timesheets: %w", err)
		}
		// If QB Time returned zero rows for a company that previously had data,
		// the token likely lost its timesheet read permission (returns HTTP 200
		// with an empty body instead of a proper 401). Abort rather than wiping
		// the existing cache.
		if len(tsRows) == 0 && state != nil && state.MinDate != "" {
			return fmt.Errorf("QB Time returned 0 timesheets for %s (%s–%s) but cache is non-empty: aborting to prevent data loss (check token permissions)", company, startDate, endDate)
		}
		if err := s.cacheRepo.ReplaceTimesheets(ctx, company, startDate, endDate, tsRows); err != nil {
			return fmt.Errorf("store timesheets: %w", err)
		}
	}

	for _, p := range payPeriodsOverlapping(company, startDate, endDate) {
		prRows, err := s.fetchPayrollLive(ctx, company, p.start, p.end)
		if err != nil {
			continue // best-effort per period
		}
		if err := s.cacheRepo.ReplacePayroll(ctx, company, p.end, prRows); err != nil {
			return fmt.Errorf("store payroll %s: %w", p.end, err)
		}
	}

	if err := s.cacheRepo.RefreshSyncState(ctx, company, endDate); err != nil {
		return fmt.Errorf("refresh sync state: %w", err)
	}
	// Retention: keep a little over three months.
	cutoff := today.AddDate(0, 0, -100).Format("2006-01-02")
	_ = s.cacheRepo.Prune(ctx, company, cutoff)
	return nil
}

// SyncAll syncs every supported company, returning a per-company status.
// Companies whose token env var is unset are skipped gracefully.
func (s *PeriodReportService) SyncAll(ctx context.Context, days int) map[string]string {
	result := make(map[string]string)
	for _, c := range []string{"framing", "hvac", "pcg", "hvacing"} {
		if qbtToken(c) == "" {
			result[c] = "skipped: token not configured"
			continue
		}
		if err := s.SyncCompany(ctx, c, days); err != nil {
			result[c] = "error: " + err.Error()
		} else {
			result[c] = "ok"
		}
	}
	return result
}

// ── Unpaid addresses (Pillar 2) ────────────────────────────────────────────────

func (s *PeriodReportService) unpaidSet(ctx context.Context, company string) map[string]bool {
	set := make(map[string]bool)
	if s.unpaidRepo != nil {
		if list, err := s.unpaidRepo.List(ctx, company); err == nil {
			for _, a := range list {
				set[a] = true
			}
		}
	}
	return set
}

// ListAddresses returns the distinct jobcode-path strings seen for a company
// (from the cache, falling back to a recent live pull) plus any flagged unpaid
// address, each marked with its paid/unpaid state.
func (s *PeriodReportService) ListAddresses(ctx context.Context, company string) ([]domain.PeriodAddress, error) {
	set := make(map[string]bool)

	if s.cacheRepo != nil {
		if st, _ := s.cacheRepo.GetSyncState(ctx, company); st != nil && st.MinDate != "" {
			if rows, err := s.cacheRepo.GetTimesheets(ctx, company, st.MinDate, st.MaxDate); err == nil {
				for _, r := range rows {
					set[joinPathPR(r.JobcodePath)] = true
				}
			}
		}
	}

	// Cache cold: pull the two most recent periods live so the list isn't empty.
	if len(set) == 0 {
		ranges := recentPayPeriods(company, 2)
		if len(ranges) > 0 {
			if rows, err := s.fetchTimesheetsLive(ctx, company, ranges[len(ranges)-1].start, ranges[0].end); err == nil {
				for _, r := range rows {
					set[joinPathPR(r.JobcodePath)] = true
				}
			}
		}
	}

	unpaid := s.unpaidSet(ctx, company)
	for a := range unpaid {
		set[a] = true // keep flagged addresses listed even if absent from current data
	}

	out := make([]domain.PeriodAddress, 0, len(set))
	for a := range set {
		out = append(out, domain.PeriodAddress{Address: a, Unpaid: unpaid[a]})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Address < out[j].Address })
	return out, nil
}

func (s *PeriodReportService) SetUnpaid(ctx context.Context, company, address string) error {
	if s.unpaidRepo == nil {
		return fmt.Errorf("unpaid address repository not configured")
	}
	return s.unpaidRepo.Set(ctx, company, address)
}

func (s *PeriodReportService) UnsetUnpaid(ctx context.Context, company, address string) error {
	if s.unpaidRepo == nil {
		return fmt.Errorf("unpaid address repository not configured")
	}
	return s.unpaidRepo.Unset(ctx, company, address)
}
