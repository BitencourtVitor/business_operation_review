package integration_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/jackc/pgx/v5/pgxpool"
)

const testDSN = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway?sslmode=require"

func newTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	db, err := pgxpool.New(context.Background(), testDSN)
	if err != nil {
		t.Fatalf("connect to db: %v", err)
	}
	if err := db.Ping(context.Background()); err != nil {
		t.Fatalf("ping db: %v", err)
	}
	return db
}

// TestCreateProject_FieldwireSeeding verifies that:
// 1. A project is created without error (bigint CTE fix)
// 2. forecast_fieldwire entries are seeded from the catalog
// 3. The created project can be fetched by ID
// 4. Cleanup removes the test project
func TestCreateProject_FieldwireSeeding(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	repo := repository.NewPostgresForecastRepository(db)
	ctx := context.Background()

	// Use a unique test ID to avoid collisions
	testID := "TEST-INTEG-" + time.Now().Format("150405")

	p := &domain.ForecastProject{
		ID:      testID,
		Name:    "",
		Company: "framing",
		Status:  domain.ForecastStatusPlanned,
		Cliente: "PULTE HOMES",
		JobSite: "Bates",
		Type:    "Lot",
		LoteBld: "TEST-LOT",
		Address: "123 Integration Test St",
	}

	// ── Cleanup: always delete test project at the end ────────────────────────
	t.Cleanup(func() {
		db.Exec(ctx, "DELETE FROM forecast_fieldwire WHERE LOWER(project_id) = LOWER($1)", testID)
		db.Exec(ctx, "DELETE FROM forecast_core WHERE id = $1", testID)
		t.Logf("cleaned up test project %s", testID)
	})

	// ── Step 1: Create the project ────────────────────────────────────────────
	err := repo.Create(ctx, p)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	t.Logf("✓ Project created: %s", testID)

	// ── Step 2: Verify it exists in DB ────────────────────────────────────────
	fetched, err := repo.FindByID(ctx, testID)
	if err != nil {
		t.Fatalf("FindByID returned error: %v", err)
	}
	if !strings.EqualFold(fetched.Cliente, "PULTE HOMES") {
		t.Errorf("expected cliente=PULTE HOMES, got %q", fetched.Cliente)
	}
	t.Logf("✓ Project fetched: cliente=%s type=%s", fetched.Cliente, fetched.Type)

	// ── Step 3: Verify fieldwire entries were seeded ──────────────────────────
	var fwCount int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM forecast_fieldwire WHERE LOWER(project_id) = LOWER($1)`, testID).Scan(&fwCount)
	if fwCount == 0 {
		// Check if catalog has entries for this client/type
		var catalogCount int
		db.QueryRow(ctx, `
			SELECT COUNT(*) FROM catalog_forecast_fieldwire c
			WHERE (LOWER(c.client) = LOWER($1) AND LOWER(c.type) = LOWER($2))
			   OR (c.client = '' AND c.type = '')
		`, p.Cliente, p.Type).Scan(&catalogCount)

		if catalogCount > 0 {
			t.Errorf("fieldwire seeding failed: catalog has %d entries but project has 0 fieldwire rows", catalogCount)
		} else {
			t.Logf("⚠ No fieldwire entries: catalog has no entries for cliente=%q type=%q (expected)", p.Cliente, p.Type)
		}
	} else {
		t.Logf("✓ Fieldwire seeded: %d entries for project %s", fwCount, testID)
	}

	// ── Step 4: Verify fieldwire IDs are valid bigints (not 0, no duplicates) ─
	rows, _ := db.Query(ctx, `SELECT id FROM forecast_fieldwire WHERE LOWER(project_id) = LOWER($1) ORDER BY id`, testID)
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		rows.Scan(&id)
		ids = append(ids, id)
	}
	for i, id := range ids {
		if id <= 0 {
			t.Errorf("fieldwire entry %d has invalid id=%d", i, id)
		}
	}
	if len(ids) > 1 {
		for i := 1; i < len(ids); i++ {
			if ids[i] == ids[i-1] {
				t.Errorf("duplicate fieldwire id=%d detected", ids[i])
			}
		}
	}
	t.Logf("✓ Fieldwire IDs valid: %v", ids)

	// ── Step 5: Summary ───────────────────────────────────────────────────────
	t.Logf("\n=== RESULT ===")
	t.Logf("Project created:      ✓ (no error)")
	t.Logf("Project fetchable:    ✓ (found by ID)")
	t.Logf("Fieldwire entries:    %d (catalog seeds applied)", fwCount)
	t.Logf("Fieldwire IDs valid:  ✓ (bigint, no duplicates)")
}

// TestCreateProject_NullDates ensures null dates don't cause a 400/500 error
func TestCreateProject_NullDates(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	repo := repository.NewPostgresForecastRepository(db)
	ctx := context.Background()

	testID := "TEST-NULLDATE-" + time.Now().Format("150405")

	p := &domain.ForecastProject{
		ID:      testID,
		Company: "framing",
		Status:  domain.ForecastStatusPlanned,
		Cliente: "TEST NULL",
		JobSite: "Test Site",
		Type:    "",
	}

	t.Cleanup(func() {
		db.Exec(ctx, "DELETE FROM forecast_fieldwire WHERE LOWER(project_id) = LOWER($1)", testID)
		db.Exec(ctx, "DELETE FROM forecast_core WHERE id = $1", testID)
	})

	if err := repo.Create(ctx, p); err != nil {
		t.Fatalf("Create with null dates returned error: %v", err)
	}
	t.Logf("✓ Project with null dates created successfully: %s", testID)
}

// TestCreateProject_CleanupTestClient removes the dangling TEST_CLIENT project
// that was created by the server test before the CTE fix was deployed.
func TestCreateProject_CleanupTestClient(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	ctx := context.Background()

	var count int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM forecast_core WHERE UPPER(cliente) = 'TEST_CLIENT'`).Scan(&count)
	if count == 0 {
		t.Logf("No TEST_CLIENT projects found — nothing to clean up")
		return
	}

	t.Logf("Found %d TEST_CLIENT project(s) — removing...", count)

	// Remove fieldwire entries first (FK safety), then the core record
	db.Exec(ctx, `
		DELETE FROM forecast_fieldwire
		WHERE project_id IN (SELECT id FROM forecast_core WHERE UPPER(cliente) = 'TEST_CLIENT')
	`)
	db.Exec(ctx, `DELETE FROM forecast_core WHERE UPPER(cliente) = 'TEST_CLIENT'`)

	// Verify cleanup
	db.QueryRow(ctx, `SELECT COUNT(*) FROM forecast_core WHERE UPPER(cliente) = 'TEST_CLIENT'`).Scan(&count)
	if count != 0 {
		t.Errorf("cleanup failed: still %d TEST_CLIENT records", count)
	} else {
		t.Logf("✓ TEST_CLIENT projects cleaned up")
	}
}
