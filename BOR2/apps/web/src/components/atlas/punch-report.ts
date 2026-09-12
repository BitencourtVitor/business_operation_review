"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { atlasService, type AtlasPunchMedia, type AtlasPunchPoint } from "@/services/atlas.service"

/**
 * O relatório do punch list.
 *
 * É o artefato que sai do sistema e vai parar na mão de quem não estava lá: o
 * cliente, o empreiteiro, o gerente que cobra na reunião de terça. Tudo o que o
 * Atlas registra existe para caber aqui, e por isso este arquivo é longo: ele é
 * onde o registro vira documento.
 *
 * ── O que cada ponto mostra ──
 *
 * Um container por ponto, com o escrito à esquerda e a imagem à direita, em
 * altura cheia. A leitura é a de uma ficha: número e título no topo, a descrição
 * embaixo, o que foi feito depois disso, e o rodapé com quem levantou e quando.
 *
 * **A imagem da direita é a foto do problema.** É ela que responde "o que é",
 * que é a primeira pergunta de quem lê. O recorte da planta entra menor, embaixo
 * dela, respondendo "onde é", e vira a imagem principal quando não há foto.
 *
 * ── Por que o recorte da planta e não a prancha ──
 *
 * Mandar a prancha inteira e escrever "ponto 17" obriga quem lê a procurar num
 * A0. O recorte em volta da coordenada mostra a viga de que se está falando. A
 * coordenada já está gravada em cada ponto desde que ele nasceu, então o recorte
 * é conta, não trabalho manual.
 *
 * ── Por que imprimir em vez de montar um PDF ──
 *
 * O diálogo do navegador já pagina, já respeita a margem do aparelho, e já
 * oferece "salvar como PDF" em todos eles, iPad incluído. Uma biblioteca de PDF
 * somaria centenas de kB ao pacote de campo para reimplementar pior o que o
 * sistema faz de graça. O cabeçalho e o rodapé que se repetem em toda página
 * saem de elementos fixos, que é como o navegador os repete na impressão.
 */

export interface OpcoesRelatorio {
  jobsiteId: string
  jobsiteName: string
  /** Vazio traz a obra inteira; preenchido traz um escopo. */
  scope?: string
  /** Vazio traz tudo, resolvido ou não. */
  status?: "open" | "resolved"
}

/**
 * Recorta a região do desenho em volta de um ponto.
 *
 * A janela é proporcional à prancha e não fixa em pixels: uma fração da largura
 * numa A0 cobre mais ou menos o mesmo pedaço de obra que a mesma fração numa
 * folha carta, porque as duas foram desenhadas para serem lidas inteiras. Uma
 * janela em centímetros de papel mostraria um cômodo numa e um parafuso na
 * outra.
 *
 * A fração era 12% e ficou 18%. Com 12% o recorte caía muitas vezes sobre papel
 * em branco, porque o ponto é marcado sobre o detalhe e o detalhe tem um palmo
 * de espaço em volta. Mostrar o vazio ao lado da viga é pior que mostrar a viga
 * pequena.
 */
async function recortar(
  url: string, pageIndex: number, x: number, y: number,
): Promise<string | null> {
  try {
    const pdf = await loadPdf(url)
    // Qual página abrir dentro do arquivo.
    //
    // Depende de o arquivo ser o recorte da folha ou o set inteiro. Recortado, a
    // folha é a única página do arquivo e a página é sempre a primeira; inteiro,
    // é preciso pular até a página dela. Usar o índice da folha nos dois casos
    // pedia a página 43 de um arquivo de uma página só, e o pdf.js recusava: o
    // relatório saía com recorte apenas dos pontos da primeira prancha, e os
    // outros apareciam com o quadro vazio.
    const pagina = pageIndex < pdf.numPages ? pageIndex + 1 : 1
    const page = await pdf.getPage(pagina)
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

    const lado = Math.round(vp.width * 0.18)
    const cx = Math.round(x * vp.width)
    const cy = Math.round(y * vp.height)
    const corte = document.createElement("canvas")
    corte.width = lado
    corte.height = lado
    const cctx = corte.getContext("2d")
    if (!cctx) return null
    cctx.fillStyle = "#fff"
    cctx.fillRect(0, 0, lado, lado)
    cctx.drawImage(
      canvas,
      Math.max(0, cx - lado / 2), Math.max(0, cy - lado / 2), lado, lado,
      0, 0, lado, lado,
    )
    // A marca do ponto, desenhada por cima: sem ela o recorte mostra um pedaço
    // de planta e deixa quem lê adivinhar qual detalhe dali é o assunto.
    cctx.strokeStyle = "#dc2626"
    cctx.lineWidth = Math.max(2, lado * 0.012)
    cctx.beginPath()
    cctx.arc(lado / 2, lado / 2, lado * 0.09, 0, Math.PI * 2)
    cctx.stroke()
    return corte.toDataURL("image/jpeg", 0.85)
  } catch {
    return null
  }
}

