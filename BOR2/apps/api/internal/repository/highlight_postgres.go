package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Destaque ──────────────────────────────────────────────────────────────────

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
	rows, err := r.db.Query(ctx, `
		SELECT d.id, d.usuario_id, d.tela_id, d.mes, d.ano, d.criado_em, d.updated_at,
		       COALESCE(d.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM destaques d
		LEFT JOIN users u1 ON d.usuario_id = u1.id
		LEFT JOIN users u2 ON d.updated_by_id = u2.id
		WHERE ($1 = '' OR d.usuario_id = $1)
		  AND ($2 = '' OR d.tela_id::text = $2)
		  AND ($3 = 0 OR d.ano = $3)
		  AND ($4 = 0 OR d.mes = $4)
		ORDER BY d.ano DESC, d.mes DESC`, f.UsuarioID, f.TelaID, f.Ano, f.Mes)
	if err != nil {
		return nil, fmt.Errorf("list destaques: %w", err)
	}
	defer rows.Close()

	index := map[string]*domain.Destaque{}
	var result []*domain.Destaque
	for rows.Next() {
		d := &domain.Destaque{}
		if err := rows.Scan(&d.ID, &d.UsuarioID, &d.TelaID, &d.Mes, &d.Ano, &d.CriadoEm, &d.UpdatedAt,
			&d.UpdatedByID, &d.CriadoPorNome, &d.EditadoPorNome); err != nil {
			return nil, err
		}
		d.Positivos = []domain.DestaqueItem{}
		d.Negativos = []domain.DestaqueItem{}
		index[d.ID] = d
		result = append(result, d)
	}
	if len(result) == 0 {
		return result, nil
	}

	ids := make([]string, 0, len(result))
	for _, d := range result {
		ids = append(ids, d.ID)
	}

	posRows, err := r.db.Query(ctx, `SELECT id, destaque_id, texto FROM destaques_positivos WHERE destaque_id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("list positivos: %w", err)
	}
	defer posRows.Close()
	for posRows.Next() {
		var item domain.DestaqueItem
		if err := posRows.Scan(&item.ID, &item.DestaqueID, &item.Texto); err != nil {
			return nil, err
		}
		if d, ok := index[item.DestaqueID]; ok {
			d.Positivos = append(d.Positivos, item)
		}
	}

	negRows, err := r.db.Query(ctx, `SELECT id, destaque_id, texto FROM destaques_negativos WHERE destaque_id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("list negativos: %w", err)
	}
	defer negRows.Close()
	for negRows.Next() {
		var item domain.DestaqueItem
		if err := negRows.Scan(&item.ID, &item.DestaqueID, &item.Texto); err != nil {
			return nil, err
		}
		if d, ok := index[item.DestaqueID]; ok {
			d.Negativos = append(d.Negativos, item)
		}
	}

	return result, nil
}

func (r *PostgresDestaqueRepository) FindByID(ctx context.Context, id string) (*domain.Destaque, error) {
	d := &domain.Destaque{}
	err := r.db.QueryRow(ctx, `
		SELECT d.id, d.usuario_id, d.tela_id, d.mes, d.ano, d.criado_em, d.updated_at,
		       COALESCE(d.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM destaques d
		LEFT JOIN users u1 ON d.usuario_id = u1.id
		LEFT JOIN users u2 ON d.updated_by_id = u2.id
		WHERE d.id=$1`, id).
		Scan(&d.ID, &d.UsuarioID, &d.TelaID, &d.Mes, &d.Ano, &d.CriadoEm, &d.UpdatedAt,
			&d.UpdatedByID, &d.CriadoPorNome, &d.EditadoPorNome)
	if err != nil {
		return nil, fmt.Errorf("find destaque: %w", err)
	}
	d.Positivos = []domain.DestaqueItem{}
	d.Negativos = []domain.DestaqueItem{}

	posRows, _ := r.db.Query(ctx, `SELECT id, destaque_id, texto FROM destaques_positivos WHERE destaque_id=$1`, id)
	defer posRows.Close()
	for posRows.Next() {
		var item domain.DestaqueItem
		posRows.Scan(&item.ID, &item.DestaqueID, &item.Texto)
		d.Positivos = append(d.Positivos, item)
	}

	negRows, _ := r.db.Query(ctx, `SELECT id, destaque_id, texto FROM destaques_negativos WHERE destaque_id=$1`, id)
	defer negRows.Close()
	for negRows.Next() {
		var item domain.DestaqueItem
		negRows.Scan(&item.ID, &item.DestaqueID, &item.Texto)
		d.Negativos = append(d.Negativos, item)
	}

	return d, nil
}

