"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AttachmentPicker } from "@/components/atlas/attachment-picker"
import { renderThumb } from "@/components/atlas/plan-split"
import { readPdfOutline } from "@/components/atlas/pdf-page"
import { atlasService, uploadToR2 } from "@/services/atlas.service"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileUp, History, Loader2, Paperclip, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useEffect, useRef, useState } from "react"

import type { AtlasSheet } from "@/services/atlas.service"

/**
 * O histórico de uma página, e a troca de uma prancha só.
 *
 * O projetista não devolve o set: devolve a prancha corrigida. Antes disto,
 * trocar uma folha significava subir as 97 de novo, e as folhas antigas sumiam
 * junto, levando as anotações feitas sobre elas.
 *
 * Aqui a página guarda linhagem. A prancha que vale é a última; as anteriores
 * continuam no banco com quem as trocou, quando, e com que justificativa. As
 * anotações ficam com a revisão em que foram feitas, e é isso que se quer: elas
 * apontam para traços que podem ter mudado de lugar na prancha nova.
 */

/** A data como se fala dela numa linha de histórico. */
function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Uma imagem anexada à justificativa.
 *
 * O objeto no bucket é privado, então a miniatura pede a URL assinada quando
 * entra na tela. Pedir todas de uma vez ao abrir o histórico gastaria uma
 * assinatura por anexo de revisão nenhuma que ninguém foi olhar.
 */
function Attachment({ id, fileName, contentType, onOpen }: {
  id: string; fileName: string; contentType: string
  onOpen: (url: string, fileName: string) => void
}) {
  const [url, setUrl] = useState("")
  const image = contentType.startsWith("image/")

  useEffect(() => {
    let alive = true
    atlasService.mediaUrl(id)
      .then(r => { if (alive) setUrl(r.url) })
      .catch(() => {})
    return () => { alive = false }
  }, [id])

  if (!image) {
    return (
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener"
        className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Paperclip className="h-3 w-3" />
        <span className="max-w-40 truncate">{fileName}</span>
      </a>
    )
  }
  return (
    <button
      type="button"
      title={fileName}
      disabled={!url}
      onClick={() => onOpen(url, fileName)}
      className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40 transition-colors hover:border-primary/40"
    >
      {/* Enquanto a URL assinada não chega, o quadro gira. Antes ele renderizava
          com `src` vazio, o que o navegador trata como "recarregue a página
          inteira" e deixava a moldura quebrada. */}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={fileName} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  )
}

/**
 * A janela que amplia um anexo.
 *
 * Toma a forma da imagem: a altura é o limite e a largura sai da proporção
 * dela. Largura fixa deixava um print deitado no meio de dois vãos de fundo do
 * tamanho dele.
 *
 * A pinça amplia dentro da janela, e não a janela: o quadro fica onde está e o
 * desenho cresce dentro dele, que é o gesto de quem quer ler o texto pequeno de
 * um print sem perder de vista onde ele estava.
 */
function AttachmentWindow({ url, name, onClose }: {
  url: string; name: string; onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // Os dedos na tela, por id. Dois deles viram distância, e a razão entre a
  // distância de agora e a do começo do gesto é a ampliação.
  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const inicio = useRef<{ dist: number; scale: number } | null>(null)
  const arrasto = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)

  const limita = (n: number) => Math.min(6, Math.max(1, n))

  function reset() {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  function down(e: React.PointerEvent) {
    // Capturar o ponteiro é conforto para o arraste não escapar do elemento, e
    // ele recusa id que o navegador não conhece. Falhar aqui não pode derrubar
    // o resto do gesto: sem o try, a pinça nem chegava a ser registrada.
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      // segue sem captura
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()]
      inicio.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale }
      arrasto.current = null
      return
    }
    // Arrastar só faz sentido com a imagem ampliada: no tamanho natural não há
    // para onde ir.
    if (scale > 1) arrasto.current = { x: e.clientX, y: e.clientY, pan }
  }

  function move(e: React.PointerEvent) {
    if (!dedos.current.has(e.pointerId)) return
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (dedos.current.size === 2 && inicio.current) {
      const [a, b] = [...dedos.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (inicio.current.dist > 0) {
        setScale(limita(inicio.current.scale * (dist / inicio.current.dist)))
      }
      return
    }
    if (arrasto.current) {
      setPan({
        x: arrasto.current.pan.x + (e.clientX - arrasto.current.x),
        y: arrasto.current.pan.y + (e.clientY - arrasto.current.y),
      })
    }
  }

  function up(e: React.PointerEvent) {
    dedos.current.delete(e.pointerId)
    if (dedos.current.size < 2) inicio.current = null
    if (dedos.current.size === 0) arrasto.current = null
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/60 p-6 backdrop-blur-md"
    >
      <div
        role="presentation"
        onClick={e => e.stopPropagation()}
        className="inline-flex min-w-80 max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {scale > 1 && (
              <button
                type="button"
                onClick={reset}
                className="rounded px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {scale.toFixed(1)}x
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* A imagem encosta na moldura: o que arredonda é a janela, e o corte
            dela nas duas quinas de baixo é o mesmo que qualquer modal faz com o
            que carrega. Respiro aqui viraria borda que não é da imagem. */}
        <div
          className="touch-none overflow-hidden"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDoubleClick={reset}
          onWheel={e => {
            const passo = e.deltaY < 0 ? 1.15 : 1 / 1.15
            setScale(atual => {
              const proximo = limita(atual * passo)
              if (proximo === 1) setPan({ x: 0, y: 0 })
              return proximo
            })
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              cursor: scale > 1 ? "grab" : "default",
            }}
            className="block h-auto max-h-[calc(85vh-3.5rem)] w-auto max-w-full select-none object-contain"
          />
        </div>
      </div>
    </div>
  )
}

