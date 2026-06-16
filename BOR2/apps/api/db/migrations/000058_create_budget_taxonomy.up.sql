-- Budget Control taxonomy: categories + mappings.
-- Categories are defined per project_type ('house' | 'building') — houses and
-- buildings have different sets. Project type is derived from the Project name
-- ("building" → building, "lot" → house, else house) at query time.
-- Expense accounts and subcontractors map to a category; each project may set a
-- suggested max per category. Seeds below are an editable starting point; the
-- admin UI is the source of truth going forward.

CREATE TABLE IF NOT EXISTS budget_categories (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_type text        NOT NULL,             -- 'house' | 'building'
  name         text        NOT NULL,
  icon         text        NOT NULL DEFAULT 'Tag',
  sort_order   integer     NOT NULL DEFAULT 0,
  default_max  numeric,                          -- optional suggested ceiling (template)
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_type, name)
);

-- Expense GL account → category (per company, per project_type since the same
-- account is shared by house and building projects but maps to type-specific sets).
CREATE TABLE IF NOT EXISTS budget_account_categories (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company        text NOT NULL,
  account_ref_id text NOT NULL,
  project_type   text NOT NULL,
  category_id    uuid NOT NULL REFERENCES budget_categories (id) ON DELETE CASCADE,
  UNIQUE (company, account_ref_id, project_type)
);

-- Subcontractor (vendor) → category.
CREATE TABLE IF NOT EXISTS budget_vendor_categories (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company      text NOT NULL,
  vendor_id    text NOT NULL,
  project_type text NOT NULL,
  category_id  uuid NOT NULL REFERENCES budget_categories (id) ON DELETE CASCADE,
  UNIQUE (company, vendor_id, project_type)
);

-- Per-project suggested max per category.
CREATE TABLE IF NOT EXISTS budget_project_category_limits (
  id          uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company     text    NOT NULL,
  customer_id text    NOT NULL,
  category_id uuid    NOT NULL REFERENCES budget_categories (id) ON DELETE CASCADE,
  max_value   numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, customer_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_type     ON budget_categories            (project_type);
CREATE INDEX IF NOT EXISTS idx_budget_acct_cat_lookup     ON budget_account_categories    (company, project_type, account_ref_id);
CREATE INDEX IF NOT EXISTS idx_budget_vendor_cat_lookup   ON budget_vendor_categories     (company, project_type, vendor_id);
CREATE INDEX IF NOT EXISTS idx_budget_proj_cat_limits     ON budget_project_category_limits (company, customer_id);

-- ─── Seed starter categories (same canonical set for both types; edit in UI) ────

INSERT INTO budget_categories (project_type, name, icon, sort_order) VALUES
  ('building','Foundation','Mountain',10),
  ('building','Framing','Frame',20),
  ('building','Roofing','Triangle',30),
  ('building','Siding','House',40),
  ('building','Plumbing','Droplets',50),
  ('building','Electrical','Zap',60),
  ('building','HVAC','Wind',70),
  ('building','Insulation','Layers',80),
  ('building','Drywall','Square',90),
  ('building','Painting','PaintBucket',100),
  ('building','Flooring','Grid3x3',110),
  ('building','Masonry','BrickWall',120),
  ('building','Finish Carpentry','Hammer',130),
  ('building','Cabinets','Boxes',140),
  ('building','Landscaping','Trees',150),
  ('building','Materials','Package',160),
  ('building','Labor','HardHat',170),
  ('building','Equipment','Truck',180),
  ('building','Other','Ellipsis',999),
  ('house','Foundation','Mountain',10),
  ('house','Framing','Frame',20),
  ('house','Roofing','Triangle',30),
  ('house','Siding','House',40),
  ('house','Plumbing','Droplets',50),
  ('house','Electrical','Zap',60),
  ('house','HVAC','Wind',70),
  ('house','Insulation','Layers',80),
  ('house','Drywall','Square',90),
  ('house','Painting','PaintBucket',100),
  ('house','Flooring','Grid3x3',110),
  ('house','Masonry','BrickWall',120),
  ('house','Finish Carpentry','Hammer',130),
  ('house','Cabinets','Boxes',140),
  ('house','Landscaping','Trees',150),
  ('house','Materials','Package',160),
  ('house','Labor','HardHat',170),
  ('house','Equipment','Truck',180),
  ('house','Other','Ellipsis',999)
ON CONFLICT (project_type, name) DO NOTHING;

-- ─── Best-effort auto-map expense accounts → category by name keyword ──────────
-- Editable later in the UI. Maps to both type sets (same category names).

INSERT INTO budget_account_categories (company, account_ref_id, project_type, category_id)
SELECT a.company, a.external_id, c.project_type, c.id
FROM qb_accounts a
JOIN (VALUES
  ('%foundation%','Foundation'), ('%footing%','Foundation'),
  ('%fram%','Framing'),
  ('%roof%','Roofing'),
  ('%siding%','Siding'),
  ('%plumb%','Plumbing'),
  ('%electric%','Electrical'),
  ('%hvac%','HVAC'), ('%mechanical%','HVAC'),
  ('%insulat%','Insulation'),
  ('%drywall%','Drywall'), ('%sheetrock%','Drywall'),
  ('%paint%','Painting'),
  ('%floor%','Flooring'), ('%tile%','Flooring'),
  ('%mason%','Masonry'), ('%concrete%','Masonry'),
  ('%landscap%','Landscaping'),
  ('%carpentry%','Finish Carpentry'), ('%trim%','Finish Carpentry'),
  ('%cabinet%','Cabinets'),
  ('%material%','Materials'), ('%supplies%','Materials'),
  ('%equipment%','Equipment'), ('%rental%','Equipment'),
  ('%labor%','Labor'), ('%contractor%','Labor')
) AS kw(pat, cat) ON a.name ILIKE kw.pat
JOIN budget_categories c ON c.name = kw.cat
WHERE a.account_type IN ('Cost of Goods Sold','Expense')
ON CONFLICT (company, account_ref_id, project_type) DO NOTHING;
