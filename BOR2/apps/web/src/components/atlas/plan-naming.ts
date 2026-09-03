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
  /** Giro do texto que se quer ler ali: 0 para deitado, 90 para o carimbo em pé. */
  rotation: number
  /**
   * Corta tudo até este separador, inclusive. É o que transforma
   * "Bundle: 1-06-L" em "1-06-L". Vazio mantém o texto inteiro.
   */
  after: string
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

type TextItem = { str: string; transform: number[] }

const clean = (raw: string, after: string) => {
  const text = raw.replace(/\s+/g, " ").trim()
  if (!after) return text
  const at = text.indexOf(after)
  return at === -1 ? text : text.slice(at + after.length).trim()
}

/** O giro do trecho, em graus, no mesmo sentido em que a tela o mostra. */
function angleOf(transform: number[]): number {
  const deg = -Math.atan2(transform[1], transform[0]) * (180 / Math.PI)
  // Normaliza para 0, 90, 180 ou 270: fonte torta por fração de grau é ruído de
  // arredondamento do PDF, não intenção do desenho.
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360
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
        const str = item.str ?? ""
        if (!str.trim()) continue
        // O giro entra como filtro, não como conversão: numa prancha o carimbo
        // em pé e a legenda deitada se cruzam na mesma área, e ler os dois
        // juntos embaralharia o nome.
        if (angleOf(item.transform) !== ((region.rotation % 360) + 360) % 360) continue

        const x = item.transform[4] / viewport.width
        const y = (viewport.height - item.transform[5]) / viewport.height
        if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) continue
        found += str
      }
      return clean(found, region.after)
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
