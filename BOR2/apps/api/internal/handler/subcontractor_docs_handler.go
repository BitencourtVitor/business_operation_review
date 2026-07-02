package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SubcontractorDocsHandler manages the Subcontractor Docs page: tracks
// compliance document status/expiry per subcontractor (insurance
// certificates, W-9, master contract, ID, policy binder), replacing the
// manual "COI Subcontractors" spreadsheet.
type SubcontractorDocsHandler struct {
	db *pgxpool.Pool
}

func NewSubcontractorDocsHandler(db *pgxpool.Pool) *SubcontractorDocsHandler {
	return &SubcontractorDocsHandler{db: db}
}

type SubDocType struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	HasExpiry bool   `json:"has_expiry"`
}

// GET /subcontractor-docs/types
func (h *SubcontractorDocsHandler) ListTypes(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `SELECT key, label, has_expiry FROM sub_doc_types ORDER BY sort_order`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []SubDocType{}
	for rows.Next() {
		var t SubDocType
		rows.Scan(&t.Key, &t.Label, &t.HasExpiry)
		out = append(out, t)
	}
	return c.JSON(fiber.Map{"data": out})
}

type SubDocRecord struct {
	DocType       string  `json:"doc_type"`
	Status        string  `json:"status"` // missing | requested | received | not_applicable
	StartDate     *string `json:"start_date"`
	ExpiryDate    *string `json:"expiry_date"`
	RequestedDate *string `json:"requested_date"`
	Notes         string  `json:"notes"`
}

// Urgency buckets, computed from the soonest expiry among this contractor's
// received dated docs (GL/Auto/WC) — the signal Amanda asked to have surface
// automatically instead of scanning a raw spreadsheet by eye.
const (
	UrgencyExpired = "expired" // already past expiry
	UrgencyUrgent  = "urgent"  // expires within 30 days
	UrgencySoon    = "soon"    // expires within 90 days
	UrgencyOK      = "ok"      // expires beyond 90 days
	UrgencyNone    = "none"    // no dated doc on file yet
)

func urgencyFor(daysUntil int, hasExpiry bool) string {
	if !hasExpiry {
		return UrgencyNone
	}
	switch {
	case daysUntil < 0:
		return UrgencyExpired
	case daysUntil <= 30:
		return UrgencyUrgent
	case daysUntil <= 90:
		return UrgencySoon
	default:
		return UrgencyOK
	}
}

type SubDocContractor struct {
	ID         int            `json:"id"`
	Company    string         `json:"company"`
	Name       string         `json:"name"`
	Email      string         `json:"email"`
	Phone      string         `json:"phone"`
	Notes      string         `json:"notes"`
	Records    []SubDocRecord `json:"records"`
	NextExpiry *string        `json:"next_expiry"`
	Urgency    string         `json:"urgency"`
}

// subDocsCompany is a placeholder value for the NOT NULL company column —
// this page isn't segmented by company (single flat list, unlike Budget
// Control/Accounting/etc.), so it's never read from or exposed via the API.
const subDocsCompany = "framing"

