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
}

/** Um pedaço de texto da página, com a caixa normalizada. */
export interface TokenExtraido {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
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

  const tokens: TokenExtraido[] = []
  for (const item of content.items) {
    const bruto = item.str
    if (!bruto || !bruto.trim()) continue

    const [, , , , e, f] = item.transform
    const x0 = e / larg
    const y0 = (alt - f - item.height) / alt
    const x1 = (e + item.width) / larg
    const y1 = (alt - f) / alt

    tokens.push({ text: bruto, x0, y0, x1, y1 })

    // As palavras de dentro do trecho, quando há mais de uma.
    const partes = bruto.split(/\s+/).filter(Boolean)
    if (partes.length < 2) continue
    const totalChars = partes.reduce((n, p) => n + p.length, 0) || 1
    let usado = 0
    for (const parte of partes) {
      const fatia = parte.length / totalChars
      const px0 = x0 + (x1 - x0) * usado
      usado += fatia
      tokens.push({ text: parte, x0: px0, y0, x1: x0 + (x1 - x0) * usado, y1 })
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
