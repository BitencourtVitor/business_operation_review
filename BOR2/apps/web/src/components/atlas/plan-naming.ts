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
}

export interface NamingTemplate {
  /** Em ordem de precedência: o primeiro que devolver texto dá o nome. */
  levels: NamingRegion[]
}

export interface PageName {
  pageIndex: number
  /** O nome final, ou vazio quando nenhum nível achou nada. */
  name: string
  /** Qual nível resolveu, começando em 1. Zero quando a folha ficou sem nome. */
  level: number
  /** O que cada nível leu, para a prévia mostrar por que deu no que deu. */
  reads: string[]
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

  const chars = Array.from(item.str)
  const widths = chars.map(ch => measure(ch))
  const total = widths.reduce((a, b) => a + b, 0)
  if (total <= 0) return item.str

  let acc = 0
  let out = ""
  for (let i = 0; i < chars.length; i++) {
    const middle = (acc + widths[i] / 2) / total
    acc += widths[i]
    // Pelo meio da letra: a que está pela metade dentro fica de fora, que é o
    // que quem desenhou a região quis dizer ao parar ali.
    if (middle >= t0 && middle <= t1) out += chars[i]
  }
  return out
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
      let found = ""
      for (const item of content.items) {
        if (!item.str?.trim()) continue
        found += inside(item, region, viewport, measure)
      }
      return clean(found)
    })

    const level = reads.findIndex(Boolean)
    out.push({
      pageIndex: n - 1,
      name: level === -1 ? "" : reads[level],
      level: level === -1 ? 0 : level + 1,
      reads,
    })
    onProgress?.(n, pdf.numPages)
  }

  return out
}
