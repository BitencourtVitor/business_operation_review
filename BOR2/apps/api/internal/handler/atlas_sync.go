package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgconn"
)

// A subida da fila de campo.
//
// O cliente não manda estado final, manda o que aconteceu. Cada item é um fato
// carimbado no aparelho: ponto criado, comentário escrito, condição mudada, foto
// anexada. O servidor ordena, aplica em cascata e devolve o que aceitou, o que
// recusou e o que ficou preso esperando outro.
//
// Nada aqui é otimista. O item só sai da fila do aparelho quando volta marcado
// como `applied` nesta resposta — é isso que permite ao cliente reenviar sem
// medo quando o sinal cai antes da resposta chegar. Os ids nascem no aparelho
// justamente para o reenvio ser reconhecido em vez de duplicar.

type syncEventIn struct {
	ID         string          `json:"id"`
	JobsiteID  string          `json:"jobsiteId"`
	Kind       string          `json:"kind"`
	TargetID   string          `json:"targetId"`
	Payload    json.RawMessage `json:"payload"`
	DeviceID   string          `json:"deviceId"`
	DeviceSeq  int64           `json:"deviceSeq"`
	OccurredAt string          `json:"occurredAt"`
	// Minutos a leste de UTC no aparelho, no momento do registro. O cliente
	// manda `-new Date().getTimezoneOffset()`. Sem isto a linha do tempo
	// mostraria a hora em UTC, e um ponto registrado às 7 da manhã em
	// Massachusetts apareceria como meio-dia, contando uma história errada
	// sobre o turno.
	OccurredOffset int `json:"occurredOffsetMinutes"`
}

type syncEventOut struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Reason    string `json:"reason,omitempty"`
	BlockedBy string `json:"blockedBy,omitempty"`
}

