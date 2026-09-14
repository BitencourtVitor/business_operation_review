package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// O dicionário do Takeoff (ATL-103): o que cada símbolo, abreviação e código
// quer dizer neste set, em três níveis. Ver a migração 000167 para o porquê.

type takeoffTerm struct {
	ID         string         `json:"id"`
	Level      string         `json:"level"`
	DocumentID *string        `json:"documentId"`
	Kind       string         `json:"kind"`
	Code       string         `json:"code"`
	Meaning    string         `json:"meaning"`
	Attrs      map[string]any `json:"attrs"`
	Source     string         `json:"source"`
	SheetID    *string        `json:"sheetId"`
	VersionID  *string        `json:"versionId"`
	UpdatedAt  string         `json:"updatedAt"`
}

type takeoffExtraction struct {
	State     string         `json:"state"` // running, done, failed
	VersionID string         `json:"versionId"`
	StartedAt string         `json:"startedAt"`
	Error     string         `json:"error,omitempty"`
	Counts    map[string]int `json:"counts,omitempty"`
}

// A extração roda em segundo plano e o estado fica em memória: são 51 folhas a
// baixar e ler, e a requisição não pode ficar pendurada esperando. Uma API só
// atende o Atlas, então memória basta; perder o estado numa reinicialização só
// apaga o aviso, e o que já foi gravado continua gravado.
var (
	takeoffExtracting   = map[string]*takeoffExtraction{}
	takeoffExtractingMu sync.Mutex
)

