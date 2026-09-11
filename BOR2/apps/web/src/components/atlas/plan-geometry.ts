"use client"

import { OPS } from "pdfjs-dist"

/**
 * As linhas do desenho, e o que fazer com elas ao medir.
 *
 * Medir à mão sobre uma planta tem um problema que não é de precisão do dedo: é
 * de intenção. Quem mede a largura de um cômodo quer o ponto **exato** onde a
 * parede começa, e o dedo num iPad erra três ou quatro pixels. Três pixels numa
 * prancha em 1/4" são dois centímetros e meio de mundo real, e a pessoa não tem
 * como saber se errou.
 *
 * O AutoCAD resolve isso há trinta anos com duas ferramentas, e as duas cabem
 * aqui:
 *
 *   - **Ortho** (o F8): trava a medida no horizontal ou no vertical, porque
 *     parede é reta e ninguém quer medir a diagonal por engano.
 *   - **Snap**: o ponto pula para o canto mais próximo, e canto é onde duas
 *     linhas do desenho se cruzam.
 *
 * A geometria vem do próprio PDF. Uma prancha vetorial carrega os segmentos que
 * a desenham, e o pdf.js os entrega na lista de operadores. Não há visão
 * computacional envolvida: é ler o que já está escrito no arquivo.
 */

export interface Segmento {
  x0: number; y0: number; x1: number; y1: number
}

export interface Ponto { x: number; y: number }

// O operador de construção de caminho vem da biblioteca, e não escrito à mão.
//
// O valor é 91 hoje, e escrevê-lo aqui funcionaria até a próxima atualização do
// pdf.js. O modo como isso quebraria é o pior possível: nenhum erro, nenhum
// aviso, e a extração passa a devolver zero segmento. O snap simplesmente para
// de existir, e ninguém tem como saber por quê.
const OP_CONSTRUCT_PATH = OPS.constructPath

// Os comandos dentro de um caminho, e **quantos números cada um consome**.
//
// A tabela existe porque errar o consumo não dá erro: desalinha o cursor de
// leitura, e a partir dali todos os segmentos nascem de coordenadas trocadas.
// O desenho extraído fica cheio de retas que não existem na prancha, e o snap
// passa a pular para cantos imaginários.
//
// `DrawOPS` não é exportado pela biblioteca, então os valores ficam aqui, com a
// tabela completa em vez de um "todo o resto consome 2" — que era o erro:
// `quadraticCurveTo` consome 4 e `closePath` consome 0.
const CMD_MOVE = 0
const CMD_LINE = 1
const ARGS: Record<number, number> = {
  0: 2, // moveTo
  1: 2, // lineTo
  2: 6, // curveTo
  3: 4, // quadraticCurveTo
  4: 0, // closePath
}

/**
 * Extrai os segmentos retos de uma página.
 *
 * Só interessa reta: curva de Bézier existe na planta (arco de porta, tubulação)
 * e não é onde alguém encosta a trena. Ignorá-las reduz o conjunto e melhora o
 * snap, porque canto de verdade é encontro de retas.
 *
 * As coordenadas saem normalizadas, de 0 a 1, para casarem com o resto do
 * sistema de anotação e sobreviverem a zoom e a mudança de tamanho de tela.
 */
export async function segmentosDaPagina(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>
          getViewport: (p: { scale: number }) => { width: number; height: number } },
): Promise<Segmento[]> {
  let ops: { fnArray: number[]; argsArray: unknown[] }
  try {
    ops = await page.getOperatorList()
  } catch {
    return []
  }
  const vp = page.getViewport({ scale: 1 })
  const larg = vp.width || 1
  const alt = vp.height || 1

  const out: Segmento[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OP_CONSTRUCT_PATH) continue
    const args = ops.argsArray[i] as [number[], number[]] | undefined
    if (!args) continue
    const [comandos, coords] = args
    if (!comandos || !coords) continue

    let cx = 0, cy = 0, k = 0
    for (const cmd of comandos) {
      if (cmd === CMD_MOVE) {
        cx = coords[k++]; cy = coords[k++]
      } else if (cmd === CMD_LINE) {
        const nx = coords[k++], ny = coords[k++]
        // Segmento de comprimento desprezível é ruído de arredondamento, e entra
        // no conjunto só para atrapalhar o vizinho mais próximo.
        if (Math.hypot(nx - cx, ny - cy) > 1) {
          out.push({
            x0: cx / larg, y0: 1 - cy / alt,
            x1: nx / larg, y1: 1 - ny / alt,
          })
        }
        cx = nx; cy = ny
      } else {
        // Curva e fechamento: consome o que aquele comando consome e segue. O
        // ponto corrente passa a ser o fim do comando, senão o próximo segmento
        // nasceria do lugar errado e inventaria uma reta que não existe.
        //
        // `closePath` consome zero e não move o cursor: ele volta ao início do
        // subcaminho, e tratá-lo como os outros faria a leitura escorregar dois
        // números para o resto da página.
        const consome = ARGS[cmd] ?? 0
        k += consome
        if (consome > 0 && k >= 2) { cx = coords[k - 2]; cy = coords[k - 1] }
      }
    }
    // Uma prancha A0 tem dezenas de milhares de segmentos, e o snap não fica
    // melhor com todos eles: fica mais lento. O teto mantém a resposta imediata
    // ao toque, que é o que a ferramenta precisa ser.
    if (out.length > 20000) break
  }
  return out
}

/**
 * Trava o segundo ponto no eixo dominante.
 *
 * É o ortho. Compara o quanto andou em cada eixo e zera o menor: quem arrastou
 * mais na horizontal está medindo horizontal, e os poucos pixels de desvio
 * vertical são tremor de mão, não intenção.
 */
