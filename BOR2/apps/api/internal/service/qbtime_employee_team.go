package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

// QBTimeEmployeeTeamService syncs the QB Time "Groups" feature (an employee
// belongs to at most one group at a time in QB Time) into
// qbtime_employee_teams, and lets an admin override the effective team per
// employee without losing the QB-side value used to detect divergence.
type QBTimeEmployeeTeamService struct {
	repo       repository.QBTimeEmployeeTeamRepository
	httpClient *http.Client
}

func NewQBTimeEmployeeTeamService(repo repository.QBTimeEmployeeTeamRepository) *QBTimeEmployeeTeamService {
	return &QBTimeEmployeeTeamService{repo: repo, httpClient: &http.Client{Timeout: 30 * time.Second}}
}

// ── QB Time API response shapes (Groups + Users) ──────────────────────────────

type qbtGroupItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type qbtGroupsResp struct {
	Results struct {
		Groups map[string]qbtGroupItem `json:"groups"`
	} `json:"results"`
	More bool `json:"more"`
}

type qbtUserWithGroupItem struct {
	ID        int    `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	GroupID   int    `json:"group_id"`
}

type qbtUsersWithGroupResp struct {
	Results struct {
		Users map[string]qbtUserWithGroupItem `json:"users"`
	} `json:"results"`
	More bool `json:"more"`
}

// ── Fetch ───────────────────────────────────────────────────────────────────

func (s *QBTimeEmployeeTeamService) fetchGroups(ctx context.Context, token string) (map[int]qbtGroupItem, error) {
	out := make(map[int]qbtGroupItem)
	for page := 1; ; page++ {
		url := fmt.Sprintf("%s/groups?active=yes&per_page=200&page=%d", qbtBaseURL, page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("qbt groups api returned %d: %s", resp.StatusCode, string(body))
		}

		var data qbtGroupsResp
		if err := json.Unmarshal(body, &data); err != nil {
			return nil, fmt.Errorf("parse qbt groups response: %w", err)
		}
		for _, g := range data.Results.Groups {
			out[g.ID] = g
		}
		if !data.More || page >= 10 {
			break
		}
	}
	return out, nil
}

func (s *QBTimeEmployeeTeamService) fetchActiveUsers(ctx context.Context, token string) (map[int]qbtUserWithGroupItem, error) {
	out := make(map[int]qbtUserWithGroupItem)
	for page := 1; ; page++ {
		url := fmt.Sprintf("%s/users?active=yes&per_page=200&page=%d", qbtBaseURL, page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("qbt users api returned %d: %s", resp.StatusCode, string(body))
		}

		var data qbtUsersWithGroupResp
		if err := json.Unmarshal(body, &data); err != nil {
			return nil, fmt.Errorf("parse qbt users response: %w", err)
		}
		for _, u := range data.Results.Users {
			out[u.ID] = u
		}
		if !data.More || page >= 10 {
			break
		}
	}
	return out, nil
}

// ── Sync ────────────────────────────────────────────────────────────────────

// SyncCompany pulls the current Groups + active Users from QB Time and
// upserts the QB-side snapshot for every employee. Any existing manual
// override is preserved by UpsertFromSync.
func (s *QBTimeEmployeeTeamService) SyncCompany(ctx context.Context, company string) error {
	token := qbtToken(company)
	if token == "" {
		return fmt.Errorf("no QB Time token configured for company %q", company)
	}

	groups, err := s.fetchGroups(ctx, token)
	if err != nil {
		return fmt.Errorf("fetch qbt groups: %w", err)
	}
	users, err := s.fetchActiveUsers(ctx, token)
	if err != nil {
		return fmt.Errorf("fetch qbt users: %w", err)
	}
	if len(users) == 0 {
		return fmt.Errorf("qbt returned 0 active users for %s — aborting sync to avoid wiping existing data", company)
	}

	rows := make([]repository.QBTimeEmployeeTeamSyncRow, 0, len(users))
	for _, u := range users {
		name := strings.TrimSpace(u.FirstName + " " + u.LastName)
		if name == "" {
			continue
		}
		row := repository.QBTimeEmployeeTeamSyncRow{
			QBTUserID:    u.ID,
			EmployeeName: name,
		}
		if u.GroupID != 0 {
			if g, ok := groups[u.GroupID]; ok {
				gid := u.GroupID
				gname := g.Name
				row.QBTeamID = &gid
				row.QBTeamName = &gname
			}
		}
		rows = append(rows, row)
	}

	return s.repo.UpsertFromSync(ctx, strings.ToLower(company), rows)
}

// SyncAll syncs every supported company, returning a per-company status.
// Companies whose token env var is unset are skipped gracefully.
func (s *QBTimeEmployeeTeamService) SyncAll(ctx context.Context) map[string]string {
	result := make(map[string]string)
	for _, c := range []string{"framing", "hvac", "pcg", "hvacing"} {
		if qbtToken(c) == "" {
			result[c] = "skipped: token not configured"
			continue
		}
		if err := s.SyncCompany(ctx, c); err != nil {
			result[c] = "error: " + err.Error()
		} else {
			result[c] = "ok"
		}
	}
	return result
}

// ── Reads + overrides ──────────────────────────────────────────────────────

func (s *QBTimeEmployeeTeamService) List(ctx context.Context, company string) ([]*domain.QBTimeEmployeeTeam, error) {
	return s.repo.List(ctx, strings.ToLower(company))
}

func (s *QBTimeEmployeeTeamService) SetOverride(ctx context.Context, id, overrideTeamName, overriddenBy string) (*domain.QBTimeEmployeeTeam, error) {
	return s.repo.SetOverride(ctx, id, overrideTeamName, overriddenBy)
}

func (s *QBTimeEmployeeTeamService) ClearOverride(ctx context.Context, id string) (*domain.QBTimeEmployeeTeam, error) {
	return s.repo.ClearOverride(ctx, id)
}
