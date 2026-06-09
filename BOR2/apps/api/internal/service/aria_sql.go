package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// maxQueryRows caps how many rows a single agent query returns into the model
// context, keeping token usage bounded.
const maxQueryRows = 150

// QueryResult holds the label and rows returned from a financial query.
type QueryResult struct {
	Label string           `json:"label"`
	Rows  []map[string]any `json:"rows"`
}

// SQLRunResult is what the agent's run_sql tool returns for one query.
type SQLRunResult struct {
	Columns   []string         `json:"columns"`
	Rows      []map[string]any `json:"rows"`
	RowCount  int              `json:"row_count"`
	Truncated bool             `json:"truncated"`
}

// AriaSQL executes model-written SELECTs against a read-only connection pool,
// behind a validation layer and per-query company isolation (RLS session var).
type AriaSQL struct {
	pool *pgxpool.Pool
}

func NewAriaSQL(pool *pgxpool.Pool) *AriaSQL {
	return &AriaSQL{pool: pool}
}

// Enabled reports whether a read-only pool is configured. When false (e.g. the
// production read-only DSN is unset), the agent must not query — the main pool is
// never used as a fallback because it would bypass the per-company RLS policies.
func (a *AriaSQL) Enabled() bool { return a != nil && a.pool != nil }

// forbiddenWord matches any data-modifying / dangerous keyword as a whole word.
// This is defense-in-depth on top of the read-only DB role and RLS — even if the
// model is tricked into emitting a write, the validator rejects it before it runs.
var forbiddenWord = regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|reindex|refresh|cluster|comment|call|do|set|reset|lock|merge|nextval|setval|currval|pg_sleep|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|into)\b`)

// ValidateSQL enforces a single read-only SELECT statement.
func ValidateSQL(sql string) error {
	trimmed := strings.TrimSpace(sql)
	if trimmed == "" {
		return fmt.Errorf("empty query")
	}
	// Allow exactly one optional trailing semicolon; reject statement chaining.
	trimmed = strings.TrimRight(trimmed, "; \n\t\r")
	if strings.Contains(trimmed, ";") {
		return fmt.Errorf("multiple statements are not allowed")
	}
	lower := strings.ToLower(trimmed)
	if !strings.HasPrefix(lower, "select") && !strings.HasPrefix(lower, "with") {
		return fmt.Errorf("only SELECT / WITH queries are allowed")
	}
	if m := forbiddenWord.FindString(trimmed); m != "" {
		return fmt.Errorf("forbidden keyword %q — read-only SELECT only", m)
	}
	return nil
}

// Run validates then executes a SELECT for one company. It runs inside a
// read-only transaction with a statement timeout and a transaction-local GUC
// (app.aria_company) that the RLS policies use to scope rows to the company.
func (a *AriaSQL) Run(ctx context.Context, company, sql string) (*SQLRunResult, error) {
	if !a.Enabled() {
		return nil, fmt.Errorf("aria read-only database not configured")
	}
	if err := ValidateSQL(sql); err != nil {
		return nil, err
	}

	conn, err := a.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Release()

	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) // read-only — always roll back

	if _, err := tx.Exec(ctx, "SET LOCAL statement_timeout = 5000"); err != nil {
		return nil, fmt.Errorf("set timeout: %w", err)
	}
	// Transaction-local company scope consumed by the RLS policy on qb_* tables.
	if _, err := tx.Exec(ctx, "SELECT set_config('app.aria_company', $1, true)", company); err != nil {
		return nil, fmt.Errorf("set company scope: %w", err)
	}

	rows, err := tx.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	cols := make([]string, len(fields))
	for i, f := range fields {
		cols[i] = string(f.Name)
	}

	out := make([]map[string]any, 0, maxQueryRows)
	total := 0
	truncated := false
	for rows.Next() {
		total++
		if len(out) >= maxQueryRows {
			truncated = true
			continue
		}
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(map[string]any, len(cols))
		for i, name := range cols {
			row[name] = vals[i]
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &SQLRunResult{Columns: cols, Rows: out, RowCount: total, Truncated: truncated}, nil
}
