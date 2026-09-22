package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/bitencourtVitor/bor2-api/internal/service"
)

// O processamento do set no servidor (ATL-102).
//
// O navegador sobe o PDF direto no bucket e confirma. A partir daí é aqui que
// acontece o que antes acontecia na aba de quem enviou: baixar o original,
// cortar em um PDF por página, desenhar a prévia, ler o nome pelo gabarito da
// categoria, calcular a impressão de cada página, subir recorte e prévia, e
// gravar a folha. Uma página de cada vez, quatro ao mesmo tempo, e cada folha
// entra no banco assim que fica pronta: a tela vai preenchendo os cartões, e
// uma queda no meio deixa o que já foi feito de pé.
//
// Terminadas as folhas, os vínculos que a pessoa confirmou na etapa Links do
// envio. A sugestão continua acontecendo antes do upload, com a decisão dela.
//
// O trabalho de PDF é de ferramenta pronta: o poppler lê texto e desenha a
// prévia (pdftotext, pdftoppm), e o MuPDF recorta (mutool merge). Foi o poppler
// que mediu bem em 31/08, e reimplementar corte e render em Go seria trabalho
// sem retorno.

// Quantas páginas processar ao mesmo tempo. Quatro: cada uma segura um
// mutool e um pdftoppm, e a API divide a máquina com o resto.
const ingestConcurrency = 4

// Largura da prévia, em pixels. A mesma da geração antiga no navegador.
const ingestThumbWidth = 300

// ingestParams é o que o cliente decidiu antes de subir.
type ingestParams struct {
	// Nome de cada página, quando o cliente já leu pelo gabarito e a pessoa
	// conferiu na prévia. Índice de página em texto porque é JSON.
	Names map[string]string `json:"names,omitempty"`
	// Revisão parcial: as páginas do set atual que este arquivo substitui.
	Alvo []int `json:"alvo,omitempty"`
	// O nome do arquivo anexado, para o modo `file` do gabarito.
	FileName string `json:"fileName,omitempty"`
	// Os vínculos que a pessoa confirmou na etapa Links, por número de página.
	Links []vinculoConfirmado `json:"links,omitempty"`
}

// ── Fila ────────────────────────────────────────────────────────────────────

// IngestWorker processa as versões enfileiradas, em segundo plano.
type IngestWorker struct {
	h     *AtlasHandler
	fila  chan string
	ativo sync.Map
}

// NewIngestWorker cria a fila e sobe os operários. Antes de aceitar trabalho
// novo, recoloca na fila o que ficou pela metade numa subida anterior.
func NewIngestWorker(ctx context.Context, h *AtlasHandler) *IngestWorker {
	w := &IngestWorker{h: h, fila: make(chan string, 256)}
	h.ingest = w
	for i := 0; i < 2; i++ {
		go w.loop(ctx)
	}
	go w.retomar(ctx)
	return w
}

func (w *IngestWorker) retomar(ctx context.Context) {
	rows, err := w.h.db.Query(ctx, `
		SELECT version_id FROM atlas_version_job
		 WHERE status IN ('queued','running') ORDER BY created_at`)
	if err != nil {
		log.Printf("[atlas-ingest] retomar: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			w.enfileirar(id)
		}
	}
}

func (w *IngestWorker) enfileirar(versionID string) {
	if _, ja := w.ativo.LoadOrStore(versionID, true); ja {
		return
	}
	select {
	case w.fila <- versionID:
	default:
		// Fila cheia: solta e deixa para a próxima subida. Não trava a
		// requisição de quem confirmou.
		w.ativo.Delete(versionID)
		log.Printf("[atlas-ingest] fila cheia; %s fica para depois", versionID)
	}
}

func (w *IngestWorker) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case id := <-w.fila:
			w.h.processar(ctx, id)
			w.ativo.Delete(id)
		}
	}
}