export function ortogonalizar(a: Ponto, b: Ponto, larguraPt: number, alturaPt: number): Ponto {
  // A comparação é feita em pontos de PDF e não em coordenada normalizada.
  // Normalizada, uma prancha 3024×2160 faria o mesmo deslocamento físico parecer
  // maior na vertical, e o eixo dominante sairia errado numa medida a 45 graus.
  const dx = Math.abs(b.x - a.x) * larguraPt
  const dy = Math.abs(b.y - a.y) * alturaPt
  return dx >= dy ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
}

/**
 * O ponto sugerido mais próximo: onde duas linhas do desenho se cruzam.
 *
 * O cruzamento é calculado, e não procurado numa lista pré-computada, porque a
 * lista de todos os cruzamentos de uma prancha A0 é grande demais para valer a
 * pena: ela custaria mais para montar do que este laço custa para responder ao
 * toque.
 *
 * `raio` é a distância máxima, em coordenada normalizada, para o pulo acontecer.
 * Longe demais, o snap deixa de ajudar e passa a mover o ponto para onde a
 * pessoa não pediu, que é pior que não ter snap nenhum.
 */
export function pontoSugerido(
  alvo: Ponto, segmentos: Segmento[], raio = 0.006,
): Ponto | null {
  let melhor: Ponto | null = null
  let melhorDist = raio

  // Só os segmentos que passam perto entram no cruzamento par a par. Sem este
  // filtro seriam vinte mil ao quadrado, e o toque travaria.
  const perto = segmentos.filter(s =>
    distanciaAoSegmento(alvo, s) < raio * 3)

  for (let i = 0; i < perto.length; i++) {
    for (let j = i + 1; j < perto.length; j++) {
      const p = interseccao(perto[i], perto[j])
      if (!p) continue
      const d = Math.hypot(p.x - alvo.x, p.y - alvo.y)
      if (d < melhorDist) { melhorDist = d; melhor = p }
    }
  }

  // Não havendo cruzamento por perto, vale o ponto sobre a linha mais próxima.
  // Encostar na parede já é melhor que flutuar ao lado dela, e é o que a pessoa
  // queria quando mirou na linha e não no canto.
  if (!melhor) {
    let d0 = raio
    for (const s of perto) {
      const p = projetarNoSegmento(alvo, s)
      const d = Math.hypot(p.x - alvo.x, p.y - alvo.y)
      if (d < d0) { d0 = d; melhor = p }
    }
  }
  return melhor
}

function interseccao(a: Segmento, b: Segmento): Ponto | null {
  const d = (a.x1 - a.x0) * (b.y1 - b.y0) - (a.y1 - a.y0) * (b.x1 - b.x0)
  // Paralelas, ou quase. Duas retas quase paralelas se cruzam muito longe, e
  // esse cruzamento não é um canto do desenho.
  if (Math.abs(d) < 1e-9) return null
  const t = ((b.x0 - a.x0) * (b.y1 - b.y0) - (b.y0 - a.y0) * (b.x1 - b.x0)) / d
  const u = ((b.x0 - a.x0) * (a.y1 - a.y0) - (b.y0 - a.y0) * (a.x1 - a.x0)) / d
  // O cruzamento precisa cair dentro dos dois segmentos. Fora deles é o encontro
  // das retas infinitas, que não corresponde a nada desenhado na prancha.
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a.x0 + t * (a.x1 - a.x0), y: a.y0 + t * (a.y1 - a.y0) }
}

function projetarNoSegmento(p: Ponto, s: Segmento): Ponto {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { x: s.x0, y: s.y0 }
  const t = Math.max(0, Math.min(1, ((p.x - s.x0) * dx + (p.y - s.y0) * dy) / len2))
  return { x: s.x0 + t * dx, y: s.y0 + t * dy }
}

function distanciaAoSegmento(p: Ponto, s: Segmento): number {
  const q = projetarNoSegmento(p, s)
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/**
 * A distância entre dois pontos, no mundo real.
 *
 * Devolve `null` sem escala em vez de um número em pixels. Um número sem unidade
 * numa ferramenta de medição é convite a ser lido como pé, e é assim que alguém
 * corta madeira pelo tamanho errado.
 */
export function medir(
  a: Ponto, b: Ponto,
  larguraPt: number, alturaPt: number,
  unidadesPorPt: number | null,
): number | null {
  if (!unidadesPorPt) return null
  const dx = (b.x - a.x) * larguraPt
  const dy = (b.y - a.y) * alturaPt
  return Math.hypot(dx, dy) * unidadesPorPt
}

/**
 * A medida como o carpinteiro lê: pés, polegadas e a fração de polegada.
 *
 * `12.3125` não significa nada na obra; `12'-3 3/4"` significa. A fração é
 * arredondada para dezesseis avos, que é a menor divisão que uma trena de obra
 * carrega e o limite abaixo do qual ninguém corta.
 */
export function formatarPes(pes: number): string {
  const total = Math.abs(pes)
  const p = Math.floor(total)
  const polTotal = (total - p) * 12
  const pol = Math.floor(polTotal)
  const dezesseis = Math.round((polTotal - pol) * 16)

  let polFinal = pol, pFinal = p, dez = dezesseis
  if (dez === 16) { dez = 0; polFinal++ }
  if (polFinal === 12) { polFinal = 0; pFinal++ }

  const fracao = dez === 0 ? "" : ` ${simplificar(dez, 16)}`
  return `${pFinal}'-${polFinal}${fracao}"`
}

function simplificar(num: number, den: number): string {
  const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b))
  const d = mdc(num, den)
  return `${num / d}/${den / d}`
}
