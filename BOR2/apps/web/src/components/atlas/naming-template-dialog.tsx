"use client"

import { PdfPage, loadPdf } from "@/components/atlas/pdf-page"
import {
  readPageNames, splitSuffix,
  type NamingMode, type NamingRegion, type NamingTemplate, type PageName,
} from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Crop, Minus, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

const EMPTY_REGION: NamingRegion = { x0: 0, y0: 0, x1: 0, y1: 0, rotation: 0 }

const ROTATIONS = [
  { value: "0", label: "Horizontal" },
  { value: "90", label: "Vertical" },
]

const SCALE = 1.4
const MIN_ZOOM = 1
const MAX_ZOOM = 6

const has = (r: NamingRegion) => r.x1 > r.x0 && r.y1 > r.y0

/**
 * As faixas repartem o arquivo inteiro, na ordem.
 *
 * A primeira começa na página 1, a última termina na última página, cada uma
 * começa logo depois da anterior e tem ao menos uma página. Sem buraco e sem
 * página em duas faixas: página em duas faixas teria duas marcações brigando
 * pelo mesmo nome, e faixa que começa na 9 e termina na 8 não é faixa.
 *
 * Gabarito antigo, com limite em branco ou sobreposto, entra aqui e sai
 * repartido. Faixa que não cabe (mais faixas que páginas) sai.
 */
function particionar(levels: NamingRegion[], pages: number): NamingRegion[] {
  if (!levels.length) return levels
  const n = Math.max(1, Math.min(levels.length, pages))
  const out = levels.slice(0, n).map(l => ({ ...l }))
  for (let i = 0; i < n; i++) {
    const from = i === 0 ? 1 : (out[i - 1].toPage as number) + 1
    const teto = pages - (n - 1 - i)
    out[i].fromPage = from
    out[i].toPage = i === n - 1 ? pages : Math.min(teto, Math.max(from, out[i].toPage ?? from))
  }
  return out
}

/**
 * O fim da faixa `i` vai para `v`, e as seguintes andam junto: cada uma começa
 * logo depois da anterior e, espremida, fica com uma página. `v` chega já
 * limitado para sobrar uma página a cada faixa seguinte.
 */
function empurrarFim(levels: NamingRegion[], i: number, v: number): NamingRegion[] {
  const out = levels.map(l => ({ ...l }))
  out[i].toPage = v
  for (let k = i + 1; k < out.length; k++) {
    const from = (out[k - 1].toPage as number) + 1
    out[k].fromPage = from
    if ((out[k].toPage ?? 0) < from) out[k].toPage = from
  }
  return out
}

/** O começo da faixa `i` vai para `v`, e as anteriores cedem do mesmo jeito. */
function empurrarInicio(levels: NamingRegion[], i: number, v: number): NamingRegion[] {
  const out = levels.map(l => ({ ...l }))
  out[i].fromPage = v
  for (let k = i - 1; k >= 0; k--) {
    const to = (out[k + 1].fromPage as number) - 1
    out[k].toPage = to
    if ((out[k].fromPage ?? 1) > to) out[k].fromPage = to
  }
  return out
}

// As duas perguntas que o arquivo responde antes de qualquer marcação.
const MODES: { value: NamingMode; label: string; hint: string }[] = [
  {
    value: "layout",
    label: "Same layout",
    hint: "Every page follows the same drawing. Mark where the name is, and a second place for the pages that don't have the first.",
  },
  {
    value: "ranges",
    label: "By page range",
    hint: "The file is several reports glued together. Say from which page to which, and where the name is printed in that stretch.",
  },
  {
    value: "file",
    label: "From the file",
    hint: "Nothing is printed on the pages. The file title names the sheets, numbered by page.",
  },
]

/**
 * Onde o nome de cada folha está impresso.
 *
 * Um plan set não vem com os nomes num campo à parte: eles estão desenhados na
 * própria prancha, sempre no mesmo canto, porque quem emitiu usou um gabarito.
 * Aqui se marca esse canto uma vez e as páginas se nomeiam sozinhas.
 *
 * Dois níveis porque um só não dá conta: há folha que traz a sigla no rodapé e
 * folha que não traz sigla nenhuma, e o que a identifica está no cabeçalho. O
 * primeiro nível que devolver texto ganha.
 */