// Enqueue grava (ou reabre) o job da versão e o coloca na fila.
func (h *AtlasHandler) enqueueIngest(ctx context.Context, versionID, userID string, p ingestParams) error {
	// Cópia de verdade, e não o que o fiber devolveu. `c.Params` aponta para o
	// buffer da requisição, que o fasthttp reaproveita na seguinte: guardado na
	// fila, o id da versão virava pedaço do caminho de outra chamada. Foi o que
	// travou o envio de 14/09 em 45%, com as 51 folhas batendo em versão que
	// não existia e o job sem ter onde registrar a falha.
	versionID = strings.Clone(versionID)
	userID = strings.Clone(userID)
	params, _ := json.Marshal(p)
	if _, err := h.db.Exec(ctx, `
		INSERT INTO atlas_version_job (version_id, status, step, params, requested_by)
		VALUES ($1, 'queued', 'queued', $2, $3)
		ON CONFLICT (version_id) DO UPDATE SET
			status = 'queued', step = 'queued', error = '', failed = 0,
			params = CASE WHEN $2::jsonb = '{}'::jsonb THEN atlas_version_job.params ELSE $2::jsonb END,
			finished_at = NULL`, versionID, params, userID); err != nil {
		return err
	}
	if h.ingest != nil {
		h.ingest.enfileirar(versionID)
	}
	return nil
}

func (h *AtlasHandler) jobSet(ctx context.Context, versionID, campos string, args ...any) {
	all := append([]any{versionID}, args...)
	if _, err := h.db.Exec(ctx, `UPDATE atlas_version_job SET `+campos+` WHERE version_id = $1`, all...); err != nil {
		log.Printf("[atlas-ingest] job %s: %v", versionID, err)
	}
}

// ── Pipeline ────────────────────────────────────────────────────────────────

type ingestPagina struct {
	Width, Height float64
	Words         []ingestWord
}

type ingestWord struct {
	Text           string
	X0, Y0, X1, Y1 float64 // em pontos, origem no canto superior esquerdo
}

func (h *AtlasHandler) processar(ctx context.Context, versionID string) {
	inicio := time.Now()
	h.jobSet(ctx, versionID, `status='running', step='download', started_at=now(), error=''`)

	if err := h.processarVersao(ctx, versionID); err != nil {
		log.Printf("[atlas-ingest] %s falhou: %v", versionID, err)
		h.jobSet(ctx, versionID, `status='failed', error=$2, finished_at=now()`, err.Error())
		return
	}
	h.jobSet(ctx, versionID, `status='done', step='done', finished_at=now()`)
	log.Printf("[atlas-ingest] %s pronto em %s", versionID, time.Since(inicio).Round(time.Second))

	// Com as folhas prontas, o dicionário do Takeoff lê legenda e tabelas (ATL-103).
	h.extrairAoProcessar(ctx, versionID)
}

