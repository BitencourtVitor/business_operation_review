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
	}
	if k, ok := keys[strings.ToLower(company)]; ok {
		return os.Getenv(k)
	}
	return ""
}

// ── QB Time API response shapes ───────────────────────────────────────────────

type qbtTimesheetItem struct {
	ID       int    `json:"id"`
	UserID   int    `json:"user_id"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Duration int    `json:"duration"`
}

type qbtUserItem struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type qbtOnTheClockResp struct {
	Results struct {
		Timesheets map[string]qbtTimesheetItem `json:"timesheets"`
	} `json:"results"`
	SupplementalData struct {
		Users map[string]qbtUserItem `json:"users"`
	} `json:"supplemental_data"`
}

// ─────────────────────────────────────────────────────────────────────────────

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

	// ── QB Time API call ──────────────────────────────────────────────────────
	url := fmt.Sprintf(
		"%s/timesheets?start_date=%s&end_date=%s&on_the_clock=yes&supplemental_data=yes",
		qbtBaseURL, today, today,
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

	var qbtResp qbtOnTheClockResp
	if err := json.Unmarshal(body, &qbtResp); err != nil {
		return nil, fmt.Errorf("parse qbt response: %w", err)
	}

	// ── User name lookup ──────────────────────────────────────────────────────
	type userInfo struct{ id int; name string }
	userByID := make(map[int]userInfo, len(qbtResp.SupplementalData.Users))
	for _, u := range qbtResp.SupplementalData.Users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		userByID[u.ID] = userInfo{id: u.ID, name: name}
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

	for _, ts := range qbtResp.Results.Timesheets {
		u, ok := userByID[ts.UserID]
		if !ok {
			continue
		}
		if excluded[strings.ToLower(u.name)] {
			continue
		}

		clockIn, err := time.Parse(time.RFC3339, ts.Start)
		if err != nil {
			continue
		}
		elapsed := math.Max(0, math.Round(now.Sub(clockIn).Hours()*100)/100)

		team := nameToTeam[strings.ToLower(u.name)]
		if team == "" {
			team = "Unassigned"
		}

		groupMap[team] = append(groupMap[team], domain.WhosWorkingEntry{
			QBTUserID: u.id,
			Name:      u.name,
			ClockIn:   clockIn.In(loc).Format("03:04 PM"),
			Elapsed:   elapsed,
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
