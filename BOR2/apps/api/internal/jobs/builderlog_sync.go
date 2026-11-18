package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// O Fieldwire foi descontinuado em 17/11/2026 (F-21) e o BuilderLog virou a
// fonte dos documentos da obra. Este job lê a cobertura de documentos de todas
// as obras pela API pública do BuilderLog e marca como completed, no Forecast,
// o que já subiu lá. Só promove pendente para completed: nunca desmarca nem
// mexe em dispensed, que são decisões da equipe no Data Control.

const builderLogCoverageURL = "https://builderlog.co/api/public/v1/document-coverage"

// O nome do documento no Forecast nem sempre é o da categoria no BuilderLog.
var builderLogAliases = map[string][]string{
	"Trusses":            {"Trusses Profile", "Trusses Placement"},
	"Architectural Plan": {"Architectural Plan", "Architectural"},
}

const onBuilderLog = "On BuilderLog"

var builderLogUnitWords = regexp.MustCompile(`\b(lot|building|bld)\b`)
var builderLogSpaces = regexp.MustCompile(`\s+`)
var builderLogLeadingZeros = regexp.MustCompile(`\b0+(\d)`)

// builderLogKey casa a obra do Forecast (job_site + lote_bld) com a do
// BuilderLog (community + number): "Lot 12", "Building 12" e "12" são a mesma.
// O BuilderLog escreve o lote de casa com três dígitos ("007"): o zero à
// esquerda não conta.
func builderLogKey(site, unit string) string {
	u := builderLogUnitWords.ReplaceAllString(strings.ToLower(unit), "")
	u = builderLogLeadingZeros.ReplaceAllString(u, "$1")
	s := strings.ToLower(site)
	return builderLogSpaces.ReplaceAllString(strings.TrimSpace(s), " ") + "|" + builderLogSpaces.ReplaceAllString(strings.TrimSpace(u), " ")
}

type builderLogCoverage struct {
	Data []struct {
		Community  string `json:"community"`
		Number     string `json:"number"`
		Categories []struct {
			Category    string `json:"category"`
			HasDocument bool   `json:"hasDocument"`
		} `json:"categories"`
	} `json:"data"`
}

func NewBuilderLogSyncJob(db *pgxpool.Pool, token string) Job {
	return Job{
		Name:      "builderlog_sync",
		DailyHour: 10, // 6h em Nova York, antes de a equipe abrir o Forecast
		Run: func(ctx context.Context) error {
			if token == "" {
				logger.Info("builderlog sync skipped: BUILDERLOG_API_TOKEN not set")
				return nil
			}
			return syncBuilderLog(ctx, db, token)
		},
	}
}

func syncBuilderLog(ctx context.Context, db *pgxpool.Pool, token string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, builderLogCoverageURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("builderlog coverage: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("builderlog coverage: status %d", res.StatusCode)
	}
	var cov builderLogCoverage
	if err := json.NewDecoder(res.Body).Decode(&cov); err != nil {
		return fmt.Errorf("builderlog coverage decode: %w", err)
	}

	have := map[string]map[string]bool{}
	for _, j := range cov.Data {
		k := builderLogKey(j.Community, j.Number)
		if have[k] == nil {
			have[k] = map[string]bool{onBuilderLog: true}
		}
		for _, c := range j.Categories {
			if c.HasDocument {
				have[k][c.Category] = true
			}
		}
	}

	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT set_config('bor.changed_by', 'BuilderLog sync', true)`); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT b.id, f.job_site, f.lote_bld, b.document
			  FROM forecast_builderlog b JOIN forecast_core f ON f.id = b.project_id
			 WHERE lower(f.company) = 'framing' AND b.status IS NULL`)
		if err != nil {
			return err
		}
		var ids []int64
		for rows.Next() {
			var id int64
			var site, unit, doc *string
			if err := rows.Scan(&id, &site, &unit, &doc); err != nil {
				rows.Close()
				return err
			}
			cats := have[builderLogKey(deref(site), deref(unit))]
			if cats == nil || doc == nil {
				continue
			}
			for _, name := range append([]string{*doc}, builderLogAliases[*doc]...) {
				if cats[name] {
					ids = append(ids, id)
					break
				}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if len(ids) == 0 {
			logger.Info("builderlog sync: nothing to mark")
			return nil
		}
		if _, err := tx.Exec(ctx, `UPDATE forecast_builderlog SET status = 'completed' WHERE id = ANY($1)`, ids); err != nil {
			return err
		}
		logger.Info("builderlog sync: marked completed", "rows", len(ids))
		return nil
	})
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