// POST /atlas/sync
func (h *AtlasHandler) SyncEvents(c *fiber.Ctx) error {
	var in struct {
		Events []syncEventIn `json:"events"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if len(in.Events) == 0 {
		return c.JSON(fiber.Map{"data": []syncEventOut{}})
	}
	if len(in.Events) > 500 {
		return badRequest(c, "no máximo 500 eventos por lote")
	}

	userID, _ := actor(c)
	now := time.Now()

	// A ordem de aplicação é a do aparelho, não a de chegada no corpo.
	//
	// O JSON chega na ordem em que o cliente montou o array, e não há nada que
	// garanta que ela seja a ordem dos fatos. `device_seq` é monotônico dentro
	// do aparelho e é a única ordem confiável; `occurred_at` desempata entre
	// aparelhos diferentes, sabendo que o relógio de tablet em campo mente.
	eventos := append([]syncEventIn(nil), in.Events...)
	sort.SliceStable(eventos, func(i, j int) bool {
		if eventos[i].DeviceID != eventos[j].DeviceID {
			return eventos[i].OccurredAt < eventos[j].OccurredAt
		}
		return eventos[i].DeviceSeq < eventos[j].DeviceSeq
	})

	// Quem já travou neste lote. Um ponto cuja criação falhou contamina tudo o
	// que vem depois dele, e a razão de guardar o id do evento que travou é
	// poder dizer ao usuário qual é o problema único em vez de listar quatro.
	travados := map[string]string{}
	out := make([]syncEventOut, 0, len(eventos))

	for _, e := range eventos {
		res := syncEventOut{ID: e.ID}

		if e.ID == "" || e.TargetID == "" || e.JobsiteID == "" {
			res.Status, res.Reason = "rejected", "id, targetId e jobsiteId são obrigatórios"
			out = append(out, res)
			continue
		}

		// Reenvio do que já entrou. Não é erro: é a rede tendo caído depois de o
		// servidor aplicar e antes de a resposta chegar.
		var jaStatus, jaReason string
		if err := h.db.QueryRow(c.Context(),
			`SELECT status, reason FROM atlas_sync_event WHERE id = $1`, e.ID).
			Scan(&jaStatus, &jaReason); err == nil {
			res.Status, res.Reason = jaStatus, jaReason
			out = append(out, res)
			continue
		}

		if err := h.require(c, e.JobsiteID, "annotate"); err != nil {
			res.Status, res.Reason = "rejected", "sem permissão de anotar nesta obra"
			out = append(out, res)
			continue
		}

		ocorrido := now
		if t, err := time.Parse(time.RFC3339, e.OccurredAt); err == nil {
			ocorrido = t
		}

		// Bloqueio em cascata, antes de qualquer tentativa de aplicar: se o
		// ponto já travou, nem vale tentar o que pende dele.
		if travou, preso := travados[e.TargetID]; preso {
			res.Status, res.BlockedBy = "blocked", travou
			res.Reason = "depende de um evento que não pôde ser aplicado"
			h.gravaEvento(c, e, userID, ocorrido, "blocked", res.Reason, &travou)
			out = append(out, res)
			continue
		}

		status, reason := h.aplica(c, e, userID, ocorrido)
		res.Status, res.Reason = status, reason
		if status == "rejected" {
			// A partir daqui, tudo que pende deste ponto neste lote fica preso.
			travados[e.TargetID] = e.ID
		}
		h.gravaEvento(c, e, userID, ocorrido, status, reason, nil)
		out = append(out, res)
	}

	return c.JSON(fiber.Map{"data": out})
}

// isUniqueViolation diz se o erro é a trava de unicidade do Postgres, e não uma
// falha qualquer de escrita.
//
// A distinção importa porque as duas dão erro no mesmo lugar e pedem respostas
// opostas: colisão de número é decisão de negócio, com motivo que a pessoa
// precisa ler; qualquer outra coisa é defeito, e mascará-la como colisão faria
// um bug de banco chegar ao usuário como "alguém registrou antes".
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// isCheckViolation cobre as regras de negócio que moram em trigger, como a
// exigência da foto do depois.
func isCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514"
}

// aplica leva o fato para a projeção, que é `atlas_event` e as tabelas que
// pendem dela. É aqui que o evento vira o estado que as telas leem.
func (h *AtlasHandler) aplica(c *fiber.Ctx, e syncEventIn, userID string, ocorrido time.Time) (string, string) {
	switch e.Kind {

	case "point.created":
		var p struct {
			SheetID     string   `json:"sheetId"`
			Title       string   `json:"title"`
			Body        string   `json:"body"`
			PageX       *float64 `json:"pageX"`
			PageY       *float64 `json:"pageY"`
			PointNumber *int     `json:"pointNumber"`
		}
		_ = json.Unmarshal(e.Payload, &p)
		if p.SheetID == "" {
			// A regra que a migração 000149 tornou estrutural: task sem folha
			// não existe, porque é registro que ninguém consegue localizar.
			return "rejected", "ponto precisa estar ancorado numa folha"
		}
		// O número vem do aparelho quando ele estava offline, porque precisou
		// decidir antes de poder perguntar. Vindo nulo, o gatilho da obra pega o
		// próximo, que é o caso de quem criou com rede.
		_, err := h.db.Exec(c.Context(), `
			INSERT INTO atlas_event (id, jobsite_id, sheet_id, kind, title, body,
			                         page_x, page_y, point_number, created_by, created_at)
			VALUES ($1,$2,$3,'task',$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (id) DO NOTHING`,
			e.TargetID, e.JobsiteID, p.SheetID, p.Title, p.Body,
			p.PageX, p.PageY, p.PointNumber, userID, ocorrido)
		if err != nil {
			// Colisão de número é o caso que a decisão de 09/09 nomeou: outra
			// pessoa verificou em paralelo, sem sinal, e sincronizou antes. O
			// ponto que chega depois é inválido, e **não** é renumerado.
			//
			// Renumerar em silêncio pareceria gentileza e seria pior: o número
			// já está no relatório impresso que a pessoa levou ao canteiro e no
			// papel dela. Trocar por baixo faz o sistema e o mundo discordarem
			// sobre qual ponto é o 17. Recusar é ruidoso de propósito.
			if isUniqueViolation(err) {
				n := 0
				if p.PointNumber != nil {
					n = *p.PointNumber
				}
				return "rejected", fmt.Sprintf(
					"o ponto %d já foi registrado por outra pessoa nesta obra; "+
						"esta verificação foi feita em paralelo e precisa ser renumerada à mão", n)
			}
			return "rejected", "folha não existe mais nesta obra"
		}
		return "applied", ""

	case "point.commented":
		var p struct {
			ReplyID string `json:"replyId"`
			Body    string `json:"body"`
		}
		_ = json.Unmarshal(e.Payload, &p)
		if !h.pontoVivo(c, e.TargetID) {
			return "rejected", "o ponto foi excluído por outra pessoa"
		}
		id := p.ReplyID
		if id == "" {
			id = e.ID
		}
		if _, err := h.db.Exec(c.Context(), `
			INSERT INTO atlas_event_reply (id, event_id, author_id, body, created_at)
			VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
			id, e.TargetID, userID, p.Body, ocorrido); err != nil {
			return "rejected", "não foi possível gravar o comentário"
		}
		return "applied", ""

	case "point.status_changed":
		var p struct {
			Status string `json:"status"`
		}
		_ = json.Unmarshal(e.Payload, &p)
		if p.Status != "open" && p.Status != "resolved" {
			return "rejected", "condição desconhecida"
		}
		if !h.pontoVivo(c, e.TargetID) {
			return "rejected", "o ponto foi excluído por outra pessoa"
		}
		// Mesmos três braços do UpdateEvent: o par resolved_by/resolved_at só
		// existe enquanto a condição for 'resolved'.
		if _, err := h.db.Exec(c.Context(), `
			UPDATE atlas_event SET status = $2,
			       resolved_by = CASE WHEN $2 = 'resolved' THEN $3 ELSE NULL END,
			       resolved_at = CASE WHEN $2 = 'resolved' THEN $4 ELSE NULL END
			 WHERE id = $1`, e.TargetID, p.Status, userID, ocorrido); err != nil {
			// A trava do antes/depois mora no banco (migração 000156), porque
			// são três caminhos que fecham um ponto e uma regra guardada em um
			// deles é regra que os outros dois furam sem querer. Aqui ela é
			// traduzida para o que a pessoa lê na fila dela.
			if isCheckViolation(err) {
				return "rejected", "este ponto foi registrado com foto e precisa de uma foto do depois para ser concluído"
			}
			return "rejected", "não foi possível mudar a condição"
		}
		return "applied", ""

	case "point.photo_attached":
		// A foto em si sobe direto para o R2 pela URL assinada, como todo o
		// resto: o byte nunca atravessa esta API. O evento carrega só o vínculo,
		// e por isso ele é barato de enfileirar mesmo com dez fotos na fila.
		var p struct {
			MediaID string `json:"mediaId"`
			Phase   string `json:"phase"`
		}
		_ = json.Unmarshal(e.Payload, &p)
		if p.MediaID == "" {
			return "rejected", "mediaId é obrigatório"
		}
		if !h.pontoVivo(c, e.TargetID) {
			return "rejected", "o ponto foi excluído por outra pessoa"
		}
		fase := "before"
		if p.Phase == "after" {
			fase = "after"
		}
		if _, err := h.db.Exec(c.Context(),
			`UPDATE atlas_media SET event_id = $2, phase = $3 WHERE id = $1`,
			p.MediaID, e.TargetID, fase); err != nil {
			return "rejected", "mídia não encontrada"
		}
		return "applied", ""

	case "point.deleted":
		if _, err := h.db.Exec(c.Context(),
			`DELETE FROM atlas_event WHERE id = $1`, e.TargetID); err != nil {
			return "rejected", "não foi possível excluir o ponto"
		}
		return "applied", ""
	}
	return "rejected", "tipo de evento desconhecido"
}