/** As imagens do relatório viram data URI: janela nova não herda sessão. */
async function embutir(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const esc = (s: string) =>
  (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))

/**
 * Os ícones, desenhados no próprio documento.
 *
 * São os mesmos traços do lucide, escritos à mão aqui porque a janela de
 * impressão é um documento à parte: ela não tem o React, não tem o pacote de
 * ícones, e não pode buscar nada na rede sem arriscar imprimir com buraco no
 * lugar do desenho.
 */
const ICONE: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  sheet: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
}

const icone = (nome: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" class="ic">${ICONE[nome] ?? ""}</svg>`

const dataCurta = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US")
}

/**
 * O corpo do ponto, respeitando os tópicos.
 *
 * A descrição falada volta do agente em linhas que começam com travessão, e
 * impressas como texto corrido elas viram um parágrafo com hífens no meio. Sendo
 * lista de verdade, cada tópico é uma linha que se lê de relance, que é o
 * formato em que ele nasceu.
 */
function corpoDoPonto(texto: string): string {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean)
  const topicos = linhas.filter(l => /^[-•*]\s+/.test(l))
  if (topicos.length < 2 || topicos.length !== linhas.length) {
    return `<p class="corpo">${esc(texto)}</p>`
  }
  return `<ul class="topicos">${
    topicos.map(l => `<li>${esc(l.replace(/^[-•*]\s+/, ""))}</li>`).join("")
  }</ul>`
}

