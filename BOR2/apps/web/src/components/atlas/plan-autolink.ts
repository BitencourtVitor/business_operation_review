"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { atlasService } from "@/services/atlas.service"

/**
 * A extração que alimenta os vínculos automáticos.
 *
 * A divisão de trabalho é deliberada, e vale repetir porque ela é o que torna a
 * funcionalidade viável: quem lê o PDF é este lado, com o pdf.js que já está
 * carregado e já sabe entregar texto com posição. Mandar 112 MB para o servidor
 * reparsear seria transferir o arquivo inteiro para refazer o que já foi feito
 * aqui.
 *
 * O servidor faz o que só ele pode: decidir quais páginas merecem vínculo,
 * resolver a que folha cada código corresponde, e gravar. **Nenhuma regra de
 * negócio mora aqui.** Este arquivo não sabe o que é um código de folha, não
 * sabe qual página é prancha de conjunto, e não decide nada sobre homônimos.
 * Ele manda todo o texto e deixa o índice decidir, porque duplicar a regra nos
 * dois lados é garantir que as duas metades divirjam na primeira mudança.
 */

interface TextItem {
  str: string
  width: number
  height: number
  transform: number[]
  /** O nome interno da fonte usada no trecho, como o pdf.js a registrou. */
  fontName?: string
}

/**
 * O respiro em volta do código, nas quatro direções.
 *
 * Com a medição por glifo, a caixa já é a do texto impresso, e a folga deixa de
 * ser conserto para ser o que sempre deveria ter sido: espaço para o dedo. Por
 * isso ela é pequena de três lados. Embaixo é maior porque a caixa da fonte
 * termina na linha de base, e o que desce dela (o rabo do "g", o parêntese)
 * fica de fora.
 */
const FOLGA = {
  esquerda: 0.02,
  direita: 0.06,
  cima: 0.02,
  baixo: 0.18,
}

