"use client"

import { loadPdf } from "@/components/atlas/pdf-page"

/**
 * Onde procurar o nome de uma folha, em fração da página.
 *
 * Fração e não ponto: o mesmo gabarito precisa valer no ofício de um relatório
 * de produção e na prancha de 42 polegadas de um plan set, e o que se repete
 * entre os dois é a proporção, não a medida.
 */
export interface NamingRegion {
  x0: number
  y0: number
  x1: number
  y1: number
  /**
   * Direção do texto que se quer ler ali: 0 horizontal, 90 vertical. Vertical
   * vale para os dois sentidos, porque na prancha um deles é o texto e o outro
   * é o que está de cabeça para baixo; ninguém precisa saber qual.
   */
  rotation: number
  /**
   * De qual página até qual página este nível vale, contando a partir de 1 e
   * incluindo as duas pontas. Vazio vale para o arquivo inteiro.
   *
   * Existe porque nem sempre o que separa os tipos de folha é o que está
   * impresso: às vezes é a posição no arquivo. Num relatório de produção as 18
   * primeiras páginas trazem o código no cabeçalho e as demais no rodapé, e sem
   * a faixa isso vira uma disputa de precedência entre dois níveis lendo o
   * mesmo lugar.
   */
  fromPage?: number
  toPage?: number
}

export interface NamingTemplate {
  /** Em ordem de precedência: o primeiro que devolver texto dá o nome. */
  levels: NamingRegion[]
}

export interface PageName {
  pageIndex: number
  /** O nome final, já com sufixo se houve repetição. */
  name: string
  /** O que o gabarito leu, antes do sufixo. Vazio quando nada foi lido. */
  read: string
  /** Qual nível resolveu, começando em 1. Zero quando a folha ficou sem nome. */
  level: number
  /** O que cada nível leu, para a prévia mostrar por que deu no que deu. */
  reads: string[]
}

