package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WexCategorizationRepository defines operations for wex_normalization, wex_reports,
// and wex_ignored_addresses.
type WexCategorizationRepository interface {
	// Normalization
	ListNorm(ctx context.Context, company string) ([]*domain.WexNormEntry, error)
	UpsertNorm(ctx context.Context, in *domain.WexNormInput) (*domain.WexNormEntry, error)
	UpdateNorm(ctx context.Context, id int64, in *domain.WexNormInput) (*domain.WexNormEntry, error)
	DeleteNorm(ctx context.Context, id int64) error

	// Reports
	ListReports(ctx context.Context, company string) ([]*domain.WexReport, error)
	GetReport(ctx context.Context, id string) (*domain.WexReport, error)
	CreateReport(ctx context.Context, in *domain.WexReportInput) (*domain.WexReport, error)
	PatchReport(ctx context.Context, id string, in *domain.WexReportPatchInput) (*domain.WexReport, error)
	DeleteReport(ctx context.Context, id string) error

	// Ignored addresses
	ListIgnoredAddresses(ctx context.Context, company string) ([]*domain.WexIgnoredAddress, error)
	UpsertIgnoredAddress(ctx context.Context, in *domain.WexIgnoredAddressInput) (*domain.WexIgnoredAddress, error)
	DeleteIgnoredAddress(ctx context.Context, id int64) error
}

type PostgresWexCategorizationRepository struct {
	db *pgxpool.Pool
}

func NewPostgresWexCategorizationRepository(db *pgxpool.Pool) *PostgresWexCategorizationRepository {
	return &PostgresWexCategorizationRepository{db: db}
}

// ─── Normalization ────────────────────────────────────────────────────────────

