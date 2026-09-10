package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// Conceder acesso a um conjunto de obras de uma vez.
//
// A concessão unitária resolve o caso de uma obra. Ela não resolve o caso real:
// um subcontratado entra e precisa enxergar as trinta obras de um cliente, ou
// todas as unidades de um jobsite. Fazer isso pela porta de uma obra por vez são
// trinta requisições, trinta chances de parar no meio, e nenhum registro de que
// as trinta eram a mesma decisão.
//
// O lote é laço, não modelagem nova: `atlas_jobsite_access` continua sendo uma
// linha por usuário e obra. O que muda é quem escolhe o conjunto — em vez de o
// operador apontar obra a obra, ele descreve o critério e o servidor resolve
// quais obras casam.

type bulkAccessInput struct {
	UserID string `json:"userId"`
	Level  string `json:"level"`
	// O critério. Pelo menos um precisa vir preenchido, e eles se somam: cliente
	// "Pulte Homes" com community "Riverview" pega a interseção, não a união.
	Client    string   `json:"client"`
	Community string   `json:"community"`
	Company   string   `json:"company"`
	JobsiteID []string `json:"jobsiteIds"`
	ExpiresAt *string  `json:"expiresAt"`
	// Sem isto a rota devolve o que faria e não grava nada. O padrão é não
	// gravar de propósito: um critério amplo demais concede acesso a obra que
	// ninguém pretendia, e revogar depois é outro lote.
	Apply bool `json:"apply"`
}