// GET /subcontractor-docs/contractors
// Sorted soonest-expiry-first (Amanda's core ask): whoever needs attention
// next surfaces at the top instead of being buried in a flat spreadsheet.
func (h *SubcontractorDocsHandler) ListContractors(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, company, name, email, phone, notes
		FROM sub_doc_contractors ORDER BY name
	`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	out := []*SubDocContractor{}
	byID := map[int]*SubDocContractor{}
	for rows.Next() {
		ctr := &SubDocContractor{Records: []SubDocRecord{}}
		rows.Scan(&ctr.ID, &ctr.Company, &ctr.Name, &ctr.Email, &ctr.Phone, &ctr.Notes)
		out = append(out, ctr)
		byID[ctr.ID] = ctr
	}
	rows.Close()
	if len(out) == 0 {
		return c.JSON(fiber.Map{"data": out})
	}

	recRows, err := h.db.Query(c.Context(), `
		SELECT r.contractor_id, r.doc_type, r.status,
		       to_char(r.start_date,'YYYY-MM-DD'), to_char(r.expiry_date,'YYYY-MM-DD'),
		       to_char(r.requested_date,'YYYY-MM-DD'), r.notes, t.has_expiry
		FROM sub_doc_records r
		JOIN sub_doc_types t ON t.key = r.doc_type
	`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer recRows.Close()

	today := time.Now().UTC().Truncate(24 * time.Hour)
	for recRows.Next() {
		var contractorID int
		var rec SubDocRecord
		var hasExpiry bool
		var startDate, expiryDate, requestedDate *string
		recRows.Scan(&contractorID, &rec.DocType, &rec.Status, &startDate, &expiryDate, &requestedDate, &rec.Notes, &hasExpiry)
		rec.StartDate, rec.ExpiryDate, rec.RequestedDate = startDate, expiryDate, requestedDate

		ctr, ok := byID[contractorID]
		if !ok {
			continue
		}
		ctr.Records = append(ctr.Records, rec)

		if hasExpiry && rec.Status == "received" && expiryDate != nil {
			if exp, err := time.Parse("2006-01-02", *expiryDate); err == nil {
				if ctr.NextExpiry == nil {
					v := *expiryDate
					ctr.NextExpiry = &v
				} else if prev, _ := time.Parse("2006-01-02", *ctr.NextExpiry); exp.Before(prev) {
					v := *expiryDate
					ctr.NextExpiry = &v
				}
			}
		}
	}

	for _, ctr := range out {
		if ctr.NextExpiry == nil {
			ctr.Urgency = UrgencyNone
			continue
		}
		exp, _ := time.Parse("2006-01-02", *ctr.NextExpiry)
		days := int(exp.Sub(today).Hours() / 24)
		ctr.Urgency = urgencyFor(days, true)
	}

	sortByUrgency(out)
	return c.JSON(fiber.Map{"data": out})
}

// sortByUrgency: soonest expiry first, contractors with no dated doc on file
// last (they need outreach too, but there's no date to rank them by).
func sortByUrgency(list []*SubDocContractor) {
	for i := 1; i < len(list); i++ {
		j := i
		for j > 0 && expiryLess(list[j], list[j-1]) {
			list[j], list[j-1] = list[j-1], list[j]
			j--
		}
	}
}

func expiryLess(a, b *SubDocContractor) bool {
	if a.NextExpiry == nil {
		return false
	}
	if b.NextExpiry == nil {
		return true
	}
	return *a.NextExpiry < *b.NextExpiry
}

type contractorBody struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
	Notes string `json:"notes"`
}

// POST /subcontractor-docs/contractors
func (h *SubcontractorDocsHandler) CreateContractor(c *fiber.Ctx) error {
	var b contractorBody
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	var id int
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO sub_doc_contractors (company, name, email, phone, notes)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, subDocsCompany, b.Name, b.Email, b.Phone, b.Notes).Scan(&id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PUT /subcontractor-docs/contractors/:id
func (h *SubcontractorDocsHandler) UpdateContractor(c *fiber.Ctx) error {
	id := c.Params("id")
	var b contractorBody
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE sub_doc_contractors SET name=$1, email=$2, phone=$3, notes=$4, updated_at=now()
		WHERE id=$5
	`, b.Name, b.Email, b.Phone, b.Notes, id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /subcontractor-docs/contractors/:id
func (h *SubcontractorDocsHandler) DeleteContractor(c *fiber.Ctx) error {
	id := c.Params("id")
	_, err := h.db.Exec(c.Context(), `DELETE FROM sub_doc_contractors WHERE id=$1`, id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// PUT /subcontractor-docs/records
// body {contractor_id, doc_type, status, start_date?, expiry_date?, requested_date?, notes?}
// Dates are "YYYY-MM-DD" or "" to clear.
func (h *SubcontractorDocsHandler) SetRecord(c *fiber.Ctx) error {
	var b struct {
		ContractorID  int    `json:"contractor_id"`
		DocType       string `json:"doc_type"`
		Status        string `json:"status"`
		StartDate     string `json:"start_date"`
		ExpiryDate    string `json:"expiry_date"`
		RequestedDate string `json:"requested_date"`
		Notes         string `json:"notes"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.ContractorID == 0 || b.DocType == "" || b.Status == "" {
		return fiber.NewError(fiber.StatusBadRequest, "contractor_id, doc_type and status are required")
	}
	var start, expiry, requested any
	if b.StartDate != "" {
		start = b.StartDate
	}
	if b.ExpiryDate != "" {
		expiry = b.ExpiryDate
	}
	if b.RequestedDate != "" {
		requested = b.RequestedDate
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO sub_doc_records (contractor_id, doc_type, status, start_date, expiry_date, requested_date, notes, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,now())
		ON CONFLICT (contractor_id, doc_type) DO UPDATE SET
			status=EXCLUDED.status, start_date=EXCLUDED.start_date, expiry_date=EXCLUDED.expiry_date,
			requested_date=EXCLUDED.requested_date, notes=EXCLUDED.notes, updated_at=now()
	`, b.ContractorID, b.DocType, b.Status, start, expiry, requested, b.Notes)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
