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

const permitSheetURL = "https://docs.google.com/spreadsheets/d/1Em_Wyj8EiBeo56zGrShKEP9yFCMDVmkR-_EoiNXI3YA/export?format=csv&gid=1016235500"

// parseDateUS parses M/D/YYYY or MM/DD/YYYY dates from the spreadsheet.
func parseDateUS(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"01/02/2006", "1/2/2006", "1/02/2006", "01/2/2006"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

type PermitRowService struct {
	repo repository.PermitRowRepository
}

func NewPermitRowService(repo repository.PermitRowRepository) *PermitRowService {
	return &PermitRowService{repo: repo}
}

func (s *PermitRowService) List(ctx context.Context, filters domain.PermitRowFilters) ([]*domain.PermitRow, error) {
	return s.repo.List(ctx, filters)
}

func (s *PermitRowService) FindByID(ctx context.Context, id string) (*domain.PermitRow, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *PermitRowService) Create(ctx context.Context, r *domain.PermitRow) (*domain.PermitRow, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PermitRowService) Update(ctx context.Context, id string, r *domain.PermitRow) (*domain.PermitRow, error) {
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

func (s *PermitRowService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

// SyncFromSheet fetches the Google Sheets CSV, parses and deduplicates rows,
// then atomically replaces all permit_control records.
// Returns (totalFromSheet, insertedCount, error).
func (s *PermitRowService) SyncFromSheet(ctx context.Context) (int, int, error) {
	resp, err := http.Get(permitSheetURL)
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

	seen := make(map[string]bool)
	var records []*domain.PermitRow
	now := time.Now()

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // skip malformed rows
		}

		model      := col(row, "MODEL")
		jobsite    := col(row, "JOBSITE")
		lotAddress := col(row, "LOT/ADDRESS")

		if model == "" && jobsite == "" && lotAddress == "" {
			continue // empty row
		}

		key := model + "|" + jobsite + "|" + lotAddress
		if seen[key] {
			continue // deduplicate
		}
		seen[key] = true

		records = append(records, &domain.PermitRow{
			ID:          uuid.NewString(),
			Client:      model,
			Jobsite:     jobsite,
			LotAddress:  lotAddress,
			Situacao:    col(row, "SITUACAO"),
			Solicitacao: parseDateUS(col(row, "SOLICITACAO")),
			Aplicacao:   parseDateUS(col(row, "APLICACAO")),
			Emissao:     parseDateUS(col(row, "EMISSAO")),
			Observacao:  col(row, "OBSERVACAO"),
			Arquivo:     col(row, "ARQUIVO"),
			CreatedAt:   now,
		})
	}

	total := len(records)
	inserted, err := s.repo.ReplaceAll(ctx, records)
	return total, inserted, err
}
