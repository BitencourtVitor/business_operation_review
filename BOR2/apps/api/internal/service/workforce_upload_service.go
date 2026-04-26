package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type WorkforceUploadService struct {
	repo repository.WorkforceUploadRepository
}

func NewWorkforceUploadService(repo repository.WorkforceUploadRepository) *WorkforceUploadService {
	return &WorkforceUploadService{repo: repo}
}

func (s *WorkforceUploadService) List(ctx context.Context) ([]*domain.WorkforceUpload, error) {
	return s.repo.List(ctx)
}

func (s *WorkforceUploadService) FindConflict(ctx context.Context, month, company string) (*domain.WorkforceUpload, error) {
	return s.repo.FindByMonthAndCompany(ctx, month, company)
}

func (s *WorkforceUploadService) Delete(ctx context.Context, id string) error {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing == nil {
		return fmt.Errorf("upload not found")
	}
	return s.repo.Delete(ctx, id)
}

// ProcessAndCreate parses the CSV, creates the upload record and bulk-inserts all rows atomically.
func (s *WorkforceUploadService) ProcessAndCreate(
	ctx context.Context,
	r io.Reader,
	company, refMonth, fileName, userID string,
) (*domain.WorkforceUpload, int, int, error) {

	rows, inserted, skipped, err := parseWorkforceCSV(r, company, refMonth)
	if err != nil {
		return nil, 0, 0, err
	}

	var totalHours float64
	for _, row := range rows {
		totalHours += row.RegularHours
	}

	uploadID := uuid.NewString()
	upload := &domain.WorkforceUpload{
		ID:             uploadID,
		ReferenceMonth: refMonth,
		Company:        company,
		FileName:       fileName,
		RecordCount:    len(rows),
		TotalHours:     totalHours,
		UploadedBy:     userID,
		Status:         "success",
	}

	if err := s.repo.Create(ctx, upload); err != nil {
		return nil, 0, 0, fmt.Errorf("create upload record: %w", err)
	}

	for _, row := range rows {
		row.UploadID = uploadID
	}

	if err := s.repo.BulkInsertRows(ctx, rows); err != nil {
		// rollback the upload record
		_ = s.repo.Delete(ctx, uploadID)
		return nil, 0, 0, fmt.Errorf("insert rows: %w", err)
	}

	return upload, inserted, skipped, nil
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

func parseWorkforceCSV(r io.Reader, company, refMonth string) ([]*domain.WorkforceProductivityRow, int, int, error) {
	reader := csv.NewReader(r)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, 0, 0, fmt.Errorf("read header: %w", err)
	}

	colMap := make(map[string]int)
	for i, col := range header {
		colMap[strings.ToLower(strings.TrimSpace(col))] = i
	}

	getCol := func(names ...string) int {
		for _, n := range names {
			if idx, ok := colMap[n]; ok {
				return idx
			}
		}
		return -1
	}

	clientCol   := getCol("customer", "client", "customer/job", "customer:job")
	jobsiteCol  := getCol("jobsite", "job site", "job", "service item", "item")
	lotCol      := getCol("lot_building", "lot/building", "lot", "building")
	worktypeCol := getCol("worktype", "work type", "type", "class")
	empCol      := getCol("employee", "employee_name", "team member", "worker", "name")
	rateCol     := getCol("regular_rate", "rate", "hourly rate", "pay rate", "billing rate")
	hoursCol    := getCol("regular_hours", "hours", "total hours", "duration", "qty")

	if empCol == -1 || hoursCol == -1 {
		return nil, 0, 0, fmt.Errorf("CSV must have at least Employee and Hours columns")
	}

	isPCG := strings.EqualFold(company, "pcg")
	var rows []*domain.WorkforceProductivityRow
	inserted, skipped := 0, 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}

		field := func(idx int) string {
			if idx >= 0 && idx < len(record) {
				return strings.TrimSpace(record[idx])
			}
			return ""
		}

		client   := field(clientCol)
		emp      := field(empCol)
		hoursStr := field(hoursCol)

		if emp == "" || hoursStr == "" {
			continue
		}

		if isPCG && !strings.EqualFold(client, "callahan") {
			skipped++
			continue
		}

		worktype := field(worktypeCol)
		if strings.EqualFold(worktype, "service call") {
			skipped++
			continue
		}

		hours := parseWorkforceNum(hoursStr)
		if hours == 0 {
			skipped++
			continue
		}

		rows = append(rows, &domain.WorkforceProductivityRow{
			ID:             uuid.NewString(),
			Client:         client,
			Jobsite:        field(jobsiteCol),
			LotBuilding:    field(lotCol),
			Worktype:       worktype,
			EmployeeName:   emp,
			RegularRate:    parseWorkforceNum(field(rateCol)),
			RegularHours:   hours,
			ReferenceMonth: refMonth,
			Company:        company,
		})
		inserted++
	}

	return rows, inserted, skipped, nil
}

func parseWorkforceNum(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, ",", "")
	if s == "" || s == "-" {
		return 0
	}
	f, _ := strconv.ParseFloat(s, 64)
	return f
}
