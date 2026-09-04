"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AttachmentPicker } from "@/components/atlas/attachment-picker"
import { RoleName } from "@/components/atlas/role-icon"
import { renderThumb } from "@/components/atlas/plan-split"
import { readPdfOutline } from "@/components/atlas/pdf-page"
import { atlasService, uploadToR2 } from "@/services/atlas.service"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, FileUp, Loader2, Music, Pause, Play, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useEffect, useRef, useState } from "react"
import WaveSurfer from "wavesurfer.js"

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

/** O que um anexo é, e por isso que janela ele abre. */
type Tipo = "image" | "audio" | "video" | "file"

/** "1:07" a partir de segundos. */
function relogio(s: number) {
  if (!Number.isFinite(s)) return "0:00"
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

/**
 * A janela que toca um anexo de áudio.
 *
 * Áudio de justificativa é recado de obra, e recado se ouve procurando um
 * trecho: a onda mostra onde está o silêncio e onde alguém falou, o que uma
 * barra de progresso lisa não conta. Daí o wavesurfer, que desenha a forma do
 * som e deixa saltar clicando nela.
 */
function AudioWindow({ url, name, onClose }: {
  url: string; name: string; onClose: () => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const onda = useRef<WaveSurfer | null>(null)
  const [tocando, setTocando] = useState(false)
  const [pos, setPos] = useState(0)
  const [total, setTotal] = useState(0)
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    if (!caixa.current) return
    // As cores saem do tema pelo valor calculado: o wavesurfer desenha em
    // canvas, e canvas não enxerga variável de CSS.
    const estilo = getComputedStyle(document.documentElement)
    const ws = WaveSurfer.create({
      container: caixa.current,
      url,
      height: 96,
      // Barra grossa: recado de obra é voz, e voz vira uma serrilha fina demais
      // para se enxergar onde alguém falou e onde ficou em silêncio.
      barWidth: 5,
      barGap: 3,
      barRadius: 3,
      cursorWidth: 1,
      waveColor: estilo.getPropertyValue("--color-muted-foreground").trim() || "#888",
      progressColor: estilo.getPropertyValue("--color-primary").trim() || "#0ea5e9",
      cursorColor: estilo.getPropertyValue("--color-foreground").trim() || "#fff",
    })
    onda.current = ws
    ws.on("ready", () => { setTotal(ws.getDuration()); setPronta(true) })
    ws.on("timeupdate", t => setPos(t))
    ws.on("play", () => setTocando(true))
    ws.on("pause", () => setTocando(false))
    ws.on("finish", () => setTocando(false))
    return () => { ws.destroy(); onda.current = null }
  }, [url])

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/60 p-6 backdrop-blur-md"
    >
      <div
        role="presentation"
        onClick={e => e.stopPropagation()}
        className="flex w-[min(90vw,42rem)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex items-center gap-3 p-4">
          <button
            type="button"
            disabled={!pronta}
            onClick={() => onda.current?.playPause()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <div className="relative min-w-0 flex-1">
            <div ref={caixa} className="w-full" />
            {!pronta && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </span>
            )}
          </div>

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {relogio(pos)} / {relogio(total)}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * A janela que toca um anexo de vídeo.
 *
 * Veste o vídeo como a de imagem veste a imagem: a proporção vem do arquivo, e
 * não uma caixa fixa com tarja preta em cima e embaixo. Os controles são os do
 * navegador de propósito: tela cheia, velocidade e legenda já estão lá, e
 * refazê-los à mão seria refazer pior.
 */
function VideoWindow({ url, name, onClose }: {
  url: string; name: string; onClose: () => void
}) {
  const [largura, setLargura] = useState(0)

  function medir(v: HTMLVideoElement) {
    if (!v.videoWidth || !v.videoHeight) return
    const teto = window.innerWidth * 0.92
    const altura = window.innerHeight * 0.9 - 44
    const coube = Math.min(1, teto / v.videoWidth, altura / v.videoHeight)
    setLargura(v.videoWidth * coube)
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
        style={largura ? { width: Math.round(largura) } : undefined}
        className="flex max-w-[92vw] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <video
          src={url}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={e => medir(e.currentTarget)}
          className="block max-h-[calc(90vh-2.75rem)] w-full bg-black"
        />
      </div>
    </div>
  )
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
  onOpen: (anexo: { url: string; name: string; kind: Tipo }) => void
}) {
  const [url, setUrl] = useState("")
  const kind: Tipo = contentType.startsWith("image/") ? "image"
    : contentType.startsWith("audio/") ? "audio"
    : contentType.startsWith("video/") ? "video"
    : "file"

  useEffect(() => {
    let alive = true
    atlasService.mediaUrl(id)
      .then(r => { if (alive) setUrl(r.url) })
      .catch(() => {})
    return () => { alive = false }
  }, [id])

  // Todos do mesmo tamanho: o que muda é o que aparece dentro e o que o clique
  // abre. Anexo de tipos diferentes em quadros de tamanhos diferentes fazia a
  // fila parecer três coisas soltas em vez de uma lista.
  return (
    <button
      type="button"
      title={fileName}
      disabled={!url}
      onClick={() => onOpen({ url, name: fileName, kind })}
      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:border-primary/40 disabled:opacity-60"
    >
      {!url ? (
        <span className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </span>
      ) : kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={fileName} className="h-full w-full object-cover" />
      ) : kind === "video" ? (
        // O primeiro quadro já diz do que se trata; ícone de filme não diz.
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
          {kind === "audio" ? <Music className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          <span className="w-full truncate text-center text-[10px] leading-tight">{fileName}</span>
        </span>
      )}
    </button>
  )
}

