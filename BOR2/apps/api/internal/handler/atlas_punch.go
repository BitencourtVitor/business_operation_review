package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// A lista de verificação da obra.
//
// Os pontos não são uma entidade nova: cada um é uma linha de `atlas_event`,
// ancorada numa coordenada de uma folha. O que muda aqui é a pergunta. O painel
// de Tasks pergunta "o que está aberto nesta obra"; a lista de verificação
// pergunta "o que foi levantado neste pavimento, esteja aberto ou não, e em que
// pé está cada um".
//
// A diferença que faz isso funcionar é o escopo. A verificação é escopada por
// **subcategoria**, que na prática é o andar, e a subcategoria mora no
// documento, não na folha. Percorrer o primeiro andar de um prédio com três
// pastas categorizadas por pavimento tem de trazer os pontos das três pastas, e
// é por isso que a consulta sobe de folha para versão, de versão para documento,
// e agrupa por lá. Escopar por documento traria um terço do andar.

type punchPoint struct {
	ID string `json:"id"`
	// O número contínuo por obra. É por ele que o ponto é chamado no canteiro
	// e citado no relatório impresso, e é o que a colisão de sincronização
	// protege.
	Number      *int   `json:"number"`
	Title       string `json:"title"`
	Body        string `json:"body"`
	Status      string `json:"status"`
	SheetID     string `json:"sheetId"`
	SheetNumber string `json:"sheetNumber"`
	PageIndex   int    `json:"pageIndex"`
	DocumentID  string `json:"documentId"`
	Document    string `json:"document"`
	Category    string `json:"category"`
	Subcategory string `json:"subcategory"`
	// A coordenada normalizada do ponto na página. É o que permite ao relatório
	// recortar a região do desenho em volta dele, em vez de mandar a prancha
	// inteira e deixar quem lê procurar.
	PageX    *float64 `json:"pageX"`
	PageY    *float64 `json:"pageY"`
	Photos   int      `json:"photos"`
	Comments int      `json:"comments"`

	CreatedBy   string `json:"createdBy"`
	CreatedName string `json:"createdName"`
	CreatedAt   string `json:"createdAt"`
	ResolvedAt  string `json:"resolvedAt"`
}

const punchSelect = `
	SELECT e.id, e.point_number, e.title, e.body, e.status,
	       e.sheet_id, COALESCE(s.sheet_number,''), COALESCE(s.page_index,0),
	       d.id, COALESCE(d.name,''), COALESCE(d.category,''), COALESCE(d.subcategory,''),
	       e.page_x, e.page_y,
	       (SELECT count(*) FROM atlas_media m
	         WHERE m.event_id = e.id AND m.status = 'uploaded'
	           AND m.content_type LIKE 'image/%'),
	       (SELECT count(*) FROM atlas_event_reply r WHERE r.event_id = e.id),
	       e.created_by, COALESCE(u.name,''), e.created_at, e.resolved_at
	  FROM atlas_event e
	  JOIN atlas_sheet s            ON s.id = e.sheet_id
	  JOIN atlas_document_version v ON v.id = s.version_id
	  JOIN atlas_document d         ON d.id = v.document_id
	  LEFT JOIN users u             ON u.id = e.created_by
	 WHERE e.jobsite_id = $1
	   AND ($2 = '' OR d.subcategory = $2)
	   AND ($3 = '' OR e.status = $3)
	 ORDER BY e.point_number NULLS LAST, e.created_at`

