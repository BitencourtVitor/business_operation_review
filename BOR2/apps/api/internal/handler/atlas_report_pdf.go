package handler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	"github.com/gofiber/fiber/v2"
)

// O relatório do punch vira arquivo PDF aqui, e não no navegador.
//
// ── Por que no servidor ──
//
// Navegador nenhum converte HTML em PDF sem passar pelo diálogo de impressão.
// O que existe no cliente é rasterizar a página numa imagem e embrulhar em PDF:
// o arquivo passa de dezenas de megabytes, o texto deixa de ser selecionável e
// as fotos borram. Para documento que vai ao cliente, é pior que o diálogo.
//
// Aqui um Chromium sem tela abre o documento e o imprime em PDF de verdade: o
// texto é texto, as fotos saem na resolução em que estão, e quem pediu recebe
// um download comum, com nome, sem janela nem diálogo nenhum.
//
// ── Por que o HTML vem pronto do cliente ──
//
// O documento é montado em `punch-report.ts`, e o modelo dele mora em
// `public/modelos/punch-report.html`. Montar de novo em Go seria a segunda cópia
// do mesmo layout, e duas cópias divergem na primeira mudança. O servidor não
// sabe nada de relatório: recebe o documento, imprime, devolve.
//
// As fotos chegam como endereço assinado do R2, e não embutidas. Embutidas, um
// relatório de sessenta pontos passava do limite de corpo da requisição; por
// endereço, o HTML é texto, e quem busca as fotos é o Chromium, daqui mesmo.

// Uma emissão por vez. Cada Chromium come algumas centenas de megabytes, e a API
// divide a máquina com o resto do sistema: dois relatórios pesados ao mesmo
// tempo não podem derrubar o login de ninguém. O segundo espera o primeiro.
var emissaoDePDF = make(chan struct{}, 1)

// O nome volta limpo: tira o que o Windows não aceita em nome de arquivo e o
// que quebraria o cabeçalho da resposta.
var foraDoNome = regexp.MustCompile(`[\\/:*?"<>|\r\n]+`)

type pedidoDePDF struct {
	HTML     string `json:"html"`
	FileName string `json:"fileName"`
}

// POST /atlas/jobsites/:id/punch-list/report.pdf
func (h *AtlasHandler) PunchReportPDF(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	var pedido pedidoDePDF
	if err := c.BodyParser(&pedido); err != nil || strings.TrimSpace(pedido.HTML) == "" {
		return badRequest(c, "html is required")
	}

	nome := strings.TrimSpace(foraDoNome.ReplaceAllString(pedido.FileName, "-"))
	if nome == "" {
		nome = "Punch List Report"
	}
	if !strings.HasSuffix(strings.ToLower(nome), ".pdf") {
		nome += ".pdf"
	}

	// A fila tem prazo: quem espera mais de um minuto por uma emissão que não
	// começa está melhor recebendo um erro do que uma tela parada.
	select {
	case emissaoDePDF <- struct{}{}:
		defer func() { <-emissaoDePDF }()
	case <-time.After(60 * time.Second):
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "another report is being generated, try again in a moment",
		})
	}

	pdf, err := imprimirPDF(pedido.HTML)
	if err != nil {
		return internalErr(c, err)
	}

	c.Set(fiber.HeaderContentType, "application/pdf")
	c.Set(fiber.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, nome))
	return c.Send(pdf)
}

// imprimirPDF abre o documento num Chromium sem tela e devolve o PDF.
func imprimirPDF(html string) ([]byte, error) {
	// O documento vai para um arquivo e é aberto por endereço de arquivo. Posto
	// direto na página, o script de paginação de dentro dele não rodaria, e é
	// ele que corta as folhas e numera o rodapé.
	dir, err := os.MkdirTemp("", "atlas-report-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	arquivo := filepath.Join(dir, "report.html")
	if err := os.WriteFile(arquivo, []byte(html), 0o600); err != nil {
		return nil, err
	}

	opcoes := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.NoSandbox,
		chromedp.DisableGPU,
		// O /dev/shm do contêiner é pequeno, e o Chromium usa ele para as
		// páginas. Cheio, a aba morre no meio da renderização sem dizer por quê.
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("hide-scrollbars", true),
	)
	if bin := os.Getenv("CHROME_BIN"); bin != "" {
		opcoes = append(opcoes, chromedp.ExecPath(bin))
	}

	alocador, cancelaAlocador := chromedp.NewExecAllocator(context.Background(), opcoes...)
	defer cancelaAlocador()
	ctx, cancelaAba := chromedp.NewContext(alocador)
	defer cancelaAba()
	ctx, cancelaPrazo := context.WithTimeout(ctx, 90*time.Second)
	defer cancelaPrazo()

	var pdf []byte
	err = chromedp.Run(ctx,
		chromedp.Navigate("file://"+filepath.ToSlash(arquivo)),
		// As fotos chegam pela rede, depois do documento. Imprimir antes de elas
		// entrarem deixaria a folha com o quadro vazio no lugar da prova, que é
		// justamente o que o relatório existe para mostrar.
		chromedp.Evaluate(`Promise.all(Array.from(document.images)
			.filter(function (i) { return !i.complete })
			.map(function (i) { return new Promise(function (ok) { i.onload = i.onerror = ok }) }))`,
			nil, func(p *runtime.EvaluateParams) *runtime.EvaluateParams { return p.WithAwaitPromise(true) }),
		chromedp.ActionFunc(func(ctx context.Context) error {
			var err error
			// A folha e a margem vêm do @page do próprio documento: é lá que o
			// modelo diz que é A4 com dez milímetros em volta.
			pdf, _, err = page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(true).
				Do(ctx)
			return err
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("print to pdf: %w", err)
	}
	return pdf, nil
}
