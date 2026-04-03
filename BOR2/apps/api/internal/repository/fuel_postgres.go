package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SamsaraRepository interface {
	List(ctx context.Context, filters domain.FuelFilters) ([]*domain.SamsaraEvent, error)
	Upsert(ctx context.Context, event *domain.SamsaraEvent) error
}

type WexRepository interface {
	List(ctx context.Context, filters domain.FuelFilters) ([]*domain.WexTransaction, error)
	Upsert(ctx context.Context, tx *domain.WexTransaction) error
}

type PostgresSamsaraRepository struct{ db *pgxpool.Pool }
type PostgresWexRepository struct{ db *pgxpool.Pool }

func NewPostgresSamsaraRepository(db *pgxpool.Pool) *PostgresSamsaraRepository {
	return &PostgresSamsaraRepository{db: db}
}

func NewPostgresWexRepository(db *pgxpool.Pool) *PostgresWexRepository {
	return &PostgresWexRepository{db: db}
}

func (r *PostgresSamsaraRepository) List(ctx context.Context, f domain.FuelFilters) ([]*domain.SamsaraEvent, error) {
	query := `
		SELECT id, event_key, event_date, driver_name, location, distance, units, type, created_at
		FROM samsara_events
		WHERE ($1 = '' OR driver_name ILIKE '%' || $1 || '%')
		  AND ($2::timestamptz IS NULL OR event_date >= $2)
		  AND ($3::timestamptz IS NULL OR event_date <= $3)
		ORDER BY event_date DESC
	`
	rows, err := r.db.Query(ctx, query, f.DriverName, f.StartDate, f.EndDate)
	if err != nil {
		return nil, fmt.Errorf("list samsara: %w", err)
	}
	defer rows.Close()

	var events []*domain.SamsaraEvent
	for rows.Next() {
		e := &domain.SamsaraEvent{}
		if err := rows.Scan(&e.ID, &e.EventKey, &e.EventDate, &e.DriverName,
			&e.Location, &e.Distance, &e.Units, &e.Type, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan samsara: %w", err)
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *PostgresSamsaraRepository) Upsert(ctx context.Context, e *domain.SamsaraEvent) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO samsara_events (id, event_key, event_date, driver_name, location, distance, units, type, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (event_key) DO UPDATE
		SET event_date=EXCLUDED.event_date, driver_name=EXCLUDED.driver_name,
		    location=EXCLUDED.location, distance=EXCLUDED.distance
	`, e.ID, e.EventKey, e.EventDate, e.DriverName, e.Location, e.Distance, e.Units, e.Type, e.CreatedAt)
	return err
}

func (r *PostgresWexRepository) List(ctx context.Context, f domain.FuelFilters) ([]*domain.WexTransaction, error) {
	query := `
		SELECT id, transaction_key, transaction_date, driver_name, units, total_fuel_cost, merchant_city, created_at
		FROM wex_transactions
		WHERE ($1 = '' OR driver_name ILIKE '%' || $1 || '%')
		  AND ($2::timestamptz IS NULL OR transaction_date >= $2)
		  AND ($3::timestamptz IS NULL OR transaction_date <= $3)
		ORDER BY transaction_date DESC
	`
	rows, err := r.db.Query(ctx, query, f.DriverName, f.StartDate, f.EndDate)
	if err != nil {
		return nil, fmt.Errorf("list wex: %w", err)
	}
	defer rows.Close()

	var txs []*domain.WexTransaction
	for rows.Next() {
		t := &domain.WexTransaction{}
		if err := rows.Scan(&t.ID, &t.TransactionKey, &t.TransactionDate,
			&t.DriverName, &t.Units, &t.TotalFuelCost, &t.MerchantCity, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan wex: %w", err)
		}
		txs = append(txs, t)
	}
	return txs, nil
}

func (r *PostgresWexRepository) Upsert(ctx context.Context, t *domain.WexTransaction) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO wex_transactions (id, transaction_key, transaction_date, driver_name, units, total_fuel_cost, merchant_city, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (transaction_key) DO UPDATE
		SET units=EXCLUDED.units, total_fuel_cost=EXCLUDED.total_fuel_cost
	`, t.ID, t.TransactionKey, t.TransactionDate, t.DriverName, t.Units, t.TotalFuelCost, t.MerchantCity, t.CreatedAt)
	return err
}
