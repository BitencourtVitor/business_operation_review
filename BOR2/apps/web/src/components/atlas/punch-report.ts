"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { atlasService } from "@/services/atlas.service"

/**
 * O relatório do punch list.
 *
 * O que ele precisa mostrar por ponto: onde é, com a imagem do **recorte** do
 * plano; as fotos de campo; o plano de origem, a categoria, a subcategoria e a
 * obra; a data; e a condição atual.
 *
 * O recorte é a parte que não é óbvia e é a que faz o documento valer. Mandar a
 * prancha inteira e escrever "ponto 17" obriga quem lê a procurar num A0; o
 * recorte de quinze centímetros em volta da coordenada mostra a viga de que se
 * está falando. A coordenada normalizada já está gravada em cada ponto desde que
 * ele nasceu, então o recorte é conta, não trabalho manual.
 *
 * **Sai a qualquer momento do ciclo**, com os problemas resolvidos ou não. Não é
 * artefato de fechamento: o uso mais frequente é levar para a reunião de terça a
 * lista do que ainda falta.
 */

export interface OpcoesRelatorio {
  jobsiteId: string
  jobsiteName: string
  /** Vazio traz a obra inteira; preenchido traz um pavimento. */
  subcategory?: string
  /** Vazio traz tudo, resolvido ou não. */
  status?: "open" | "resolved"
}

/**
 * Recorta a região do desenho em volta de um ponto.
 *
 * A janela é proporcional à prancha e não fixa em pixels: 12% de largura numa A0
 * cobre mais ou menos o mesmo pedaço de obra que 12% numa folha carta, porque as
 * duas foram desenhadas para serem lidas inteiras. Uma janela em centímetros de
 * papel mostraria um cômodo numa e um parafuso na outra.
 */
async function recortar(
  url: string, pageIndex: number, x: number, y: number,
): Promise<string | null> {
  try {
    const pdf = await loadPdf(url)
    const page = await pdf.getPage(pageIndex + 1)
    // Escala 2 porque o recorte é ampliado no documento final, e renderizar em 1
    // para depois esticar produz uma imagem borrada justamente na única coisa
    // que ela precisa mostrar.
    const vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement("canvas")
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    await page.render({ canvasContext: ctx, viewport: vp }).promise

    const lado = Math.round(vp.width * 0.12)
    const cx = Math.round(x * vp.width)
    const cy = Math.round(y * vp.height)
    const corte = document.createElement("canvas")
    corte.width = lado
    corte.height = lado
    const cctx = corte.getContext("2d")
    if (!cctx) return null
    cctx.fillStyle = "#fff"
    cctx.fillRect(0, 0, lado, lado)
    // O recorte pode encostar na borda da prancha, e aí o pedaço que falta fica
    // branco em vez de a imagem escorregar para dentro. Escorregar moveria o
    // ponto para fora do centro, e o centro é a única coisa que o leitor
    // procura.
    cctx.drawImage(canvas, cx - lado / 2, cy - lado / 2, lado, lado, 0, 0, lado, lado)

    // A marca do ponto por cima, no centro, porque o recorte sozinho ainda deixa
    // a dúvida de qual detalhe do pedaço é o problema.
    cctx.strokeStyle = "#f97316"
    cctx.lineWidth = 3
    cctx.beginPath()
    cctx.arc(lado / 2, lado / 2, 14, 0, Math.PI * 2)
    cctx.stroke()

    return corte.toDataURL("image/jpeg", 0.85)
  } catch {
    // Sem o recorte o ponto continua no relatório, com o número, o texto e as
    // fotos. Perder a localização é ruim; perder o ponto inteiro por causa dela
    // seria pior.
    return null
  }
}

/**
 * Monta o relatório e abre a caixa de impressão.
 *
 * Imprime em vez de gerar o arquivo com uma biblioteca de PDF, e é escolha e não
 * atalho: o diálogo do navegador já sabe paginar, já respeita a margem do
 * aparelho, e já oferece "salvar como PDF" em todos eles, incluindo o iPad. Uma
 * biblioteca acrescentaria centenas de kB ao pacote de campo para reimplementar
 * pior o que o sistema faz de graça.
 */
