package handler

import (
	"github.com/gofiber/fiber/v2"
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
	if b.ProjectType != "house" && b.ProjectType != "building" {
		return fiber.NewError(fiber.StatusBadRequest, "project_type must be house or building")
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

// ── Per-account cost budget ("cost budget mapping") ──────────────────────────

type AccountLimit struct {
	AccountID string  `json:"account_id"`
	Amount    float64 `json:"amount"`
}

// GET /budget/account-limits?company=hvac&project_id=<key>
func (h *BudgetTaxonomyHandler) ListAccountLimits(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT account_id, amount FROM budget_project_account_limits
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []AccountLimit{}
	for rows.Next() {
		var l AccountLimit
		rows.Scan(&l.AccountID, &l.Amount)
		out = append(out, l)
	}
	return c.JSON(fiber.Map{"data": out})
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