func (h *AtlasHandler) pontoVivo(c *fiber.Ctx, id string) bool {
	var existe bool
	err := h.db.QueryRow(c.Context(),
		`SELECT true FROM atlas_event WHERE id = $1`, id).Scan(&existe)
	return err == nil && existe
}

func (h *AtlasHandler) gravaEvento(c *fiber.Ctx, e syncEventIn, userID string,
	ocorrido time.Time, status, reason string, blockedBy *string) {
	var appliedAt any
	if status == "applied" {
		appliedAt = time.Now()
	}
	payload := e.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	_, _ = h.db.Exec(c.Context(), `
		INSERT INTO atlas_sync_event
			(id, user_id, jobsite_id, kind, target_id, payload,
			 device_id, device_seq, occurred_at, occurred_offset_minutes,
			 status, reason, blocked_by, applied_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (id) DO NOTHING`,
		e.ID, userID, e.JobsiteID, e.Kind, e.TargetID, payload,
		e.DeviceID, e.DeviceSeq, ocorrido, e.OccurredOffset,
		status, reason, blockedBy, appliedAt)
}

// GET /atlas/sync/queue
//
// A fila de quem está perguntando: o que falta subir, o que foi recusado e por
// quê, e o que está preso esperando outro evento.
//
// A fila é global e o indicador é por obra, então a resposta traz os dois: cada
// obra vê a fatia dela, e o cabeçalho vê o total.
func (h *AtlasHandler) SyncQueue(c *fiber.Ctx) error {
	userID, _ := actor(c)

	rows, err := h.db.Query(c.Context(), `
		SELECT e.id, e.jobsite_id, COALESCE(j.name,''), e.kind, e.target_id,
		       e.status, e.reason, COALESCE(e.blocked_by,''), e.occurred_at
		  FROM atlas_sync_event e
		  LEFT JOIN atlas_jobsite j ON j.id = e.jobsite_id
		 WHERE e.user_id = $1 AND e.status <> 'applied'
		 ORDER BY e.occurred_at`, userID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type item struct {
		ID          string `json:"id"`
		JobsiteID   string `json:"jobsiteId"`
		JobsiteName string `json:"jobsiteName"`
		Kind        string `json:"kind"`
		TargetID    string `json:"targetId"`
		Status      string `json:"status"`
		Reason      string `json:"reason,omitempty"`
		BlockedBy   string `json:"blockedBy,omitempty"`
		OccurredAt  string `json:"occurredAt"`
	}
	itens := []item{}
	porObra := map[string]map[string]int{}
	for rows.Next() {
		var it item
		var oc time.Time
		if rows.Scan(&it.ID, &it.JobsiteID, &it.JobsiteName, &it.Kind, &it.TargetID,
			&it.Status, &it.Reason, &it.BlockedBy, &oc) != nil {
			continue
		}
		it.OccurredAt = oc.Format(time.RFC3339)
		itens = append(itens, it)
		if porObra[it.JobsiteID] == nil {
			porObra[it.JobsiteID] = map[string]int{}
		}
		porObra[it.JobsiteID][it.Status]++
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"items": itens, "byJobsite": porObra, "total": len(itens),
	}})
}

