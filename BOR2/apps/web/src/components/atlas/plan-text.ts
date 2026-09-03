"use client"

import { loadPdf } from "@/components/atlas/pdf-page"

export interface TextHit {
  /** Início do trecho, na coordenada da página, com origem no canto superior esquerdo. */
  x: number
  y: number
  width: number
  height: number
  /** Giro do texto em graus, no sentido da tela. Carimbo e legenda vêm a 90. */
  angle: number
  /** Meio do trecho, para levar a prancha até ele sem recalcular o giro. */
  cx: number
  cy: number
}

/**
 * Régua para medir a fatia de um trecho.
 *
 * O PDF entrega a largura do trecho inteiro e mais nada, então achar onde uma
 * palavra começa dentro dele é conta nossa. Dividir a largura pelo número de
 * letras supõe que todas ocupam o mesmo, o que não vale em fonte proporcional:
 * "l" e "m" não medem igual, e o erro se acumula ao longo da linha até o
 * destaque escorregar alguns caracteres.
 *
 * Medir com a fonte real exigiria montar o programa de fonte do próprio PDF. O
 * que se faz aqui é usar as proporções de uma fonte proporcional qualquer e
 * normalizá-las pela largura que o PDF informa: a soma continua exata e a
 * repartição interna fica muito mais perto da verdade.
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
 * a posição e o giro em que foi impresso, e é isso que o pdf.js devolve. Procurar
 * aqui custa uma leitura da página e nenhuma rasterização.
 *
 * O giro importa mais do que parece. Prancha de arquitetura escreve de lado o
 * tempo todo: o carimbo lateral, o nome da folha, as chamadas ao longo das
 * paredes. Marcar tudo deitado deixava o destaque atravessado sobre o desenho,
 * apontando para o lugar errado.
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

    const [a, b, , , left, bottom] = item.transform
    const height = item.height || 10
    // O ângulo sai da própria matriz do trecho. O PDF conta o giro no sentido
    // anti-horário e com o eixo Y para cima; a tela é o contrário nas duas
    // coisas, e é por isso que o sinal se inverte.
    const radians = Math.atan2(b, a)
    const angle = -radians * (180 / Math.PI)
    const dirX = Math.cos(radians)
    const dirY = -Math.sin(radians)

    // Uma ocorrência por trecho, mas o retângulo cobre só a fatia da palavra: o
    // trecho pode ser uma linha inteira, e destacá-la toda apontaria para o
    // lugar errado.
    const whole = ruler(item.str) || 1
    const scale = item.width / whole
    let from = text.indexOf(needle)
    while (from !== -1) {
      // A fatia sai da medição da própria cadeia, e não de uma média: assim o
      // começo da palavra cai onde ela realmente começa.
      const offset = ruler(item.str.slice(0, from)) * scale
      const width = ruler(item.str.slice(from, from + needle.length)) * scale
      // O PDF conta de baixo para cima; a tela, de cima para baixo.
      const x = left + dirX * offset
      const y = pageHeight - bottom + dirY * offset
      hits.push({
        x, y, width, height, angle,
        cx: x + dirX * (width / 2),
        cy: y + dirY * (width / 2),
      })
      from = text.indexOf(needle, from + needle.length)
    }
  }

  // Ordem de leitura: de cima para baixo, depois da esquerda para a direita. É
  // como quem varre a prancha espera que "próximo" ande.
  return hits.sort((p, q) => (p.cy - q.cy) || (p.cx - q.cx))
}
