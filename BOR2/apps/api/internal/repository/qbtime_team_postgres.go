package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimeTeamRepository interface {
	List(ctx context.Context, company string) ([]*domain.QBTimeTeam, error)
	Create(ctx context.Context, t *domain.QBTimeTeam) (*domain.QBTimeTeam, error)
	Update(ctx context.Context, id string, name string, members []string) (*domain.QBTimeTeam, error)
	Delete(ctx context.Context, id string) error
}

type PostgresQBTimeTeamRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeTeamRepository(db *pgxpool.Pool) *PostgresQBTimeTeamRepository {
	return &PostgresQBTimeTeamRepository{db: db}
}

func marshalMembers(m []string) string {
	if m == nil {
		m = []string{}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func unmarshalMembers(s string) []string {
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil || out == nil {
		return []string{}
	}
	return out
}

func (r *PostgresQBTimeTeamRepository) List(ctx context.Context, company string) ([]*domain.QBTimeTeam, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, name, array_to_json(members)::text, created_at
		FROM qbtime_teams
		WHERE company = $1
		ORDER BY created_at ASC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list qbtime teams: %w", err)
	}
	defer rows.Close()

	var out []*domain.QBTimeTeam
	for rows.Next() {
		t := &domain.QBTimeTeam{}
		var membersJSON string
		if err := rows.Scan(&t.ID, &t.Company, &t.Name, &membersJSON, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan qbtime team: %w", err)
		}
		t.Members = unmarshalMembers(membersJSON)
		out = append(out, t)
	}
	return out, nil
}

func (r *PostgresQBTimeTeamRepository) Create(ctx context.Context, t *domain.QBTimeTeam) (*domain.QBTimeTeam, error) {
	membersJSON := marshalMembers(t.Members)
	var retJSON string
	err := r.db.QueryRow(ctx, `
		INSERT INTO qbtime_teams (company, name, members)
		VALUES ($1, $2, ARRAY(SELECT jsonb_array_elements_text($3::jsonb)))
		RETURNING id, array_to_json(members)::text, created_at
	`, t.Company, t.Name, membersJSON).Scan(&t.ID, &retJSON, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create qbtime team: %w", err)
	}
	t.Members = unmarshalMembers(retJSON)
	return t, nil
}

func (r *PostgresQBTimeTeamRepository) Update(ctx context.Context, id string, name string, members []string) (*domain.QBTimeTeam, error) {
	membersJSON := marshalMembers(members)
	t := &domain.QBTimeTeam{}
	var retJSON string
	err := r.db.QueryRow(ctx, `
		UPDATE qbtime_teams
		SET name = $2, members = ARRAY(SELECT jsonb_array_elements_text($3::jsonb))
		WHERE id = $1
		RETURNING id, company, name, array_to_json(members)::text, created_at
	`, id, name, membersJSON).Scan(&t.ID, &t.Company, &t.Name, &retJSON, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update qbtime team: %w", err)
	}
	t.Members = unmarshalMembers(retJSON)
	return t, nil
}

func (r *PostgresQBTimeTeamRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM qbtime_teams WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete qbtime team: %w", err)
	}
	return nil
}