// POST /atlas/access/bulk
func (h *AtlasHandler) GrantAccessBulk(c *fiber.Ctx) error {
	var in bulkAccessInput
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.UserID == "" {
		return badRequest(c, "userId is required")
	}
	if atlasLevelRank[in.Level] == 0 {
		return badRequest(c, "level must be read, annotate or manage")
	}
	if in.Client == "" && in.Community == "" && in.Company == "" && len(in.JobsiteID) == 0 {
		return badRequest(c, "informe ao menos um critério: client, community, company ou jobsiteIds")
	}

	var expires any
	if in.ExpiresAt != nil && *in.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *in.ExpiresAt)
		if err != nil {
			return badRequest(c, "expiresAt must be RFC3339")
		}
		expires = t
	}

	// As obras que casam com o critério. `$n = ''` neutraliza o filtro que não
	// veio, e o array vazio idem, para a consulta ser uma só em vez de montada
	// por concatenação.
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, COALESCE(unit,'')
		  FROM atlas_jobsite
		 WHERE ($1 = '' OR client    = $1)
		   AND ($2 = '' OR community = $2)
		   AND ($3 = '' OR company   = $3)
		   AND (cardinality($4::text[]) = 0 OR id = ANY($4::text[]))
		 ORDER BY name`,
		in.Client, in.Community, in.Company, in.JobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	type alvo struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Unit string `json:"unit"`
	}
	alvos := []alvo{}
	for rows.Next() {
		var a alvo
		if rows.Scan(&a.ID, &a.Name, &a.Unit) == nil {
			alvos = append(alvos, a)
		}
	}
	rows.Close()

	// Quem concede precisa poder gerenciar cada obra do lote. Deixar passar as
	// que pode e ignorar as que não pode faria o lote conceder um subconjunto
	// silencioso, e o operador acharia que concedeu tudo. Ou vale para o
	// conjunto descrito, ou não vale.
	negadas := []string{}
	for _, a := range alvos {
		if err := h.require(c, a.ID, "manage"); err != nil {
			negadas = append(negadas, a.ID)
		}
	}
	if len(negadas) > 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "sem permissão de manage em todas as obras do critério",
			"data":  fiber.Map{"semPermissao": negadas, "total": len(alvos)},
		})
	}

	if !in.Apply {
		return c.JSON(fiber.Map{"data": fiber.Map{
			"dryRun": true, "total": len(alvos), "jobsites": alvos,
		}})
	}

	granter, _ := actor(c)
	gravadas := 0
	for _, a := range alvos {
		// Mesmo INSERT da concessão unitária, incluindo o `revoked_at = NULL`:
		// reconceder é reabrir, senão um acesso devolvido depois de revogado
		// nasce morto.
		if _, err := h.db.Exec(c.Context(), `
			INSERT INTO atlas_jobsite_access (jobsite_id, user_id, level, granted_by, expires_at)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (jobsite_id, user_id) DO UPDATE SET
				level = EXCLUDED.level, granted_by = EXCLUDED.granted_by,
				granted_at = now(), expires_at = EXCLUDED.expires_at, revoked_at = NULL`,
			a.ID, in.UserID, in.Level, granter, expires); err != nil {
			return internalErr(c, err)
		}
		gravadas++
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"userId": in.UserID, "level": in.Level,
		"concedidas": gravadas, "jobsites": alvos,
	}})
}

// GET /atlas/users/:id/access
//
// O controle de acesso visto pelo lado da pessoa, e não da obra.
//
// A tela da obra responde "quem entra aqui". É a pergunta certa quando se está
// cuidando de uma obra, e é a errada quando se está cuidando de alguém: um
// subcontratado novo precisa enxergar trinta obras de um cliente, e descobrir
// quais ele já tem exige abrir trinta telas e somar de cabeça. Revogar o acesso
// de quem saiu tem o mesmo problema, e é o caso em que errar custa mais.
//
// Devolve **todas** as obras, com e sem acesso, porque a pergunta de quem abre
// esta tela costuma ser sobre o que falta e não sobre o que já existe. Uma lista
// só do que ele tem esconde exatamente o que se veio conceder.
func (h *AtlasHandler) ListUserAccess(c *fiber.Ctx) error {
	userID := c.Params("id")

	var nome, email string
	if err := h.db.QueryRow(c.Context(),
		`SELECT COALESCE(name,''), COALESCE(email,'') FROM users WHERE id = $1`,
		userID).Scan(&nome, &email); err != nil {
		return atlasNotFound(c, "usuário")
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT j.id, j.name, COALESCE(j.client,''), COALESCE(j.community,''),
		       COALESCE(j.company,''), COALESCE(j.status,''),
		       COALESCE(a.level,''), a.revoked_at IS NULL AND a.user_id IS NOT NULL
		  FROM atlas_jobsite j
		  LEFT JOIN atlas_jobsite_access a
		         ON a.jobsite_id = j.id AND a.user_id = $1
		 ORDER BY j.client, j.community, j.name`, userID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type linha struct {
		JobsiteID string `json:"jobsiteId"`
		Name      string `json:"name"`
		Client    string `json:"client"`
		Community string `json:"community"`
		Company   string `json:"company"`
		Status    string `json:"status"`
		Level     string `json:"level"`
		HasAccess bool   `json:"hasAccess"`
	}
	out := []linha{}
	comAcesso := 0
	// Os critérios que o lote aceita, montados a partir do que estas obras de
	// fato têm. Oferecer "Pulte Homes" numa conta que não atende a Pulte seria
	// oferecer um lote que concede zero.
	clientes := map[string]int{}
	comunidades := map[string]int{}
	for rows.Next() {
		var l linha
		if rows.Scan(&l.JobsiteID, &l.Name, &l.Client, &l.Community, &l.Company,
			&l.Status, &l.Level, &l.HasAccess) != nil {
			continue
		}
		if l.HasAccess {
			comAcesso++
		}
		if l.Client != "" {
			clientes[l.Client]++
		}
		if l.Community != "" {
			comunidades[l.Community]++
		}
		out = append(out, l)
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"user":      fiber.Map{"id": userID, "name": nome, "email": email},
		"jobsites":  out,
		"comAcesso": comAcesso,
		"total":     len(out),
		"criterios": fiber.Map{"clients": clientes, "communities": comunidades},
	}})
}
