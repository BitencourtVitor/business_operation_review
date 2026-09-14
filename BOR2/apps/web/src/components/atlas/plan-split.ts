"use client"

import { loadPdf } from "@/components/atlas/pdf-page"


/**
 * Corta o set em um PDF por página e sobe cada um direto no bucket.
 *
 * Por que cortar, se o original sozinho já bastaria: medição sobre o set real
 * (51 páginas, 107,2 MB) deu 532,5 MB somando as páginas — 4,97x —, mediana de
 * 1,66 MB por página e 6,5 s de CPU para o corte inteiro. O inchaço custa ~US$
 * 0,008/mês no R2 e 51 PUTs, que não chega perto de limite nenhum. O que ele
 * compra é a leitura: abrir um plano passa a baixar 1,66 MB em vez de 107 MB —
 * a diferença entre abrir e desistir, num tablet com 4G de obra.
 *
 * O original continua sendo a verdade e continua imutável. Isto é derivado, e
 * pode ser refeito a qualquer momento.
 */


// Largura da prévia, em pixels. O espaço na lista é 64x48, e 300 px dá quase
// cinco vezes isso: cabe trocar de ideia sobre o tamanho da miniatura sem ter de
// gerar tudo de novo, e continua custando alguns quilobytes por folha.
const THUMB_WIDTH = 300
// A prancha é desenho técnico sobre branco: acima de 0,8 o JPEG só engorda.
const THUMB_QUALITY = 0.8

export interface PlanPart {
  pageIndex: number
  r2Key: string
  thumbKey: string
  byteSize: number
  widthPt: number
  heightPt: number
}

/**
 * A prévia de uma página, desenhada no navegador.
 *
 * Sai do mesmo PDF que acabou de subir, então não custa download nenhum: o
 * pdf.js já tem o arquivo em memória por causa do corte.
 */
export async function renderThumb(url: string, pageIndex: number): Promise<Blob | null> {
  try {
    const pdf = await loadPdf(url)
    const page = await pdf.getPage(pageIndex + 1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width })

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // Fundo branco explícito: o canvas nasce transparente e o JPEG não guarda
    // transparência, então o vazio sairia preto.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    return await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", THUMB_QUALITY))
  } catch {
    // Prévia é conforto, não conteúdo: falhar aqui deixa a folha sem miniatura
    // e não estraga o upload.
    return null
  }
}

