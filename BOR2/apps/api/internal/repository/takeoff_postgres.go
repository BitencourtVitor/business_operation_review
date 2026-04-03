package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TakeoffWorkRepository interface {
	List(ctx context.Context, filters domain.TakeoffWorkFilters) ([]*domain.TakeoffWork, error)
	FindByID(ctx context.Context, id string) (*domain.TakeoffWork, error)
	Create(ctx context.Context, r *domain.TakeoffWork) error
	Update(ctx context.Context, r *domain.TakeoffWork) error
	Delete(ctx context.Context, id string) error
}

type PostgresTakeoffWorkRepository struct {
	db *pgxpool.Pool
}

func NewPostgresTakeoffWorkRepository(db *pgxpool.Pool) *PostgresTakeoffWorkRepository {
	return &PostgresTakeoffWorkRepository{db: db}
}

func (r *PostgresTakeoffWorkRepository) List(ctx context.Context, f domain.TakeoffWorkFilters) ([]*domain.TakeoffWork, error) {
	query := `
		SELECT id, project, data_solicitacao, data_inicio, data_estimada_entrega,
		       entrega_real, description, doc_links, modelo_da_casa,
		       stage_dwg, stage_mitek3d, stage_materials_list, stage_panel_division,
		       stage_validation, stage_cut_list, stage_production,
		       stage_delivery, stage_assembly, created_at
		FROM takeoff_works
		WHERE ($1 = '' OR project ILIKE '%' || $1 || '%')
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, f.Project)
	if err != nil {
		return nil, fmt.Errorf("list takeoff_works: %w", err)
	}
	defer rows.Close()

	var records []*domain.TakeoffWork
	for rows.Next() {
		rec := &domain.TakeoffWork{}
		if err := rows.Scan(
			&rec.ID, &rec.Project, &rec.DataSolicitacao, &rec.DataInicio, &rec.DataEstimadaEntrega,
			&rec.EntregaReal, &rec.Description, &rec.DocLinks, &rec.ModeloDaCasa,
			&rec.StageDwg, &rec.StageMitek3d, &rec.StageMaterialsList, &rec.StagePanelDivision,
			&rec.StageValidation, &rec.StageCutList, &rec.StageProduction,
			&rec.StageDelivery, &rec.StageAssembly, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan takeoff_works: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresTakeoffWorkRepository) FindByID(ctx context.Context, id string) (*domain.TakeoffWork, error) {
	rec := &domain.TakeoffWork{}
	err := r.db.QueryRow(ctx, `
		SELECT id, project, data_solicitacao, data_inicio, data_estimada_entrega,
		       entrega_real, description, doc_links, modelo_da_casa,
		       stage_dwg, stage_mitek3d, stage_materials_list, stage_panel_division,
		       stage_validation, stage_cut_list, stage_production,
		       stage_delivery, stage_assembly, created_at
		FROM takeoff_works WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.Project, &rec.DataSolicitacao, &rec.DataInicio, &rec.DataEstimadaEntrega,
		&rec.EntregaReal, &rec.Description, &rec.DocLinks, &rec.ModeloDaCasa,
		&rec.StageDwg, &rec.StageMitek3d, &rec.StageMaterialsList, &rec.StagePanelDivision,
		&rec.StageValidation, &rec.StageCutList, &rec.StageProduction,
		&rec.StageDelivery, &rec.StageAssembly, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find takeoff_works: %w", err)
	}
	return rec, nil
}

func (r *PostgresTakeoffWorkRepository) Create(ctx context.Context, rec *domain.TakeoffWork) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO takeoff_works
		  (id, project, data_solicitacao, data_inicio, data_estimada_entrega,
		   entrega_real, description, doc_links, modelo_da_casa,
		   stage_dwg, stage_mitek3d, stage_materials_list, stage_panel_division,
		   stage_validation, stage_cut_list, stage_production,
		   stage_delivery, stage_assembly, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	`, rec.ID, rec.Project, rec.DataSolicitacao, rec.DataInicio, rec.DataEstimadaEntrega,
		rec.EntregaReal, rec.Description, rec.DocLinks, rec.ModeloDaCasa,
		rec.StageDwg, rec.StageMitek3d, rec.StageMaterialsList, rec.StagePanelDivision,
		rec.StageValidation, rec.StageCutList, rec.StageProduction,
		rec.StageDelivery, rec.StageAssembly, rec.CreatedAt)
	return err
}

func (r *PostgresTakeoffWorkRepository) Update(ctx context.Context, rec *domain.TakeoffWork) error {
	_, err := r.db.Exec(ctx, `
		UPDATE takeoff_works
		SET project=$1, data_solicitacao=$2, data_inicio=$3, data_estimada_entrega=$4,
		    entrega_real=$5, description=$6, doc_links=$7, modelo_da_casa=$8,
		    stage_dwg=$9, stage_mitek3d=$10, stage_materials_list=$11, stage_panel_division=$12,
		    stage_validation=$13, stage_cut_list=$14, stage_production=$15,
		    stage_delivery=$16, stage_assembly=$17
		WHERE id=$18
	`, rec.Project, rec.DataSolicitacao, rec.DataInicio, rec.DataEstimadaEntrega,
		rec.EntregaReal, rec.Description, rec.DocLinks, rec.ModeloDaCasa,
		rec.StageDwg, rec.StageMitek3d, rec.StageMaterialsList, rec.StagePanelDivision,
		rec.StageValidation, rec.StageCutList, rec.StageProduction,
		rec.StageDelivery, rec.StageAssembly, rec.ID)
	return err
}

func (r *PostgresTakeoffWorkRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM takeoff_works WHERE id=$1", id)
	return err
}
