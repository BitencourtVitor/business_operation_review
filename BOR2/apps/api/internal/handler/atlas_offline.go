package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// A seleção offline vista pelo servidor.
//
// Quem decide o que fica no aparelho é o aparelho, e é lá que a decisão é usada.
// O servidor guarda uma cópia por três razões, e nenhuma delas é redundância:
// trocar de iPad não pode apagar a configuração; a sobrescrita precisa saber
// quem carrega aquela pasta no bolso para poder avisar; e sem registro central
// não há como medir uso offline nenhum.
//
// Nada aqui move byte. São quatro rotas de metadado, e as três primeiras são a
// conversa que o dispositivo tem com o servidor toda vez que a rede volta.

type offlineFolder struct {
	JobsiteID     string `json:"jobsiteId"`
	JobsiteName   string `json:"jobsiteName"`
	DocumentID    string `json:"documentId"`
	DocumentName  string `json:"documentName"`
	LocalRevision int    `json:"localRevision"`
	// A revisão que o servidor tem agora. É a comparação entre este número e o
	// de cima que diz se a pasta no aparelho está vencida.
	ServerRevision int    `json:"serverRevision"`
	Stale          bool   `json:"stale"`
	SelectedAt     string `json:"selectedAt"`
	LastAccessAt   string `json:"lastAccessAt"`
}

// GET /atlas/offline/folders
//
// O que este usuário mantém offline, com a revisão de cada lado. É a resposta
// que o dispositivo pede ao voltar do zero, e a que ele compara ao acordar.
func (h *AtlasHandler) ListOfflineFolders(c *fiber.Ctx) error {
	userID, _ := actor(c)
	rows, err := h.db.Query(c.Context(), `
		SELECT f.jobsite_id, COALESCE(j.name,''), f.document_id, COALESCE(d.name,''),
		       f.local_revision,
		       COALESCE((SELECT max(v.seq) FROM atlas_document_version v
		                  WHERE v.document_id = f.document_id
		                    AND v.status IN ('uploaded','published')), 0),
		       f.selected_at, f.last_access_at
		  FROM atlas_offline_folder f
		  LEFT JOIN atlas_jobsite  j ON j.id = f.jobsite_id
		  LEFT JOIN atlas_document d ON d.id = f.document_id
		 WHERE f.user_id = $1
		 ORDER BY j.name, d.name`, userID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []offlineFolder{}
	for rows.Next() {
		var f offlineFolder
		var sel, acc time.Time
		if err := rows.Scan(&f.JobsiteID, &f.JobsiteName, &f.DocumentID, &f.DocumentName,
			&f.LocalRevision, &f.ServerRevision, &sel, &acc); err != nil {
			continue
		}
		f.SelectedAt = sel.Format(time.RFC3339)
		f.LastAccessAt = acc.Format(time.RFC3339)
		// Vencida é ter menos do que o servidor tem. Ter zero é não ter baixado
		// ainda, o que é outro estado e não se resolve baixando por cima.
		f.Stale = f.LocalRevision > 0 && f.ServerRevision > f.LocalRevision
		out = append(out, f)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /atlas/offline/folders/:documentId
//
// Marca a pasta como mantida offline, ou atualiza o que o aparelho tem dela.
//
// O mesmo verbo serve para escolher e para carimbar, e é de propósito: as duas
// coisas são a mesma afirmação, "este aparelho tem esta pasta neste estado". Uma
// rota separada só para o carimbo produziria duas fontes para o mesmo fato.
func (h *AtlasHandler) SetOfflineFolder(c *fiber.Ctx) error {
	documentID := c.Params("documentId")
	userID, _ := actor(c)

	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_document WHERE id = $1`, documentID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "documento")
	}
	// Manter offline é uma forma de ler, então cobra a mesma permissão de ler.
	// Sem isto, uma pasta perdida de vista continuaria descendo para o aparelho
	// de quem já não deveria abri-la.
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		LocalRevision *int `json:"localRevision"`
		Touch         bool `json:"touch"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}

	// `touch` carimba o acesso sem mexer na revisão. É o que o dispositivo manda
	// ao abrir a pasta: sem isso o relógio da expiração só andaria quando
	// houvesse download, e uma pasta consultada todo dia seria dada como
	// abandonada.
	var lastAccess any = nil
	if in.Touch {
		lastAccess = time.Now()
	}

	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_offline_folder (user_id, jobsite_id, document_id, local_revision, last_access_at)
		VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, now()))
		ON CONFLICT (user_id, document_id) DO UPDATE SET
			local_revision = COALESCE($4, atlas_offline_folder.local_revision),
			last_access_at = COALESCE($5, atlas_offline_folder.last_access_at)`,
		userID, jobsiteID, documentID, in.LocalRevision, lastAccess)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"documentId": documentID, "offline": true}})
}

// DELETE /atlas/offline/folders/:documentId
//
// Deixar de manter offline. Apaga a linha mesmo, ao contrário da revogação de
// acesso: aqui não há nada a provar depois, é preferência de aparelho, e uma
// linha morta atrapalharia a contagem de quem mantém a pasta.
func (h *AtlasHandler) UnsetOfflineFolder(c *fiber.Ctx) error {
	userID, _ := actor(c)
	_, err := h.db.Exec(c.Context(),
		`DELETE FROM atlas_offline_folder WHERE user_id = $1 AND document_id = $2`,
		userID, c.Params("documentId"))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"documentId": c.Params("documentId"), "offline": false}})
}

// GET /atlas/documents/:id/offline-holders
//
// Quem mantém esta pasta no aparelho, e com que revisão.
//
// É a consulta do aviso de sobrescrita, o cenário perigoso: alguém publica
// revisão nova e há gente no canteiro com a antiga baixada, executando a partir
// dela. Cobra `manage` porque é sobre a obra dos outros, não sobre a própria
// seleção.
func (h *AtlasHandler) ListOfflineHolders(c *fiber.Ctx) error {
	documentID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_document WHERE id = $1`, documentID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT f.user_id, COALESCE(u.name,''), COALESCE(u.email,''),
		       f.local_revision, f.last_access_at
		  FROM atlas_offline_folder f
		  LEFT JOIN users u ON u.id = f.user_id
		 WHERE f.document_id = $1
		 ORDER BY u.name`, documentID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type holder struct {
		UserID        string `json:"userId"`
		Name          string `json:"name"`
		Email         string `json:"email"`
		LocalRevision int    `json:"localRevision"`
		LastAccessAt  string `json:"lastAccessAt"`
	}
	out := []holder{}
	for rows.Next() {
		var hd holder
		var acc time.Time
		if rows.Scan(&hd.UserID, &hd.Name, &hd.Email, &hd.LocalRevision, &acc) == nil {
			hd.LastAccessAt = acc.Format(time.RFC3339)
			out = append(out, hd)
		}
	}
	return c.JSON(fiber.Map{"data": out})
}
