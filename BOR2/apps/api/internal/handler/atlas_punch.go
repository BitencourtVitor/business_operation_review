package handler

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// A verificação da obra, e a passagem que a conduz.
//
// Os pontos não são uma entidade nova: cada um é uma linha de `atlas_event`,
// ancorada numa coordenada de uma folha. O que muda aqui é a pergunta. O painel
// de Tasks pergunta "o que está aberto nesta obra"; a verificação pergunta "o
// que foi levantado neste pavimento, esteja aberto ou não, e em que pé está
// cada um".
//
// ── A passagem ──
//
// Desde a migração 000159 o punch é uma coisa e não um filtro. Cada percurso de
// um escopo é uma linha de `atlas_punch`, com identidade, data de abertura, quem
// abriu e fechamento. Percorrer o mesmo andar em março e de novo em junho produz
// duas passagens, e não um monte só.
//
// O ponto se pendura na passagem pelo `punch_id`, e quem escolhe a passagem é o
// escopo da pasta em que ele foi levantado. Ninguém precisa abrir passagem antes
// de sair a campo: o primeiro ponto de um escopo sem passagem aberta abre uma.
// Obrigar a abrir antes seria uma etapa a mais entre ver o problema e registrar
// o problema, que é onde o registro se perde.
//
// ── O escopo ──
//
// A unidade é a subcategoria, que na prática é o andar ou a unidade: 1st floor,
// C unit. Quando a categoria não tem eixo, e Permit Set é assim, o escopo é a
// própria categoria. A regra inteira mora na view `atlas_documento_escopo`
// (migração 000161), inclusive a leitura das colunas antigas para a pasta que
// ainda não tem tag.
//
// A consulta sobe de folha para versão e de versão para pasta porque a categoria
// mora na pasta, não na folha: o primeiro andar de um prédio com três pastas
// categorizadas por pavimento tem de trazer os pontos das três.

type punchPoint struct {
	ID string `json:"id"`
	// O número contínuo por obra. É por ele que o ponto é chamado no canteiro
	// e citado no relatório impresso, e é o que a colisão de sincronização
	// protege.
	Number      *int   `json:"number"`
	Title       string `json:"title"`
	Body        string `json:"body"`
	Status      string `json:"status"`
	PunchID     string `json:"punchId"`
	SheetID     string `json:"sheetId"`
	SheetNumber string `json:"sheetNumber"`
	PageIndex   int    `json:"pageIndex"`
	DocumentID  string `json:"documentId"`
	Document    string `json:"document"`
	Category    string `json:"category"`
	Subcategory string `json:"subcategory"`
	ScopeKind   string `json:"scopeKind"`
	ScopeValue  string `json:"scopeValue"`
	// A coordenada normalizada do ponto na página. É o que permite ao relatório
	// recortar a região do desenho em volta dele, em vez de mandar a prancha
	// inteira e deixar quem lê procurar.
	PageX    *float64 `json:"pageX"`
	PageY    *float64 `json:"pageY"`
	Photos   int      `json:"photos"`
	Videos   int      `json:"videos"`
	Audios   int      `json:"audios"`
	After    int      `json:"after"`
	Comments int      `json:"comments"`

	CreatedBy   string `json:"createdBy"`
	CreatedName string `json:"createdName"`
	CreatedAt   string `json:"createdAt"`
	ResolvedAt  string `json:"resolvedAt"`
}