func (r *PostgresDestaqueRepository) Create(ctx context.Context, d *domain.Destaque) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	d.ID = uuid.New().String()
	_, err = tx.Exec(ctx, `INSERT INTO destaques (id, usuario_id, tela_id, mes, ano, updated_by_id) VALUES ($1,$2,$3,$4,$5,$6)`,
		d.ID, d.UsuarioID, d.TelaID, d.Mes, d.Ano, d.UpdatedByID)
	if err != nil {
		return err
	}

	for i := range d.Positivos {
		d.Positivos[i].ID = uuid.New().String()
		d.Positivos[i].DestaqueID = d.ID
		_, err = tx.Exec(ctx, `INSERT INTO destaques_positivos (id, destaque_id, texto) VALUES ($1,$2,$3)`,
			d.Positivos[i].ID, d.ID, d.Positivos[i].Texto)
		if err != nil {
			return err
		}
	}
	for i := range d.Negativos {
		d.Negativos[i].ID = uuid.New().String()
		d.Negativos[i].DestaqueID = d.ID
		_, err = tx.Exec(ctx, `INSERT INTO destaques_negativos (id, destaque_id, texto) VALUES ($1,$2,$3)`,
			d.Negativos[i].ID, d.ID, d.Negativos[i].Texto)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresDestaqueRepository) Update(ctx context.Context, d *domain.Destaque) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE destaques SET mes=$1, ano=$2, updated_at=NOW(), updated_by_id=$3 WHERE id=$4`,
		d.Mes, d.Ano, d.UpdatedByID, d.ID)
	if err != nil {
		return err
	}

	tx.Exec(ctx, `DELETE FROM destaques_positivos WHERE destaque_id=$1`, d.ID)
	tx.Exec(ctx, `DELETE FROM destaques_negativos WHERE destaque_id=$1`, d.ID)

	for i := range d.Positivos {
		d.Positivos[i].ID = uuid.New().String()
		d.Positivos[i].DestaqueID = d.ID
		_, err = tx.Exec(ctx, `INSERT INTO destaques_positivos (id, destaque_id, texto) VALUES ($1,$2,$3)`,
			d.Positivos[i].ID, d.ID, d.Positivos[i].Texto)
		if err != nil {
			return err
		}
	}
	for i := range d.Negativos {
		d.Negativos[i].ID = uuid.New().String()
		d.Negativos[i].DestaqueID = d.ID
		_, err = tx.Exec(ctx, `INSERT INTO destaques_negativos (id, destaque_id, texto) VALUES ($1,$2,$3)`,
			d.Negativos[i].ID, d.ID, d.Negativos[i].Texto)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresDestaqueRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM destaques WHERE id=$1`, id)
	return err
}

