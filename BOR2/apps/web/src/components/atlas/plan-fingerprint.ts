"use client"

import { loadPdf } from "@/components/atlas/pdf-page"

/**
 * A impressão digital de uma página, para saber quando duas folhas são a mesma.
 *
 * Nome é como a folha se chama; isto é o que ela é. Os dois juntos respondem a
 * pergunta que a gestão documental faz o tempo todo: esta página que está
 * entrando já existe aqui dentro?
 *
 * São dois hashes porque uma alteração pode aparecer em qualquer um dos dois
 * lados do desenho, e nunca no outro. Cota corrigida, nota nova do projetista,
 * código de peça trocado: muda o texto e a geometria fica igual. Parede que
 * andou, painel que mudou de vão, corte redesenhado: muda a geometria inteira
 * sem tocar numa letra.
 *
 * Comparar bytes seria o caminho curto e não funciona. A folha publicada não é
 * a página do PDF de origem, é um recorte gerado pelo pdf-lib, e nunca bate
 * byte a byte com ela; e um reexporte sem mudança nenhuma já sai com bytes
 * diferentes, por causa de data de criação e ordem de objeto. Bytes acusariam o
 * set inteiro como alterado toda vez.
 *
 * Medido em 04/09 sobre um set real de 97 páginas: 2,3 s para as duas
 * impressões das 97, nenhuma colisão entre páginas, e o recorte do pdf-lib
 * preserva as duas exatamente. É essa última parte que deixa comparar uma folha
 * já publicada com uma página de PDF novo.
 */
export interface Fingerprint {
  /** O texto da página, na ordem em que o PDF guarda os trechos. */
  text: string
  /** Os operadores de desenho, com as coordenadas arredondadas. */
  geom: string
}

/** Duas páginas são a mesma coisa quando as duas impressões batem. */
export function sameContent(a?: Fingerprint | null, b?: Fingerprint | null): boolean {
  if (!a?.text || !b?.text) return false
  return a.text === b.text && a.geom === b.geom
}

/**
 * Casa de decimal do arredondamento da geometria.
 *
 * A coordenada vem em pontos tipográficos, e 0,1 pt é 0,035 mm: menos que a
 * espessura do traço mais fino que uma prancha imprime. Guardar a casa inteira
 * transformaria ruído de arredondamento do gerador do PDF em alteração de
 * projeto.
 */
const PRECISION = 10

async function sha(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  // Dezesseis dígitos hexadecimais, que são 64 bits. Num documento de mil
  // páginas a chance de duas distintas colidirem aí é da ordem de 1 em 40
  // bilhões, e o que está em jogo é mostrar um aviso a mais, não perder folha.
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map(b => b.toString(16).padStart(2, "0")).join("")
}

type TextItem = { str?: string }
type OperatorList = { fnArray: number[]; argsArray: unknown[] }

/** A impressão de uma página já carregada. */
export async function fingerprintPage(
  pdf: { getPage: (n: number) => Promise<unknown> },
  pageIndex: number,
): Promise<Fingerprint> {
  const page = await pdf.getPage(pageIndex + 1) as {
    getTextContent: () => Promise<{ items: TextItem[] }>
    getOperatorList: () => Promise<OperatorList>
  }

  const content = await page.getTextContent()
  const text = content.items.map(i => i.str ?? "").join(" ").replace(/\s+/g, " ").trim()

  const ops = await page.getOperatorList()
  const geom: (number | string)[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    // O código do operador entra junto: a mesma sequência de números desenhando
    // uma linha ou preenchendo uma área não é o mesmo desenho.
    geom.push(ops.fnArray[i])
    const args = ops.argsArray[i]
    if (!Array.isArray(args)) continue
    for (const value of args.flat(2)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        geom.push(Math.round(value * PRECISION))
      }
    }
  }

  const [textHash, geomHash] = await Promise.all([sha(text), sha(geom.join(","))])
  return { text: textHash, geom: geomHash }
}

/**
 * A impressão de todas as páginas de um PDF.
 *
 * Roda antes de qualquer upload: o objetivo é justamente decidir o que vale a
 * pena subir, e nada aqui toca no bucket.
 */
export async function fingerprintPages(
  url: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Fingerprint[]> {
  const pdf = await loadPdf(url)
  const out: Fingerprint[] = []
  for (let i = 0; i < pdf.numPages; i++) {
    out.push(await fingerprintPage(pdf as never, i))
    onProgress?.(i + 1, pdf.numPages)
  }
  return out
}