// A contagem de mídia por fase e por tipo.
//
// Antes era uma só, "fotos", filtrando image. O vídeo passou a valer como prova
// na migração 000160, e o áudio entrou como descrição falada: somar os três numa
// contagem só faria a lista dizer que um ponto tem três fotos quando ele tem uma
// foto, um vídeo e o áudio de quem descreveu o problema.
const punchSelect = `
	SELECT e.id, e.point_number, e.title, e.body, e.status, COALESCE(e.punch_id,''),
	       e.sheet_id, COALESCE(s.sheet_number,''), COALESCE(s.page_index,0),
	       d.id, COALESCE(d.name,''), COALESCE(d.category,''), COALESCE(d.subcategory,''),
	       esc.scope_kind, esc.scope_value,
	       e.page_x, e.page_y,
	       (SELECT count(*) FROM atlas_media m
	         WHERE m.event_id = e.id AND m.status = 'uploaded'
	           AND m.content_type LIKE 'image/%'),
	       (SELECT count(*) FROM atlas_media m
	         WHERE m.event_id = e.id AND m.status = 'uploaded'
	           AND m.content_type LIKE 'video/%'),
	       (SELECT count(*) FROM atlas_media m
	         WHERE m.event_id = e.id AND m.status = 'uploaded'
	           AND m.content_type LIKE 'audio/%'),
	       (SELECT count(*) FROM atlas_media m
	         WHERE m.event_id = e.id AND m.status = 'uploaded' AND m.phase = 'after'
	           AND (m.content_type LIKE 'image/%' OR m.content_type LIKE 'video/%')),
	       (SELECT count(*) FROM atlas_event_reply r WHERE r.event_id = e.id),
	       e.created_by, COALESCE(u.name,''), e.created_at, e.resolved_at
	  FROM atlas_event e
	  JOIN atlas_sheet s              ON s.id = e.sheet_id
	  JOIN atlas_document_version v   ON v.id = s.version_id
	  JOIN atlas_document d           ON d.id = v.document_id
	  JOIN atlas_documento_escopo esc ON esc.document_id = d.id
	  LEFT JOIN users u               ON u.id = e.created_by
	 WHERE e.jobsite_id = $1
	   AND ($2 = '' OR e.punch_id = $2)
	   AND ($3 = '' OR esc.scope_value = $3)
	   AND ($4 = '' OR e.status = $4)
	 ORDER BY e.point_number NULLS LAST, e.created_at`