// POST /atlas/sync/retry/:id
//
// Destrava um evento recusado, para o cliente reenviar.
//
// Resolvido o problema que travou o primeiro, os que ficaram presos por
// dependência voltam para `pending` sozinhos e na ordem original. É o que faz o
// usuário ver um problema em vez de quatro.
func (h *AtlasHandler) SyncRetry(c *fiber.Ctx) error {
	userID, _ := actor(c)
	id := c.Params("id")

	var alvo string
	if err := h.db.QueryRow(c.Context(),
		`SELECT target_id FROM atlas_sync_event WHERE id = $1 AND user_id = $2`,
		id, userID).Scan(&alvo); err != nil {
		return atlasNotFound(c, "evento da fila")
	}

	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_sync_event SET status = 'pending', reason = '', blocked_by = NULL
		 WHERE id = $1 OR blocked_by = $1`, id); err != nil {
		return internalErr(c, err)
	}
	// Os presos por dependência do mesmo alvo também voltam: eles não têm culpa
	// própria, só esperavam este.
	var destravados int
	_ = h.db.QueryRow(c.Context(), `
		WITH volta AS (
			UPDATE atlas_sync_event SET status = 'pending', reason = '', blocked_by = NULL
			 WHERE target_id = $1 AND status = 'blocked' RETURNING 1)
		SELECT count(*) FROM volta`, alvo).Scan(&destravados)

	return c.JSON(fiber.Map{"data": fiber.Map{
		"id": id, "status": "pending", "desbloqueados": destravados,
	}})
}
