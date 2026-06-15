package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

const qbtBaseURL = "https://rest.tsheets.com/api/v1"

// WhosWorkingService fetches real-time QB Time clock data and assembles
// the Who's Working report grouped by BOR2 teams.
type WhosWorkingService struct {
	exceptionRepo repository.QBTimeExceptionsRepository
	teamRepo      repository.QBTimeTeamRepository
	httpClient    *http.Client
}

func NewWhosWorkingService(
	exceptionRepo repository.QBTimeExceptionsRepository,
	teamRepo repository.QBTimeTeamRepository,
) *WhosWorkingService {
	return &WhosWorkingService{
		exceptionRepo: exceptionRepo,
		teamRepo:      teamRepo,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
	}
}

func qbtToken(company string) string {
	keys := map[string]string{
		"framing": "QBT_ACCESS_TOKEN_FRAMING",
		"hvac":    "QBT_ACCESS_TOKEN_HVAC",
		"pcg":     "QBT_ACCESS_TOKEN_PCG",
		// hvacing is the QB Time workspace for the Framing crew under a new account.
		// Set QBT_ACCESS_TOKEN_HVACING to enable daily sync.
		"hvacing": "QBT_ACCESS_TOKEN_HVACING",
	}
	if k, ok := keys[strings.ToLower(company)]; ok {
		return os.Getenv(k)
	}
	return ""
}

// ── QB Time API response shapes ───────────────────────────────────────────────

type qbtTimesheetItem struct {
	ID         int    `json:"id"`
	UserID     int    `json:"user_id"`
	JobcodeID  int    `json:"jobcode_id"`
	Start      string `json:"start"`
	End        string `json:"end"`
	Duration   int    `json:"duration"` // seconds; -1 when open
	Type       string `json:"type"`     // "regular" | "break"
}

type qbtUserItem struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type qbtJobcodeItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type qbtTimesheetResp struct {
	Results struct {
		Timesheets map[string]qbtTimesheetItem `json:"timesheets"`
	} `json:"results"`
	SupplementalData struct {
		Users    map[string]qbtUserItem    `json:"users"`
		Jobcodes map[string]qbtJobcodeItem `json:"jobcodes"`
	} `json:"supplemental_data"`
}

// ─────────────────────────────────────────────────────────────────────────────

func (s *WhosWorkingService) fetchTimesheets(ctx context.Context, token, url string) (*qbtTimesheetResp, error) {
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

	var r qbtTimesheetResp
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, fmt.Errorf("parse qbt response: %w", err)
	}
	return &r, nil
}