/**
 * Um limite de página, com um degrau de cada lado.
 *
 * O teclado numérico do navegador esconde as setas até o ponteiro chegar em
 * cima, e em tablet ele não as mostra nunca. Aqui o menos e o mais são parte do
 * campo: ajustar de uma em uma é o gesto de quem procura onde o layout muda, e
 * ele não pode depender de digitar.
 */
function PageField({ value, min, max, disabled, onChange }: {
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  // O que se digita só vale ao sair do campo: conferir o limite a cada tecla
  // impediria digitar "12" num campo cujo mínimo é 5.
  const [texto, setTexto] = useState(String(value))
  useEffect(() => setTexto(String(value)), [value])
  const aplicar = (n: number) => {
    const v = Math.min(max, Math.max(min, n))
    setTexto(String(v))
    if (v !== value) onChange(v)
  }
  return (
    <div className={`flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent dark:bg-input/30 ${
      disabled ? "opacity-50" : ""
    }`}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => aplicar(value - 1)}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={() => aplicar(Number(texto) || value)}
        onKeyDown={e => { if (e.key === "Enter") aplicar(Number(texto) || value) }}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => aplicar(value + 1)}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** O que a marcação entrega a quem monta os botões em volta dela. */
export type NamingEditorContext = {
  template: NamingTemplate
  /** Há o que ler: uma região desenhada, ou o modo que tira o nome do arquivo. */
  ready: boolean
  reading: string
  preview: PageName[] | null
  runPreview: () => Promise<PageName[] | undefined>
}

/**
 * A marcação sem moldura. Vive num diálogo próprio, para trocar o set de um
 * documento que já existe, e é a segunda etapa do documento novo: lá ela não
 * é um botão que abre outra janela, é a própria etapa.
 */
export function NamingTemplateEditor({ url, open, initial, fileName, actions }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  /** O nome do arquivo anexado, de onde o modo "From the file" tira o título. */
  fileName?: string
  /** Os botões, no pé da coluna de controles. */
  actions: (ctx: NamingEditorContext) => ReactNode
}) {
  const [page, setPage] = useState(0)
  // Zero enquanto o arquivo não contou as páginas: as faixas só se repartem
  // com o número certo, senão uma conta de uma página só apagaria faixas.
  const [pages, setPages] = useState(0)
  const [mode, setMode] = useState<NamingMode>("layout")
  const [levels, setLevels] = useState<NamingRegion[]>([{ ...EMPTY_REGION }])
  const [drawing, setDrawing] = useState<number | null>(null)
  const [preview, setPreview] = useState<PageName[] | null>(null)
  const [reading, setReading] = useState("")

  const sheetRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  // Quantas folhas o arquivo tem: sem isso não há como virar página até achar
  // uma de cada tipo, que é o gesto que este diálogo pede.
  useEffect(() => {
    if (!open || !url) return
    let alive = true
    loadPdf(url).then(pdf => { if (alive) setPages(pdf.numPages) }).catch(() => {})
    return () => { alive = false }
  }, [open, url])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setMode(initial?.mode ?? "layout")
    setLevels(initial?.levels?.length ? initial.levels.map(l => ({ ...l })) : [{ ...EMPTY_REGION }])
    setPage(0)
  }, [open, initial])

  // Por trecho, as faixas sempre repartem o arquivo inteiro: confere ao abrir,
  // ao trocar para este modo e quando o arquivo termina de contar as páginas.
  useEffect(() => {
    if (open && mode === "ranges" && pages) setLevels(l => particionar(l, pages))
  }, [open, initial, mode, pages])

  // A folha esticada até preencher a área não serve para marcar nada: a região
  // é lida no PDF, onde a prancha tem a proporção dela. Então o espaço livre é
  // medido e a folha entra inteira dentro dele, na proporção certa.
  const [ratio, setRatio] = useState(0)
  const [space, setSpace] = useState({ w: 0, h: 0 })
  const spaceRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSpace({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
  }, [])

  const onSize = useCallback((size: { width: number; height: number }) => {
    if (size.height > 0) setRatio(size.width / size.height)
  }, [])

  // O código que dá nome à folha está impresso pequeno, e marcar apertado em
  // cima dele à distância é chute. O zoom aumenta a folha dentro da área, que
  // passa a rolar; a marcação continua em fração, então não muda de lugar.
  const [zoom, setZoom] = useState(1)
  useEffect(() => { if (open) setZoom(1) }, [open])

  const base = ratio && space.w && space.h
    ? space.w / space.h > ratio
      ? { width: space.h * ratio, height: space.h }
      : { width: space.w, height: space.w / ratio }
    : null
  const fit = base ? { width: base.width * zoom, height: base.height * zoom } : null

  const zoomBy = (step: number) =>
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + step) * 100) / 100)))

  function wheel(e: React.WheelEvent) {
    // Sem tecla o gesto rola a folha, que é o que se espera de uma área com
    // barra. Com Ctrl ou Cmd ele amplia, como em qualquer visualizador.
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 0.25 : -0.25)
  }

  const point = useCallback((e: React.PointerEvent) => {
    const box = sheetRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }, [])

  function down(e: React.PointerEvent) {
    if (drawing === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = point(e)
    setPreview(null)
  }

  function move(e: React.PointerEvent) {
    if (drawing === null || !start.current) return
    const now = point(e)
    const a = start.current
    setLevels(list => list.map((l, i) => i === drawing ? {
      ...l,
      x0: Math.min(a.x, now.x), y0: Math.min(a.y, now.y),
      x1: Math.max(a.x, now.x), y1: Math.max(a.y, now.y),
    } : l))
  }

  function up() {
    if (drawing === null) return
    start.current = null
    setDrawing(null)
  }

  function mudarFim(i: number, v: number) {
    setLevels(l => empurrarFim(l, i, v))
    setPreview(null)
  }

  function mudarInicio(i: number, v: number) {
    setLevels(l => empurrarInicio(l, i, v))
    setPreview(null)
  }

  // A faixa nova toma a última página da última faixa: 1 a 9 vira 1 a 8 e 9 a
  // 9. Com a última faixa numa página só, não há de onde tirar.
  const ultima = levels[levels.length - 1]
  const cabeOutraFaixa = !!pages && (ultima?.toPage ?? pages) > (ultima?.fromPage ?? 1)

  function novaFaixa() {
    if (!cabeOutraFaixa) return
    setLevels(l => [
      ...l.slice(0, -1),
      { ...l[l.length - 1], toPage: pages - 1 },
      { ...EMPTY_REGION, fromPage: pages, toPage: pages },
    ])
    setPreview(null)
  }

  function removerNivel(i: number) {
    // Por trecho, as páginas da faixa que sai voltam para a de antes.
    setLevels(l => mode === "ranges"
      ? l.flatMap((r, k) => k === i ? [] : k === i - 1 ? [{ ...r, toPage: l[i].toPage }] : [r])
      : l.slice(0, i))
    setPreview(null)
  }

  async function runPreview(): Promise<PageName[] | undefined> {
    const usable = levels.filter(has)
    if (mode !== "file" && !usable.length) return
    setReading("0")
    try {
      const names = await readPageNames(url, { mode, levels: usable },
        (done, total) => setReading(`${done}/${total}`), undefined, fileName)
      setPreview(names)
      return names
    } finally {
      setReading("")
    }
  }

  const usable = levels.filter(has)
  const named = preview?.filter(p => p.name).length ?? 0
  // Quantas folhas leram um nome que outra também leu, e por isso ganharam
  // sufixo. Vale dizer: é o número que explica um "1-01-L-B" na lista.
  const suffixed = preview?.filter(p => p.name !== p.read).length ?? 0
  const pending = preview ? preview.length - named : 0

  const ctx: NamingEditorContext = {
    template: { mode, levels: usable },
    ready: mode === "file" || usable.length > 0,
    reading, preview, runPreview,
  }

  return (
    <>
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Só a folha deste lado. */}
          <div
            ref={spaceRef}
            onWheel={wheel}
            className="flex min-h-0 min-w-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-3"
          >
            <div
              ref={sheetRef}
              style={fit ? { width: fit.width, height: fit.height } : undefined}
              className={`relative m-auto shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-border/60 ${
                fit ? "" : "h-full w-full"
              } ${drawing !== null ? "cursor-crosshair" : ""}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              {/* Ampliar sem redesenhar deixaria o traço borrado justo onde se
                  precisa ler: a escala do canvas acompanha o zoom, em degraus,
                  para não redesenhar a cada clique. */}
              <PdfPage
                url={url}
                pageIndex={page}
                scale={SCALE * Math.min(3, Math.round(zoom))}
                onSize={onSize}
              />

              {/* Tirando o nome do arquivo, nada na folha é lido: as áreas
                  marcadas saem de vista, e voltam ao trocar de modo. */}
              {mode !== "file" && levels.map((region, i) => has(region) && (
                <div
                  key={i}
                  className={`pointer-events-none absolute border-2 ${
                    i === 0 ? "border-sky-500 bg-sky-500/15" : "border-violet-500 bg-violet-500/15"
                  }`}
                  style={{
                    left: `${region.x0 * 100}%`,
                    top: `${region.y0 * 100}%`,
                    width: `${(region.x1 - region.x0) * 100}%`,
                    height: `${(region.y1 - region.y0) * 100}%`,
                  }}
                >
                  <span className={`absolute -top-5 left-0 rounded px-1 text-[10px] font-medium text-white ${
                    i === 0 ? "bg-sky-500" : "bg-violet-500"
                  }`}>
                    {i === 0 ? "1st" : "2nd"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Todo controle deste. */}
          <div className="flex min-h-0 w-80 shrink-0 flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {/* A primeira decisão, e a que mudaria o sentido de tudo abaixo se
                ficasse implícita: como o arquivo está organizado. */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2">
              <div className="flex gap-1">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setMode(m.value)
                      // Por layout são dois níveis no máximo.
                      if (m.value === "layout") setLevels(l => l.slice(0, 2))
                      setPreview(null)
                    }}
                    className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors ${
                      mode === m.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
                {MODES.find(m => m.value === mode)?.hint}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-1.5">
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {page + 1} of {pages || "…"}
              </span>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={page + 1 >= pages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-1.5">
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => zoomBy(-0.25)}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="rounded px-2 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                title="Fit to the area"
              >
                {zoom.toFixed(2).replace(/\.?0+$/, "")}x
              </button>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => zoomBy(0.25)}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {mode === "file" && (
              <div className="rounded-lg border border-border/60 p-3 text-xs leading-snug text-muted-foreground">
                Nothing to mark here. Run the preview to see the names the file title gives, and
                save it to keep the choice for the next upload of this folder.
              </div>
            )}

            {mode !== "file" && levels.map((region, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-sky-500" : "bg-violet-500"}`} />
                    {mode === "ranges"
                      ? `Range ${i + 1}`
                      : i === 0 ? "First level" : "Second level"}
                  </span>
                  {i > 0 && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => removerNivel(i)}
                      title="Remove this level"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <Button
                  variant={drawing === i ? "default" : "outline"}
                  onClick={() => setDrawing(drawing === i ? null : i)}
                >
                  <Crop className="h-3.5 w-3.5" />
                  {drawing === i ? "Draw on the sheet…"
                    : has(region) ? "Redraw the area" : "Draw the area"}
                </Button>

                {/* A faixa só existe no modo por trecho: no de layout ela não
                    significa nada, e mostrá-la ali seria oferecer uma decisão
                    que não muda resultado nenhum. */}
                {mode === "ranges" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Pages</Label>
                  <div className="flex items-center gap-1.5">
                    {/* A primeira faixa começa sempre na página 1 e a última
                        termina sempre na última: esses dois limites ficam
                        travados. O começo não passa do fim, e cada faixa
                        deixa ao menos uma página para as vizinhas. */}
                    <PageField
                      value={region.fromPage ?? 1}
                      min={i + 1}
                      max={region.toPage ?? pages}
                      disabled={i === 0 || !pages}
                      onChange={v => mudarInicio(i, v)}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">to</span>
                    <PageField
                      value={region.toPage ?? pages}
                      min={region.fromPage ?? 1}
                      max={pages - (levels.length - 1 - i)}
                      disabled={i === levels.length - 1 || !pages}
                      onChange={v => mudarFim(i, v)}
                    />
                  </div>
                </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Text direction</Label>
                  <Select
                    value={String(region.rotation)}
                    onValueChange={v => {
                      if (!v) return
                      setLevels(l => l.map((r, k) => k === i ? { ...r, rotation: Number(v) } : r))
                      // A leitura antiga era da outra direção: o envio não pode usá-la.
                      setPreview(null)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <span className="flex-1 truncate text-left text-sm">
                        {ROTATIONS.find(r => r.value === String(region.rotation))?.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {ROTATIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}

            {/* Por layout são dois, porque precedência com três já é regra que
                ninguém acompanha. Por trecho não há teto: o arquivo tem os
                trechos que tiver. */}
            {mode === "layout" && levels.length < 2 && (
              <Button
                variant="outline"
                onClick={() => { setLevels(l => [...l, { ...EMPTY_REGION }]); setPreview(null) }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add a second level
              </Button>
            )}
            {mode === "ranges" && (
              <Button variant="outline" disabled={!cabeOutraFaixa} onClick={novaFaixa}>
                <Plus className="h-3.5 w-3.5" />
                {cabeOutraFaixa || !pages ? "Add a page range" : "No page left for another range"}
              </Button>
            )}

            {preview && (
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">
                  {named} of {preview.length} named
                  {pending > 0 && <span className="text-destructive"> · {pending} pending</span>}
                  {suffixed > 0 && (
                    <span className="text-muted-foreground"> · {suffixed} disambiguated</span>
                  )}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {/* A linha leva até a página que ela descreve.

                      Conferir a leitura era navegar à mão: a lista dizia que a
                      página 47 leu errado, e chegar lá custava quarenta e seis
                      cliques na seta. Quem lê a prévia está justamente
                      procurando a página que destoa, então a linha é o caminho
                      mais curto até ela.

                      Nem isto nem as setas limpam a prévia: virar página não
                      muda o que é lido. Quem limpa é mexer na leitura (a área,
                      a direção, as faixas, o modo), e sem prévia o envio não
                      sai. */}
                  {preview.map(p => (
                    <button
                      key={p.pageIndex}
                      type="button"
                      onClick={() => setPage(p.pageIndex)}
                      title="Show this page"
                      className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent ${
                        p.pageIndex === page ? "bg-accent/60" : ""
                      }`}
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                        {p.pageIndex + 1}
                      </span>
                      {/* O sufixo de desempate sai em itálico e cinza: ele não
                          faz parte do que foi lido da prancha, é o que o
                          sistema acrescentou para separar duas folhas
                          homônimas. Misturado ao título, pareceria nome. */}
                      <span className={`min-w-0 flex-1 truncate ${p.name ? "" : "text-destructive"}`}>
                        {p.name ? (
                          <>
                            {splitSuffix(p.name).base}
                            {splitSuffix(p.name).suffix && (
                              <span className="italic text-muted-foreground">
                                {splitSuffix(p.name).suffix}
                              </span>
                            )}
                          </>
                        ) : "no name"}
                      </span>
                      {p.level > 0 && (
                        <span className={`shrink-0 rounded px-1 text-[10px] ${
                          p.level === 1 ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        }`}>
                          {p.level === 1 ? "1st" : "2nd"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div>

            {/* As ações moram no pé da coluna, e não num rodapé embaixo de
                tudo: a folha fica com a altura inteira da tela. */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 pt-3">
              {actions(ctx)}
            </div>
          </div>
        </div>
    </>
  )
}

export function NamingTemplateDialog({ url, open, initial, onClose, onSave }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  onClose: () => void
  onSave: (template: NamingTemplate) => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      {/* Altura fixa, não teto: com `max-h` o diálogo encolhia até o tamanho do
          conteúdo, e como a folha é quem cede espaço, ela ficava do tamanho de
          um selo. Aqui se marca uma região de poucos milímetros no papel, então
          a folha usa toda a tela que houver. */}
      <DialogContent className="flex h-[92vh] w-[min(96vw,80rem)] max-w-none flex-col gap-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Where the sheet name is printed</DialogTitle>
        </DialogHeader>
        <NamingTemplateEditor
          url={url}
          open={open}
          initial={initial}
          actions={({ template, ready, reading, runPreview }) => (
            <>
              <Button variant="outline" disabled={!ready || !!reading} onClick={runPreview}>
                {reading ? `Reading ${reading}` : "Preview names"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className="flex-1" disabled={!ready} onClick={() => onSave(template)}>
                  Save template
                </Button>
              </div>
            </>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}
