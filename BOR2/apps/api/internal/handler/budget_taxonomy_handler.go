package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetTaxonomyHandler manages the Budget Control taxonomy: categories (per
// project_type), account→category and vendor→category mappings, and per-project
// category limits. This is the admin/management surface.
type BudgetTaxonomyHandler struct {
	db *pgxpool.Pool
}

func NewBudgetTaxonomyHandler(db *pgxpool.Pool) *BudgetTaxonomyHandler {
	return &BudgetTaxonomyHandler{db: db}
}

type Category struct {
	ID         string   `json:"id"`
	ProjectType string  `json:"project_type"`
	Name       string   `json:"name"`
	Icon       string   `json:"icon"`
	SortOrder  int      `json:"sort_order"`
	DefaultMax *float64 `json:"default_max"`
	Active     bool     `json:"active"`
}

// GET /budget/categories[?project_type=building]
func (h *BudgetTaxonomyHandler) ListCategories(c *fiber.Ctx) error {
	pt := c.Query("project_type")
	q := `SELECT id::text, project_type, name, icon, sort_order, default_max, active FROM budget_categories`
	args := []any{}
	if pt != "" {
		q += ` WHERE project_type = $1`
		args = append(args, pt)
	}
	q += ` ORDER BY project_type, sort_order, name`
	rows, err := h.db.Query(c.Context(), q, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var cat Category
		rows.Scan(&cat.ID, &cat.ProjectType, &cat.Name, &cat.Icon, &cat.SortOrder, &cat.DefaultMax, &cat.Active)
		out = append(out, cat)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /budget/categories
func (h *BudgetTaxonomyHandler) CreateCategory(c *fiber.Ctx) error {
	var b Category
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.ProjectType != "building" && b.ProjectType != "lot" && b.ProjectType != "private" {
		return fiber.NewError(fiber.StatusBadRequest, "project_type must be building, lot or private")
	}
	if b.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	if b.Icon == "" {
		b.Icon = "Tag"
	}
	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO budget_categories (project_type, name, icon, sort_order, default_max)
		VALUES ($1,$2,$3,$4,$5) RETURNING id::text
	`, b.ProjectType, b.Name, b.Icon, b.SortOrder, b.DefaultMax).Scan(&id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PUT /budget/categories/:id
func (h *BudgetTaxonomyHandler) UpdateCategory(c *fiber.Ctx) error {
	id := c.Params("id")
	var b Category
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Icon == "" {
		b.Icon = "Tag"
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE budget_categories
		SET name=$2, icon=$3, sort_order=$4, default_max=$5, active=$6, updated_at=now()
		WHERE id=$1
	`, id, b.Name, b.Icon, b.SortOrder, b.DefaultMax, b.Active)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /budget/categories/:id
func (h *BudgetTaxonomyHandler) DeleteCategory(c *fiber.Ctx) error {
	if _, err := h.db.Exec(c.Context(), `DELETE FROM budget_categories WHERE id=$1`, c.Params("id")); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Account → category mapping ────────────────────────────────────────────────

type AccountMapping struct {
	AccountRefID   string  `json:"account_ref_id"`
	AccountName    string  `json:"account_name"`
	AccountType    string  `json:"account_type"`
	CategoryID     *string `json:"category_id"`
	CategoryName   *string `json:"category_name"`
}

// GET /budget/account-categories?company=hvac&project_type=building
// Returns expense accounts with their current mapping (if any) for that type.
func (h *BudgetTaxonomyHandler) ListAccountMappings(c *fiber.Ctx) error {
	company := c.Query("company")
	pt := c.Query("project_type")
	if company == "" || pt == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_type are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT a.external_id, COALESCE(a.name,''), COALESCE(a.account_type,''),
		       cat.id::text, cat.name
		FROM qb_accounts a
		LEFT JOIN budget_account_categories bac
		  ON bac.company=a.company AND bac.account_ref_id=a.external_id AND bac.project_type=$2
		LEFT JOIN budget_categories cat ON cat.id = bac.category_id
		WHERE a.company=$1 AND a.account_type IN ('Cost of Goods Sold','Expense')
		ORDER BY a.name
	`, company, pt)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []AccountMapping{}
	for rows.Next() {
		var m AccountMapping
		rows.Scan(&m.AccountRefID, &m.AccountName, &m.AccountType, &m.CategoryID, &m.CategoryName)
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/account-categories  body {company, account_ref_id, project_type, category_id|null}
func (h *BudgetTaxonomyHandler) SetAccountMapping(c *fiber.Ctx) error {
	var b struct {
		Company      string  `json:"company"`
		AccountRefID string  `json:"account_ref_id"`
		ProjectType  string  `json:"project_type"`
		CategoryID   *string `json:"category_id"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.AccountRefID == "" || b.ProjectType == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, account_ref_id, project_type required")
	}
	if b.CategoryID == nil || *b.CategoryID == "" {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_account_categories WHERE company=$1 AND account_ref_id=$2 AND project_type=$3`, b.Company, b.AccountRefID, b.ProjectType)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_account_categories (company, account_ref_id, project_type, category_id)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (company, account_ref_id, project_type) DO UPDATE SET category_id=EXCLUDED.category_id
	`, b.Company, b.AccountRefID, b.ProjectType, *b.CategoryID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Ghost cost accounts (BC-20) ───────────────────────────────────────────────
// A curated catalog of QB GL accounts that should always show up (budget-
// editable) on a project of the given type, even with zero real activity yet.

type GhostAccountOption struct {
	AccountRefID string `json:"account_ref_id"`
	AccountName  string `json:"account_name"`
	Active       bool   `json:"active"` // true if currently in the ghost catalog
}

// GET /budget/ghost-accounts?company=hvac&project_type=building
func (h *BudgetTaxonomyHandler) ListGhostAccounts(c *fiber.Ctx) error {
	company := c.Query("company")
	pt := c.Query("project_type")
	if company == "" || pt == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_type are required")
	}
	// Top-level only (no parent_id) — matches injectGhostCostAccounts, which only
	// ever adds top-level nodes. A child account here would never actually show
	// up as a ghost row, so it has no business being toggleable in this list.
	rows, err := h.db.Query(c.Context(), `
		SELECT a.external_id, COALESCE(a.name,''), (g.id IS NOT NULL AND g.active)
		FROM qb_accounts a
		LEFT JOIN budget_ghost_accounts g
		  ON g.company=a.company AND g.account_ref_id=a.external_id AND g.project_type=$2
		WHERE a.company=$1 AND a.account_type IN ('Cost of Goods Sold','Expense')
		  AND COALESCE(a.parent_id,'') = ''
		ORDER BY a.name
	`, company, pt)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []GhostAccountOption{}
	for rows.Next() {
		var o GhostAccountOption
		rows.Scan(&o.AccountRefID, &o.AccountName, &o.Active)
		out = append(out, o)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/ghost-accounts  body {company, project_type, account_ref_id, active}
func (h *BudgetTaxonomyHandler) SetGhostAccount(c *fiber.Ctx) error {
	var b struct {
		Company      string `json:"company"`
		ProjectType  string `json:"project_type"`
		AccountRefID string `json:"account_ref_id"`
		Active       bool   `json:"active"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectType == "" || b.AccountRefID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_type, account_ref_id required")
	}
	if !b.Active {
		_, err := h.db.Exec(c.Context(), `
			DELETE FROM budget_ghost_accounts WHERE company=$1 AND project_type=$2 AND account_ref_id=$3
		`, b.Company, b.ProjectType, b.AccountRefID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_ghost_accounts (company, project_type, account_ref_id)
		VALUES ($1,$2,$3)
		ON CONFLICT (company, project_type, account_ref_id) DO UPDATE SET active=true, updated_at=now()
	`, b.Company, b.ProjectType, b.AccountRefID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Vendor (subcontractor) → category mapping ─────────────────────────────────

type VendorMapping struct {
	VendorID     string  `json:"vendor_id"`
	DisplayName  string  `json:"display_name"`
	CategoryID   *string `json:"category_id"`
	CategoryName *string `json:"category_name"`
}

// GET /budget/vendor-categories?company=hvac&project_type=building[&only_po=true]
func (h *BudgetTaxonomyHandler) ListVendorMappings(c *fiber.Ctx) error {
	company := c.Query("company")
	pt := c.Query("project_type")
	if company == "" || pt == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_type are required")
	}
	// Vendors that actually appear on purchase orders (the subcontractors), with mapping.
	rows, err := h.db.Query(c.Context(), `
		SELECT v.external_id, COALESCE(v.display_name,''),
		       cat.id::text, cat.name
		FROM qb_vendors v
		JOIN (SELECT DISTINCT company, vendor_id FROM qb_purchase_orders WHERE company=$1 AND vendor_id IS NOT NULL) po
		  ON po.company=v.company AND po.vendor_id=v.external_id
		LEFT JOIN budget_vendor_categories bvc
		  ON bvc.company=v.company AND bvc.vendor_id=v.external_id AND bvc.project_type=$2
		LEFT JOIN budget_categories cat ON cat.id = bvc.category_id
		WHERE v.company=$1
		ORDER BY v.display_name
	`, company, pt)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []VendorMapping{}
	for rows.Next() {
		var m VendorMapping
		rows.Scan(&m.VendorID, &m.DisplayName, &m.CategoryID, &m.CategoryName)
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/vendor-categories  body {company, vendor_id, project_type, category_id|null}
func (h *BudgetTaxonomyHandler) SetVendorMapping(c *fiber.Ctx) error {
	var b struct {
		Company     string  `json:"company"`
		VendorID    string  `json:"vendor_id"`
		ProjectType string  `json:"project_type"`
		CategoryID  *string `json:"category_id"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.VendorID == "" || b.ProjectType == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, vendor_id, project_type required")
	}
	if b.CategoryID == nil || *b.CategoryID == "" {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_vendor_categories WHERE company=$1 AND vendor_id=$2 AND project_type=$3`, b.Company, b.VendorID, b.ProjectType)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_vendor_categories (company, vendor_id, project_type, category_id)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (company, vendor_id, project_type) DO UPDATE SET category_id=EXCLUDED.category_id
	`, b.Company, b.VendorID, b.ProjectType, *b.CategoryID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Per-project category limits ───────────────────────────────────────────────

type ProjectLimit struct {
	CategoryID string  `json:"category_id"`
	MaxValue   float64 `json:"max_value"`
}

// GET /budget/project-limits?company=hvac&project_id=<hierarchy key>
func (h *BudgetTaxonomyHandler) ListProjectLimits(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT category_id::text, max_value FROM budget_project_category_limits
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []ProjectLimit{}
	for rows.Next() {
		var l ProjectLimit
		rows.Scan(&l.CategoryID, &l.MaxValue)
		out = append(out, l)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/project-limits  body {company, project_id, category_id, max_value}
func (h *BudgetTaxonomyHandler) SetProjectLimit(c *fiber.Ctx) error {
	var b struct {
		Company    string  `json:"company"`
		ProjectID  string  `json:"project_id"`
		CategoryID string  `json:"category_id"`
		MaxValue   float64 `json:"max_value"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.CategoryID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, category_id required")
	}
	if b.MaxValue <= 0 {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_project_category_limits WHERE company=$1 AND project_id=$2 AND category_id=$3`, b.Company, b.ProjectID, b.CategoryID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_category_limits (company, project_id, category_id, max_value, updated_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (company, project_id, category_id) DO UPDATE SET max_value=EXCLUDED.max_value, updated_at=now()
	`, b.Company, b.ProjectID, b.CategoryID, b.MaxValue)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Per-project start date ────────────────────────────────────────────────────
// Manual "ground broken" date, paired with a per-category deadline (above) to
// draw a progressive budget-adherence line instead of a flat ceiling.

// GET /budget/project-dates?company=hvac&project_id=<hierarchy key>
func (h *BudgetTaxonomyHandler) GetProjectStartDate(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	var startDate *string
	err := h.db.QueryRow(c.Context(), `
		SELECT to_char(start_date, 'YYYY-MM-DD') FROM budget_project_dates
		WHERE company=$1 AND project_id=$2
	`, company, projectID).Scan(&startDate)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if startDate != nil && *startDate == "" {
		startDate = nil
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"start_date": startDate}})
}

// PUT /budget/project-dates  body {company, project_id, start_date}
// start_date is "YYYY-MM-DD", or "" to clear it.
func (h *BudgetTaxonomyHandler) SetProjectStartDate(c *fiber.Ctx) error {
	var b struct {
		Company   string `json:"company"`
		ProjectID string `json:"project_id"`
		StartDate string `json:"start_date"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id required")
	}
	var startDate any
	if b.StartDate != "" {
		startDate = b.StartDate
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_dates (company, project_id, start_date, updated_at)
		VALUES ($1,$2,$3,now())
		ON CONFLICT (company, project_id) DO UPDATE SET start_date=EXCLUDED.start_date, updated_at=now()
	`, b.Company, b.ProjectID, startDate)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Per-project vendor → category override ───────────────────────────────────
// Overrides the global budget_vendor_categories for one project ("cada sub pode
// ir pra outra categoria em determinada obra"). No row → use the global mapping.

type ProjectVendorCategory struct {
	VendorID   string `json:"vendor_id"`
	CategoryID string `json:"category_id"`
}

// GET /budget/project-vendor-categories?company=&project_id=
func (h *BudgetTaxonomyHandler) ListProjectVendorCategories(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT vendor_id, category_id::text FROM budget_project_vendor_categories
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []ProjectVendorCategory{}
	for rows.Next() {
		var m ProjectVendorCategory
		rows.Scan(&m.VendorID, &m.CategoryID)
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/project-vendor-categories  body {company, project_id, vendor_id, category_id|null}
// category_id null/empty deletes the override (revert to the global mapping).
func (h *BudgetTaxonomyHandler) SetProjectVendorCategory(c *fiber.Ctx) error {
	var b struct {
		Company    string  `json:"company"`
		ProjectID  string  `json:"project_id"`
		VendorID   string  `json:"vendor_id"`
		CategoryID *string `json:"category_id"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.VendorID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, vendor_id required")
	}
	if b.CategoryID == nil || *b.CategoryID == "" {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_project_vendor_categories WHERE company=$1 AND project_id=$2 AND vendor_id=$3`, b.Company, b.ProjectID, b.VendorID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_vendor_categories (company, project_id, vendor_id, category_id, updated_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (company, project_id, vendor_id) DO UPDATE SET category_id=EXCLUDED.category_id, updated_at=now()
	`, b.Company, b.ProjectID, b.VendorID, *b.CategoryID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Per-sub (vendor within a category) budget ────────────────────────────────

type VendorLimit struct {
	CategoryID string  `json:"category_id"`
	VendorID   string  `json:"vendor_id"`
	Amount     float64 `json:"amount"`
}

// GET /budget/vendor-limits?company=&project_id=
func (h *BudgetTaxonomyHandler) ListVendorLimits(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT category_id::text, vendor_id, amount FROM budget_project_vendor_limits
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []VendorLimit{}
	for rows.Next() {
		var l VendorLimit
		rows.Scan(&l.CategoryID, &l.VendorID, &l.Amount)
		out = append(out, l)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/vendor-limits  body {company, project_id, category_id, vendor_id, amount}
// amount <= 0 deletes the sub budget.
func (h *BudgetTaxonomyHandler) SetVendorLimit(c *fiber.Ctx) error {
	var b struct {
		Company    string  `json:"company"`
		ProjectID  string  `json:"project_id"`
		CategoryID string  `json:"category_id"`
		VendorID   string  `json:"vendor_id"`
		Amount     float64 `json:"amount"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.CategoryID == "" || b.VendorID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, category_id, vendor_id required")
	}
	if b.Amount <= 0 {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_project_vendor_limits WHERE company=$1 AND project_id=$2 AND category_id=$3 AND vendor_id=$4`, b.Company, b.ProjectID, b.CategoryID, b.VendorID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_vendor_limits (company, project_id, category_id, vendor_id, amount, updated_at)
		VALUES ($1,$2,$3,$4,$5,now())
		ON CONFLICT (company, project_id, category_id, vendor_id) DO UPDATE SET amount=EXCLUDED.amount, updated_at=now()
	`, b.Company, b.ProjectID, b.CategoryID, b.VendorID, b.Amount)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Budget settings (spend-vs-receive health band) ──────────────────────────

type BudgetSettings struct {
	Company        string  `json:"company"`
	CostRatio      float64 `json:"cost_ratio"`
	VariabilityPct float64 `json:"variability_pct"`
}

// GET /budget/settings?company=
func (h *BudgetTaxonomyHandler) GetBudgetSettings(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	s := BudgetSettings{Company: company, CostRatio: 0.70, VariabilityPct: 5}
	_ = h.db.QueryRow(c.Context(), `SELECT cost_ratio, variability_pct FROM qb_budget_settings WHERE company=$1`, company).Scan(&s.CostRatio, &s.VariabilityPct)
	return c.JSON(fiber.Map{"data": s})
}

// PUT /budget/settings  body {company, variability_pct}
func (h *BudgetTaxonomyHandler) SetBudgetSettings(c *fiber.Ctx) error {
	var b struct {
		Company        string  `json:"company"`
		VariabilityPct float64 `json:"variability_pct"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	v := b.VariabilityPct
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO qb_budget_settings (company, variability_pct, updated_at)
		VALUES ($1,$2,now())
		ON CONFLICT (company) DO UPDATE SET variability_pct=EXCLUDED.variability_pct, updated_at=now()
	`, b.Company, v)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Payroll supervisor flag (per account payee, per project) ─────────────────

// PUT /budget/payroll-supervisor  body {company, project_id, account_id, vendor_id, is_supervisor}
func (h *BudgetTaxonomyHandler) SetPayrollSupervisor(c *fiber.Ctx) error {
	var b struct {
		Company      string `json:"company"`
		ProjectID    string `json:"project_id"`
		AccountID    string `json:"account_id"`
		VendorID     string `json:"vendor_id"`
		IsSupervisor bool   `json:"is_supervisor"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.AccountID == "" || b.VendorID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, account_id, vendor_id required")
	}
	if !b.IsSupervisor {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_payroll_supervisors WHERE company=$1 AND project_id=$2 AND account_id=$3 AND vendor_id=$4`, b.Company, b.ProjectID, b.AccountID, b.VendorID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_payroll_supervisors (company, project_id, account_id, vendor_id, updated_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (company, project_id, account_id, vendor_id) DO UPDATE SET updated_at=now()
	`, b.Company, b.ProjectID, b.AccountID, b.VendorID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── Per-account cost budget ("cost budget mapping") ──────────────────────────

type AccountLimit struct {
	AccountID string  `json:"account_id"`
	Amount    float64 `json:"amount"`
	Deadline  *string `json:"deadline"`
}

// GET /budget/account-limits?company=hvac&project_id=<key>
func (h *BudgetTaxonomyHandler) ListAccountLimits(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT account_id, amount, to_char(deadline, 'YYYY-MM-DD') FROM budget_project_account_limits
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []AccountLimit{}
	for rows.Next() {
		var l AccountLimit
		var deadline *string
		rows.Scan(&l.AccountID, &l.Amount, &deadline)
		if deadline != nil && *deadline != "" {
			l.Deadline = deadline
		}
		out = append(out, l)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/account-limits/deadline  body {company, project_id, account_id, deadline}
// deadline is "YYYY-MM-DD", or "" to clear it. Does not touch amount.
func (h *BudgetTaxonomyHandler) SetAccountDeadline(c *fiber.Ctx) error {
	var b struct {
		Company   string `json:"company"`
		ProjectID string `json:"project_id"`
		AccountID string `json:"account_id"`
		Deadline  string `json:"deadline"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.AccountID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, account_id required")
	}
	var deadline any
	if b.Deadline != "" {
		deadline = b.Deadline
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_account_limits (company, project_id, account_id, amount, deadline, updated_at)
		VALUES ($1,$2,$3,0,$4,now())
		ON CONFLICT (company, project_id, account_id) DO UPDATE SET deadline=EXCLUDED.deadline, updated_at=now()
	`, b.Company, b.ProjectID, b.AccountID, deadline)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// PUT /budget/account-limits  body {company, project_id, account_id, amount}
func (h *BudgetTaxonomyHandler) SetAccountLimit(c *fiber.Ctx) error {
	var b struct {
		Company   string  `json:"company"`
		ProjectID string  `json:"project_id"`
		AccountID string  `json:"account_id"`
		Amount    float64 `json:"amount"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.ProjectID == "" || b.AccountID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id, account_id required")
	}
	if b.Amount <= 0 {
		_, err := h.db.Exec(c.Context(), `DELETE FROM budget_project_account_limits WHERE company=$1 AND project_id=$2 AND account_id=$3`, b.Company, b.ProjectID, b.AccountID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true})
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_account_limits (company, project_id, account_id, amount, updated_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (company, project_id, account_id) DO UPDATE SET amount=EXCLUDED.amount, updated_at=now()
	`, b.Company, b.ProjectID, b.AccountID, b.Amount)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