// GET /atlas/jobsites/:id/punch-list?subcategory=&status=
func (h *AtlasHandler) ListPunchList(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	sub := c.Query("subcategory")
	status := c.Query("status")
	if status != "" && status != "open" && status != "resolved" {
		return badRequest(c, "status must be open or resolved")
	}

	rows, err := h.db.Query(c.Context(), punchSelect, jobsiteID, sub, status)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []punchPoint{}
	for rows.Next() {
		var p punchPoint
		var created time.Time
		var resolved *time.Time
		if err := rows.Scan(&p.ID, &p.Number, &p.Title, &p.Body, &p.Status,
			&p.SheetID, &p.SheetNumber, &p.PageIndex,
			&p.DocumentID, &p.Document, &p.Category, &p.Subcategory,
			&p.PageX, &p.PageY, &p.Photos, &p.Comments,
			&p.CreatedBy, &p.CreatedName, &created, &resolved); err != nil {
			continue
		}
		p.CreatedAt = created.Format(time.RFC3339)
		if resolved != nil {
			p.ResolvedAt = resolved.Format(time.RFC3339)
		}
		out = append(out, p)
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /atlas/jobsites/:id/punch-list/summary
//
// Quantos pontos por pavimento, e quantos já foram resolvidos.
//
// É o que permite acompanhar o andamento da verificação de cada andar sem
// baixar os pontos todos. A conta sai do banco e não de contar no cliente
// porque a distribuição é irregular por natureza: sessenta pontos podem estar
// espalhados por vinte plantas, e não há regra de quantidade por planta.
func (h *AtlasHandler) PunchListSummary(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT COALESCE(d.subcategory,''), COALESCE(d.category,''),
		       count(*) FILTER (WHERE e.status <> 'resolved'),
		       count(*) FILTER (WHERE e.status  = 'resolved'),
		       count(*)
		  FROM atlas_event e
		  JOIN atlas_sheet s            ON s.id = e.sheet_id
		  JOIN atlas_document_version v ON v.id = s.version_id
		  JOIN atlas_document d         ON d.id = v.document_id
		 WHERE e.jobsite_id = $1
		 GROUP BY d.subcategory, d.category
		 ORDER BY d.subcategory`, jobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type bucket struct {
		Subcategory string `json:"subcategory"`
		Category    string `json:"category"`
		Open        int    `json:"open"`
		Resolved    int    `json:"resolved"`
		Total       int    `json:"total"`
	}
	buckets := []bucket{}
	total := bucket{Subcategory: "", Category: ""}
	for rows.Next() {
		var b bucket
		if rows.Scan(&b.Subcategory, &b.Category, &b.Open, &b.Resolved, &b.Total) == nil {
			buckets = append(buckets, b)
			total.Open += b.Open
			total.Resolved += b.Resolved
			total.Total += b.Total
		}
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"bySubcategory": buckets,
		"jobsite": fiber.Map{
			"open": total.Open, "resolved": total.Resolved, "total": total.Total,
		},
	}})
}

// GET /atlas/jobsites/:id/punch-list/subcategories
//
// Os pavimentos que a obra tem, para a verificação poder ser iniciada apontando
// um deles.
//
// Sai dos documentos e não de uma lista à parte: a subcategoria de uma obra é o
// que as pastas dela declaram, e uma segunda lista seria mais uma coisa para
// divergir. Traz a contagem de folhas junto porque quem escolhe o andar quer
// saber o tamanho do que vai percorrer.
func (h *AtlasHandler) PunchListSubcategories(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT COALESCE(d.subcategory,''), COALESCE(d.category,''),
		       count(DISTINCT d.id), count(s.id)
		  FROM atlas_document d
		  LEFT JOIN atlas_document_version v ON v.document_id = d.id
		  LEFT JOIN atlas_sheet s            ON s.version_id  = v.id
		 WHERE d.jobsite_id = $1 AND d.archived_at IS NULL
		 GROUP BY d.subcategory, d.category
		 HAVING COALESCE(d.subcategory,'') <> ''
		 ORDER BY d.subcategory`, jobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type scope struct {
		Subcategory string `json:"subcategory"`
		Category    string `json:"category"`
		Documents   int    `json:"documents"`
		Sheets      int    `json:"sheets"`
	}
	out := []scope{}
	for rows.Next() {
		var s scope
		if rows.Scan(&s.Subcategory, &s.Category, &s.Documents, &s.Sheets) == nil {
			out = append(out, s)
		}
	}
	return c.JSON(fiber.Map{"data": out})
}