func (h *AtlasHandler) processarVersao(ctx context.Context, versionID string) error {
	var jobsiteID, documentID, documentName, key, userID string
	var categoriaID int
	var paramsRaw []byte
	err := h.db.QueryRow(ctx, `
		SELECT d.jobsite_id, d.id, COALESCE(d.name,''), v.r2_key, j.requested_by, j.params,
		       COALESCE(d.category_id, (SELECT t.category_id FROM atlas_document_tag t
		                                WHERE t.document_id = d.id ORDER BY t.category_id LIMIT 1), 0)
		  FROM atlas_version_job j
		  JOIN atlas_document_version v ON v.id = j.version_id
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE j.version_id = $1`, versionID).
		Scan(&jobsiteID, &documentID, &documentName, &key, &userID, &paramsRaw, &categoriaID)
	if err != nil {
		return fmt.Errorf("versão: %w", err)
	}
	var p ingestParams
	_ = json.Unmarshal(paramsRaw, &p)

	dir, err := os.MkdirTemp("", "atlas-ingest-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)

	// 1. O original desce do bucket.
	original := filepath.Join(dir, "set.pdf")
	if err := h.baixar(ctx, key, original); err != nil {
		return fmt.Errorf("baixar original: %w", err)
	}

	// 2. Texto com posição de todas as páginas, numa chamada só. Dá também o
	// tamanho de cada página e a contagem.
	paginas, err := lerTexto(ctx, original)
	if err != nil {
		return fmt.Errorf("ler texto: %w", err)
	}
	total := len(paginas)
	if total == 0 {
		return fmt.Errorf("o PDF não tem páginas")
	}

	// O mesmo texto que nomeia a folha serve para sugerir hiperlink. Guardar
	// aqui evita que o navegador abra o arquivo de novo só para reler o que
	// acabou de ser lido. Falhar não derruba o processamento: a varredura sabe
	// extrair na hora quando não encontra nada guardado.
	if err := h.guardarTexto(ctx, versionID, paginas); err != nil {
		log.Printf("[atlas-ingest] %s: guardar texto falhou: %v", versionID, err)
	}

	// A vaga: na revisão parcial as páginas do arquivo entram no lugar da
	// primeira que sai. No set inteiro é zero.
	vaga := 0
	parcial := len(p.Alvo) > 0
	if parcial {
		vaga = p.Alvo[0]
		for _, a := range p.Alvo {
			if a < vaga {
				vaga = a
			}
		}
	}

	// 3. Nomes: o que o cliente leu tem precedência; sem isso, o gabarito da
	// categoria roda aqui sobre as mesmas palavras.
	nomes := map[int]string{}
	for k, v := range p.Names {
		if i, err := strconv.Atoi(k); err == nil && strings.TrimSpace(v) != "" {
			nomes[i] = strings.TrimSpace(v)
		}
	}
	if len(nomes) == 0 && categoriaID > 0 {
		var naming []byte
		_ = h.db.QueryRow(ctx, `SELECT naming FROM atlas_doc_category WHERE id = $1`, categoriaID).Scan(&naming)
		nomes = lerNomes(paginas, naming, p.FileName)
	}

	// O que já está pronto de uma rodada anterior não se refaz: retomar é
	// continuar, e o recorte já gravado no bucket vale.
	prontas := map[int]bool{}
	rows, err := h.db.Query(ctx, `
		SELECT page_index FROM atlas_sheet
		 WHERE version_id = $1 AND superseded_at IS NULL
		   AND r2_key <> '' AND thumb_key <> '' AND ingest_error = ''`, versionID)
	if err == nil {
		for rows.Next() {
			var i int
			if rows.Scan(&i) == nil {
				prontas[i] = true
			}
		}
		rows.Close()
	}

	h.jobSet(ctx, versionID, `step='pages', total=$2, done=$3, failed=0`, total, len(prontas))

	// 4. Página a página, quatro ao mesmo tempo.
	//
	// Se a versão sumir no meio (a pasta apagada enquanto processava), o resto
	// para: seguir cortando e subindo 51 folhas para uma versão que não existe
	// é banda jogada fora e objeto órfão no bucket.
	pctx, parar := context.WithCancel(ctx)
	defer parar()
	var mu sync.Mutex
	feitas, falhas := len(prontas), 0
	apagada := false
	sem := make(chan struct{}, ingestConcurrency)
	var wg sync.WaitGroup
	for i := 0; i < total; i++ {
		destino := vaga + i
		if prontas[destino] {
			continue
		}
		if pctx.Err() != nil {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(i, destino int) {
			defer wg.Done()
			defer func() { <-sem }()
			if pctx.Err() != nil {
				return
			}
			err := h.processarPagina(pctx, dir, original, jobsiteID, versionID, i, destino, paginas[i], nomes[i])
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				var existe bool
				_ = h.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM atlas_document_version WHERE id = $1)`,
					versionID).Scan(&existe)
				if !existe {
					apagada = true
					parar()
					return
				}
				falhas++
				log.Printf("[atlas-ingest] %s página %d: %v", versionID, i+1, err)
				h.gravarFolhaFalha(ctx, versionID, destino, paginas[i], nomes[i], err.Error())
			} else {
				feitas++
			}
			h.jobSet(ctx, versionID, `done=$2, failed=$3`, feitas, falhas)
		}(i, destino)
	}
	wg.Wait()
	if apagada {
		return fmt.Errorf("a versão foi apagada durante o processamento")
	}

	// 5. Revisão parcial: o que não foi trocado vem da versão anterior.
	if parcial {
		scope := "range"
		if len(p.Alvo) == 1 && total == 1 {
			scope = "single"
		}
		if _, err := h.herdarFolhas(ctx, versionID, documentID, scope, p.Alvo, total); err != nil {
			return fmt.Errorf("herdar folhas: %w", err)
		}
	} else {
		_, _ = h.db.Exec(ctx, `UPDATE atlas_document_version SET page_count = GREATEST(page_count, $2) WHERE id = $1`,
			versionID, total)
	}

	// 6. Vínculos: só os que a pessoa confirmou na etapa Links do envio. Sem
	// confirmação nenhum link é criado. Rodada repetida (retry, retomada)
	// apaga os automáticos da anterior antes, para não dobrar.
	if len(p.Links) > 0 {
		h.jobSet(ctx, versionID, `step='links'`)
		_, _ = h.db.Exec(ctx, `
			DELETE FROM atlas_annotation a USING atlas_sheet s
			 WHERE a.sheet_id = s.id AND s.version_id = $1
			   AND a.tool = 'link' AND a.geometry->>'auto' = 'true'`, versionID)
		links, err := h.gravarVinculos(ctx, versionID, documentID, documentName, userID, p.Links)
		if err != nil {
			log.Printf("[atlas-ingest] %s vínculos: %v", versionID, err)
		}
		h.jobSet(ctx, versionID, `links=$2`, links)
	}

	if falhas > 0 {
		return fmt.Errorf("%d de %d páginas não terminaram", falhas, total)
	}
	return nil
}

func (h *AtlasHandler) baixar(ctx context.Context, key, destino string) error {
	body, err := h.r2.Get(ctx, key)
	if err != nil {
		return err
	}
	defer body.Close()
	f, err := os.Create(destino)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, body)
	return err
}

// processarPagina corta, desenha a prévia, calcula as impressões, sobe os dois
// objetos e grava a folha. `i` é a página no arquivo, `destino` a posição no
// set.
func (h *AtlasHandler) processarPagina(
	ctx context.Context, dir, original, jobsiteID, versionID string,
	i, destino int, pagina ingestPagina, nome string,
) error {
	n := strconv.Itoa(i + 1)
	base := filepath.Join(dir, fmt.Sprintf("p%04d", i))

	// Recorte: um PDF de uma página, pelo MuPDF. O pdfseparate foi descartado em
	// 14/09: no set do Bluebeam Stapler a página arrasta o dicionário de recursos
	// compartilhado inteiro, e 38 das 51 folhas saíram com 112 MB cada, o set todo.
	// O merge do MuPDF copia só o que a página alcança e o garbage=4 descarta o
	// resto: o mesmo set deu 133 MB somando as 51, mediana de 0,87 MB.
	recorte := base + ".pdf"
	if err := rodar(ctx, "mutool", "merge", "-o", recorte, "-O", "garbage=4,compress", original, n); err != nil {
		return fmt.Errorf("mutool merge: %w", err)
	}

	// Prévia: JPEG de 300 px de largura, fundo branco.
	if err := rodar(ctx, "pdftoppm", "-jpeg", "-jpegopt", "quality=80",
		"-scale-to-x", strconv.Itoa(ingestThumbWidth), "-scale-to-y", "-1",
		"-f", n, "-l", n, "-singlefile", original, base+"-thumb"); err != nil {
		return fmt.Errorf("pdftoppm thumb: %w", err)
	}
	thumb := base + "-thumb.jpg"

	// Impressão de geometria: o raster miúdo em cinza. Duas revisões com o mesmo
	// desenho dão os mesmos bytes; um traço a mais muda o hash.
	if err := rodar(ctx, "pdftoppm", "-gray", "-r", "20", "-f", n, "-l", n, "-singlefile",
		original, base+"-geom"); err != nil {
		return fmt.Errorf("pdftoppm geom: %w", err)
	}
	geomBytes, err := os.ReadFile(base + "-geom.pgm")
	if err != nil {
		return err
	}
	geomHash := hash16(geomBytes)
	textHash := hash16([]byte(textoDaPagina(pagina)))

	planKey := service.PlanKey(jobsiteID, versionID, destino)
	thumbKey := service.ThumbKey(jobsiteID, versionID, destino)
	tamanho, err := h.subirArquivo(ctx, planKey, "application/pdf", recorte)
	if err != nil {
		return fmt.Errorf("subir recorte: %w", err)
	}
	if _, err := h.subirArquivo(ctx, thumbKey, "image/jpeg", thumb); err != nil {
		return fmt.Errorf("subir prévia: %w", err)
	}

	_, err = h.db.Exec(ctx, `
		INSERT INTO atlas_sheet
			(id, version_id, page_index, sheet_number, width_pt, height_pt,
			 needs_review, r2_key, thumb_key, byte_size, text_hash, geom_hash, ingest_error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'')
		ON CONFLICT (version_id, page_index) WHERE superseded_at IS NULL DO UPDATE SET
			sheet_number = CASE WHEN EXCLUDED.sheet_number <> '' THEN EXCLUDED.sheet_number
			                    ELSE atlas_sheet.sheet_number END,
			width_pt     = EXCLUDED.width_pt,
			height_pt    = EXCLUDED.height_pt,
			needs_review = CASE WHEN EXCLUDED.sheet_number <> '' THEN false ELSE atlas_sheet.needs_review END,
			r2_key       = EXCLUDED.r2_key,
			thumb_key    = EXCLUDED.thumb_key,
			byte_size    = EXCLUDED.byte_size,
			text_hash    = EXCLUDED.text_hash,
			geom_hash    = EXCLUDED.geom_hash,
			ingest_error = ''`,
		uuid.NewString(), versionID, destino, nome, pagina.Width, pagina.Height,
		nome == "", planKey, thumbKey, tamanho, textHash, geomHash)
	if err != nil {
		return fmt.Errorf("gravar folha: %w", err)
	}
	// O que este processo produziu já está no bucket; o temporário sai agora
	// para o disco não acumular 51 recortes até o fim.
	os.Remove(recorte)
	os.Remove(thumb)
	os.Remove(base + "-geom.pgm")
	return nil
}

// gravarFolhaFalha deixa a folha existindo, sem recorte, com o erro escrito:
// o cartão mostra o motivo e a rodada seguinte tenta de novo só ela.
func (h *AtlasHandler) gravarFolhaFalha(ctx context.Context, versionID string, destino int, pagina ingestPagina, nome, motivo string) {
	if len(motivo) > 300 {
		motivo = motivo[:300]
	}
	_, _ = h.db.Exec(ctx, `
		INSERT INTO atlas_sheet
			(id, version_id, page_index, sheet_number, width_pt, height_pt, needs_review, ingest_error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (version_id, page_index) WHERE superseded_at IS NULL DO UPDATE SET
			ingest_error = EXCLUDED.ingest_error`,
		uuid.NewString(), versionID, destino, nome, pagina.Width, pagina.Height, nome == "", motivo)
}

func (h *AtlasHandler) subirArquivo(ctx context.Context, key, contentType, caminho string) (int64, error) {
	f, err := os.Open(caminho)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return 0, err
	}
	return st.Size(), h.r2.Put(ctx, key, contentType, f, st.Size())
}

func rodar(ctx context.Context, nome string, args ...string) error {
	cmd := exec.CommandContext(ctx, nome, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 200 {
			msg = msg[:200]
		}
		return fmt.Errorf("%s: %v: %s", nome, err, msg)
	}
	return nil
}

func hash16(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:8])
}

// ── Texto com posição ───────────────────────────────────────────────────────

// semControle tira do fluxo os caracteres de controle que o XML não aceita.
//
// O `pdftotext` copia para a saída o texto que está dentro do PDF, e set de
// projeto traz caractere de controle solto (U+000E num set da Toll Brothers,
// 18/09). O decodificador do Go rejeita esses bytes mesmo fora do modo estrito,
// e o processamento inteiro morria por causa de um byte invisível.
//
// Filtrar byte a byte é seguro em UTF-8: todo byte de sequência multibyte tem o
// bit alto ligado, então nunca cai nesta faixa.
type semControle struct{ r io.Reader }

func (s semControle) Read(p []byte) (int, error) {
	// Repete enquanto a leitura só trouxer bytes filtrados: devolver zero sem
	// erro faz quem lê parar como se o arquivo tivesse acabado.
	for {
		n, err := s.r.Read(p)
		fim := 0
		for i := 0; i < n; i++ {
			b := p[i]
			if b < 0x20 && b != '\t' && b != '\n' && b != '\r' {
				continue
			}
			p[fim] = b
			fim++
		}
		if fim > 0 || err != nil {
			return fim, err
		}
	}
}

// lerTexto roda pdftotext -bbox-layout e devolve, por página, tamanho e
// palavras com caixa. A origem é o canto superior esquerdo, em pontos.
func lerTexto(ctx context.Context, original string) ([]ingestPagina, error) {
	saida := original + ".html"
	if err := rodar(ctx, "pdftotext", "-bbox-layout", original, saida); err != nil {
		return nil, err
	}
	f, err := os.Open(saida)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	dec := xml.NewDecoder(semControle{f})
	dec.Strict = false
	dec.AutoClose = xml.HTMLAutoClose
	dec.Entity = xml.HTMLEntity

	var paginas []ingestPagina
	var atual *ingestPagina
	var palavra *ingestWord
	attr := func(el xml.StartElement, nome string) float64 {
		for _, a := range el.Attr {
			if a.Name.Local == nome {
				v, _ := strconv.ParseFloat(a.Value, 64)
				return v
			}
		}
		return 0
	}
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "page":
				paginas = append(paginas, ingestPagina{Width: attr(t, "width"), Height: attr(t, "height")})
				atual = &paginas[len(paginas)-1]
			case "word":
				if atual != nil {
					atual.Words = append(atual.Words, ingestWord{
						X0: attr(t, "xMin"), Y0: attr(t, "yMin"), X1: attr(t, "xMax"), Y1: attr(t, "yMax"),
					})
					palavra = &atual.Words[len(atual.Words)-1]
				}
			}
		case xml.CharData:
			if palavra != nil {
				palavra.Text += string(t)
			}
		case xml.EndElement:
			if t.Name.Local == "word" {
				if palavra != nil {
					palavra.Text = strings.TrimSpace(palavra.Text)
				}
				palavra = nil
			}
		}
	}
	return paginas, nil
}

func textoDaPagina(p ingestPagina) string {
	var b strings.Builder
	for _, w := range p.Words {
		if w.Text == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(w.Text)
	}
	return b.String()
}

// ── Nomes pelo gabarito ─────────────────────────────────────────────────────

// namingTemplate espelha o JSON gravado em atlas_doc_category.naming, que é o
// mesmo que o navegador edita (components/atlas/plan-naming.ts).
type namingTemplate struct {
	Mode   string `json:"mode"`
	Levels []struct {
		X0, Y0, X1, Y1 float64
		Rotation       int `json:"rotation"`
		FromPage       int `json:"fromPage"`
		ToPage         int `json:"toPage"`
	} `json:"levels"`
}

// lerNomes aplica o gabarito sobre as palavras de cada página: o que cair
// dentro da região, na orientação pedida, é o nome. Palavra inteira, nunca
// pedaço, pela mesma razão do cliente: ninguém marca uma região para levar
// meio código. Nome repetido ganha " (1)", " (2)" na ordem do arquivo.
func lerNomes(paginas []ingestPagina, naming []byte, fileName string) map[int]string {
	var t namingTemplate
	if err := json.Unmarshal(naming, &t); err != nil {
		return nil
	}
	out := map[int]string{}
	lidos := make([]string, len(paginas))

	if t.Mode == "file" {
		titulo := strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(fileName, ".pdf"), ".PDF"))
		if titulo == "" {
			titulo = "Sheet"
		}
		for i := range paginas {
			if len(paginas) > 1 {
				out[i] = fmt.Sprintf("%s %d", titulo, i+1)
			} else {
				out[i] = titulo
			}
		}
		return out
	}
	if len(t.Levels) == 0 {
		return nil
	}

	for i, p := range paginas {
		for _, r := range t.Levels {
			if t.Mode == "ranges" {
				if r.FromPage > 0 && i+1 < r.FromPage {
					continue
				}
				if r.ToPage > 0 && i+1 > r.ToPage {
					continue
				}
			}
			var partes []string
			for _, w := range p.Words {
				if w.Text == "" || p.Width == 0 || p.Height == 0 {
					continue
				}
				larg, alt := w.X1-w.X0, w.Y1-w.Y0
				vertical := alt > 1.5*larg && utf8.RuneCountInString(w.Text) > 1
				horizontal := larg >= alt || utf8.RuneCountInString(w.Text) == 1
				if r.Rotation != 0 && !vertical && utf8.RuneCountInString(w.Text) > 1 {
					continue
				}
				if r.Rotation == 0 && !horizontal {
					continue
				}
				cx := (w.X0 + w.X1) / 2 / p.Width
				cy := (w.Y0 + w.Y1) / 2 / p.Height
				if cx >= r.X0 && cx <= r.X1 && cy >= r.Y0 && cy <= r.Y1 {
					partes = append(partes, w.Text)
				}
			}
			if lido := strings.Join(partes, " "); lido != "" {
				lidos[i] = lido
				break
			}
		}
	}

	conta := map[string]int{}
	for _, l := range lidos {
		if l != "" {
			conta[l]++
		}
	}
	visto := map[string]int{}
	for i, l := range lidos {
		if l == "" {
			continue
		}
		if conta[l] < 2 {
			out[i] = l
			continue
		}
		visto[l]++
		out[i] = fmt.Sprintf("%s (%d)", l, visto[l])
	}
	return out
}

// ── Vínculos ────────────────────────────────────────────────────────────────

// autolinkAplicar é o miolo do POST /versions/:id/autolink, sem o fiber: a
// mesma decisão de quais páginas citam o quê, usada pela rota e pela ingestão.
func (h *AtlasHandler) autolinkAplicar(
	ctx context.Context, jobsiteID, documentID, documentName, userID string,
	pages []autolinkPage, minRefs int, apply bool,
) ([]autolinkPageResult, int, error) {
	if minRefs <= 0 {
		minRefs = 2
	}
	indice, err := h.indiceDaObra(ctx, jobsiteID, documentID)
	if err != nil {
		return nil, 0, err
	}

	paginas := []autolinkPageResult{}
	totalLinks := 0
	for _, p := range pages {
		res := autolinkPageResult{SheetID: p.SheetID}
		if p.NoText {
			res.Shape = "no-text"
			paginas = append(paginas, res)
			continue
		}
		type hit struct {
			d destino
			t autolinkToken
		}
		hits := []hit{}
		alcancados := map[string]bool{}
		for _, t := range p.Tokens {
			k := chaveTitulo(t.Text)
			if k == "" {
				continue
			}
			d, achou := indice[k]
			if !achou || d.SheetID == p.SheetID {
				continue
			}
			hits = append(hits, hit{d, t})
			alcancados[k] = true
		}
		res.Refs = len(alcancados)
		xs := make([]float64, 0, len(hits))
		for _, hi := range hits {
			xs = append(xs, (hi.t.X0+hi.t.X1)/2)
		}
		res.Spread = dispersao(xs)
		switch {
		case res.Refs == 0:
			res.Shape = "terminal"
		case len(indice) > 0 && float64(res.Refs) >= 0.8*float64(len(indice)):
			res.Shape = "index"
		default:
			res.Shape = "referencing"
		}
		if res.Refs < minRefs {
			paginas = append(paginas, res)
			continue
		}
		for _, hi := range hits {
			res.Linked++
			totalLinks++
			if !apply {
				continue
			}
			geom, _ := json.Marshal(map[string]any{
				"x0": hi.t.X0, "y0": hi.t.Y0, "x1": hi.t.X1, "y1": hi.t.Y1,
				"auto": true, "text": hi.t.Text,
				"target": map[string]any{
					"sheetId": hi.d.SheetID, "pageIndex": hi.d.PageIndex, "sheetName": hi.d.Name,
					"documentId": hi.d.DocumentID, "documentName": hi.d.DocumentName,
				},
			})
			_, _ = h.db.Exec(ctx, `
				INSERT INTO atlas_annotation (id, sheet_id, author_id, tool, color, width, opacity, geometry, shared)
				VALUES ($1,$2,$3,'link','',0,1,$4,true)`,
				uuid.NewString(), p.SheetID, userID, geom)
		}
		paginas = append(paginas, res)
	}
	return paginas, totalLinks, nil
}

// ── Herança na revisão parcial ──────────────────────────────────────────────

// herdarFolhas é o miolo do POST /versions/:id/inherit, sem o fiber.
func (h *AtlasHandler) herdarFolhas(ctx context.Context, versionID, documentID, scope string, pages []int, inserted int) (int, error) {
	if inserted <= 0 {
		inserted = len(pages)
	}
	vaga := pages[0]
	for _, p := range pages {
		if p < vaga {
			vaga = p
		}
	}
	var anterior string
	if err := h.db.QueryRow(ctx, `
		SELECT v.id FROM atlas_document_version v
		 WHERE v.document_id = $1
		   AND v.seq < (SELECT seq FROM atlas_document_version WHERE id = $2)
		 ORDER BY v.seq DESC LIMIT 1`, documentID, versionID).Scan(&anterior); err != nil {
		return 0, fmt.Errorf("esta é a primeira versão da pasta; não há de onde herdar")
	}
	tag, err := h.db.Exec(ctx, `
		INSERT INTO atlas_sheet
			(id, version_id, page_index, sheet_number, discipline, level, title,
			 revision, thumb_key, width_pt, height_pt, r2_key, byte_size,
			 text_hash, geom_hash, inherited_from)
		SELECT gen_random_uuid()::text, $1, d.destino, s.sheet_number, s.discipline,
		       s.level, s.title, s.revision, s.thumb_key, s.width_pt, s.height_pt,
		       s.r2_key, s.byte_size, s.text_hash, s.geom_hash, s.id
		  FROM atlas_sheet s
		  CROSS JOIN LATERAL (
		      SELECT CASE WHEN s.page_index < $4 THEN s.page_index
		                  ELSE s.page_index + $5
		                       - (SELECT count(*) FROM unnest($3::int[]) r WHERE r < s.page_index)::int
		             END AS destino
		  ) d
		 WHERE s.version_id = $2
		   AND s.superseded_at IS NULL
		   AND NOT (s.page_index = ANY($3::int[]))
		   AND NOT EXISTS (SELECT 1 FROM atlas_sheet n
		                    WHERE n.version_id = $1 AND n.page_index = d.destino
		                      AND n.superseded_at IS NULL)`,
		versionID, anterior, pages, vaga, inserted)
	if err != nil {
		return 0, err
	}
	var total int
	_ = h.db.QueryRow(ctx, `
		SELECT count(*) FROM atlas_sheet
		 WHERE version_id = $1 AND superseded_at IS NULL`, versionID).Scan(&total)
	if _, err := h.db.Exec(ctx, `
		UPDATE atlas_document_version SET scope = $2, scope_pages = $3, page_count = $4
		 WHERE id = $1`, versionID, scope, pages, total); err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// ── Rotas ───────────────────────────────────────────────────────────────────

// GET /atlas/versions/:id/job — onde o processamento está.
func (h *AtlasHandler) IngestStatus(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	var status, step, msg string
	var total, done, failed, links int
	var startedAt, finishedAt *time.Time
	err = h.db.QueryRow(c.Context(), `
		SELECT status, step, total, done, failed, links, error, started_at, finished_at
		  FROM atlas_version_job WHERE version_id = $1`, versionID).
		Scan(&status, &step, &total, &done, &failed, &links, &msg, &startedAt, &finishedAt)
	if err != nil {
		return c.JSON(fiber.Map{"data": fiber.Map{"versionId": versionID, "status": "none"}})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"versionId": versionID, "status": status, "step": step,
		"total": total, "done": done, "failed": failed, "links": links, "error": msg,
		"startedAt": startedAt, "finishedAt": finishedAt,
	}})
}

// POST /atlas/versions/:id/job/retry — refaz o que faltou. As páginas prontas
// ficam; só as sem recorte (ou com erro) voltam a rodar.
func (h *AtlasHandler) IngestRetry(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	userID, _ := actor(c)
	if err := h.enqueueIngest(c.Context(), versionID, userID, ingestParams{}); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"versionId": versionID, "status": "queued"}})
}
