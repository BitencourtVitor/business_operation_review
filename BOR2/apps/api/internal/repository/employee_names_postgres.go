package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EmployeeNameRepository interface {
	List(ctx context.Context, filters domain.EmployeeNameFilters) ([]*domain.EmployeeName, error)
	FindByID(ctx context.Context, id string) (*domain.EmployeeName, error)
	Create(ctx context.Context, r *domain.EmployeeName) error
	Update(ctx context.Context, r *domain.EmployeeName) error
	Delete(ctx context.Context, id string) error
}

type PostgresEmployeeNameRepository struct {
	db *pgxpool.Pool
}

func NewPostgresEmployeeNameRepository(db *pgxpool.Pool) *PostgresEmployeeNameRepository {
	return &PostgresEmployeeNameRepository{db: db}
}

func (r *PostgresEmployeeNameRepository) List(ctx context.Context, f domain.EmployeeNameFilters) ([]*domain.EmployeeName, error) {
	query := `
		SELECT id, wex_name, samsara_name, normalized_name, is_active,
		       vehicle_model, vehicle_min_consumption, vehicle_max_consumption, created_at
		FROM employee_names
		WHERE ($1 = '' OR normalized_name ILIKE '%' || $1 || '%')
		  AND ($2::boolean IS NULL OR is_active = $2)
		ORDER BY normalized_name ASC
	`
	rows, err := r.db.Query(ctx, query, f.NormalizedName, f.IsActive)
	if err != nil {
		return nil, fmt.Errorf("list employee_names: %w", err)
	}
	defer rows.Close()

	var records []*domain.EmployeeName
	for rows.Next() {
		rec := &domain.EmployeeName{}
		if err := rows.Scan(
			&rec.ID, &rec.WexName, &rec.SamsaraName, &rec.NormalizedName, &rec.IsActive,
			&rec.VehicleModel, &rec.VehicleMinConsumption, &rec.VehicleMaxConsumption, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan employee_names: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresEmployeeNameRepository) FindByID(ctx context.Context, id string) (*domain.EmployeeName, error) {
	rec := &domain.EmployeeName{}
	err := r.db.QueryRow(ctx, `
		SELECT id, wex_name, samsara_name, normalized_name, is_active,
		       vehicle_model, vehicle_min_consumption, vehicle_max_consumption, created_at
		FROM employee_names WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.WexName, &rec.SamsaraName, &rec.NormalizedName, &rec.IsActive,
		&rec.VehicleModel, &rec.VehicleMinConsumption, &rec.VehicleMaxConsumption, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find employee_names: %w", err)
	}
	return rec, nil
}

func (r *PostgresEmployeeNameRepository) Create(ctx context.Context, rec *domain.EmployeeName) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO employee_names
		  (id, wex_name, samsara_name, normalized_name, is_active,
		   vehicle_model, vehicle_min_consumption, vehicle_max_consumption, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, rec.ID, rec.WexName, rec.SamsaraName, rec.NormalizedName, rec.IsActive,
		rec.VehicleModel, rec.VehicleMinConsumption, rec.VehicleMaxConsumption, rec.CreatedAt)
	return err
}

func (r *PostgresEmployeeNameRepository) Update(ctx context.Context, rec *domain.EmployeeName) error {
	_, err := r.db.Exec(ctx, `
		UPDATE employee_names
		SET wex_name=$1, samsara_name=$2, normalized_name=$3, is_active=$4,
		    vehicle_model=$5, vehicle_min_consumption=$6, vehicle_max_consumption=$7
		WHERE id=$8
	`, rec.WexName, rec.SamsaraName, rec.NormalizedName, rec.IsActive,
		rec.VehicleModel, rec.VehicleMinConsumption, rec.VehicleMaxConsumption, rec.ID)
	return err
}

func (r *PostgresEmployeeNameRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM employee_names WHERE id=$1", id)
	return err
}
