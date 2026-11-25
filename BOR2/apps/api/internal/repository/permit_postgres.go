package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PermitRowRepository interface {
	List(ctx context.Context, filters domain.PermitRowFilters) ([]*domain.PermitRow, error)
	FindByID(ctx context.Context, id string) (*domain.PermitRow, error)
	Create(ctx context.Context, r *domain.PermitRow) error
	Update(ctx context.Context, r *domain.PermitRow) error
	Delete(ctx context.Context, id string) error
	LinkProject(ctx context.Context, projectID string, permitID *string) error
}

type PostgresPermitRowRepository struct {
	db *pgxpool.Pool
}

func NewPostgresPermitRowRepository(db *pgxpool.Pool) *PostgresPermitRowRepository {
	return &PostgresPermitRowRepository{db: db}
}

func (r *PostgresPermitRowRepository) List(ctx context.Context, f domain.PermitRowFilters) ([]*domain.PermitRow, error) {
	query := `
		SELECT id, client, jobsite, lot_address, situacao,
		       solicitacao, aplicacao, emissao, observacao, arquivo, created_at, project_id
		FROM permit_control
		WHERE ($1 = '' OR jobsite ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR situacao = $2)
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, f.Jobsite, f.Situacao)
	if err != nil {
		return nil, fmt.Errorf("list permit_control: %w", err)
	}
	defer rows.Close()

	var records []*domain.PermitRow
	for rows.Next() {
		rec := &domain.PermitRow{}
		if err := rows.Scan(
			&rec.ID, &rec.Client, &rec.Jobsite, &rec.LotAddress, &rec.Situacao,
			&rec.Solicitacao, &rec.Aplicacao, &rec.Emissao, &rec.Observacao,
			&rec.Arquivo, &rec.CreatedAt, &rec.ProjectID,
		); err != nil {
			return nil, fmt.Errorf("scan permit_control: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresPermitRowRepository) FindByID(ctx context.Context, id string) (*domain.PermitRow, error) {
	rec := &domain.PermitRow{}
	err := r.db.QueryRow(ctx, `
		SELECT id, client, jobsite, lot_address, situacao,
		       solicitacao, aplicacao, emissao, observacao, arquivo, created_at, project_id
		FROM permit_control WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.Client, &rec.Jobsite, &rec.LotAddress, &rec.Situacao,
		&rec.Solicitacao, &rec.Aplicacao, &rec.Emissao, &rec.Observacao,
		&rec.Arquivo, &rec.CreatedAt, &rec.ProjectID,
	)
	if err != nil {
		return nil, fmt.Errorf("find permit_control: %w", err)
	}
	return rec, nil
}

func (r *PostgresPermitRowRepository) Create(ctx context.Context, rec *domain.PermitRow) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO permit_control
		  (id, client, jobsite, lot_address, situacao,
		   solicitacao, aplicacao, emissao, observacao, arquivo, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, rec.ID, rec.Client, rec.Jobsite, rec.LotAddress, rec.Situacao,
		rec.Solicitacao, rec.Aplicacao, rec.Emissao, rec.Observacao,
		rec.Arquivo, rec.CreatedAt)
	return err
}

func (r *PostgresPermitRowRepository) Update(ctx context.Context, rec *domain.PermitRow) error {
	_, err := r.db.Exec(ctx, `
		UPDATE permit_control
		SET client=$1, jobsite=$2, lot_address=$3, situacao=$4,
		    solicitacao=$5, aplicacao=$6, emissao=$7, observacao=$8, arquivo=$9
		WHERE id=$10
	`, rec.Client, rec.Jobsite, rec.LotAddress, rec.Situacao,
		rec.Solicitacao, rec.Aplicacao, rec.Emissao, rec.Observacao,
		rec.Arquivo, rec.ID)
	return err
}

func (r *PostgresPermitRowRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM permit_control WHERE id=$1", id)
	return err
}

// LinkProject vincula a obra a uma linha (ou a nenhuma, com permitID nil). A obra
// larga o vínculo anterior; a linha já vinculada a outra obra esbarra no UNIQUE.
func (r *PostgresPermitRowRepository) LinkProject(ctx context.Context, projectID string, permitID *string) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "UPDATE permit_control SET project_id = NULL WHERE project_id = $1", projectID); err != nil {
			return err
		}
		if permitID == nil {
			return nil
		}
		tag, err := tx.Exec(ctx, "UPDATE permit_control SET project_id = $1 WHERE id = $2", projectID, *permitID)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return domain.ErrConflict
			}
			return err
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrNotFound
		}
		return nil
	})
}