export async function gerarRelatorio(op: OpcoesRelatorio): Promise<void> {
  const filtro = { scope: op.scope || undefined, status: op.status }
  const [pontos, midias] = await Promise.all([
    atlasService.punchList(op.jobsiteId, filtro),
    atlasService.punchMedia(op.jobsiteId, filtro).catch(() => [] as AtlasPunchMedia[]),
  ])
  if (!pontos.length) return

  // As peças de cada ponto, separadas pelo que elas provam.
  const porPonto = new Map<string, AtlasPunchMedia[]>()
  for (const m of midias) {
    const lista = porPonto.get(m.eventId) ?? []
    lista.push(m)
    porPonto.set(m.eventId, lista)
  }

  // Os recortes, agrupados por folha para o PDF de cada prancha ser aberto uma
  // vez só. Sessenta pontos em vinte plantas seriam sessenta downloads de PDF
  // sem isto, num aparelho de campo.
  const porFolha = new Map<string, AtlasPunchPoint[]>()
  for (const p of pontos) {
    const lista = porFolha.get(p.sheetId) ?? []
    lista.push(p)
    porFolha.set(p.sheetId, lista)
  }
  const recortes = new Map<string, string>()
  for (const [sheetId, doFolha] of porFolha) {
    try {
      const folha = await atlasService.sheetUrl(sheetId)
      for (const p of doFolha) {
        if (p.pageX == null || p.pageY == null) continue
        // O set inteiro precisa do índice da folha; o recorte dela, não.
        const img = await recortar(folha.url, folha.whole ? p.pageIndex : 0, p.pageX, p.pageY)
        if (img) recortes.set(p.id, img)
      }
    } catch {
      // Prancha inacessível: os pontos dela seguem sem recorte.
    }
  }

  // As fotos entram embutidas. A janela do relatório é outro documento, e a URL
  // assinada nela vence em trinta minutos: impressa depois disso, a folha sairia
  // com o quadro vazio no lugar da prova.
  const embutidas = new Map<string, string>()
  await Promise.all(midias
    .filter(m => m.url && (m.contentType.startsWith("image/")))
    .map(async m => {
      const dado = await embutir(m.url)
      if (dado) embutidas.set(m.id, dado)
    }))

  const blocos = pontos.map(p => {
    const pecas = porPonto.get(p.id) ?? []
    const antes = pecas.filter(m => m.phase !== "after" && embutidas.has(m.id))
    const depois = pecas.filter(m => m.phase === "after" && embutidas.has(m.id))
    const falado = pecas.find(m => m.contentType.startsWith("audio/") && m.transcript)
    const recorte = recortes.get(p.id)

    const principal = antes[0] ? embutidas.get(antes[0].id) : recorte
    const secundaria = antes[0] && recorte ? recorte : null

    const solucao = depois.length ? `
      <div class="feito">
        <span class="rotulo">${icone("check")} What was done</span>
        <div class="tiras">
          ${depois.map(m => `
            <figure>
              <img src="${embutidas.get(m.id)}" alt="">
              ${m.title || m.description ? `
                <figcaption>
                  ${m.title ? `<strong>${esc(m.title)}</strong>` : ""}
                  ${m.description ? `<span>${esc(m.description)}</span>` : ""}
                </figcaption>` : ""}
            </figure>`).join("")}
        </div>
      </div>` : ""

    return `
    <section class="ponto">
      <div class="linha">
        <div class="escrito">
          <div class="cabeca">
            <span class="numero">${p.number ?? "—"}</span>
            <h2>${esc(p.title || p.body.slice(0, 80) || "Untitled")}</h2>
            <span class="cond ${p.status}">${p.status === "resolved" ? "Done" : "Pending"}</span>
          </div>
          ${p.body ? corpoDoPonto(p.body) : ""}
          ${falado ? `<p class="falado">${icone("user")}${esc(falado.transcript)}</p>` : ""}
          ${solucao}
          <div class="rodape">
            <span>${icone("user")}${esc(p.createdName || "Someone")}</span>
            <span>${icone("calendar")}${dataCurta(p.createdAt)}</span>
            <span>${icone("sheet")}${esc(p.sheetNumber || `p. ${p.pageIndex + 1}`)}</span>
            <span>${icone("layers")}${esc(p.scopeValue || p.document)}</span>
            ${p.resolvedAt ? `<span class="ok">${icone("check")}${dataCurta(p.resolvedAt)}</span>` : ""}
          </div>
        </div>

        <div class="visual">
          ${principal
            ? `<img class="grande" src="${principal}" alt="">`
            : `<div class="grande vazio">${icone("pin")}</div>`}
          ${secundaria ? `<img class="pequena" src="${secundaria}" alt="">` : ""}
        </div>
      </div>
    </section>`
  }).join("")

  const abertos = pontos.filter(p => p.status !== "resolved").length
  const escopo = op.scope || "Whole job"
  const emitido = new Date().toLocaleDateString("en-US")

  const janela = window.open("", "_blank")
  if (!janela) return

  janela.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Punch list · ${esc(op.jobsiteName)}</title>
<style>
  /* A margem de cima e a de baixo abrem espaço para o cabeçalho e o rodapé
     fixos, que se repetem em toda página. Sem essa folga o texto passa por
     baixo deles a partir da segunda folha. */
  @page { margin: 22mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #18181b;
    font: 11px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ic { width: 11px; height: 11px; flex: none; }

  header.folha, footer.folha {
    position: fixed; left: 0; right: 0;
    display: flex; align-items: baseline; justify-content: space-between;
    color: #71717a;
  }
  header.folha {
    top: -14mm; padding-bottom: 4px; border-bottom: 1px solid #e4e4e7;
  }
  header.folha .obra { font-size: 13px; font-weight: 600; color: #18181b; }
  footer.folha {
    bottom: -11mm; padding-top: 4px; border-top: 1px solid #e4e4e7;
    font-size: 9px; letter-spacing: .04em; text-transform: uppercase;
  }

  .resumo {
    display: flex; gap: 18px; align-items: baseline;
    margin: 0 0 12px; padding-bottom: 10px; border-bottom: 2px solid #18181b;
  }
  .resumo h1 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
  .resumo .conta { margin-left: auto; display: flex; gap: 14px; }
  .resumo .conta b { font-size: 15px; }
  .resumo .conta span { color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }

  /* Um ponto nunca é cortado entre páginas: o recorte numa página e as
     informações na seguinte torna o documento inútil para conferir em obra. */
  .ponto { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
  .linha {
    display: flex; gap: 12px; align-items: stretch;
    border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px; background: #fff;
  }
  .escrito { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }

  .cabeca { display: flex; align-items: baseline; gap: 8px; }
  .cabeca .numero {
    font-size: 13px; font-weight: 700; color: #52525b;
    min-width: 22px; font-variant-numeric: tabular-nums;
  }
  .cabeca h2 { margin: 0; font-size: 13px; font-weight: 600; flex: 1; }
  .cond {
    font-size: 8px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600;
    border: 1px solid; border-radius: 999px; padding: 2px 7px; white-space: nowrap;
  }
  .cond.open { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
  .cond.resolved { color: #047857; border-color: #6ee7b7; background: #ecfdf5; }

  .corpo { margin: 0; white-space: pre-wrap; }
  .topicos { margin: 0; padding-left: 15px; }
  .topicos li { margin-bottom: 2px; }
  /* O que foi dito em voz alta entra em itálico e recuado: é citação de alguém
     que estava lá, e não texto do sistema. */
  .falado {
    margin: 0; display: flex; gap: 6px; align-items: flex-start;
    padding-left: 8px; border-left: 2px solid #e4e4e7;
    color: #52525b; font-style: italic;
  }

  .feito { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
  .rotulo {
    display: flex; align-items: center; gap: 5px;
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
    color: #047857;
  }
  .tiras { display: flex; flex-wrap: wrap; gap: 8px; }
  .tiras figure { margin: 0; width: 150px; display: flex; flex-direction: column; gap: 3px; }
  .tiras img { width: 150px; height: 100px; object-fit: cover; border-radius: 5px; border: 1px solid #e4e4e7; }
  .tiras figcaption { display: flex; flex-direction: column; font-size: 9px; line-height: 1.35; color: #52525b; }
  .tiras figcaption strong { color: #18181b; }

  .rodape {
    margin-top: auto; padding-top: 6px; border-top: 1px dashed #e4e4e7;
    display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end;
    color: #71717a; font-size: 9px;
  }
  .rodape span { display: flex; align-items: center; gap: 4px; }
  .rodape .ok { color: #047857; }

  /* A coluna da direita ocupa a altura inteira do container, e é o que dá ao
     bloco a forma de ficha: o olho cai na imagem e volta para o texto. */
  .visual { width: 168px; flex: none; display: flex; flex-direction: column; gap: 6px; }
  .visual .grande {
    width: 168px; flex: 1; min-height: 118px; object-fit: cover;
    border-radius: 6px; border: 1px solid #e4e4e7; background: #fafafa;
  }
  .visual .grande.vazio {
    display: flex; align-items: center; justify-content: center; color: #d4d4d8;
  }
  .visual .grande.vazio .ic { width: 26px; height: 26px; }
  .visual .pequena {
    width: 168px; height: 74px; object-fit: cover;
    border-radius: 6px; border: 1px solid #e4e4e7;
  }
</style></head><body>
<header class="folha">
  <span class="obra">${esc(op.jobsiteName)}</span>
  <span>${esc(escopo)}</span>
</header>
<footer class="folha">
  <span>Punch list · Premium Group</span>
  <span>Issued ${emitido}</span>
</footer>

<div class="resumo">
  <h1>Punch list</h1>
  <div class="conta">
    <div><b>${pontos.length}</b> <span>points</span></div>
    <div><b>${abertos}</b> <span>pending</span></div>
    <div><b>${pontos.length - abertos}</b> <span>done</span></div>
  </div>
</div>
${blocos}
</body></html>`)
  janela.document.close()
  // O `onload` espera as imagens entrarem. Chamar `print` antes deixaria o
  // documento sair com os quadros em branco, que é justamente a parte que ele
  // existe para mostrar.
  janela.onload = () => janela.print()
}
