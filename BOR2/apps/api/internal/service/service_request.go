package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

const serviceRequestSheetURL = "https://docs.google.com/spreadsheets/d/142NUG_ffJwVotYwShXLywKcNzK8EQoNny_4Ow50qTu8/export?format=csv&gid=0"

type ServiceRequestService struct {
	repo repository.ServiceRequestRepository
}

func NewServiceRequestService(repo repository.ServiceRequestRepository) *ServiceRequestService {
	return &ServiceRequestService{repo: repo}
}

func (s *ServiceRequestService) List(ctx context.Context, filters domain.ServiceRequestFilters) ([]*domain.ServiceRequestRow, error) {
	return s.repo.List(ctx, filters)
}

func (s *ServiceRequestService) FindByID(ctx context.Context, id string) (*domain.ServiceRequestRow, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *ServiceRequestService) Create(ctx context.Context, r *domain.ServiceRequestRow) (*domain.ServiceRequestRow, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ServiceRequestService) Update(ctx context.Context, id string, r *domain.ServiceRequestRow) (*domain.ServiceRequestRow, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.CreatedAt = existing.CreatedAt
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ServiceRequestService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

// SyncFromSheet fetches the Google Sheets CSV, parses rows, then atomically
// replaces all service_requests records. Returns (totalFromSheet, insertedCount, error).
func (s *ServiceRequestService) SyncFromSheet(ctx context.Context) (int, int, error) {
	resp, err := http.Get(serviceRequestSheetURL)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch sheet: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("sheet returned status %d", resp.StatusCode)
	}

	reader := csv.NewReader(resp.Body)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	headers, err := reader.Read()
	if err != nil {
		return 0, 0, fmt.Errorf("read csv header: %w", err)
	}

	// Build header → column-index map (normalised to UPPER, trimmed)
	colIdx := make(map[string]int, len(headers))
	for i, h := range headers {
		colIdx[strings.TrimSpace(strings.ToUpper(h))] = i
	}

	col := func(row []string, key string) string {
		i, ok := colIdx[key]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	parseBool := func(v string) bool {
		v = strings.ToLower(strings.TrimSpace(v))
		return v == "yes" || v == "true" || v == "1"
	}

	var records []*domain.ServiceRequestRow
	now := time.Now()

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // skip malformed rows
		}

		contractor := col(row, "CONTRACTOR")
		jobSite    := col(row, "JOB SITE")
		issue      := col(row, "ISSUE")

		if contractor == "" && jobSite == "" && issue == "" {
			continue // empty row
		}

		// Parse additional_visits: comma-separated date strings
		var additionalVisits []string
		if raw := col(row, "ADDITIONAL VISITS"); raw != "" {
			for _, part := range strings.Split(raw, ",") {
				part = strings.TrimSpace(part)
				if part == "" {
					continue
				}
				if t := parseDateUS(part); t != nil {
					additionalVisits = append(additionalVisits, t.Format("2006-01-02T00:00:00Z"))
				}
			}
		}

		records = append(records, &domain.ServiceRequestRow{
			ID:                    uuid.NewString(),
			Contractor:            contractor,
			JobSite:               col(row, "JOB SITE"),
			City:                  col(row, "CITY"),
			Lot:                   col(row, "LOT"),
			Address:               col(row, "ADDRESS"),
			CloseDate:             parseDateUS(col(row, "CLOSE DATE")),
			DateReceived:          parseDateUS(col(row, "DATE RECEIVED")),
			MaterialAvailableDate: parseDateUS(col(row, "DISPONIBILIDADE DO MATERIAL")),
			ResidentAvailableDate: parseDateUS(col(row, "DISPONIBILIDADE DO MORADOR")),
			DateCompleted:         parseDateUS(col(row, "DATE COMPLETED")),
			AdditionalVisits:      additionalVisits,
			Issue:                 col(row, "ISSUE"),
			Warranty:              parseBool(col(row, "WARRANTY")),
			Tech:                  col(row, "TECH"),
			CreatedAt:             now,
		})
	}

	total := len(records)
	inserted, err := s.repo.ReplaceAll(ctx, records)
	return total, inserted, err
}
