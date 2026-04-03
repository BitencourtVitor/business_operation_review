package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DestaqueRepository interface {
	List(ctx context.Context, f domain.DestaqueFilters) ([]*domain.Destaque, error)
	FindByID(ctx context.Context, id string) (*domain.Destaque, error)
	Create(ctx context.Context, d *domain.Destaque) error
	Update(ctx context.Context, d *domain.Destaque) error
	Delete(ctx context.Context, id string) error
}

type PostgresDestaqueRepository struct{ db *pgxpool.Pool }

func NewPostgresDestaqueRepository(db *pgxpool.Pool) *PostgresDestaqueRepository {
	return &PostgresDestaqueRepository{db: db}
}

func (r *PostgresDestaqueRepository) List(ctx context.Context, f domain.DestaqueFilters) ([]*domain.Destaque, error) {
	rows, err := r.db.Query(ctx, `SELECT id, usuario_id, tela_id, mes, ano, criado_em FROM destaques
		WHERE ($1 = '' OR usuario_id = $1) AND ($2 = '' OR tela_id::text = $2) AND ($3 = 0 OR ano = $3)
		ORDER BY criado_em DESC`, f.UsuarioID, f.TelaID, f.Ano)
	if err != nil {
		return nil, fmt.Errorf("list destaques: %w", err)
	}
	defer rows.Close()
	var result []*domain.Destaque
	for rows.Next() {
		d := &domain.Destaque{}
		if err := rows.Scan(&d.ID, &d.UsuarioID, &d.TelaID, &d.Mes, &d.Ano, &d.CriadoEm); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, nil
}

func (r *PostgresDestaqueRepository) FindByID(ctx context.Context, id string) (*domain.Destaque, error) {
	d := &domain.Destaque{}
	err := r.db.QueryRow(ctx, `SELECT id, usuario_id, tela_id, mes, ano, criado_em FROM destaques WHERE id=$1`, id).
		Scan(&d.ID, &d.UsuarioID, &d.TelaID, &d.Mes, &d.Ano, &d.CriadoEm)
	if err != nil {
		return nil, fmt.Errorf("find destaque: %w", err)
	}
	return d, nil
}

func (r *PostgresDestaqueRepository) Create(ctx context.Context, d *domain.Destaque) error {
	d.ID = uuid.New().String()
	_, err := r.db.Exec(ctx, `INSERT INTO destaques (id, usuario_id, tela_id, mes, ano) VALUES ($1,$2,$3,$4,$5)`,
		d.ID, d.UsuarioID, d.TelaID, d.Mes, d.Ano)
	return err
}

func (r *PostgresDestaqueRepository) Update(ctx context.Context, d *domain.Destaque) error {
	_, err := r.db.Exec(ctx, `UPDATE destaques SET mes=$1, ano=$2 WHERE id=$3`, d.Mes, d.Ano, d.ID)
	return err
}

func (r *PostgresDestaqueRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM destaques WHERE id=$1`, id)
	return err
}

type OportunidadeRepository interface {
	List(ctx context.Context, f domain.OportunidadeFilters) ([]*domain.Oportunidade, error)
	FindByID(ctx context.Context, id string) (*domain.Oportunidade, error)
	Create(ctx context.Context, o *domain.Oportunidade) error
	Update(ctx context.Context, o *domain.Oportunidade) error
	Delete(ctx context.Context, id string) error
}

type PostgresOportunidadeRepository struct{ db *pgxpool.Pool }

func NewPostgresOportunidadeRepository(db *pgxpool.Pool) *PostgresOportunidadeRepository {
	return &PostgresOportunidadeRepository{db: db}
}

func (r *PostgresOportunidadeRepository) List(ctx context.Context, f domain.OportunidadeFilters) ([]*domain.Oportunidade, error) {
	rows, err := r.db.Query(ctx, `SELECT id, usuario_id, tela_id, mes, ano, titulo, criado_em FROM oportunidades
		WHERE ($1 = '' OR usuario_id = $1) AND ($2 = '' OR tela_id::text = $2) AND ($3 = 0 OR ano = $3)
		ORDER BY criado_em DESC`, f.UsuarioID, f.TelaID, f.Ano)
	if err != nil {
		return nil, fmt.Errorf("list oportunidades: %w", err)
	}
	defer rows.Close()
	var result []*domain.Oportunidade
	for rows.Next() {
		o := &domain.Oportunidade{}
		if err := rows.Scan(&o.ID, &o.UsuarioID, &o.TelaID, &o.Mes, &o.Ano, &o.Titulo, &o.CriadoEm); err != nil {
			return nil, err
		}
		result = append(result, o)
	}
	return result, nil
}

func (r *PostgresOportunidadeRepository) FindByID(ctx context.Context, id string) (*domain.Oportunidade, error) {
	o := &domain.Oportunidade{}
	err := r.db.QueryRow(ctx, `SELECT id, usuario_id, tela_id, mes, ano, titulo, criado_em FROM oportunidades WHERE id=$1`, id).
		Scan(&o.ID, &o.UsuarioID, &o.TelaID, &o.Mes, &o.Ano, &o.Titulo, &o.CriadoEm)
	if err != nil {
		return nil, fmt.Errorf("find oportunidade: %w", err)
	}
	return o, nil
}

func (r *PostgresOportunidadeRepository) Create(ctx context.Context, o *domain.Oportunidade) error {
	o.ID = uuid.New().String()
	_, err := r.db.Exec(ctx, `INSERT INTO oportunidades (id, usuario_id, tela_id, mes, ano, titulo) VALUES ($1,$2,$3,$4,$5,$6)`,
		o.ID, o.UsuarioID, o.TelaID, o.Mes, o.Ano, o.Titulo)
	return err
}

func (r *PostgresOportunidadeRepository) Update(ctx context.Context, o *domain.Oportunidade) error {
	_, err := r.db.Exec(ctx, `UPDATE oportunidades SET titulo=$1, mes=$2, ano=$3 WHERE id=$4`, o.Titulo, o.Mes, o.Ano, o.ID)
	return err
}

func (r *PostgresOportunidadeRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM oportunidades WHERE id=$1`, id)
	return err
}