func (h *AtlasHandler) takeoffTerms(ctx context.Context, documentID string) ([]takeoffTerm, error) {
	rows, err := h.db.Query(ctx, `
		SELECT id, level, document_id, kind, code, meaning, attrs, source, sheet_id, version_id, updated_at
		  FROM atlas_takeoff_term
		 WHERE level = 'base' OR document_id = $1
		 ORDER BY CASE level WHEN 'project' THEN 0 WHEN 'set' THEN 1 ELSE 2 END, kind, code`, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []takeoffTerm{}
	for rows.Next() {
		var t takeoffTerm
		var attrs []byte
		var updated time.Time
		if err := rows.Scan(&t.ID, &t.Level, &t.DocumentID, &t.Kind, &t.Code, &t.Meaning, &attrs,
			&t.Source, &t.SheetID, &t.VersionID, &updated); err != nil {
			return nil, err
		}
		t.Attrs = map[string]any{}
		_ = json.Unmarshal(attrs, &t.Attrs)
		t.UpdatedAt = updated.Format(time.RFC3339)
		out = append(out, t)
	}
	return out, rows.Err()
}

// GET /atlas/documents/:id/takeoff/dictionary
func (h *AtlasHandler) TakeoffDictionary(c *fiber.Ctx) error {
	documentID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, documentID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	terms, err := h.takeoffTerms(c.Context(), documentID)
	if err != nil {
		return internalErr(c, err)
	}
	takeoffExtractingMu.Lock()
	var extraction *takeoffExtraction
	if e := takeoffExtracting[documentID]; e != nil {
		copia := *e
		extraction = &copia
	}
	takeoffExtractingMu.Unlock()
	return c.JSON(fiber.Map{"data": fiber.Map{"terms": terms, "extraction": extraction}})
}

// POST /atlas/documents/:id/takeoff/dictionary/extract  { versionId }
func (h *AtlasHandler) TakeoffExtract(c *fiber.Ctx) error {
	documentID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, documentID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		VersionID string `json:"versionId"`
	}
	if err := c.BodyParser(&in); err != nil || in.VersionID == "" {
		return badRequest(c, "versionId é obrigatório")
	}
	if _, doc, err := h.versionContext(c, in.VersionID); err != nil || doc != documentID {
		return atlasNotFound(c, "versão")
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	userID, _ := c.Locals("userID").(string)

	takeoffExtractingMu.Lock()
	if e := takeoffExtracting[documentID]; e != nil && e.State == "running" {
		copia := *e
		takeoffExtractingMu.Unlock()
		return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": copia})
	}
	estado := &takeoffExtraction{State: "running", VersionID: in.VersionID, StartedAt: time.Now().Format(time.RFC3339)}
	takeoffExtracting[documentID] = estado
	copia := *estado
	takeoffExtractingMu.Unlock()

	go h.rodarExtracao(documentID, in.VersionID, userID)
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": copia})
}

func (h *AtlasHandler) rodarExtracao(documentID, versionID, userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	counts, err := h.extrairDicionario(ctx, documentID, versionID, userID)
	takeoffExtractingMu.Lock()
	defer takeoffExtractingMu.Unlock()
	e := takeoffExtracting[documentID]
	if e == nil {
		return
	}
	if err != nil {
		log.Printf("[atlas-takeoff] extração %s falhou: %v", documentID, err)
		e.State, e.Error = "failed", err.Error()
		return
	}
	e.State, e.Counts = "done", counts
}

type termoDaFolha struct {
	termoExtraido
	SheetID string
}

// extrairDicionario lê todas as folhas da versão e regrava o que veio do
// arquivo. O que alguém escreveu à mão (source = manual) não é tocado: a
// inserção do extraído cede ao manual no mesmo código.
func (h *AtlasHandler) extrairDicionario(ctx context.Context, documentID, versionID, userID string) (map[string]int, error) {
	rows, err := h.db.Query(ctx, `
		SELECT id, page_index, r2_key FROM atlas_sheet
		 WHERE version_id = $1 AND superseded_at IS NULL AND r2_key <> ''
		 ORDER BY page_index`, versionID)
	if err != nil {
		return nil, err
	}
	type folha struct {
		id, key string
		page    int
	}
	var folhas []folha
	for rows.Next() {
		var f folha
		if err := rows.Scan(&f.id, &f.page, &f.key); err != nil {
			rows.Close()
			return nil, err
		}
		folhas = append(folhas, f)
	}
	rows.Close()
	if len(folhas) == 0 {
		return nil, fmt.Errorf("a versão não tem folhas processadas")
	}

	dir, err := os.MkdirTemp("", "atlas-takeoff-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)

	var mu sync.Mutex
	var lidos []termoDaFolha
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup
	for _, f := range folhas {
		wg.Add(1)
		sem <- struct{}{}
		go func(f folha) {
			defer wg.Done()
			defer func() { <-sem }()
			arquivo := filepath.Join(dir, fmt.Sprintf("p%04d.pdf", f.page))
			if err := h.baixar(ctx, f.key, arquivo); err != nil {
				log.Printf("[atlas-takeoff] baixar folha %s: %v", f.id, err)
				return
			}
			paginas, err := lerTexto(ctx, arquivo)
			if err != nil || len(paginas) == 0 {
				return
			}
			var achados []termoDaFolha
			for _, t := range extrairDaPagina(paginas[0]) {
				achados = append(achados, termoDaFolha{termoExtraido: t, SheetID: f.id})
			}
			mu.Lock()
			lidos = append(lidos, achados...)
			mu.Unlock()
		}(f)
	}
	wg.Wait()

	// A ordem das folhas decide qual significado fica quando duas ensinam o
	// mesmo código: a primeira do set, que é a da tabela.
	origem := map[string]string{}
	var planos []termoExtraido
	for _, f := range folhas {
		for _, t := range lidos {
			if t.SheetID == f.id {
				k := t.Level + "|" + t.Kind + "|" + strings.ToUpper(t.Code)
				if _, ok := origem[k]; !ok {
					origem[k] = f.id
				}
				planos = append(planos, t.termoExtraido)
			}
		}
	}
	termos := juntarTermos(planos)

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM atlas_takeoff_term WHERE document_id = $1 AND source = 'extracted'`, documentID); err != nil {
		return nil, err
	}
	counts := map[string]int{}
	batch := &pgx.Batch{}
	for _, t := range termos {
		attrs, _ := json.Marshal(t.Attrs)
		sheet := origem[t.Level+"|"+t.Kind+"|"+strings.ToUpper(t.Code)]
		batch.Queue(`
			INSERT INTO atlas_takeoff_term (level, document_id, kind, code, meaning, attrs, source, sheet_id, version_id, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, 'extracted', NULLIF($7, ''), $8, $9)
			ON CONFLICT DO NOTHING`,
			t.Level, documentID, t.Kind, t.Code, t.Meaning, attrs, sheet, versionID, userID)
		counts[t.Level+"."+t.Kind]++
	}
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return counts, nil
}

// extrairAoProcessar roda no fim do processamento do set. Falhar aqui não falha
// o set: o dicionário é complemento, e a pessoa pode pedir de novo.
func (h *AtlasHandler) extrairAoProcessar(ctx context.Context, versionID string) {
	var documentID, userID string
	if err := h.db.QueryRow(ctx, `
		SELECT v.document_id, COALESCE(j.requested_by, '')
		  FROM atlas_document_version v
		  LEFT JOIN atlas_version_job j ON j.version_id = v.id
		 WHERE v.id = $1`, versionID).Scan(&documentID, &userID); err != nil {
		return
	}
	takeoffExtractingMu.Lock()
	takeoffExtracting[documentID] = &takeoffExtraction{State: "running", VersionID: versionID, StartedAt: time.Now().Format(time.RFC3339)}
	takeoffExtractingMu.Unlock()
	h.rodarExtracao(documentID, versionID, userID)
}

// POST /atlas/documents/:id/takeoff/terms: termo escrito à mão no set ou no projeto.
func (h *AtlasHandler) TakeoffCreateTerm(c *fiber.Ctx) error {
	documentID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, documentID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Level   string         `json:"level"`
		Kind    string         `json:"kind"`
		Code    string         `json:"code"`
		Meaning string         `json:"meaning"`
		Attrs   map[string]any `json:"attrs"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	in.Code = strings.TrimSpace(in.Code)
	if in.Level != "set" && in.Level != "project" {
		return badRequest(c, "level precisa ser set ou project")
	}
	if in.Kind != "abbreviation" && in.Kind != "symbol" && in.Kind != "tag" {
		return badRequest(c, "kind inválido")
	}
	if in.Code == "" {
		return badRequest(c, "code é obrigatório")
	}
	if in.Attrs == nil {
		in.Attrs = map[string]any{}
	}
	attrs, _ := json.Marshal(in.Attrs)
	userID, _ := c.Locals("userID").(string)
	var id string
	if err := h.db.QueryRow(c.Context(), `
		INSERT INTO atlas_takeoff_term (level, document_id, kind, code, meaning, attrs, source, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)
		ON CONFLICT (level, (COALESCE(document_id, '')), kind, (upper(code)))
		DO UPDATE SET meaning = EXCLUDED.meaning, attrs = atlas_takeoff_term.attrs || EXCLUDED.attrs,
		              source = 'manual', updated_at = now()
		RETURNING id`, in.Level, documentID, in.Kind, in.Code, strings.TrimSpace(in.Meaning), attrs, userID).Scan(&id); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

func (h *AtlasHandler) termJobsite(c *fiber.Ctx, termID string) (jobsiteID, level string, err error) {
	err = h.db.QueryRow(c.Context(), `
		SELECT COALESCE(d.jobsite_id, ''), t.level
		  FROM atlas_takeoff_term t
		  LEFT JOIN atlas_document d ON d.id = t.document_id
		 WHERE t.id = $1`, termID).Scan(&jobsiteID, &level)
	return
}

// PATCH /atlas/takeoff/terms/:id  { meaning?, attrs? }
//
// Editar um termo extraído o torna manual: a próxima extração não o sobrescreve.
// A forma do símbolo medida pelo navegador entra por aqui sem mudar a origem.
func (h *AtlasHandler) TakeoffUpdateTerm(c *fiber.Ctx) error {
	termID := c.Params("id")
	jobsiteID, level, err := h.termJobsite(c, termID)
	if err != nil {
		return atlasNotFound(c, "termo")
	}
	if level == "base" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "a base não se edita pela obra", "code": "FORBIDDEN"})
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Meaning *string        `json:"meaning"`
		Attrs   map[string]any `json:"attrs"`
		// Medição automática (forma do símbolo): não conta como correção humana.
		Measured bool `json:"measured"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	attrs, _ := json.Marshal(in.Attrs)
	if in.Attrs == nil {
		attrs = []byte("{}")
	}
	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_takeoff_term
		   SET meaning = COALESCE($2, meaning),
		       attrs = attrs || $3::jsonb,
		       source = CASE WHEN $4 THEN source ELSE 'manual' END,
		       updated_at = now()
		 WHERE id = $1`, termID, in.Meaning, attrs, in.Measured); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": termID}})
}