/**
 * A janela que amplia um anexo de imagem.
 *
 * Ela veste a imagem: a largura sai da proporção, e o cabeçalho acompanha essa
 * largura sem mudar de altura. Largura fixa deixava um print deitado no meio de
 * dois vãos de fundo do tamanho dele.
 *
 * A pinça cresce e encolhe a janela, e a imagem ocupa o corpo inteiro dela.
 * Ampliar o desenho dentro de um quadro parado resolveria outro problema: aqui
 * o que se quer é a mesma imagem maior na tela, não um pedaço dela.
 */
function AttachmentWindow({ url, name, onClose }: {
  url: string; name: string; onClose: () => void
}) {
  // A largura com que a imagem coube na tela ao abrir, e o quanto ela ainda
  // pode crescer antes de encostar na borda por qualquer um dos dois lados.
  const [base, setBase] = useState(0)
  const [teto, setTeto] = useState(1)
  const [zoom, setZoom] = useState(1)

  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const inicio = useRef<{ dist: number; zoom: number } | null>(null)

  // O tamanho de partida é o piso: ele já é a imagem inteira cabendo na tela, e
  // encolher além disso só devolve uma janela menor do que a que se abriu.
  const limita = (n: number) => Math.min(teto, Math.max(1, n))

  function medir(img: HTMLImageElement) {
    const largura = window.innerWidth * 0.92
    const altura = window.innerHeight * 0.9 - 44
    const proporcao = img.naturalWidth / img.naturalHeight
    const coube = Math.min(1, largura / img.naturalWidth, altura / img.naturalHeight)
    const inicial = img.naturalWidth * coube
    setBase(inicial)
    setTeto(Math.max(1, Math.min(largura / inicial, (altura * proporcao) / inicial)))
  }

  function down(e: React.PointerEvent) {
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      // ponteiro que o navegador não conhece: segue sem captura
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()]
      inicio.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  function move(e: React.PointerEvent) {
    if (!dedos.current.has(e.pointerId)) return
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size !== 2 || !inicio.current) return
    const [a, b] = [...dedos.current.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (inicio.current.dist > 0) setZoom(limita(inicio.current.zoom * (dist / inicio.current.dist)))
  }

  function up(e: React.PointerEvent) {
    dedos.current.delete(e.pointerId)
    if (dedos.current.size < 2) inicio.current = null
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
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => setZoom(1)}
        onWheel={e => setZoom(z => limita(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))}
        className="inline-flex touch-none flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        {/* O cabeçalho segue a largura da janela e não muda de altura: ele é a
            identificação, e identificação não cresce com o zoom. */}
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="rounded px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {zoom.toFixed(1)}x
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
            que carrega. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          draggable={false}
          onLoad={e => medir(e.currentTarget)}
          style={base ? { width: Math.round(base * zoom) } : undefined}
          className="block h-auto max-h-[calc(90vh-2.75rem)] w-auto max-w-[92vw] select-none"
        />
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
  const [zoom, setZoom] = useState<{ url: string; name: string; kind: Tipo } | null>(null)

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
            kind: extra.type.startsWith("image/") ? "photo"
              : extra.type.startsWith("audio/") ? "audio"
              : extra.type.startsWith("video/") ? "video"
              : "file",
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
                    {/* Duas colunas, e não três informações numa linha só: à
                        esquerda quem fez, à direita quando e o que a revisão é.
                        Cada coluna se lê de cima para baixo, do mais forte para
                        o detalhe. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight">
                          {r.name || (r.supersededAt ? "Replaced" : "Original")}
                        </p>
                        <RoleName
                          name={r.revisedBy}
                          role={r.revisedRole}
                          className="mt-0.5 text-xs text-muted-foreground"
                        />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs leading-tight text-muted-foreground">
                          {when(r.revisedAt)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.supersededAt
                            ? `${r.annotations} ${r.annotations === 1 ? "mark" : "marks"}`
                            : "Current"}
                        </p>
                      </div>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.attachments.map(a => (
                          <Attachment
                            key={a.id}
                            id={a.id}
                            fileName={a.fileName}
                            contentType={a.contentType}
                            onOpen={setZoom}
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
          zoom.kind === "audio"
            ? <AudioWindow url={zoom.url} name={zoom.name} onClose={() => setZoom(null)} />
            : zoom.kind === "video"
            ? <VideoWindow url={zoom.url} name={zoom.name} onClose={() => setZoom(null)} />
            : <AttachmentWindow url={zoom.url} name={zoom.name} onClose={() => setZoom(null)} />,
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
