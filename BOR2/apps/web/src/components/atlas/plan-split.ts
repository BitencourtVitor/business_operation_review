"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
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
async function renderThumb(url: string, pageIndex: number): Promise<Blob | null> {
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

export async function splitAndUploadPlans(
  file: File,
  versionId: string,
  onProgress?: (done: number, total: number) => void,
  // A folha pronta, uma a uma, com a prévia que acabou de ser desenhada aqui.
  // É o que deixa a página mostrar o quadradinho preenchendo sem esperar o
  // bucket devolver nada.
  onPage?: (part: PlanPart, preview: string) => void,
): Promise<PlanPart[]> {
  const { PDFDocument } = await import("pdf-lib")
  const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  const total = source.getPageCount()

  const indexes = Array.from({ length: total }, (_, i) => i)
  const [tickets, thumbTickets] = await Promise.all([
    atlasService.planUploadUrls(versionId, indexes),
    atlasService.thumbUploadUrls(versionId, indexes).catch(() => []),
  ])
  const byIndex = new Map(tickets.map(t => [t.pageIndex, t]))
  const thumbByIndex = new Map(thumbTickets.map(t => [t.pageIndex, t]))

  // A prévia é desenhada a partir do recorte que acabou de subir, e não do set
  // inteiro: é o mesmo objeto que o leitor vai abrir depois, e o pdf.js o traz
  // uma vez só.
  const blobUrl = (bytes: Uint8Array) =>
    URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }))

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

      let thumbKey = ""
      let preview = ""
      const thumbTicket = thumbByIndex.get(index)
      if (thumbTicket) {
        const href = blobUrl(bytes)
        const thumb = await renderThumb(href, 0)
        URL.revokeObjectURL(href)
        if (thumb) {
          preview = URL.createObjectURL(thumb)
          try {
            await uploadToR2(
              thumbTicket.uploadUrl,
              new File([thumb], `${index}.jpg`, { type: "image/jpeg" }),
              "image/jpeg",
            )
            thumbKey = thumbTicket.r2Key
          } catch {
            // Sem prévia a folha continua abrindo: a lista só fica sem imagem.
          }
        }
      }

      const part: PlanPart = {
        pageIndex: index,
        r2Key: ticket.r2Key,
        thumbKey,
        byteSize: bytes.length,
        widthPt: width,
        heightPt: height,
      }
      parts.push(part)
      done += 1
      onProgress?.(done, total)
      onPage?.(part, preview)
    }
  }

  const queues: number[][] = Array.from({ length: CONCURRENCY }, () => [])
  for (let i = 0; i < total; i++) queues[i % CONCURRENCY].push(i)
  await Promise.all(queues.map(worker))

  return parts.sort((a, b) => a.pageIndex - b.pageIndex)
}

/**
 * Gera a prévia das folhas que ainda não têm uma.
 *
 * Existe para o que já estava no bucket antes de a miniatura existir: sem isto,
 * um set de 51 páginas subido semana passada continuaria sendo uma coluna de
 * números para sempre. Trabalha sobre o recorte já gravado, então não baixa o
 * set inteiro nem toca no original.
 */
export async function backfillThumbs(
  versionId: string,
  sheets: { id: string; pageIndex: number; thumbKey: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const pending = sheets.filter(s => !s.thumbKey)
  if (!pending.length) return 0

  const tickets = await atlasService.thumbUploadUrls(
    versionId, pending.map(s => s.pageIndex),
  )
  const byIndex = new Map(tickets.map(t => [t.pageIndex, t]))

  let done = 0
  let saved = 0

  async function worker(queue: typeof pending) {
    for (const sheet of queue) {
      const ticket = byIndex.get(sheet.pageIndex)
      if (ticket) {
        try {
          const source = await atlasService.sheetUrl(sheet.id)
          const thumb = await renderThumb(source.url, source.whole ? sheet.pageIndex : 0)
          if (thumb) {
            await uploadToR2(
              ticket.uploadUrl,
              new File([thumb], `${sheet.pageIndex}.jpg`, { type: "image/jpeg" }),
              "image/jpeg",
            )
            await atlasService.updateSheet(sheet.id, { thumbKey: ticket.r2Key })
            saved += 1
          }
        } catch {
          // Uma folha que falha não derruba as outras: a lista fica com um
          // buraco e a próxima passada tenta de novo.
        }
      }
      done += 1
      onProgress?.(done, pending.length)
    }
  }

  const queues: (typeof pending)[] = Array.from({ length: CONCURRENCY }, () => [])
  pending.forEach((s, i) => queues[i % CONCURRENCY].push(s))
  await Promise.all(queues.map(worker))
  return saved
}