// GetWhosWorking calls QB Time and returns who is currently clocked in,
// grouped by BOR2 team and with exceptions filtered out.
func (s *WhosWorkingService) GetWhosWorking(ctx context.Context, company string) (*domain.WhosWorkingResponse, error) {
	token := qbtToken(company)
	if token == "" {
		return nil, fmt.Errorf("no QB Time token configured for company %q", company)
	}

	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return nil, fmt.Errorf("load timezone: %w", err)
	}

	now := time.Now()
	nowEastern := now.In(loc)
	today := nowEastern.Format("2006-01-02")

	// ── Two parallel QB Time calls ────────────────────────────────────────────
	// Call 1: open blocks (on_the_clock=yes)
	// Call 2: closed blocks for today (on_the_clock=no, same date range)
	openURL := fmt.Sprintf(
		"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=yes&supplemental_data=yes",
		qbtBaseURL, today, today,
	)
	closedURL := fmt.Sprintf(
		"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=no&supplemental_data=yes",
		qbtBaseURL, today, today,
	)

	var (
		openResp   *qbtTimesheetResp
		closedResp *qbtTimesheetResp
		openErr    error
		closedErr  error
		wg         sync.WaitGroup
	)
	wg.Add(2)
	go func() { defer wg.Done(); openResp, openErr = s.fetchTimesheets(ctx, token, openURL) }()
	go func() { defer wg.Done(); closedResp, closedErr = s.fetchTimesheets(ctx, token, closedURL) }()
	wg.Wait()

	if openErr != nil {
		return nil, openErr
	}
	if closedErr != nil {
		return nil, closedErr
	}

	// ── Build user name + jobcode lookup from both responses ──────────────────
	type userInfo struct {
		id   int
		name string
	}
	userByID   := make(map[int]userInfo)
	jobcodeByID := make(map[int]string)

	for _, u := range openResp.SupplementalData.Users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		userByID[u.ID] = userInfo{id: u.ID, name: name}
	}
	for _, u := range closedResp.SupplementalData.Users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		userByID[u.ID] = userInfo{id: u.ID, name: name}
	}
	for _, jc := range openResp.SupplementalData.Jobcodes {
		jobcodeByID[jc.ID] = jc.Name
	}
	for _, jc := range closedResp.SupplementalData.Jobcodes {
		jobcodeByID[jc.ID] = jc.Name
	}

	// ── Group closed blocks by userID ─────────────────────────────────────────
	closedByUser := make(map[int][]qbtTimesheetItem)
	for _, ts := range closedResp.Results.Timesheets {
		closedByUser[ts.UserID] = append(closedByUser[ts.UserID], ts)
	}

	// ── Exceptions (excluded employees) ──────────────────────────────────────
	exceptions, err := s.exceptionRepo.List(ctx, strings.ToLower(company))
	if err != nil {
		return nil, fmt.Errorf("load exceptions: %w", err)
	}
	excluded := make(map[string]bool, len(exceptions))
	for _, e := range exceptions {
		excluded[strings.ToLower(e.EmployeeName)] = true
	}

	// ── Teams (name → team mapping) ───────────────────────────────────────────
	teams, err := s.teamRepo.List(ctx, strings.ToLower(company))
	if err != nil {
		return nil, fmt.Errorf("load teams: %w", err)
	}
	nameToTeam := make(map[string]string)
	for _, t := range teams {
		for _, m := range t.Members {
			nameToTeam[strings.ToLower(m)] = t.Name
		}
	}

	// ── Build entries grouped by team ─────────────────────────────────────────
	groupMap := make(map[string][]domain.WhosWorkingEntry)

	for _, openTS := range openResp.Results.Timesheets {
		u, ok := userByID[openTS.UserID]
		if !ok {
			continue
		}
		if excluded[strings.ToLower(u.name)] {
			continue
		}

		currentStart, err := time.Parse(time.RFC3339, openTS.Start)
		if err != nil {
			continue
		}
		currentStart = currentStart.In(loc)

		currentType := openTS.Type
		if currentType == "" {
			currentType = "regular"
		}

		// Aggregate closed blocks for this user.
		var (
			completedWorkSec  int
			totalBreakSec     int
			firstStart        = currentStart
			breaks            []domain.WhosWorkingBreak
		)

		for _, closedTS := range closedByUser[openTS.UserID] {
			s2, err := time.Parse(time.RFC3339, closedTS.Start)
			if err != nil {
				continue
			}
			s2 = s2.In(loc)

			// Track the earliest clock-in across all blocks.
			if s2.Before(firstStart) {
				firstStart = s2
			}

			blockType := closedTS.Type
			if blockType == "" {
				blockType = "regular"
			}

			dur := closedTS.Duration
			if dur < 0 {
				dur = 0
			}

			if blockType == "regular" {
				completedWorkSec += dur
			} else {
				// break block
				totalBreakSec += dur
				e2, err := time.Parse(time.RFC3339, closedTS.End)
				if err == nil {
					e2 = e2.In(loc)
					breaks = append(breaks, domain.WhosWorkingBreak{
						Start:   s2.Format("03:04 PM"),
						End:     e2.Format("03:04 PM"),
						Minutes: dur / 60,
					})
				}
			}
		}

		// Sort breaks chronologically.
		sort.Slice(breaks, func(i, j int) bool {
			return breaks[i].Start < breaks[j].Start
		})

		// Current block contribution.
		elapsedCurrent := math.Max(0, now.Sub(currentStart.In(time.UTC)).Hours())
		totalWorkHours := float64(completedWorkSec) / 3600.0
		if currentType == "regular" {
			totalWorkHours += elapsedCurrent
		}
		totalWorkHours = math.Round(totalWorkHours*100) / 100

		// Current address from open block's jobcode.
		currentAddress := jobcodeByID[openTS.JobcodeID]

		team := nameToTeam[strings.ToLower(u.name)]
		if team == "" {
			team = "Unassigned"
		}

		groupMap[team] = append(groupMap[team], domain.WhosWorkingEntry{
			QBTUserID:         u.id,
			Name:              u.name,
			ClockIn:           currentStart.Format("03:04 PM"),
			Elapsed:           elapsedCurrent,
			FirstClockIn:      firstStart.Format("03:04 PM"),
			CurrentBlockStart: currentStart.Format("03:04 PM"),
			CurrentBlockType:  currentType,
			TotalWorkHours:    totalWorkHours,
			TotalBreakMinutes: totalBreakSec / 60,
			CurrentAddress:    currentAddress,
			Breaks:            breaks,
		})
	}

	// ── Assemble groups in team-DB order; Unassigned always last ──────────────
	var groups []domain.WhosWorkingGroup
	seen := make(map[string]bool)

	for _, t := range teams {
		entries := groupMap[t.Name]
		if len(entries) == 0 {
			continue
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
		groups = append(groups, domain.WhosWorkingGroup{Team: t.Name, Entries: entries})
		seen[t.Name] = true
	}
	if entries := groupMap["Unassigned"]; len(entries) > 0 {
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
		groups = append(groups, domain.WhosWorkingGroup{Team: "Unassigned", Entries: entries})
		seen["Unassigned"] = true
	}
	for teamName, entries := range groupMap {
		if seen[teamName] {
			continue
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
		groups = append(groups, domain.WhosWorkingGroup{Team: teamName, Entries: entries})
	}

	total := 0
	for _, g := range groups {
		total += len(g.Entries)
	}

	return &domain.WhosWorkingResponse{
		Company:      company,
		GeneratedAt:  nowEastern.Format("01/02 · 03:04 PM"),
		GeneratedISO: now.UTC(),
		Groups:       groups,
		TotalOnClock: total,
	}, nil
}

// ── Exceptions passthrough ────────────────────────────────────────────────────

func (s *WhosWorkingService) ListExceptions(ctx context.Context, company string) ([]*domain.WhosWorkingException, error) {
	return s.exceptionRepo.List(ctx, strings.ToLower(company))
}

func (s *WhosWorkingService) UpsertException(ctx context.Context, company, name string) (*domain.WhosWorkingException, error) {
	return s.exceptionRepo.Upsert(ctx, strings.ToLower(company), name)
}

func (s *WhosWorkingService) DeleteException(ctx context.Context, id string) error {
	return s.exceptionRepo.Delete(ctx, id)
}
