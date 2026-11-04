package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MonthlyExecutionRepository interface {
	ListGroups(ctx context.Context) ([]*domain.GoalGroup, error)
	SaveGroups(ctx context.Context, groups []*domain.GoalGroup) error
	ListFinished(ctx context.Context, year int) ([]domain.FinishedProject, error)
	ListPoints(ctx context.Context, year int) ([]*domain.ImprovementPoint, error)
	CreatePoint(ctx context.Context, p *domain.ImprovementPoint) error
	EditPoint(ctx context.Context, id, authorID, body string, groupIDs []string) (bool, error)
	SetPointStatus(ctx context.Context, id string, status domain.PointStatus) (bool, error)
	DeletePoint(ctx context.Context, id, authorID string) (bool, error)
	AddReply(ctx context.Context, pointID string, r *domain.PointReply) error
}

type PostgresMonthlyExecutionRepository struct {
	db *pgxpool.Pool
}

func NewPostgresMonthlyExecutionRepository(db *pgxpool.Pool) *PostgresMonthlyExecutionRepository {
	return &PostgresMonthlyExecutionRepository{db: db}
}

func (r *PostgresMonthlyExecutionRepository) ListGroups(ctx context.Context) ([]*domain.GoalGroup, error) {
	rows, err := r.db.Query(ctx, `
		SELECT g.id, g.name,
		       COALESCE((SELECT json_agg(json_build_object('cliente', s.cliente, 'jobSite', s.job_site) ORDER BY s.job_site)
		                 FROM me_goal_group_sites s WHERE s.group_id = g.id), '[]'),
		       COALESCE((SELECT json_agg(json_build_object('year', c.effective_year, 'month', c.effective_month, 'goal', c.goal)
		                                 ORDER BY c.effective_year, c.effective_month)
		                 FROM me_goal_checkpoints c WHERE c.group_id = g.id), '[]')
		FROM me_goal_groups g
		ORDER BY g.name
	`)
	if err != nil {
		return nil, fmt.Errorf("list me_goal_groups: %w", err)
	}
	defer rows.Close()
	out := []*domain.GoalGroup{}
	for rows.Next() {
		g := &domain.GoalGroup{}
		if err := rows.Scan(&g.ID, &g.Name, &g.Sites, &g.Checkpoints); err != nil {
			return nil, fmt.Errorf("scan me_goal_groups: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// SaveGroups troca a configuração inteira numa transação. Grupo que já existe
// mantém o id, porque os pontos de melhoria apontam para ele.
func (r *PostgresMonthlyExecutionRepository) SaveGroups(ctx context.Context, groups []*domain.GoalGroup) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		keep := []string{}
		for _, g := range groups {
			if g.ID != "" {
				keep = append(keep, g.ID)
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM me_goal_groups WHERE NOT (id::text = ANY($1))`, keep); err != nil {
			return fmt.Errorf("prune me_goal_groups: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM me_goal_group_sites`); err != nil {
			return fmt.Errorf("clear me_goal_group_sites: %w", err)
		}
		for _, g := range groups {
			if g.ID == "" {
				if err := tx.QueryRow(ctx, `INSERT INTO me_goal_groups (name) VALUES ($1) RETURNING id`, g.Name).Scan(&g.ID); err != nil {
					return fmt.Errorf("insert me_goal_groups: %w", err)
				}
			} else if _, err := tx.Exec(ctx, `UPDATE me_goal_groups SET name = $2 WHERE id = $1`, g.ID, g.Name); err != nil {
				return fmt.Errorf("update me_goal_groups: %w", err)
			}
			for _, s := range g.Sites {
				if _, err := tx.Exec(ctx, `INSERT INTO me_goal_group_sites (group_id, cliente, job_site) VALUES ($1, $2, $3)`,
					g.ID, s.Cliente, s.JobSite); err != nil {
					return fmt.Errorf("insert me_goal_group_sites: %w", err)
				}
			}
			if _, err := tx.Exec(ctx, `DELETE FROM me_goal_checkpoints WHERE group_id = $1`, g.ID); err != nil {
				return fmt.Errorf("clear me_goal_checkpoints: %w", err)
			}
			for _, c := range g.Checkpoints {
				if _, err := tx.Exec(ctx, `
					INSERT INTO me_goal_checkpoints (group_id, effective_year, effective_month, goal) VALUES ($1, $2, $3, $4)`,
					g.ID, c.Year, c.Month, c.Goal); err != nil {
					return fmt.Errorf("insert me_goal_checkpoints: %w", err)
				}
			}
		}
		return nil
	})
}

func (r *PostgresMonthlyExecutionRepository) ListFinished(ctx context.Context, year int) ([]domain.FinishedProject, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, COALESCE(cliente, ''), COALESCE(job_site, ''),
		       concat_ws(' - ', NULLIF(job_site, ''), NULLIF(lote_bld, '')),
		       COALESCE(address, ''), finished_on::text
		FROM forecast_core
		WHERE company = 'framing' AND status = 'closed'
		  AND finished_on >= make_date($1, 1, 1) AND finished_on < make_date($1 + 1, 1, 1)
		ORDER BY finished_on, job_site, lote_bld
	`, year)
	if err != nil {
		return nil, fmt.Errorf("list finished: %w", err)
	}
	defer rows.Close()
	out := []domain.FinishedProject{}
	for rows.Next() {
		var p domain.FinishedProject
		if err := rows.Scan(&p.ID, &p.Cliente, &p.JobSite, &p.ProjectName, &p.Address, &p.FinishedOn); err != nil {
			return nil, fmt.Errorf("scan finished: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PostgresMonthlyExecutionRepository) ListPoints(ctx context.Context, year int) ([]*domain.ImprovementPoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.id, p.ref_year, p.ref_month, p.body, p.status, p.group_ids::text[],
		       p.author_id, p.author_name, p.author_role, p.created_at,
		       COALESCE((SELECT json_agg(json_build_object(
		                   'id', r.id, 'body', r.body, 'authorId', r.author_id, 'authorName', r.author_name,
		                   'authorRole', r.author_role, 'createdAt', r.created_at) ORDER BY r.created_at, r.id)
		                 FROM me_point_replies r WHERE r.point_id = p.id), '[]')
		FROM me_points p
		WHERE p.ref_year = $1
		ORDER BY p.ref_month, p.created_at
	`, year)
	if err != nil {
		return nil, fmt.Errorf("list me_points: %w", err)
	}
	defer rows.Close()
	out := []*domain.ImprovementPoint{}
	for rows.Next() {
		p := &domain.ImprovementPoint{}
		if err := rows.Scan(&p.ID, &p.Year, &p.Month, &p.Body, &p.Status, &p.GroupIDs,
			&p.AuthorID, &p.AuthorName, &p.AuthorRole, &p.CreatedAt, &p.Replies); err != nil {
			return nil, fmt.Errorf("scan me_points: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PostgresMonthlyExecutionRepository) CreatePoint(ctx context.Context, p *domain.ImprovementPoint) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO me_points (ref_year, ref_month, body, group_ids, author_id, author_name, author_role)
		VALUES ($1, $2, $3, $4::uuid[], $5, $6, $7)
		RETURNING id, status, created_at
	`, p.Year, p.Month, p.Body, p.GroupIDs, p.AuthorID, p.AuthorName, p.AuthorRole).Scan(&p.ID, &p.Status, &p.CreatedAt)
}

// EditPoint e DeletePoint só acham o ponto de quem o escreveu.
func (r *PostgresMonthlyExecutionRepository) EditPoint(ctx context.Context, id, authorID, body string, groupIDs []string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE me_points SET body = $3, group_ids = $4::uuid[] WHERE id = $1 AND author_id = $2
	`, id, authorID, body, groupIDs)
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMonthlyExecutionRepository) SetPointStatus(ctx context.Context, id string, status domain.PointStatus) (bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE me_points SET status = $2 WHERE id = $1`, id, string(status))
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMonthlyExecutionRepository) DeletePoint(ctx context.Context, id, authorID string) (bool, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM me_points WHERE id = $1 AND author_id = $2`, id, authorID)
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMonthlyExecutionRepository) AddReply(ctx context.Context, pointID string, rep *domain.PointReply) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO me_point_replies (point_id, body, author_id, author_name, author_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`, pointID, rep.Body, rep.AuthorID, rep.AuthorName, rep.AuthorRole).Scan(&rep.ID, &rep.CreatedAt)
}