func (r *PostgresWexCategorizationRepository) ListNorm(ctx context.Context, company string) ([]*domain.WexNormEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, driver_id, wex_name, qb_name, is_active, created_at, updated_at
		FROM wex_normalization
		WHERE company = $1
		ORDER BY driver_id ASC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list wex_normalization: %w", err)
	}
	defer rows.Close()

	var entries []*domain.WexNormEntry
	for rows.Next() {
		e := &domain.WexNormEntry{}
		if err := rows.Scan(&e.ID, &e.Company, &e.DriverID, &e.WexName, &e.QbName, &e.IsActive, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan wex_normalization: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *PostgresWexCategorizationRepository) UpsertNorm(ctx context.Context, in *domain.WexNormInput) (*domain.WexNormEntry, error) {
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	e := &domain.WexNormEntry{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO wex_normalization (company, driver_id, wex_name, qb_name, is_active)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (company, driver_id) DO UPDATE
		  SET wex_name  = EXCLUDED.wex_name,
		      qb_name   = EXCLUDED.qb_name,
		      is_active = EXCLUDED.is_active,
		      updated_at = NOW()
		RETURNING id, company, driver_id, wex_name, qb_name, is_active, created_at, updated_at
	`, in.Company, in.DriverID, in.WexName, in.QbName, isActive).Scan(
		&e.ID, &e.Company, &e.DriverID, &e.WexName, &e.QbName, &e.IsActive, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert wex_normalization: %w", err)
	}
	return e, nil
}

func (r *PostgresWexCategorizationRepository) UpdateNorm(ctx context.Context, id int64, in *domain.WexNormInput) (*domain.WexNormEntry, error) {
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	e := &domain.WexNormEntry{}
	err := r.db.QueryRow(ctx, `
		UPDATE wex_normalization
		SET wex_name = $1, qb_name = $2, is_active = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING id, company, driver_id, wex_name, qb_name, is_active, created_at, updated_at
	`, in.WexName, in.QbName, isActive, id).Scan(
		&e.ID, &e.Company, &e.DriverID, &e.WexName, &e.QbName, &e.IsActive, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update wex_normalization: %w", err)
	}
	return e, nil
}

func (r *PostgresWexCategorizationRepository) DeleteNorm(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, "DELETE FROM wex_normalization WHERE id=$1", id)
	return err
}

// ─── Reports ──────────────────────────────────────────────────────────────────

func (r *PostgresWexCategorizationRepository) ListReports(ctx context.Context, company string) ([]*domain.WexReport, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, filter_from, filter_to, meta, created_at
		FROM wex_reports
		WHERE company = $1
		ORDER BY created_at DESC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list wex_reports: %w", err)
	}
	defer rows.Close()

	var reports []*domain.WexReport
	for rows.Next() {
		rep := &domain.WexReport{}
		var metaBytes []byte
		if err := rows.Scan(&rep.ID, &rep.Company, &rep.FilterFrom, &rep.FilterTo, &metaBytes, &rep.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan wex_reports: %w", err)
		}
		if err := json.Unmarshal(metaBytes, &rep.Meta); err != nil {
			return nil, fmt.Errorf("unmarshal wex_reports meta: %w", err)
		}
		reports = append(reports, rep)
	}
	return reports, nil
}

func (r *PostgresWexCategorizationRepository) GetReport(ctx context.Context, id string) (*domain.WexReport, error) {
	rep := &domain.WexReport{}
	var metaBytes []byte
	err := r.db.QueryRow(ctx, `
		SELECT id, company, filter_from, filter_to, meta, results, created_at
		FROM wex_reports WHERE id=$1
	`, id).Scan(&rep.ID, &rep.Company, &rep.FilterFrom, &rep.FilterTo, &metaBytes, &rep.Results, &rep.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get wex_report: %w", err)
	}
	if err := json.Unmarshal(metaBytes, &rep.Meta); err != nil {
		return nil, fmt.Errorf("unmarshal wex_report meta: %w", err)
	}
	return rep, nil
}

func (r *PostgresWexCategorizationRepository) CreateReport(ctx context.Context, in *domain.WexReportInput) (*domain.WexReport, error) {
	metaBytes, err := json.Marshal(in.Meta)
	if err != nil {
		return nil, fmt.Errorf("marshal wex_report meta: %w", err)
	}

	results := in.Results
	if results == nil {
		results = json.RawMessage("[]")
	}

	rep := &domain.WexReport{}
	var metaBytesOut []byte
	err = r.db.QueryRow(ctx, `
		INSERT INTO wex_reports (company, filter_from, filter_to, meta, results)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, company, filter_from, filter_to, meta, created_at
	`, in.Company, in.FilterFrom, in.FilterTo, metaBytes, results).Scan(
		&rep.ID, &rep.Company, &rep.FilterFrom, &rep.FilterTo, &metaBytesOut, &rep.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create wex_report: %w", err)
	}
	if err := json.Unmarshal(metaBytesOut, &rep.Meta); err != nil {
		return nil, fmt.Errorf("unmarshal created wex_report meta: %w", err)
	}
	return rep, nil
}

func (r *PostgresWexCategorizationRepository) PatchReport(ctx context.Context, id string, in *domain.WexReportPatchInput) (*domain.WexReport, error) {
	rep := &domain.WexReport{}
	var metaBytes []byte
	err := r.db.QueryRow(ctx, `
		UPDATE wex_reports SET company=$1 WHERE id=$2
		RETURNING id, company, filter_from, filter_to, meta, created_at
	`, in.Company, id).Scan(&rep.ID, &rep.Company, &rep.FilterFrom, &rep.FilterTo, &metaBytes, &rep.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("patch wex_report: %w", err)
	}
	if err := json.Unmarshal(metaBytes, &rep.Meta); err != nil {
		return nil, fmt.Errorf("unmarshal wex_report meta: %w", err)
	}
	return rep, nil
}

func (r *PostgresWexCategorizationRepository) DeleteReport(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM wex_reports WHERE id=$1", id)
	return err
}

// ─── Ignored addresses ────────────────────────────────────────────────────────

func (r *PostgresWexCategorizationRepository) ListIgnoredAddresses(ctx context.Context, company string) ([]*domain.WexIgnoredAddress, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, address, note, is_active, created_at, updated_at
		FROM wex_ignored_addresses
		WHERE company = $1
		ORDER BY address ASC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list wex_ignored_addresses: %w", err)
	}
	defer rows.Close()

	var entries []*domain.WexIgnoredAddress
	for rows.Next() {
		e := &domain.WexIgnoredAddress{}
		if err := rows.Scan(&e.ID, &e.Company, &e.Address, &e.Note, &e.IsActive, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan wex_ignored_addresses: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *PostgresWexCategorizationRepository) UpsertIgnoredAddress(ctx context.Context, in *domain.WexIgnoredAddressInput) (*domain.WexIgnoredAddress, error) {
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	e := &domain.WexIgnoredAddress{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO wex_ignored_addresses (company, address, note, is_active)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (company, address) DO UPDATE
		  SET note      = EXCLUDED.note,
		      is_active = EXCLUDED.is_active,
		      updated_at = NOW()
		RETURNING id, company, address, note, is_active, created_at, updated_at
	`, in.Company, in.Address, in.Note, isActive).Scan(
		&e.ID, &e.Company, &e.Address, &e.Note, &e.IsActive, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert wex_ignored_address: %w", err)
	}
	return e, nil
}

func (r *PostgresWexCategorizationRepository) DeleteIgnoredAddress(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, "DELETE FROM wex_ignored_addresses WHERE id=$1", id)
	return err
}