/** Um pedaço de texto da página, com a caixa normalizada. */
export interface TokenExtraido {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A caixa da palavra com o respiro aplicado, sem sair da página. */
function comFolga(t: TokenExtraido): TokenExtraido {
  const largura = t.x1 - t.x0
  const altura = t.y1 - t.y0
  return {
    text: t.text,
    x0: Math.max(0, t.x0 - largura * FOLGA.esquerda),
    x1: Math.min(1, t.x1 + largura * FOLGA.direita),
    y0: Math.max(0, t.y0 - altura * FOLGA.cima),
    y1: Math.min(1, t.y1 + altura * FOLGA.baixo),
  }
}

/**
 * Onde cada palavra começa e termina dentro do trecho, medindo o texto.
 *
 * A conta por contagem de caracteres trata "W" e "i" como iguais, e em fonte
 * proporcional isso desloca tudo o que vem depois. Aqui o texto é medido de
 * verdade, e o resultado entra como **proporção** do trecho: o que vale é a
 * relação entre a largura do pedaço e a do todo, e essa relação se multiplica
 * pela largura real que o PDF já informou. Assim a medida é exata mesmo quando a
 * fonte embutida não está disponível para medir, porque o erro de escala se
 * cancela na divisão.
 */
function fatiasDoTrecho(texto: string, fonte: string): Array<{ palavra: string; inicio: number; fim: number }> {
  const ctx = medidor()
  const partes = [...texto.matchAll(/\S+/g)]
  if (!ctx) {
    // Sem canvas (renderização no servidor), sobra a proporção por caractere.
    return partes.map(p => ({
      palavra: p[0],
      inicio: (p.index ?? 0) / texto.length,
      fim: ((p.index ?? 0) + p[0].length) / texto.length,
    }))
  }
  ctx.font = fonte
  const total = ctx.measureText(texto).width || 1
  return partes.map(p => {
    const i = p.index ?? 0
    return {
      palavra: p[0],
      inicio: ctx.measureText(texto.slice(0, i)).width / total,
      fim: ctx.measureText(texto.slice(0, i + p[0].length)).width / total,
    }
  })
}

/**
 * A fonte do trecho, para medir com ela.
 *
 * O pdf.js guarda a fonte embutida da página com um nome próprio, e o navegador
 * já a conhece quando a folha foi desenhada. Achando-a, a medição é com a fonte
 * real, glifo por glifo. Não achando, mede com uma fonte qualquer: como o que
 * importa é a proporção dentro do trecho, e não a largura absoluta, o resultado
 * continua muito mais perto do certo do que contar caracteres.
 */
function fonteRegistrada(page: unknown, nome: string): boolean {
  try {
    const objs = (page as { commonObjs?: { has?: (id: string) => boolean } }).commonObjs
    return !!objs?.has?.(nome)
  } catch {
    return false
  }
}

function fonteDoTrecho(page: unknown, item: TextItem): string {
  const tamanho = Math.abs(item.transform[3]) || 12
  const objs = (page as { commonObjs?: { has?: (id: string) => boolean; get?: (id: string) => unknown } })
    .commonObjs
  let familia = ""
  try {
    if (item.fontName && objs?.has?.(item.fontName)) {
      const f = objs.get?.(item.fontName) as { loadedName?: string } | undefined
      if (f?.loadedName) familia = `"${f.loadedName}", `
    }
  } catch {
    // Fonte ainda não registrada: a folha desta página não foi desenhada.
  }
  return `${tamanho}px ${familia}sans-serif`
}

let medidorCache: CanvasRenderingContext2D | null | undefined
function medidor() {
  if (medidorCache !== undefined) return medidorCache
  medidorCache = typeof document === "undefined"
    ? null
    : document.createElement("canvas").getContext("2d")
  return medidorCache
}

/**
 * Todo o texto de uma página, com posição.
 *
 * Os trechos que o PDF guarda nem sempre são palavras: "Bundle: 1-01-L" pode ser
 * um trecho só. Por isso cada trecho também é quebrado em palavras, e as duas
 * formas vão para o servidor. A caixa da palavra é repartida proporcionalmente
 * dentro da caixa do trecho, o que é aproximação, e é aproximação que basta:
 * a área clicável de um vínculo tem alguns milímetros de folga por natureza.
 */
export async function tokensDaPagina(
  url: string, pageIndex: number,
): Promise<{ tokens: TokenExtraido[]; semTexto: boolean }> {
  const pdf = await loadPdf(url)
  const page = await pdf.getPage(pageIndex + 1)
  const content = await (page as unknown as {
    getTextContent: () => Promise<{ items: TextItem[] }>
  }).getTextContent()
  const vp = page.getViewport({ scale: 1 })
  const larg = vp.width || 1
  const alt = vp.height || 1

  // Página sem texto extraível é prancha rasterizada, e precisa de OCR. Declarar
  // isso é melhor que devolver zero token em silêncio: o servidor a marca como
  // `no-text` e o relatório de conferência diz quantas ficaram de fora, em vez
  // de a pessoa achar que a automação simplesmente não encontrou nada nelas.
  if (!content.items.length) return { tokens: [], semTexto: true }

  // A fonte embutida só é registrada quando a página é processada, e ler o texto
  // não processa. Sem isto, a medição cairia sempre na fonte de reserva; com
  // isto, ela é feita com a fonte que imprimiu o código. Custa uma passada pela
  // página, e falhar aqui não impede nada: a reserva continua valendo.
  const precisaDeFonte = content.items.some(i => i.fontName && !fonteRegistrada(page, i.fontName))
  if (precisaDeFonte) {
    try {
      await (page as unknown as { getOperatorList: () => Promise<unknown> }).getOperatorList()
    } catch {
      // Segue com a fonte de reserva.
    }
  }

  const tokens: TokenExtraido[] = []
  for (const item of content.items) {
    const bruto = item.str
    if (!bruto || !bruto.trim()) continue

    const [, , , , e, f] = item.transform
    const x0 = e / larg
    const y0 = (alt - f - item.height) / alt
    const x1 = (e + item.width) / larg
    const y1 = (alt - f) / alt

    tokens.push(comFolga({ text: bruto, x0, y0, x1, y1 }))

    // As palavras de dentro do trecho, quando há mais de uma. Cada uma entra
    // com a caixa medida no próprio texto, e não repartida por contagem de
    // letras: é isso que faz o retângulo cair em cima do código impresso.
    const partes = [...bruto.matchAll(/\S+/g)]
    if (partes.length < 2) continue
    const largura = x1 - x0
    const fonte = fonteDoTrecho(page, item)
    for (const fatia of fatiasDoTrecho(bruto, fonte)) {
      tokens.push(comFolga({
        text: fatia.palavra,
        x0: x0 + largura * fatia.inicio,
        y0,
        x1: x0 + largura * fatia.fim,
        y1,
      }))
    }
  }
  return { tokens, semTexto: false }
}

/**
 * Roda a criação de vínculos para uma versão inteira.
 *
 * `apply` é falso por padrão, e o padrão é o certo: vínculo falso é pior que
 * vínculo ausente. Quem toca e cai na folha errada perde a confiança em todos os
 * outros, e depois não há como saber quais estavam certos.
 */
export async function gerarVinculos(
  versionId: string,
  url: string,
  folhas: Array<{ id: string; pageIndex: number }>,
  apply = false,
) {
  const pages: Array<{ sheetId: string; tokens: TokenExtraido[]; noText: boolean }> = []
  for (const f of folhas) {
    try {
      const { tokens, semTexto } = await tokensDaPagina(url, f.pageIndex)
      pages.push({ sheetId: f.id, tokens, noText: semTexto })
    } catch {
      // Uma página que não abre não derruba o set. Ela vai como sem texto, e
      // aparece na contagem de `no-text` do relatório em vez de sumir.
      pages.push({ sheetId: f.id, tokens: [], noText: true })
    }
  }
  return atlasService.autolink(versionId, { pages, apply })
}

/**
 * Sugere os vínculos de um arquivo que ainda não subiu.
 *
 * Roda na terceira etapa do envio, quando o documento ainda não existe no
 * servidor: o texto sai do arquivo que está no navegador, e os destinos vêm da
 * obra inteira, mais as folhas deste mesmo arquivo, que entram pelo número da
 * página porque identificador elas ainda não têm.
 *
 * Nada é gravado aqui. O que volta é proposta, e quem decide é quem está
 * enviando, um vínculo de cada vez.
 */
export async function sugerirVinculos(
  jobsiteId: string,
  url: string,
  nomes: Map<number, string>,
  totalPaginas: number,
  andamento?: (feitas: number, total: number) => void,
  outrasPastas = false,
) {
  const local = [...nomes.entries()].map(([pageIndex, name]) => ({ pageIndex, name }))
  const pages: Array<{ pageIndex: number; tokens: TokenExtraido[]; noText: boolean }> = []
  for (let i = 0; i < totalPaginas; i++) {
    try {
      const { tokens, semTexto } = await tokensDaPagina(url, i)
      pages.push({ pageIndex: i, tokens, noText: semTexto })
    } catch {
      // Página que não abre não derruba a varredura: vai como sem texto e
      // aparece na contagem, em vez de sumir.
      pages.push({ pageIndex: i, tokens: [], noText: true })
    }
    andamento?.(i + 1, totalPaginas)
  }
  return atlasService.autolinkPreview(jobsiteId, { local, pages, otherFolders: outrasPastas })
}