/** A letra do sufixo: 0 vira A, 25 vira Z, 26 vira AA. */
function letter(i: number): string {
  let out = ""
  let n = i
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * Desempata folhas que leram a mesma identificação.
 *
 * Acontece de verdade: num relatório de produção, o mesmo código de bundle
 * aparece na folha de montagem e na de posicionamento, e as duas são folhas
 * diferentes. Sem desempate as duas ficam com o mesmo nome e ninguém sabe qual
 * é qual; com ele viram "1-01-L-A" e "1-01-L-B", na ordem em que estão no
 * arquivo.
 *
 * Só quem repete recebe sufixo. Nome único continua exatamente como foi lido,
 * senão a folha que não tem irmã passaria a carregar um "-A" que não significa
 * nada.
 */
export function disambiguate(pages: PageName[]): PageName[] {
  const count = new Map<string, number>()
  for (const p of pages) {
    if (p.read) count.set(p.read, (count.get(p.read) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return pages.map(p => {
    if (!p.read || (count.get(p.read) ?? 0) < 2) return p
    const i = seen.get(p.read) ?? 0
    seen.set(p.read, i + 1)
    return { ...p, name: `${p.read}-${letter(i)}` }
  })
}

type TextItem = { str: string; width: number; transform: number[] }

/**
 * Régua para repartir um trecho entre as letras dele.
 *
 * O PDF entrega a largura do trecho inteiro e mais nada. Sem isto, marcar
 * "depois dos dois pontos" seria impossível: no relatório de produção,
 * "Bundle: 1-01-L" é um trecho só, com a origem na letra B, e uma região
 * desenhada à direita do sinal não encostaria em origem nenhuma. Com a régua, a
 * região corta dentro do trecho e sobra "1-01-L".
 *
 * As proporções saem de uma fonte proporcional qualquer, normalizadas pela
 * largura que o PDF informa: a soma continua exata e a repartição interna fica
 * perto da verdade. É a mesma régua que a busca usa para destacar palavra.
 */
const ruler = (() => {
  let ctx: CanvasRenderingContext2D | null = null
  return (text: string) => {
    if (typeof document === "undefined") return text.length
    if (!ctx) {
      ctx = document.createElement("canvas").getContext("2d")
      if (ctx) ctx.font = "100px system-ui, sans-serif"
    }
    return ctx ? ctx.measureText(text).width : text.length
  }
})()

const clean = (raw: string) => raw.replace(/\s+/g, " ").trim()

/** O giro do trecho, em graus, no mesmo sentido em que a tela o mostra. */
function angleOf(transform: number[]): number {
  const deg = -Math.atan2(transform[1], transform[0]) * (180 / Math.PI)
  // Normaliza para 0, 90, 180 ou 270: fonte torta por fração de grau é ruído de
  // arredondamento do PDF, não intenção do desenho.
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360
}

/**
 * O pedaço do trecho que cai dentro da região, ou vazio.
 *
 * Trata o trecho como um segmento que parte da origem e corre no sentido em que
 * foi impresso. A região vira um intervalo sobre esse segmento, e o intervalo
 * vira faixa de letras.
 */
function inside(
  item: TextItem,
  region: NamingRegion,
  page: { width: number; height: number },
  measure: (text: string) => number,
): string {
  const angle = angleOf(item.transform)
  const vertical = angle === 90 || angle === 270
  if (region.rotation ? !vertical : vertical) return ""

  const x = item.transform[4] / page.width
  const y = (page.height - item.transform[5]) / page.height

  // Onde o trecho começa, para onde ele corre, e quanto ele mede: tudo em
  // fração do lado da página que ele atravessa.
  const span = vertical ? item.width / page.height : item.width / page.width
  const start = vertical ? y : x
  const forward = angle === 0 || angle === 270
  const across = vertical ? x : y
  const lowAcross = vertical ? region.x0 : region.y0
  const highAcross = vertical ? region.x1 : region.y1
  const low = vertical ? region.y0 : region.x0
  const high = vertical ? region.y1 : region.x1

  if (across < lowAcross || across > highAcross) return ""
  if (span <= 0) return start >= low && start <= high ? item.str : ""

  // A faixa da região convertida em fração do próprio trecho, de 0 no começo a
  // 1 no fim.
  const from = forward ? (low - start) / span : (start - high) / span
  const to = forward ? (high - start) / span : (start - low) / span
  const t0 = Math.max(0, Math.min(1, from))
  const t1 = Math.max(0, Math.min(1, to))
  if (t1 <= t0) return ""
  if (t0 === 0 && t1 === 1) return item.str

  // Palavra inteira, nunca letra solta. A régua acerta a posição por
  // aproximação, e cortar no caractere fazia "1-01-L" virar "01-L" quando a
  // conta escorregava um passo. Ninguém marca uma região para levar meio
  // código: o que se marca é o código.
  const parts = item.str.split(/(\s+)/).filter(Boolean)
  const widths = parts.map(part => measure(part))
  const total = widths.reduce((a, b) => a + b, 0)
  if (total <= 0) return item.str

  let acc = 0
  const kept: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const middle = (acc + widths[i] / 2) / total
    acc += widths[i]
    if (parts[i].trim() && middle >= t0 && middle <= t1) kept.push(parts[i])
  }
  return kept.join(" ")
}

/**
 * Lê o nome de cada página a partir do gabarito.
 *
 * O texto do plano é texto de verdade: o PDF guarda cada trecho com a posição e
 * o giro em que foi impresso. Ler daqui não custa rasterização nenhuma, e é o
 * que permite conferir as 97 páginas antes de gravar qualquer coisa.
 */
export async function readPageNames(
  url: string,
  template: NamingTemplate,
  onProgress?: (done: number, total: number) => void,
  measure: (text: string) => number = ruler,
): Promise<PageName[]> {
  const pdf = await loadPdf(url)
  const out: PageName[] = []

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await (page as unknown as {
      getTextContent: () => Promise<{ items: TextItem[] }>
    }).getTextContent()

    const reads = template.levels.map(region => {
      // Fora da faixa o nível simplesmente não opina, e a decisão passa ao
      // seguinte como se ele não existisse.
      if (region.fromPage && n < region.fromPage) return ""
      if (region.toPage && n > region.toPage) return ""
      let found = ""
      for (const item of content.items) {
        if (!item.str?.trim()) continue
        found += inside(item, region, viewport, measure)
      }
      return clean(found)
    })

    const level = reads.findIndex(Boolean)
    const read = level === -1 ? "" : reads[level]
    out.push({
      pageIndex: n - 1,
      name: read,
      read,
      level: level === -1 ? 0 : level + 1,
      reads,
    })
    onProgress?.(n, pdf.numPages)
  }

  return disambiguate(out)
}
