package handler

import (
	"errors"
	"fmt"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Jobsites da HVAC, no Schedule and Material.
//
// O jobsite de uma obra é o texto de forecast_core.job_site; o catálogo
// (catalog_job_sites) é quem guarda o que não cabe num texto: o nome de origem
// e os responsáveis. A ligação entre os dois é o nome, por isso renomear troca
// os dois na mesma transação.

type HVACJobsite struct {
	ID           int64    `json:"id"`
	ClientID     int64    `json:"clientId"`
	Client       string   `json:"client"`
	Name         string   `json:"name"`
	SourceName   *string  `json:"sourceName"`
	Responsibles []string `json:"responsibles"`
	HVAC         bool     `json:"hvac"`
}

type HVACJobsitesHandler struct {
	db    *pgxpool.Pool
	audit *service.AuditService
}

func NewHVACJobsitesHandler(db *pgxpool.Pool, audit *service.AuditService) *HVACJobsitesHandler {
	return &HVACJobsitesHandler{db: db, audit: audit}
}

// GET /api/v1/forecast/hvac-jobsites
func (h *HVACJobsitesHandler) List(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT j.id, j.client_id, COALESCE(cl.name, ''), j.name, j.source_name, j.responsibles, j.hvac
		FROM catalog_job_sites j
		LEFT JOIN catalog_clients cl ON cl.id = j.client_id
		ORDER BY j.name`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []HVACJobsite{}
	for rows.Next() {
		var j HVACJobsite
		if err := rows.Scan(&j.ID, &j.ClientID, &j.Client, &j.Name, &j.SourceName, &j.Responsibles, &j.HVAC); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		result = append(result, j)
	}
	return c.JSON(fiber.Map{"data": result})
}

// PUT /api/v1/forecast/hvac-jobsites
//
// Cria ou edita pelo nome. `name` é o nome atual (vazio ao criar), `newName` o
// que fica. Jobsite que só existe como texto nas obras ganha a linha no
// catálogo na primeira edição.
func (h *HVACJobsitesHandler) Save(c *fiber.Ctx) error {
	var body struct {
		Name         string   `json:"name"`
		NewName      string   `json:"newName"`
		Client       string   `json:"client"`
		Responsibles []string `json:"responsibles"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	name := strings.TrimSpace(body.Name)
	newName := strings.TrimSpace(body.NewName)
	if newName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "the jobsite name is required", "code": "NAME_REQUIRED"})
	}
	responsibles := cleanNames(body.Responsibles)

	ctx := c.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	if newName != name {
		var taken bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM catalog_job_sites WHERE name = $1)
			    OR EXISTS (SELECT 1 FROM forecast_core WHERE company = 'hvac' AND job_site = $1)`,
			newName).Scan(&taken); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		if taken {
			return c.Status(409).JSON(fiber.Map{"error": "there is already a jobsite with this name", "code": "NAME_TAKEN"})
		}
	}

	var id, clientID int64
	var source *string
	found := false
	if name != "" {
		err := tx.QueryRow(ctx,
			`SELECT id, client_id, source_name FROM catalog_job_sites WHERE name = $1`, name).
			Scan(&id, &clientID, &source)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		found = err == nil
	}

	if !found {
		// O cliente vem do corpo (jobsite novo) ou das obras que já usam o nome.
		if err := tx.QueryRow(ctx, `
			SELECT id FROM catalog_clients
			WHERE name = COALESCE(NULLIF($1, ''),
				(SELECT cliente FROM forecast_core WHERE company = 'hvac' AND job_site = $2 LIMIT 1))`,
			strings.TrimSpace(body.Client), name).Scan(&clientID); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "choose the client of this jobsite", "code": "CLIENT_REQUIRED"})
		}
	}

	// O nome de origem é o primeiro nome que o jobsite teve: renomear duas
	// vezes não pode perder o do SupplyPro.
	if name != "" && newName != name && source == nil {
		source = &name
	}

	// A Framing usa o mesmo catálogo. Se ela tem obra com este nome, a linha
	// dela fica como está e a HVAC ganha a sua, com o nome novo.
	shared := false
	if found && newName != name {
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM forecast_core WHERE company <> 'hvac' AND job_site = $1)`,
			name).Scan(&shared); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if found && !shared {
		_, err = tx.Exec(ctx, `
			UPDATE catalog_job_sites SET name = $1, source_name = $2, responsibles = $3, hvac = true WHERE id = $4`,
			newName, source, responsibles, id)
	} else {
		err = tx.QueryRow(ctx, `
			INSERT INTO catalog_job_sites (client_id, name, source_name, responsibles, hvac)
			VALUES ($1, $2, $3, $4, true) RETURNING id`,
			clientID, newName, source, responsibles).Scan(&id)
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if name != "" && newName != name {
		if _, err := tx.Exec(ctx,
			`UPDATE forecast_core SET job_site = $1 WHERE company = 'hvac' AND job_site = $2`,
			newName, name); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	uid, uname := actor(c)
	h.audit.Log(ctx, uid, uname, "update", "catalog_job_sites", fmt.Sprintf("%d", id))
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// cleanNames tira espaço, vazio e repetido, mantendo a ordem em que vieram.
func cleanNames(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, n := range in {
		n = strings.TrimSpace(n)
		if n == "" || seen[strings.ToLower(n)] {
			continue
		}
		seen[strings.ToLower(n)] = true
		out = append(out, n)
	}
	return out
}