// ── Oportunidade ──────────────────────────────────────────────────────────────

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
	rows, err := r.db.Query(ctx, `
		SELECT o.id, o.usuario_id, o.tela_id, o.mes, o.ano, o.titulo, o.criado_em, o.updated_at,
		       COALESCE(o.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM oportunidades o
		LEFT JOIN users u1 ON o.usuario_id = u1.id
		LEFT JOIN users u2 ON o.updated_by_id = u2.id
		WHERE ($1 = '' OR o.usuario_id = $1)
		  AND ($2 = '' OR o.tela_id::text = $2)
		  AND ($3 = 0 OR o.ano = $3)
		  AND ($4 = 0 OR o.mes = $4)
		ORDER BY o.ano DESC, o.mes DESC, o.criado_em DESC`, f.UsuarioID, f.TelaID, f.Ano, f.Mes)
	if err != nil {
		return nil, fmt.Errorf("list oportunidades: %w", err)
	}
	defer rows.Close()

	index := map[string]*domain.Oportunidade{}
	var result []*domain.Oportunidade
	for rows.Next() {
		o := &domain.Oportunidade{}
		if err := rows.Scan(&o.ID, &o.UsuarioID, &o.TelaID, &o.Mes, &o.Ano, &o.Titulo, &o.CriadoEm, &o.UpdatedAt,
			&o.UpdatedByID, &o.CriadoPorNome, &o.EditadoPorNome); err != nil {
			return nil, err
		}
		o.Desafios = []domain.OportunidadeItem{}
		o.Melhorias = []domain.OportunidadeItem{}
		index[o.ID] = o
		result = append(result, o)
	}
	if len(result) == 0 {
		return result, nil
	}

	ids := make([]string, 0, len(result))
	for _, o := range result {
		ids = append(ids, o.ID)
	}

	desRows, err := r.db.Query(ctx, `SELECT id, oportunidade_id, texto FROM desafios WHERE oportunidade_id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("list desafios: %w", err)
	}
	defer desRows.Close()
	for desRows.Next() {
		var item domain.OportunidadeItem
		if err := desRows.Scan(&item.ID, &item.OportunidadeID, &item.Texto); err != nil {
			return nil, err
		}
		if o, ok := index[item.OportunidadeID]; ok {
			o.Desafios = append(o.Desafios, item)
		}
	}

	melRows, err := r.db.Query(ctx, `SELECT id, oportunidade_id, texto FROM melhorias WHERE oportunidade_id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("list melhorias: %w", err)
	}
	defer melRows.Close()
	for melRows.Next() {
		var item domain.OportunidadeItem
		if err := melRows.Scan(&item.ID, &item.OportunidadeID, &item.Texto); err != nil {
			return nil, err
		}
		if o, ok := index[item.OportunidadeID]; ok {
			o.Melhorias = append(o.Melhorias, item)
		}
	}

	return result, nil
}

func (r *PostgresOportunidadeRepository) FindByID(ctx context.Context, id string) (*domain.Oportunidade, error) {
	o := &domain.Oportunidade{}
	err := r.db.QueryRow(ctx, `
		SELECT o.id, o.usuario_id, o.tela_id, o.mes, o.ano, o.titulo, o.criado_em, o.updated_at,
		       COALESCE(o.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM oportunidades o
		LEFT JOIN users u1 ON o.usuario_id = u1.id
		LEFT JOIN users u2 ON o.updated_by_id = u2.id
		WHERE o.id=$1`, id).
		Scan(&o.ID, &o.UsuarioID, &o.TelaID, &o.Mes, &o.Ano, &o.Titulo, &o.CriadoEm, &o.UpdatedAt,
			&o.UpdatedByID, &o.CriadoPorNome, &o.EditadoPorNome)
	if err != nil {
		return nil, fmt.Errorf("find oportunidade: %w", err)
	}
	o.Desafios = []domain.OportunidadeItem{}
	o.Melhorias = []domain.OportunidadeItem{}

	desRows, _ := r.db.Query(ctx, `SELECT id, oportunidade_id, texto FROM desafios WHERE oportunidade_id=$1`, id)
	defer desRows.Close()
	for desRows.Next() {
		var item domain.OportunidadeItem
		desRows.Scan(&item.ID, &item.OportunidadeID, &item.Texto)
		o.Desafios = append(o.Desafios, item)
	}

	melRows, _ := r.db.Query(ctx, `SELECT id, oportunidade_id, texto FROM melhorias WHERE oportunidade_id=$1`, id)
	defer melRows.Close()
	for melRows.Next() {
		var item domain.OportunidadeItem
		melRows.Scan(&item.ID, &item.OportunidadeID, &item.Texto)
		o.Melhorias = append(o.Melhorias, item)
	}

	return o, nil
}

