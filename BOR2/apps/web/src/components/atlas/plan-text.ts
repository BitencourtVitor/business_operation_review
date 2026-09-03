"use client"

import { loadPdf } from "@/components/atlas/pdf-page"

export interface TextHit {
  /** Retângulo na coordenada da página, origem no canto superior esquerdo. */
  x: number
  y: number
  width: number
  height: number
}

type TextItem = {
  str: string
  width: number
  height: number
  transform: number[]
}

/**
 * Onde uma palavra aparece na prancha.
 *
 * O texto do plano é texto de verdade, não imagem: o PDF carrega cada trecho com
 * a posição em que foi impresso, e é isso que o pdf.js devolve. Procurar aqui
 * custa uma leitura da página e nenhuma rasterização.
 *
 * A busca é por trecho, do jeito que o PDF os guarda. Uma palavra partida entre
 * dois trechos não é encontrada, o que acontece em título com espaçamento
 * manual; é o preço de não remontar a página inteira em memória a cada tecla.
 */
export async function findInPlan(
  url: string,
  pageIndex: number,
  query: string,
): Promise<TextHit[]> {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []

  const pdf = await loadPdf(url)
  const page = await pdf.getPage(pageIndex + 1)
  const content = await (page as unknown as {
    getTextContent: () => Promise<{ items: TextItem[] }>
  }).getTextContent()
  const viewport = page.getViewport({ scale: 1 })
  const pageHeight = viewport.height

  const hits: TextHit[] = []
  for (const item of content.items) {
    const text = (item.str ?? "").toLowerCase()
    if (!text.includes(needle)) continue

    const [, , , , left, bottom] = item.transform
    const height = item.height || 10
    // Uma ocorrência por trecho, mas o retângulo cobre só a fatia da palavra:
    // o trecho pode ser uma linha inteira, e destacá-la toda apontaria para o
    // lugar errado.
    let from = text.indexOf(needle)
    while (from !== -1) {
      const unit = item.width / Math.max(1, text.length)
      hits.push({
        x: left + from * unit,
        // O PDF conta de baixo para cima; a tela, de cima para baixo.
        y: pageHeight - bottom - height,
        width: unit * needle.length,
        height,
      })
      from = text.indexOf(needle, from + needle.length)
    }
  }

  // Ordem de leitura: de cima para baixo, depois da esquerda para a direita. É
  // como quem varre a prancha espera que "próximo" ande.
  return hits.sort((a, b) => (a.y - b.y) || (a.x - b.x))
}