export async function gerarRelatorio(op: OpcoesRelatorio): Promise<void> {
  const pontos = await atlasService.punchList(op.jobsiteId, {
    subcategory: op.subcategory, status: op.status,
  })
  if (!pontos.length) {
    alert("Não há pontos para este escopo.")
    return
  }

  // Os recortes, agrupados por folha para o PDF de cada prancha ser aberto uma
  // vez só. Sessenta pontos em vinte plantas seriam sessenta downloads de PDF
  // sem isto, num aparelho de campo.
  const porFolha = new Map<string, typeof pontos>()
  for (const p of pontos) {
    const lista = porFolha.get(p.sheetId) ?? []
    lista.push(p)
    porFolha.set(p.sheetId, lista)
  }
  const recortes = new Map<string, string>()
  for (const [sheetId, doFolha] of porFolha) {
    try {
      const { url } = await atlasService.sheetUrl(sheetId)
      for (const p of doFolha) {
        if (p.pageX == null || p.pageY == null) continue
        const img = await recortar(url, p.pageIndex, p.pageX, p.pageY)
        if (img) recortes.set(p.id, img)
      }
    } catch {
      // Prancha inacessível: os pontos dela seguem sem recorte.
    }
  }

  const esc = (s: string) =>
    s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))

  const linhas = pontos.map(p => `
    <section class="ponto">
      <div class="cabeca">
        <span class="numero">${p.number ?? "—"}</span>
        <span class="titulo">${esc(p.title || p.body || "Sem título")}</span>
        <span class="cond ${p.status}">${p.status === "resolved" ? "Concluído" : "Pendente"}</span>
      </div>
      <div class="corpo">
        ${recortes.has(p.id)
          ? `<img class="recorte" src="${recortes.get(p.id)}" alt="Localização do ponto ${p.number ?? ""}">`
          : `<div class="recorte vazio">sem recorte</div>`}
        <dl>
          <dt>Plano</dt><dd>${esc(p.sheetNumber || `p. ${p.pageIndex + 1}`)} · ${esc(p.document)}</dd>
          ${p.category ? `<dt>Categoria</dt><dd>${esc(p.category)}</dd>` : ""}
          ${p.subcategory ? `<dt>Pavimento</dt><dd>${esc(p.subcategory)}</dd>` : ""}
          <dt>Identificado</dt><dd>${new Date(p.createdAt).toLocaleDateString()} · ${esc(p.createdName)}</dd>
          ${p.resolvedAt ? `<dt>Concluído</dt><dd>${new Date(p.resolvedAt).toLocaleDateString()}</dd>` : ""}
          <dt>Registros</dt><dd>${p.photos} foto(s) · ${p.comments} comentário(s)</dd>
        </dl>
      </div>
      ${p.body && p.title ? `<p class="texto">${esc(p.body)}</p>` : ""}
    </section>`).join("")

  const abertos = pontos.filter(p => p.status !== "resolved").length
  const janela = window.open("", "_blank")
  if (!janela) {
    alert("O navegador bloqueou a janela do relatório.")
    return
  }
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Punch list · ${esc(op.jobsiteName)}</title>
<style>
  @page { margin: 14mm; }
  body { font: 12px/1.5 system-ui, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .resumo { color: #666; font-size: 12px; margin-bottom: 16px; }
  /* Um ponto nunca é cortado entre páginas: o recorte numa página e as
     informações na seguinte torna o documento inútil para conferir em obra. */
  .ponto { break-inside: avoid; border-top: 1px solid #ddd; padding: 10px 0; }
  .cabeca { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .numero { font-weight: 700; font-size: 15px; min-width: 26px; }
  .titulo { flex: 1; font-weight: 600; }
  .cond { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
          border: 1px solid; border-radius: 3px; padding: 1px 5px; }
  .cond.open { color: #b45309; border-color: #fbbf24; }
  .cond.resolved { color: #047857; border-color: #6ee7b7; }
  .corpo { display: flex; gap: 12px; align-items: flex-start; }
  .recorte { width: 150px; height: 150px; object-fit: cover;
             border: 1px solid #ddd; border-radius: 4px; }
  .recorte.vazio { display: flex; align-items: center; justify-content: center;
                   color: #999; font-size: 10px; background: #fafafa; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: 11px; }
  dt { color: #666; }
  dd { margin: 0; }
  .texto { margin: 6px 0 0; font-size: 11px; color: #333; }
</style></head><body>
<h1>Punch list · ${esc(op.jobsiteName)}</h1>
<p class="resumo">
  ${op.subcategory ? `${esc(op.subcategory)} · ` : "Obra inteira · "}
  ${pontos.length} ponto(s) · ${abertos} pendente(s) ·
  emitido em ${new Date().toLocaleDateString()}
</p>
${linhas}
</body></html>`)
  janela.document.close()
  // O `onload` espera as imagens entrarem. Chamar `print` antes deixaria o
  // documento sair com os recortes em branco, que é justamente a parte que ele
  // existe para mostrar.
  janela.onload = () => janela.print()
}