type PlanoDeAcaoRepository interface {
	List(ctx context.Context, f domain.PlanoDeAcaoFilters) ([]*domain.PlanoDeAcao, error)
	FindByID(ctx context.Context, id string) (*domain.PlanoDeAcao, error)
	Create(ctx context.Context, p *domain.PlanoDeAcao) error
	Update(ctx context.Context, p *domain.PlanoDeAcao) error
	Delete(ctx context.Context, id string) error
}

type PostgresPlanoDeAcaoRepository struct{ db *pgxpool.Pool }

func NewPostgresPlanoDeAcaoRepository(db *pgxpool.Pool) *PostgresPlanoDeAcaoRepository {
	return &PostgresPlanoDeAcaoRepository{db: db}
}

func (r *PostgresPlanoDeAcaoRepository) List(ctx context.Context, f domain.PlanoDeAcaoFilters) ([]*domain.PlanoDeAcao, error) {
	rows, err := r.db.Query(ctx, `SELECT id, usuario_id, tela_id, titulo, descricao, data_inicio, data_fim, status, deletado, criado_em
		FROM planos_de_acao WHERE deletado = false
		AND ($1 = '' OR usuario_id = $1) AND ($2 = '' OR tela_id::text = $2) AND ($3 = '' OR status = $3)
		ORDER BY criado_em DESC`, f.UsuarioID, f.TelaID, f.Status)
	if err != nil {
		return nil, fmt.Errorf("list planos: %w", err)
	}
	defer rows.Close()
	var result []*domain.PlanoDeAcao
	for rows.Next() {
		p := &domain.PlanoDeAcao{}
		if err := rows.Scan(&p.ID, &p.UsuarioID, &p.TelaID, &p.Titulo, &p.Descricao,
			&p.DataInicio, &p.DataFim, &p.Status, &p.Deletado, &p.CriadoEm); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, nil
}

func (r *PostgresPlanoDeAcaoRepository) FindByID(ctx context.Context, id string) (*domain.PlanoDeAcao, error) {
	p := &domain.PlanoDeAcao{}
	err := r.db.QueryRow(ctx, `SELECT id, usuario_id, tela_id, titulo, descricao, data_inicio, data_fim, status, deletado, criado_em
		FROM planos_de_acao WHERE id=$1`, id).
		Scan(&p.ID, &p.UsuarioID, &p.TelaID, &p.Titulo, &p.Descricao, &p.DataInicio, &p.DataFim, &p.Status, &p.Deletado, &p.CriadoEm)
	if err != nil {
		return nil, fmt.Errorf("find plano: %w", err)
	}
	return p, nil
}

func (r *PostgresPlanoDeAcaoRepository) Create(ctx context.Context, p *domain.PlanoDeAcao) error {
	p.ID = uuid.New().String()
	_, err := r.db.Exec(ctx, `INSERT INTO planos_de_acao (id, usuario_id, tela_id, titulo, descricao, data_inicio, data_fim, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		p.ID, p.UsuarioID, p.TelaID, p.Titulo, p.Descricao, p.DataInicio, p.DataFim, p.Status)
	return err
}

func (r *PostgresPlanoDeAcaoRepository) Update(ctx context.Context, p *domain.PlanoDeAcao) error {
	_, err := r.db.Exec(ctx, `UPDATE planos_de_acao SET titulo=$1, descricao=$2, data_inicio=$3, data_fim=$4, status=$5 WHERE id=$6`,
		p.Titulo, p.Descricao, p.DataInicio, p.DataFim, p.Status, p.ID)
	return err
}

func (r *PostgresPlanoDeAcaoRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE planos_de_acao SET deletado=true WHERE id=$1`, id)
	return err
}