// GET /atlas/jobsites/:id/punch-list?punch=&scope=&status=
//
// `scope` continua aceitando o valor da subcategoria, que é como a tela antiga
// chamava, e `subcategory` segue valendo como nome do mesmo parâmetro: link
// salvo não pode parar de funcionar por causa de renomeação interna.
func (h *AtlasHandler) ListPunchList(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	scope := c.Query("scope")
	if scope == "" {
		scope = c.Query("subcategory")
	}
	status := c.Query("status")
	if status != "" && status != "open" && status != "resolved" {
		return badRequest(c, "status must be open or resolved")
	}

	rows, err := h.db.Query(c.Context(), punchSelect, jobsiteID, c.Query("punch"), scope, status)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []punchPoint{}
	for rows.Next() {
		var p punchPoint
		var created time.Time
		var resolved *time.Time
		if err := rows.Scan(&p.ID, &p.Number, &p.Title, &p.Body, &p.Status, &p.PunchID,
			&p.SheetID, &p.SheetNumber, &p.PageIndex,
			&p.DocumentID, &p.Document, &p.Category, &p.Subcategory,
			&p.ScopeKind, &p.ScopeValue,
			&p.PageX, &p.PageY, &p.Photos, &p.Videos, &p.Audios, &p.After, &p.Comments,
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
// Quantos pontos por escopo, e quantos já foram resolvidos.
//
// É o que permite acompanhar o andamento de cada andar sem baixar os pontos
// todos. A conta sai do banco e não de contar no cliente porque a distribuição é
// irregular por natureza: sessenta pontos podem estar espalhados por vinte
// plantas, e não há regra de quantidade por planta.
func (h *AtlasHandler) PunchListSummary(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT esc.scope_kind, esc.scope_value,
		       count(*) FILTER (WHERE e.status <> 'resolved'),
		       count(*) FILTER (WHERE e.status  = 'resolved'),
		       count(*)
		  FROM atlas_event e
		  JOIN atlas_sheet s              ON s.id = e.sheet_id
		  JOIN atlas_document_version v   ON v.id = s.version_id
		  JOIN atlas_documento_escopo esc ON esc.document_id = v.document_id
		 WHERE e.jobsite_id = $1
		 GROUP BY 1, 2
		 ORDER BY 2`, jobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type bucket struct {
		ScopeKind  string `json:"scopeKind"`
		ScopeValue string `json:"scopeValue"`
		// Mantidos com o nome antigo para a tela que ainda lê por aqui.
		Subcategory string `json:"subcategory"`
		Category    string `json:"category"`
		Open        int    `json:"open"`
		Resolved    int    `json:"resolved"`
		Total       int    `json:"total"`
	}
	buckets := []bucket{}
	total := bucket{}
	for rows.Next() {
		var b bucket
		if rows.Scan(&b.ScopeKind, &b.ScopeValue, &b.Open, &b.Resolved, &b.Total) == nil {
			if b.ScopeKind == "subcategory" {
				b.Subcategory = b.ScopeValue
			} else {
				b.Category = b.ScopeValue
			}
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

// GET /atlas/jobsites/:id/punch-list/media?punch=&scope=&status=
//
// Toda a mídia dos pontos de um escopo, de uma vez e já com URL assinada.
//
// Existe por causa do relatório. Ele mostra a foto do problema e as peças que
// documentam a solução, e pedir isso ponto a ponto seriam sessenta chamadas
// numa lista de sessenta pontos, em aparelho de campo. A consulta é a mesma da
// lista de pontos, com a mídia pendurada.
func (h *AtlasHandler) PunchListMedia(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	scope := c.Query("scope")
	if scope == "" {
		scope = c.Query("subcategory")
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT m.id, m.event_id, m.r2_key, m.content_type, m.phase,
		       m.title, m.description, m.caption, m.transcript,
		       COALESCE(m.taken_at, m.uploaded_at)
		  FROM atlas_media m
		  JOIN atlas_event e               ON e.id = m.event_id
		  JOIN atlas_sheet s               ON s.id = e.sheet_id
		  JOIN atlas_document_version v    ON v.id = s.version_id
		  JOIN atlas_documento_escopo esc  ON esc.document_id = v.document_id
		 WHERE m.jobsite_id = $1 AND m.status = 'uploaded'
		   AND ($2 = '' OR e.punch_id = $2)
		   AND ($3 = '' OR esc.scope_value = $3)
		   AND ($4 = '' OR e.status = $4)
		 ORDER BY m.phase DESC, COALESCE(m.taken_at, m.uploaded_at)`,
		jobsiteID, c.Query("punch"), scope, c.Query("status"))
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type peca struct {
		ID          string `json:"id"`
		EventID     string `json:"eventId"`
		ContentType string `json:"contentType"`
		Phase       string `json:"phase"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Caption     string `json:"caption"`
		Transcript  string `json:"transcript"`
		TakenAt     string `json:"takenAt"`
		URL         string `json:"url"`
	}
	out := []peca{}
	chaves := []string{}
	for rows.Next() {
		var p peca
		var chave string
		var quando time.Time
		if err := rows.Scan(&p.ID, &p.EventID, &chave, &p.ContentType, &p.Phase,
			&p.Title, &p.Description, &p.Caption, &p.Transcript, &quando); err != nil {
			continue
		}
		p.TakenAt = quando.Format(time.RFC3339)
		out = append(out, p)
		chaves = append(chaves, chave)
	}
	if h.r2.Configured() {
		for i := range out {
			// Meia hora é o bastante para montar e imprimir o relatório, e curto
			// o bastante para o endereço não circular depois num PDF salvo.
			if url, err := h.r2.DownloadURL(c.Context(), chaves[i], 30*time.Minute); err == nil {
				out[i].URL = url
			}
		}
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── Os escopos e as passagens ───────────────────────────────────────────────

type punchScope struct {
	Kind  string `json:"kind"`
	Value string `json:"value"`
	// floor ou unit, quando o escopo é uma subcategoria. É o que deixa a tela
	// escrever "1st Floor" em vez de "1st", que sozinho não diz nada.
	Axis string `json:"axis"`
	// Quantas pastas e quantas folhas o escopo alcança. Quem escolhe o andar
	// quer saber o tamanho do que vai percorrer.
	Documents int `json:"documents"`
	Sheets    int `json:"sheets"`
	// De quais categorias são essas pastas.
	//
	// Um escopo de subcategoria junta categorias diferentes: o primeiro andar
	// tem Wall Panels, Floor Layout e Trusses, e a rodada daquele andar percorre
	// os três. A contagem sozinha escondia isso, e saber o que ia ser percorrido
	// exigia abrir.
	Folders []string `json:"folders"`
	// A passagem aberta neste escopo, quando há uma, e quem a abriu.
	//
	// O nome vem junto porque o cartão o mostra ao lado do título: numa obra com
	// subcontratado dentro, quem conduz a verificação é informação de primeira
	// linha, e o cargo aparece como ícone antes de alguém ler o nome.
	PunchID    string `json:"punchId"`
	OpenedAt   string `json:"openedAt"`
	OpenedName string `json:"openedName"`
	OpenedRole string `json:"openedRole"`
	// O andamento da passagem aberta.
	Open     int `json:"open"`
	Resolved int `json:"resolved"`
	Total    int `json:"total"`
	// Quantas passagens já foram fechadas aqui. É o histórico do escopo.
	Closed int `json:"closed"`
}

// GET /atlas/jobsites/:id/punch-list/scopes
//
// Os escopos que a obra tem, com a passagem aberta de cada um.
//
// Sai das pastas e não de uma lista à parte: o escopo de uma obra é o que as
// pastas dela declaram, e uma segunda lista seria mais uma coisa para divergir.
func (h *AtlasHandler) PunchListScopes(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT esc.scope_kind, esc.scope_value, esc.scope_axis,
		       count(DISTINCT d.id), count(s.id),
		       array_agg(DISTINCT esc.category_name),
		       COALESCE(p.id,''), p.opened_at,
		       COALESCE(pu.name,''), COALESCE(pu.role::text,''),
		       COALESCE((SELECT count(*) FROM atlas_event e
		                  WHERE e.punch_id = p.id AND e.status <> 'resolved'), 0),
		       COALESCE((SELECT count(*) FROM atlas_event e
		                  WHERE e.punch_id = p.id AND e.status  = 'resolved'), 0),
		       COALESCE((SELECT count(*) FROM atlas_punch f
		                  WHERE f.jobsite_id = d.jobsite_id AND f.scope_kind = esc.scope_kind
		                    AND f.scope_value = esc.scope_value AND f.closed_at IS NOT NULL), 0)
		  FROM atlas_document d
		  JOIN atlas_documento_escopo esc      ON esc.document_id = d.id
		  LEFT JOIN LATERAL (
		      SELECT v.id FROM atlas_document_version v
		       WHERE v.document_id = d.id
		       ORDER BY v.uploaded_at DESC
		       LIMIT 1
		  ) v ON true
		  LEFT JOIN atlas_sheet s              ON s.version_id  = v.id
		  LEFT JOIN atlas_punch p              ON p.jobsite_id = d.jobsite_id
		                                      AND p.scope_kind = esc.scope_kind
		                                      AND p.scope_value = esc.scope_value
		                                      AND p.closed_at IS NULL
		  LEFT JOIN users pu                   ON pu.id = p.opened_by
		 WHERE d.jobsite_id = $1 AND d.archived_at IS NULL
		 GROUP BY esc.scope_kind, esc.scope_value, esc.scope_axis, p.id, p.opened_at,
		          pu.name, pu.role, d.jobsite_id
		 -- O que está sendo percorrido vem primeiro, depois o que já foi
		 -- percorrido alguma vez, e por último o que ninguém começou. A tela
		 -- apaga o escopo sem rodada, e deixá-lo no meio da grade obrigava a
		 -- procurar o que interessa entre o que não interessa.
		 ORDER BY (p.id IS NULL),
		          (SELECT count(*) FROM atlas_punch f
		            WHERE f.jobsite_id = d.jobsite_id AND f.scope_kind = esc.scope_kind
		              AND f.scope_value = esc.scope_value AND f.closed_at IS NOT NULL) = 0,
		          esc.scope_value`, jobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []punchScope{}
	for rows.Next() {
		var s punchScope
		var aberto *time.Time
		if err := rows.Scan(&s.Kind, &s.Value, &s.Axis, &s.Documents, &s.Sheets, &s.Folders,
			&s.PunchID, &aberto, &s.OpenedName, &s.OpenedRole,
			&s.Open, &s.Resolved, &s.Closed); err != nil {
			continue
		}
		if aberto != nil {
			s.OpenedAt = aberto.Format(time.RFC3339)
		}
		s.Total = s.Open + s.Resolved
		out = append(out, s)
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /atlas/jobsites/:id/punch-list/subcategories
//
// A forma antiga da listagem acima, mantida enquanto houver tela lendo por ela.
func (h *AtlasHandler) PunchListSubcategories(c *fiber.Ctx) error {
	return h.PunchListScopes(c)
}

type atlasPunch struct {
	ID         string `json:"id"`
	JobsiteID  string `json:"jobsiteId"`
	ScopeKind  string `json:"scopeKind"`
	ScopeValue string `json:"scopeValue"`
	Name       string `json:"name"`
	Notes      string `json:"notes"`
	OpenedAt   string `json:"openedAt"`
	OpenedBy   string `json:"openedBy"`
	OpenedName string `json:"openedName"`
	ClosedAt   string `json:"closedAt"`
	ClosedBy   string `json:"closedBy"`
	Open       int    `json:"open"`
	Resolved   int    `json:"resolved"`
	Total      int    `json:"total"`
}

const punchListaSelect = `
	SELECT p.id, p.jobsite_id, p.scope_kind, p.scope_value, p.name, p.notes,
	       p.opened_at, p.opened_by, COALESCE(u.name,''), p.closed_at, COALESCE(p.closed_by,''),
	       (SELECT count(*) FROM atlas_event e WHERE e.punch_id = p.id AND e.status <> 'resolved'),
	       (SELECT count(*) FROM atlas_event e WHERE e.punch_id = p.id AND e.status  = 'resolved')
	  FROM atlas_punch p
	  LEFT JOIN users u ON u.id = p.opened_by`

func lerPunch(scan func(...any) error) (atlasPunch, error) {
	var p atlasPunch
	var aberto time.Time
	var fechado *time.Time
	if err := scan(&p.ID, &p.JobsiteID, &p.ScopeKind, &p.ScopeValue, &p.Name, &p.Notes,
		&aberto, &p.OpenedBy, &p.OpenedName, &fechado, &p.ClosedBy,
		&p.Open, &p.Resolved); err != nil {
		return p, err
	}
	p.OpenedAt = aberto.Format(time.RFC3339)
	if fechado != nil {
		p.ClosedAt = fechado.Format(time.RFC3339)
	}
	p.Total = p.Open + p.Resolved
	return p, nil
}

// GET /atlas/jobsites/:id/punches?scope=&open=1
func (h *AtlasHandler) ListPunches(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	sql := punchListaSelect + ` WHERE p.jobsite_id = $1 AND ($2 = '' OR p.scope_value = $2)`
	if c.Query("open") != "" {
		sql += ` AND p.closed_at IS NULL`
	}
	sql += ` ORDER BY p.closed_at NULLS FIRST, p.opened_at DESC`

	rows, err := h.db.Query(c.Context(), sql, jobsiteID, c.Query("scope"))
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasPunch{}
	for rows.Next() {
		if p, err := lerPunch(rows.Scan); err == nil {
			out = append(out, p)
		}
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/jobsites/:id/punches
//
// Abre a passagem de um escopo. Já havendo uma aberta, devolve a que existe em
// vez de recusar: dois toques no mesmo botão, que no celular acontece, não podem
// virar erro na cara de quem está em obra.
func (h *AtlasHandler) OpenPunch(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		ScopeKind  string `json:"scopeKind"`
		ScopeValue string `json:"scopeValue"`
		Name       string `json:"name"`
		Notes      string `json:"notes"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	in.ScopeValue = strings.TrimSpace(in.ScopeValue)
	if in.ScopeValue == "" {
		return badRequest(c, "scopeValue is required")
	}
	if in.ScopeKind != "subcategory" && in.ScopeKind != "category" {
		in.ScopeKind = "subcategory"
	}
	userID, _ := actor(c)

	id, err := h.abrirPunch(c, jobsiteID, in.ScopeKind, in.ScopeValue, userID)
	if err != nil {
		return internalErr(c, err)
	}
	if strings.TrimSpace(in.Name) != "" || strings.TrimSpace(in.Notes) != "" {
		_, _ = h.db.Exec(c.Context(), `
			UPDATE atlas_punch SET name = COALESCE(NULLIF($2,''), name),
			                       notes = COALESCE(NULLIF($3,''), notes)
			 WHERE id = $1`, id, strings.TrimSpace(in.Name), strings.TrimSpace(in.Notes))
	}
	row := h.db.QueryRow(c.Context(), punchListaSelect+` WHERE p.id = $1`, id)
	p, err := lerPunch(row.Scan)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": p})
}

// abrirPunch devolve a passagem aberta do escopo, criando uma se não houver.
//
// O índice único parcial do banco é quem garante que não nasçam duas: aqui a
// inserção pede para ser ignorada em conflito e a consulta seguinte devolve a
// que ficou, valha ela desta chamada ou da que correu ao mesmo tempo.
func (h *AtlasHandler) abrirPunch(c *fiber.Ctx, jobsiteID, kind, value, userID string) (string, error) {
	id := uuid.NewString()
	if _, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_punch (id, jobsite_id, scope_kind, scope_value, opened_by)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT DO NOTHING`, id, jobsiteID, kind, value, userID); err != nil {
		return "", err
	}
	var achado string
	if err := h.db.QueryRow(c.Context(), `
		SELECT id FROM atlas_punch
		 WHERE jobsite_id=$1 AND scope_kind=$2 AND scope_value=$3 AND closed_at IS NULL`,
		jobsiteID, kind, value).Scan(&achado); err != nil {
		return "", err
	}
	return achado, nil
}

// punchDaFolha devolve a passagem em que um ponto daquela folha deve entrar.
//
// É chamada no nascimento do ponto. O escopo vem da pasta da folha, e a passagem
// é a aberta daquele escopo, criada na hora se ainda não existir.
func (h *AtlasHandler) punchDaFolha(c *fiber.Ctx, jobsiteID, sheetID, userID string) string {
	if sheetID == "" {
		return ""
	}
	var kind, value string
	err := h.db.QueryRow(c.Context(), `
		SELECT esc.scope_kind, esc.scope_value
		  FROM atlas_sheet s
		  JOIN atlas_document_version v   ON v.id = s.version_id
		  JOIN atlas_documento_escopo esc ON esc.document_id = v.document_id
		 WHERE s.id = $1`, sheetID).Scan(&kind, &value)
	if err != nil || value == "" {
		return ""
	}
	id, err := h.abrirPunch(c, jobsiteID, kind, value, userID)
	if err != nil {
		return ""
	}
	return id
}

// POST /atlas/punches/:id/close
//
// Fechar é ato de quem conduz a verificação, e por isso exige `manage`. A trava
// de ponto pendente mora no banco (migração 000159): aqui ela vira mensagem em
// vez de erro de restrição, que é o que a tela consegue mostrar.
func (h *AtlasHandler) ClosePunch(c *fiber.Ctx) error {
	punchID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_punch WHERE id=$1`, punchID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "punch")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	userID, _ := actor(c)

	var pendentes int
	_ = h.db.QueryRow(c.Context(),
		`SELECT count(*) FROM atlas_event WHERE punch_id=$1 AND status <> 'resolved'`,
		punchID).Scan(&pendentes)
	if pendentes > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "this punch still has open points",
			"code":  "PUNCH_HAS_OPEN_POINTS",
		})
	}
	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_punch SET closed_at = now(), closed_by = $2 WHERE id = $1 AND closed_at IS NULL`,
		punchID, userID); err != nil {
		return internalErr(c, err)
	}
	row := h.db.QueryRow(c.Context(), punchListaSelect+` WHERE p.id = $1`, punchID)
	p, err := lerPunch(row.Scan)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": p})
}

// POST /atlas/punches/:id/reopen
//
// Reabrir só vale se o escopo não tiver outra passagem aberta, senão haveria
// duas listas concorrentes do mesmo andar.
func (h *AtlasHandler) ReopenPunch(c *fiber.Ctx) error {
	punchID := c.Params("id")
	var jobsiteID, kind, value string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id, scope_kind, scope_value FROM atlas_punch WHERE id=$1`,
		punchID).Scan(&jobsiteID, &kind, &value); err != nil {
		return atlasNotFound(c, "punch")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var abertas int
	_ = h.db.QueryRow(c.Context(), `
		SELECT count(*) FROM atlas_punch
		 WHERE jobsite_id=$1 AND scope_kind=$2 AND scope_value=$3 AND closed_at IS NULL`,
		jobsiteID, kind, value).Scan(&abertas)
	if abertas > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "this scope already has an open punch",
			"code":  "PUNCH_ALREADY_OPEN",
		})
	}
	if _, err := h.db.Exec(c.Context(),
		`UPDATE atlas_punch SET closed_at = NULL, closed_by = NULL WHERE id = $1`, punchID); err != nil {
		return internalErr(c, err)
	}
	row := h.db.QueryRow(c.Context(), punchListaSelect+` WHERE p.id = $1`, punchID)
	p, err := lerPunch(row.Scan)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": p})
}
