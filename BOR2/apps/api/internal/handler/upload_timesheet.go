package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TimesheetUploadHandler struct {
	db *pgxpool.Pool
}

func NewTimesheetUploadHandler(db *pgxpool.Pool) *TimesheetUploadHandler {
	return &TimesheetUploadHandler{db: db}
}

func (h *TimesheetUploadHandler) UploadCSV(c *fiber.Ctx) error {
	company := strings.TrimSpace(c.FormValue("company"))
	refMonth := strings.TrimSpace(c.FormValue("reference_month"))

	if company == "" || refMonth == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "company and reference_month are required",
			"code":  "BAD_REQUEST",
		})
	}

	form, err := c.MultipartForm()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid multipart form",
			"code":  "BAD_REQUEST",
		})
	}

	files := form.File["files"]
	if len(files) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "no files uploaded",
			"code":  "BAD_REQUEST",
		})
	}

	ctx := context.Background()
	totalInserted := 0
	totalSkipped := 0
	var errors []string

	for _, file := range files {
		f, err := file.Open()
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: failed to open", file.Filename))
			continue
		}

		inserted, skipped, parseErr := h.processCSV(ctx, f, company, refMonth)
		f.Close()

		if parseErr != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", file.Filename, parseErr))
			continue
		}

		totalInserted += inserted
		totalSkipped += skipped
		logger.Info("timesheet CSV processed", "file", file.Filename, "inserted", inserted, "skipped", skipped)
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"inserted": totalInserted,
			"skipped":  totalSkipped,
			"files":    len(files),
			"errors":   errors,
		},
	})
}

func (h *TimesheetUploadHandler) processCSV(ctx context.Context, r io.Reader, company, refMonth string) (int, int, error) {
	reader := csv.NewReader(r)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return 0, 0, fmt.Errorf("read header: %w", err)
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

	clientCol := getCol("customer", "client", "customer/job", "customer:job")
	jobsiteCol := getCol("jobsite", "job site", "job", "service item", "item")
	lotCol := getCol("lot_building", "lot/building", "lot", "building")
	worktypeCol := getCol("worktype", "work type", "type", "class")
	empCol := getCol("employee", "employee_name", "team member", "worker", "name")
	rateCol := getCol("regular_rate", "rate", "hourly rate", "pay rate", "billing rate")
	hoursCol := getCol("regular_hours", "hours", "total hours", "duration", "qty")

	if empCol == -1 || hoursCol == -1 {
		return 0, 0, fmt.Errorf("CSV must have at least Employee and Hours columns. Found: %v", header)
	}

	isPCG := strings.EqualFold(company, "pcg")
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

		client := field(clientCol)
		emp := field(empCol)
		hoursStr := field(hoursCol)

		if emp == "" || hoursStr == "" {
			continue
		}

		// PCG: only Callahan
		if isPCG && !strings.EqualFold(client, "callahan") {
			skipped++
			continue
		}

		worktype := field(worktypeCol)
		if strings.EqualFold(worktype, "service call") {
			skipped++
			continue
		}

		hours := parseNum(hoursStr)
		if hours == 0 {
			skipped++
			continue
		}

		_, err = h.db.Exec(ctx, `
			INSERT INTO timesheet_data_new (id, client, jobsite, lot_building, worktype, employee_name, regular_rate, regular_hours, reference_month, company)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, uuid.NewString(), client, field(jobsiteCol), field(lotCol), worktype, emp, parseNum(field(rateCol)), hours, refMonth, company)

		if err != nil {
			continue
		}
		inserted++
	}

	return inserted, skipped, nil
}

func parseNum(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, ",", "")
	if s == "" || s == "-" {
		return 0
	}
	f, _ := strconv.ParseFloat(s, 64)
	return f
}