func (r *PostgresOportunidadeRepository) Create(ctx context.Context, o *domain.Oportunidade) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	o.ID = uuid.New().String()
	_, err = tx.Exec(ctx, `INSERT INTO oportunidades (id, usuario_id, tela_id, mes, ano, titulo, updated_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		o.ID, o.UsuarioID, o.TelaID, o.Mes, o.Ano, o.Titulo, o.UpdatedByID)
	if err != nil {
		return err
	}

	for i := range o.Desafios {
		o.Desafios[i].ID = uuid.New().String()
		o.Desafios[i].OportunidadeID = o.ID
		_, err = tx.Exec(ctx, `INSERT INTO desafios (id, oportunidade_id, texto) VALUES ($1,$2,$3)`,
			o.Desafios[i].ID, o.ID, o.Desafios[i].Texto)
		if err != nil {
			return err
		}
	}
	for i := range o.Melhorias {
		o.Melhorias[i].ID = uuid.New().String()
		o.Melhorias[i].OportunidadeID = o.ID
		_, err = tx.Exec(ctx, `INSERT INTO melhorias (id, oportunidade_id, texto) VALUES ($1,$2,$3)`,
			o.Melhorias[i].ID, o.ID, o.Melhorias[i].Texto)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresOportunidadeRepository) Update(ctx context.Context, o *domain.Oportunidade) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE oportunidades SET titulo=$1, mes=$2, ano=$3, updated_at=NOW(), updated_by_id=$4 WHERE id=$5`,
		o.Titulo, o.Mes, o.Ano, o.UpdatedByID, o.ID)
	if err != nil {
		return err
	}

	tx.Exec(ctx, `DELETE FROM desafios WHERE oportunidade_id=$1`, o.ID)
	tx.Exec(ctx, `DELETE FROM melhorias WHERE oportunidade_id=$1`, o.ID)

	for i := range o.Desafios {
		o.Desafios[i].ID = uuid.New().String()
		o.Desafios[i].OportunidadeID = o.ID
		_, err = tx.Exec(ctx, `INSERT INTO desafios (id, oportunidade_id, texto) VALUES ($1,$2,$3)`,
			o.Desafios[i].ID, o.ID, o.Desafios[i].Texto)
		if err != nil {
			return err
		}
	}
	for i := range o.Melhorias {
		o.Melhorias[i].ID = uuid.New().String()
		o.Melhorias[i].OportunidadeID = o.ID
		_, err = tx.Exec(ctx, `INSERT INTO melhorias (id, oportunidade_id, texto) VALUES ($1,$2,$3)`,
			o.Melhorias[i].ID, o.ID, o.Melhorias[i].Texto)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresOportunidadeRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM oportunidades WHERE id=$1`, id)
	return err
}

// ── PlanoDeAcao ───────────────────────────────────────────────────────────────

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
	rows, err := r.db.Query(ctx, `
		SELECT p.id, p.usuario_id, p.tela_id, p.titulo, p.descricao, p.data_inicio, p.data_fim, p.status, p.deletado, p.criado_em, p.updated_at,
		       COALESCE(p.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM planos_de_acao p
		LEFT JOIN users u1 ON p.usuario_id = u1.id
		LEFT JOIN users u2 ON p.updated_by_id = u2.id
		WHERE p.deletado = false
		  AND ($1 = '' OR p.usuario_id = $1)
		  AND ($2 = '' OR p.tela_id::text = $2)
		  AND ($3 = '' OR p.status = $3)
		ORDER BY p.criado_em DESC`, f.UsuarioID, f.TelaID, f.Status)
	if err != nil {
		return nil, fmt.Errorf("list planos: %w", err)
	}
	defer rows.Close()

	index := map[string]*domain.PlanoDeAcao{}
	var result []*domain.PlanoDeAcao
	for rows.Next() {
		p := &domain.PlanoDeAcao{}
		if err := rows.Scan(&p.ID, &p.UsuarioID, &p.TelaID, &p.Titulo, &p.Descricao,
			&p.DataInicio, &p.DataFim, &p.Status, &p.Deletado, &p.CriadoEm, &p.UpdatedAt,
			&p.UpdatedByID, &p.CriadoPorNome, &p.EditadoPorNome); err != nil {
			return nil, err
		}
		p.Acoes = []domain.Acao{}
		index[p.ID] = p
		result = append(result, p)
	}
	if len(result) == 0 {
		return result, nil
	}

	ids := make([]string, 0, len(result))
	for _, p := range result {
		ids = append(ids, p.ID)
	}

	acoesRows, err := r.db.Query(ctx, `
		SELECT id, plano_id, titulo, responsavel, status, data_limite, criado_em, updated_at
		FROM acoes WHERE plano_id = ANY($1) ORDER BY criado_em ASC`, ids)
	if err != nil {
		return nil, fmt.Errorf("list acoes: %w", err)
	}
	defer acoesRows.Close()
	for acoesRows.Next() {
		var a domain.Acao
		if err := acoesRows.Scan(&a.ID, &a.PlanoID, &a.Titulo, &a.Responsavel, &a.Status, &a.DataLimite, &a.CriadoEm, &a.UpdatedAt); err != nil {
			return nil, err
		}
		if p, ok := index[a.PlanoID]; ok {
			p.Acoes = append(p.Acoes, a)
		}
	}

	return result, nil
}

func (r *PostgresPlanoDeAcaoRepository) FindByID(ctx context.Context, id string) (*domain.PlanoDeAcao, error) {
	p := &domain.PlanoDeAcao{}
	err := r.db.QueryRow(ctx, `
		SELECT p.id, p.usuario_id, p.tela_id, p.titulo, p.descricao, p.data_inicio, p.data_fim, p.status, p.deletado, p.criado_em, p.updated_at,
		       COALESCE(p.updated_by_id, ''), COALESCE(u1.name, '') AS criado_por_nome, COALESCE(u2.name, '') AS editado_por_nome
		FROM planos_de_acao p
		LEFT JOIN users u1 ON p.usuario_id = u1.id
		LEFT JOIN users u2 ON p.updated_by_id = u2.id
		WHERE p.id=$1`, id).
		Scan(&p.ID, &p.UsuarioID, &p.TelaID, &p.Titulo, &p.Descricao, &p.DataInicio, &p.DataFim, &p.Status, &p.Deletado, &p.CriadoEm, &p.UpdatedAt,
			&p.UpdatedByID, &p.CriadoPorNome, &p.EditadoPorNome)
	if err != nil {
		return nil, fmt.Errorf("find plano: %w", err)
	}
	p.Acoes = []domain.Acao{}

	acoesRows, _ := r.db.Query(ctx, `
		SELECT id, plano_id, titulo, responsavel, status, data_limite, criado_em, updated_at
		FROM acoes WHERE plano_id=$1 ORDER BY criado_em ASC`, id)
	defer acoesRows.Close()
	for acoesRows.Next() {
		var a domain.Acao
		acoesRows.Scan(&a.ID, &a.PlanoID, &a.Titulo, &a.Responsavel, &a.Status, &a.DataLimite, &a.CriadoEm, &a.UpdatedAt)
		p.Acoes = append(p.Acoes, a)
	}

	return p, nil
}

func (r *PostgresPlanoDeAcaoRepository) Create(ctx context.Context, p *domain.PlanoDeAcao) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	p.ID = uuid.New().String()
	_, err = tx.Exec(ctx, `INSERT INTO planos_de_acao (id, usuario_id, tela_id, titulo, descricao, data_inicio, data_fim, status, updated_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		p.ID, p.UsuarioID, p.TelaID, p.Titulo, p.Descricao, p.DataInicio, p.DataFim, p.Status, p.UpdatedByID)
	if err != nil {
		return err
	}

	for i := range p.Acoes {
		p.Acoes[i].ID = uuid.New().String()
		p.Acoes[i].PlanoID = p.ID
		_, err = tx.Exec(ctx, `INSERT INTO acoes (id, plano_id, titulo, responsavel, status, data_limite) VALUES ($1,$2,$3,$4,$5,$6)`,
			p.Acoes[i].ID, p.ID, p.Acoes[i].Titulo, p.Acoes[i].Responsavel, p.Acoes[i].Status, p.Acoes[i].DataLimite)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresPlanoDeAcaoRepository) Update(ctx context.Context, p *domain.PlanoDeAcao) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE planos_de_acao SET titulo=$1, descricao=$2, data_inicio=$3, data_fim=$4, status=$5, updated_at=NOW(), updated_by_id=$6 WHERE id=$7`,
		p.Titulo, p.Descricao, p.DataInicio, p.DataFim, p.Status, p.UpdatedByID, p.ID)
	if err != nil {
		return err
	}

	tx.Exec(ctx, `DELETE FROM acoes WHERE plano_id=$1`, p.ID)

	for i := range p.Acoes {
		p.Acoes[i].ID = uuid.New().String()
		p.Acoes[i].PlanoID = p.ID
		_, err = tx.Exec(ctx, `INSERT INTO acoes (id, plano_id, titulo, responsavel, status, data_limite) VALUES ($1,$2,$3,$4,$5,$6)`,
			p.Acoes[i].ID, p.ID, p.Acoes[i].Titulo, p.Acoes[i].Responsavel, p.Acoes[i].Status, p.Acoes[i].DataLimite)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresPlanoDeAcaoRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE planos_de_acao SET deletado=true WHERE id=$1`, id)
	return err
}