// DELETE /atlas/takeoff/terms/:id
func (h *AtlasHandler) TakeoffDeleteTerm(c *fiber.Ctx) error {
	termID := c.Params("id")
	jobsiteID, level, err := h.termJobsite(c, termID)
	if err != nil {
		return atlasNotFound(c, "termo")
	}
	if level == "base" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "a base não se apaga pela obra", "code": "FORBIDDEN"})
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	if _, err := h.db.Exec(c.Context(), `DELETE FROM atlas_takeoff_term WHERE id = $1`, termID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": termID}})
}

// resolverDicionario aplica a precedência: project sobre set sobre base, por
// tipo e código. Símbolo da base é chaveado pela forma; o do set, pelo rótulo,
// e ganha da base quando a legenda disse qual forma ele tem.
func resolverDicionario(terms []takeoffTerm) []takeoffTerm {
	rank := map[string]int{"project": 0, "set": 1, "base": 2}
	melhor := map[string]takeoffTerm{}
	ordem := []string{}
	for _, t := range terms {
		k := t.Kind + "|" + strings.ToUpper(t.Code)
		if t.Kind == "symbol" {
			if shape, ok := t.Attrs["shape"].(string); ok && shape != "" {
				k = "symbol|shape:" + shape
			}
		}
		atual, ok := melhor[k]
		if !ok {
			ordem = append(ordem, k)
			melhor[k] = t
			continue
		}
		if rank[t.Level] < rank[atual.Level] {
			melhor[k] = t
		}
	}
	out := make([]takeoffTerm, 0, len(ordem))
	for _, k := range ordem {
		out = append(out, melhor[k])
	}
	return out
}
