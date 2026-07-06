package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

// knownClientPrefixes are root-level QB Time folder names that represent clients,
// not work types. They may appear at any level in the jobcode path.
var knownClientPrefixes = []string{
	"pulte homes",
	"toll brothers",
	"callahan",
}

func isKnownClient(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, prefix := range knownClientPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

var multiSpace = regexp.MustCompile(`\s{2,}`)
var trailingStateCode = regexp.MustCompile(`,\s*[A-Za-z]{2}$`)

// normalizeAddress cleans up common QB Time address inconsistencies so the
// same physical jobsite always collapses to one string, regardless of how
// it happened to be typed into QB Time over time (WF-2: "Riverview at
// Providence, RI" vs "Riverview At Providence, Ri" vs no state at all were
// splitting one jobsite's hours into separate, individually-invisible
// buckets):
//   - trims whitespace, ensures exactly one space after each comma
//   - strips a trailing ", XX" state abbreviation — redundant (the city is
//     already in the string) and inconsistently present across entries
//   - normalizes casing to Title Case
func normalizeAddress(s string) string {
	s = strings.TrimSpace(s)
	parts := strings.Split(s, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	s = strings.Join(parts, ", ")
	s = multiSpace.ReplaceAllString(s, " ")
	s = trailingStateCode.ReplaceAllString(s, "")
	return titleCase(strings.TrimSpace(s))
}

func titleCase(s string) string {
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		r := []rune(w)
		if len(r) > 0 {
			r[0] = unicode.ToUpper(r[0])
		}
		words[i] = string(r)
	}
	return strings.Join(words, " ")
}

// parseJobcodePath converts a QB Time jobcode hierarchy path into the
// (client, jobsite, lotBuilding, worktype) tuple expected by WorkforceProductivityRow.
//
// QB Time path examples and expected output:
//   ["Pulte Homes", "Canton, Coppersmith", "Normal Labor"]
//     → client="Pulte Homes", jobsite="Canton, Coppersmith", worktype="Normal Labor"
//   ["Canton, Coppersmith", "Normal Labor"]
//     → client="", jobsite="Canton, Coppersmith", worktype="Normal Labor"
//   ["Job Sites", "Canton, Coppersmith", "Normal Labor"]
//     → client="", jobsite="Canton, Coppersmith", worktype="Normal Labor"
//   ["Canton, Coppersmith", "Pulte Homes"]  (client in worktype position)
//     → client="Pulte Homes", jobsite="Canton, Coppersmith", worktype=""
//   ["Pulte Homes", "Canton, Coppersmith - Building 1", "Framing", "Normal Labor"]
//     → client="Pulte Homes", jobsite="Canton, Coppersmith - Building 1", lotBuilding="Framing", worktype="Normal Labor"
func parseJobcodePath(path []string) (client, jobsite, lotBuilding, worktype string) {
	w := make([]string, 0, len(path))
	for _, p := range path {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// "Job Sites" is a generic grouping folder — discard it
		if strings.EqualFold(p, "job sites") {
			continue
		}
		w = append(w, p)
	}

	if len(w) == 0 {
		return
	}

	// Extract known client from the first position
	if isKnownClient(w[0]) {
		client = w[0]
		w = w[1:]
	}

	if len(w) == 0 {
		return
	}

	// If last element is a known client name it was logged as a worktype by mistake.
	// Move it to client (if not already set) and remove from the path.
	last := w[len(w)-1]
	if isKnownClient(last) {
		if client == "" {
			client = last
		}
		w = w[:len(w)-1]
	}

	switch len(w) {
	case 0:
		// client-only entry
	case 1:
		jobsite = normalizeAddress(w[0])
	case 2:
		jobsite = normalizeAddress(w[0])
		worktype = w[1]
	case 3:
		jobsite = normalizeAddress(w[0])
		lotBuilding = w[1]
		worktype = w[2]
	default:
		jobsite = normalizeAddress(w[0])
		lotBuilding = strings.Join(w[1:len(w)-1], " > ")
		worktype = w[len(w)-1]
	}

	return
}

// ── QB Time API response shapes ───────────────────────────────────────────────

type importTSItem struct {
	UserID    int    `json:"user_id"`
	JobcodeID int    `json:"jobcode_id"`
	Duration  int    `json:"duration"` // seconds; -1 if open
	Type      string `json:"type"`
	Date      string `json:"date"` // "2006-01-02"
}

type importQBTResp struct {
	Results struct {
		Timesheets map[string]importTSItem `json:"timesheets"`
	} `json:"results"`
	SupplementalData struct {
		Users    map[string]weeklyUserItem    `json:"users"`
		Jobcodes map[string]weeklyJobcodeItem `json:"jobcodes"`
	} `json:"supplemental_data"`
	More bool `json:"more"`
}

// ── Service ───────────────────────────────────────────────────────────────────

type QBTimeWorkforceImportService struct {
	repo       repository.WorkforceUploadRepository
	httpClient *http.Client
}

func NewQBTimeWorkforceImportService(repo repository.WorkforceUploadRepository) *QBTimeWorkforceImportService {
	return &QBTimeWorkforceImportService{
		repo:       repo,
		httpClient: &http.Client{Timeout: 120 * time.Second},
	}
}

type WorkforceImportResult struct {
	Upload   *domain.WorkforceUpload
	Inserted int
	Skipped  int
}

// Import fetches all closed timesheets for `company` during `month` (format: "2026-05"),
// converts them to WorkforceProductivityRow records and persists them as a new upload.
// If overwrite=true and a record for the same month+company already exists, it is replaced.
func (s *QBTimeWorkforceImportService) Import(
	ctx context.Context,
	company, month string,
	overwrite bool,
	userID string,
) (*WorkforceImportResult, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token configured for company %q", company)
	}

	// ── Date range for the requested month ────────────────────────────────────
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, fmt.Errorf("invalid month format %q (expected YYYY-MM)", month)
	}
	startDate := t.Format("2006-01-02")
	// Last day of month: first day of next month minus 1 day
	endDate := t.AddDate(0, 1, -1).Format("2006-01-02")

	// ── Conflict check ────────────────────────────────────────────────────────
	existing, _ := s.repo.FindByMonthAndCompany(ctx, month, company)
	if existing != nil {
		if !overwrite {
			return nil, fmt.Errorf("upload already exists for %s / %s; pass overwrite=true to replace", company, month)
		}
		if err := s.repo.Delete(ctx, existing.ID); err != nil {
			return nil, fmt.Errorf("delete existing upload: %w", err)
		}
	}

	// ── Fetch paginated timesheets ────────────────────────────────────────────
	agg := &importQBTResp{}
	agg.Results.Timesheets = make(map[string]importTSItem)
	agg.SupplementalData.Users = make(map[string]weeklyUserItem)
	agg.SupplementalData.Jobcodes = make(map[string]weeklyJobcodeItem)

	for page := 1; ; page++ {
		url := fmt.Sprintf(
			"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=no&supplemental_data=yes&per_page=200&page=%d",
			qbtBaseURL, startDate, endDate, page,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("qbt api: %w", err)
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read response: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("qbt api returned %d: %s", resp.StatusCode, string(body))
		}

		var pageResp importQBTResp
		if err := json.Unmarshal(body, &pageResp); err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}

		for k, v := range pageResp.Results.Timesheets {
			agg.Results.Timesheets[k] = v
		}
		for k, v := range pageResp.SupplementalData.Users {
			agg.SupplementalData.Users[k] = v
		}
		for k, v := range pageResp.SupplementalData.Jobcodes {
			agg.SupplementalData.Jobcodes[k] = v
		}

		log.Printf("[qbt-workforce-import] %s %s page=%d entries=%d more=%v total=%d",
			company, month, page, len(pageResp.Results.Timesheets), pageResp.More, len(agg.Results.Timesheets))

		if !pageResp.More {
			break
		}
		if page >= 50 {
			log.Printf("[qbt-workforce-import] %s hit page cap", company)
			break
		}
	}

	// ── Build lookup maps ─────────────────────────────────────────────────────
	userByID := make(map[int]string, len(agg.SupplementalData.Users))
	for _, u := range agg.SupplementalData.Users {
		userByID[u.ID] = strings.TrimSpace(u.FirstName + " " + u.LastName)
	}

	jobcodeByID := make(map[int]string)
	jobcodeParentID := make(map[int]int)
	for _, jc := range agg.SupplementalData.Jobcodes {
		jobcodeByID[jc.ID] = jc.Name
		if jc.ParentID != 0 {
			jobcodeParentID[jc.ID] = jc.ParentID
		}
	}

	// Fetch full jobcode tree to resolve ancestor paths
	allJCURL := fmt.Sprintf("%s/jobcodes?active=yes&per_page=200", qbtBaseURL)
	if req, err := http.NewRequestWithContext(ctx, http.MethodGet, allJCURL, nil); err == nil {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		if resp, err := s.httpClient.Do(req); err == nil {
			defer resp.Body.Close()
			if b, err := io.ReadAll(resp.Body); err == nil && resp.StatusCode == http.StatusOK {
				var allJC struct {
					Results struct {
						Jobcodes map[string]weeklyJobcodeItem `json:"jobcodes"`
					} `json:"results"`
				}
				if json.Unmarshal(b, &allJC) == nil {
					for _, jc := range allJC.Results.Jobcodes {
						jobcodeByID[jc.ID] = jc.Name
						if jc.ParentID != 0 {
							jobcodeParentID[jc.ID] = jc.ParentID
						}
					}
				}
			}
		}
	}

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
			path = append([]string{name}, path...)
			cur = jobcodeParentID[cur]
		}
		return path
	}

	// ── Aggregate hours: (employee, client, jobsite, lotBuilding, worktype, date) ──
	type rowKey struct {
		employee, client, jobsite, lotBuilding, worktype, date string
	}
	hoursByKey := make(map[rowKey]float64)
	isPCG := strings.EqualFold(company, "pcg")
	skipped := 0

	for _, ts := range agg.Results.Timesheets {
		if ts.Type != "regular" || ts.Duration <= 0 {
			skipped++
			continue
		}

		name := userByID[ts.UserID]
		if name == "" {
			skipped++
			continue
		}

		path := resolveJobcodePath(ts.JobcodeID)
		client, jobsite, lotBuilding, worktype := parseJobcodePath(path)

		// PCG: only keep Callahan work
		if isPCG && !strings.EqualFold(client, "callahan") {
			skipped++
			continue
		}

		// Skip "service call" worktype (same rule as CSV import)
		if strings.EqualFold(worktype, "service call") {
			skipped++
			continue
		}

		hours := math.Round(float64(ts.Duration)/3600.0*100) / 100
		key := rowKey{employee: name, client: client, jobsite: jobsite, lotBuilding: lotBuilding, worktype: worktype, date: ts.Date}
		hoursByKey[key] += hours
	}

	// ── Build domain rows ─────────────────────────────────────────────────────
	uploadID := uuid.NewString()
	var rows []*domain.WorkforceProductivityRow
	var totalHours float64

	for key, hours := range hoursByKey {
		if hours <= 0 {
			continue
		}
		totalHours += hours
		rows = append(rows, &domain.WorkforceProductivityRow{
			ID:             uuid.NewString(),
			UploadID:       uploadID,
			Client:         key.client,
			Jobsite:        key.jobsite,
			LotBuilding:    key.lotBuilding,
			Worktype:       key.worktype,
			EmployeeName:   key.employee,
			RegularRate:    0,
			RegularHours:   math.Round(hours*100) / 100,
			ReferenceMonth: month,
			Company:        company,
			WorkDate:       key.date,
		})
	}

	// ── Persist ───────────────────────────────────────────────────────────────
	upload := &domain.WorkforceUpload{
		ID:             uploadID,
		ReferenceMonth: month,
		Company:        company,
		FileName:       fmt.Sprintf("QB Time API - %s", month),
		RecordCount:    len(rows),
		TotalHours:     math.Round(totalHours*100) / 100,
		UploadedBy:     userID,
		Status:         "success",
	}

	if err := s.repo.Create(ctx, upload); err != nil {
		return nil, fmt.Errorf("create upload record: %w", err)
	}

	if err := s.repo.BulkInsertRows(ctx, rows); err != nil {
		_ = s.repo.Delete(ctx, uploadID)
		return nil, fmt.Errorf("insert rows: %w", err)
	}

	return &WorkforceImportResult{
		Upload:   upload,
		Inserted: len(rows),
		Skipped:  skipped,
	}, nil
}