export function SheetRevisions({ sheet, jobsiteId, canManage, open, onClose, onReplaced }: {
  sheet: AtlasSheet
  jobsiteId: string
  canManage: boolean
  open: boolean
  onClose: () => void
  /** A folha trocou: quem abriu a prancha precisa recarregar a que vale. */
  onReplaced: () => void
}) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["atlas", "sheet-history", sheet.id],
    queryFn: () => atlasService.sheetHistory(sheet.id),
    enabled: open,
  })

  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  // Clicar num anexo abria outra aba, e outra aba é sair do sistema para ver o
  // que justifica a troca que se está lendo. A imagem abre aqui, por cima.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    if (open) return
    setFile(null); setName(""); setNotes(""); setAttachments([])
    setBusy(""); setError(""); setZoom(null)
  }, [open])

  useEffect(() => {
    if (!zoom) return
    const sair = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null) }
    window.addEventListener("keydown", sair)
    return () => window.removeEventListener("keydown", sair)
  }, [zoom])

  async function replace() {
    if (!file) return
    setError("")
    try {
      // A medida sai do próprio arquivo: a prancha nova pode chegar em outro
      // tamanho de papel, e o leitor desenha a anotação em fração da página.
      setBusy("Reading")
      let size: { width: number; height: number } | null = null
      try {
        const outline = await readPdfOutline(file)
        size = { width: outline.width, height: outline.height }
      } catch {
        // PDF que o pdf.js não abre ainda sobe: a folha fica com a medida da
        // anterior, que é melhor que recusar o arquivo.
      }

      setBusy("Opening")
      const ticket = await atlasService.openSheetRevision(sheet.id)

      setBusy("Uploading")
      await uploadToR2(ticket.uploadUrl, file, "application/pdf")

      // A prévia é conforto: falhar aqui deixa a folha com a miniatura antiga e
      // não estraga a troca.
      let thumbKey = ""
      const local = URL.createObjectURL(file)
      try {
        const thumb = await renderThumb(local, 0)
        if (thumb) {
          await uploadToR2(ticket.thumbUploadUrl, thumb, "image/jpeg")
          thumbKey = ticket.thumbKey
        }
      } catch {
        // segue sem miniatura nova
      } finally {
        URL.revokeObjectURL(local)
      }

      setBusy("Saving")
      await atlasService.commitSheetRevision(sheet.id, {
        sheetId: ticket.sheetId,
        r2Key: ticket.r2Key,
        thumbKey,
        byteSize: file.size,
        widthPt: size?.width,
        heightPt: size?.height,
        name: name.trim(),
        notes: notes.trim(),
      })

      // Os anexos vão depois da troca porque é a revisão nova que eles
      // justificam, e ela só existe a partir daqui. Falhar num anexo não
      // desfaz a troca: a prancha nova já é a que vale, e o que faltou se
      // reanexa.
      for (const [i, extra] of attachments.entries()) {
        setBusy(`Attaching ${i + 1}/${attachments.length}`)
        try {
          const media = await atlasService.openMedia(jobsiteId, {
            sheetId: ticket.sheetId,
            kind: extra.type.startsWith("image/") ? "photo" : "file",
            fileName: extra.name,
            contentType: extra.type || "application/octet-stream",
            byteSize: extra.size,
          })
          await uploadToR2(media.uploadUrl, extra, extra.type || "application/octet-stream")
          await atlasService.confirmMedia(media.mediaId)
        } catch {
          setError("The sheet was replaced, but one of the attachments did not go up.")
        }
      }

      qc.invalidateQueries({ queryKey: ["atlas", "sheets"] })
      // A grade guarda as miniaturas por meia hora, e elas são endereçadas pelo
      // id da folha: sem derrubar esse cache, a folha nova ficaria num quadro
      // cinza até a página ser recarregada à mão.
      qc.invalidateQueries({ queryKey: ["atlas", "thumbs"] })
      qc.invalidateQueries({ queryKey: ["atlas", "sheet-history", sheet.id] })
      onReplaced()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not replace this sheet")
    } finally {
      setBusy("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setError("") }}
              />
              <Button
                variant="outline"
                className="h-auto justify-start py-3"
                disabled={!!busy}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate">
                    {file ? file.name : "Choose the corrected sheet"}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : "A one-page PDF replacing this plan only"}
                  </span>
                </span>
              </Button>

              {file && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rev-name">Version name</Label>
                    <Input
                      id="rev-name"
                      value={name}
                      placeholder="What changed, in a few words"
                      onChange={e => setName(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rev-notes">Why it changed</Label>
                    {/* Uma linha só não cabia o motivo. Quem troca uma prancha
                        conta o que foi achado em obra, quem pediu e o que a
                        correção resolve, e isso não é uma frase. */}
                    <Textarea
                      id="rev-notes"
                      rows={4}
                      value={notes}
                      placeholder="What was found, who asked for it, what the correction solves"
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Attachments</Label>
                    {/* A foto do que se achou em obra, o recorte do e-mail do
                        projetista. Sem lugar para isso, a justificativa vira
                        "ver anexo no e-mail" e o anexo fica fora do Atlas. */}
                    <AttachmentPicker
                      files={attachments}
                      onChange={setAttachments}
                      disabled={!!busy}
                    />
                  </div>

                  {/* Dito onde a decisão acontece: o que estava vira histórico,
                      e as marcações feitas sobre ele continuam lá, não vêm
                      junto. */}
                  <p className="text-xs text-muted-foreground">
                    The current sheet becomes history. Marks made on it stay with it, and the
                    new plan starts clean.
                  </p>
                </>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>History</Label>
            {isLoading ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {history.map(r => (
                  <div
                    key={r.id}
                    className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
                      r.supersededAt ? "border-border/40 bg-muted/20" : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-tight">
                          {r.name || (r.supersededAt ? "Replaced" : "Original")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[when(r.revisedAt), r.revisedBy.split(" ")[0]]
                            .filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.supersededAt
                          ? `${r.annotations} ${r.annotations === 1 ? "mark" : "marks"}`
                          : "Current"}
                      </span>
                    </div>

                    {/* A justificativa inteira, com as quebras que quem
                        escreveu deu: cortá-la numa linha faria a segunda frase
                        sumir junto com o motivo. */}
                    {r.notes && (
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {r.notes}
                      </p>
                    )}

                    {!!r.attachments?.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {r.attachments.map(a => (
                          <Attachment
                            key={a.id}
                            id={a.id}
                            fileName={a.fileName}
                            contentType={a.contentType}
                            onOpen={(url, name) => setZoom({ url, name })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-center text-xs text-destructive">{error}</p>}
        </div>

        {/* Uma janela por cima da outra. A que estava continua ali atrás,
            desfocada, porque quem ampliou o anexo está no meio da leitura do
            histórico e volta para ela num toque. Quina viva e fio de um pixel,
            como a janela de baixo. */}
        {/* Vai para o corpo da página, e não fica dentro do diálogo. O popup do
            diálogo tem transformação própria, e dentro dele `fixed` deixa de
            valer a tela e passa a valer o próprio popup: a janela nascia do
            tamanho do diálogo, presa a ele, e o desfoque não alcançava o resto. */}
        {zoom && createPortal(
          <AttachmentWindow url={zoom.url} name={zoom.name} onClose={() => setZoom(null)} />,
          document.body,
        )}

        <DialogFooter>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>Close</Button>
          {canManage && (
            <Button disabled={!file || !!busy} onClick={replace}>
              {busy ? `${busy}…` : "Replace this sheet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
