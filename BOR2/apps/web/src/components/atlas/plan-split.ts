"use client"

import { atlasService, uploadToR2 } from "@/services/atlas.service"

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

// Quantos PUTs ao mesmo tempo. Seis é o que o navegador mantém por origem sem
// enfileirar; acima disso a fila é do próprio Chrome e não adianta pedir mais.
const CONCURRENCY = 6

export interface PlanPart {
  pageIndex: number
  r2Key: string
  byteSize: number
  widthPt: number
  heightPt: number
}

export async function splitAndUploadPlans(
  file: File,
  versionId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PlanPart[]> {
  const { PDFDocument } = await import("pdf-lib")
  const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  const total = source.getPageCount()

  const tickets = await atlasService.planUploadUrls(
    versionId,
    Array.from({ length: total }, (_, i) => i),
  )
  const byIndex = new Map(tickets.map(t => [t.pageIndex, t]))

  const parts: PlanPart[] = []
  let done = 0

  // Corte e upload andam juntos, página a página: cortar tudo antes guardaria
  // meio giga na memória do navegador antes do primeiro byte sair.
  async function worker(queue: number[]) {
    for (const index of queue) {
      const ticket = byIndex.get(index)
      if (!ticket) continue

      const out = await PDFDocument.create()
      const [page] = await out.copyPages(source, [index])
      out.addPage(page)
      const bytes = await out.save({ useObjectStreams: true })
      const { width, height } = page.getSize()

      const blob = new File([bytes.slice().buffer], `${index}.pdf`, { type: "application/pdf" })
      await uploadToR2(ticket.uploadUrl, blob, "application/pdf")

      parts.push({
        pageIndex: index,
        r2Key: ticket.r2Key,
        byteSize: bytes.length,
        widthPt: width,
        heightPt: height,
      })
      done += 1
      onProgress?.(done, total)
    }
  }

  const queues: number[][] = Array.from({ length: CONCURRENCY }, () => [])
  for (let i = 0; i < total; i++) queues[i % CONCURRENCY].push(i)
  await Promise.all(queues.map(worker))

  return parts.sort((a, b) => a.pageIndex - b.pageIndex)
}
