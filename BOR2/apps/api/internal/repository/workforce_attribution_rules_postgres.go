package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Interface ────────────────────────────────────────────────────────────────

type WorkforceAttributionRuleRepository interface {
	List(ctx context.Context) ([]*domain.WorkforceAttributionRule, error)
	FindByID(ctx context.Context, id string) (*domain.WorkforceAttributionRule, error)
	Create(ctx context.Context, r *domain.WorkforceAttributionRule) error
	Update(ctx context.Context, r *domain.WorkforceAttributionRule) error
	Delete(ctx context.Context, id string) error
}

// ─── Implementation ───────────────────────────────────────────────────────────

type PostgresWorkforceAttributionRuleRepository struct {
	db *pgxpool.Pool
}

func NewPostgresWorkforceAttributionRuleRepository(db *pgxpool.Pool) *PostgresWorkforceAttributionRuleRepository {
	return &PostgresWorkforceAttributionRuleRepository{db: db}
}

func (r *PostgresWorkforceAttributionRuleRepository) scan(row interface {
	Scan(dest ...any) error
}) (*domain.WorkforceAttributionRule, error) {
	var rule domain.WorkforceAttributionRule
	var condJSON []byte
	if err := row.Scan(
		&rule.ID, &rule.Name, &condJSON,
		&rule.TargetCompany, &rule.CreatedBy,
		&rule.CreatedAt, &rule.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(condJSON, &rule.Conditions); err != nil {
		return nil, fmt.Errorf("unmarshal conditions: %w", err)
	}
	return &rule, nil
}

func (r *PostgresWorkforceAttributionRuleRepository) List(ctx context.Context) ([]*domain.WorkforceAttributionRule, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, conditions, target_company, created_by, created_at, updated_at
		 FROM workforce_attribution_rules ORDER BY created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("list attribution rules: %w", err)
	}
	defer rows.Close()

	var rules []*domain.WorkforceAttributionRule
	for rows.Next() {
		rule, err := r.scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan attribution rule: %w", err)
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

func (r *PostgresWorkforceAttributionRuleRepository) FindByID(ctx context.Context, id string) (*domain.WorkforceAttributionRule, error) {
	row := r.db.QueryRow(ctx,
		`SELECT id, name, conditions, target_company, created_by, created_at, updated_at
		 FROM workforce_attribution_rules WHERE id = $1`, id)
	rule, err := r.scan(row)
	if err != nil {
		return nil, fmt.Errorf("find attribution rule %s: %w", id, err)
	}
	return rule, nil
}

func (r *PostgresWorkforceAttributionRuleRepository) Create(ctx context.Context, rule *domain.WorkforceAttributionRule) error {
	condJSON, err := json.Marshal(rule.Conditions)
	if err != nil {
		return fmt.Errorf("marshal conditions: %w", err)
	}
	_, err = r.db.Exec(ctx,
		`INSERT INTO workforce_attribution_rules
		 (id, name, conditions, target_company, created_by, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		rule.ID, rule.Name, condJSON,
		rule.TargetCompany, rule.CreatedBy,
		rule.CreatedAt, rule.UpdatedAt,
	)
	return err
}

func (r *PostgresWorkforceAttributionRuleRepository) Update(ctx context.Context, rule *domain.WorkforceAttributionRule) error {
	condJSON, err := json.Marshal(rule.Conditions)
	if err != nil {
		return fmt.Errorf("marshal conditions: %w", err)
	}
	rule.UpdatedAt = time.Now()
	_, err = r.db.Exec(ctx,
		`UPDATE workforce_attribution_rules
		 SET name=$1, conditions=$2, target_company=$3, updated_at=$4
		 WHERE id=$5`,
		rule.Name, condJSON, rule.TargetCompany, rule.UpdatedAt, rule.ID,
	)
	return err
}

func (r *PostgresWorkforceAttributionRuleRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM workforce_attribution_rules WHERE id = $1`, id)
	return err
}
