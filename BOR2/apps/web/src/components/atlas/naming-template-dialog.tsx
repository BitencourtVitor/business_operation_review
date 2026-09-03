"use client"

import { PdfPage, loadPdf } from "@/components/atlas/pdf-page"
import {
  readPageNames, type NamingRegion, type NamingTemplate, type PageName,
} from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Crop, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

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
export function NamingTemplateDialog({ url, open, initial, onClose, onSave }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  onClose: () => void
  onSave: (template: NamingTemplate) => void
}) {
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
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
    setLevels(initial?.levels?.length ? initial.levels.map(l => ({ ...l })) : [{ ...EMPTY_REGION }])
    setPage(0)
  }, [open, initial])

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

  async function runPreview() {
    const usable = levels.filter(has)
    if (!usable.length) return
    setReading("0")
    try {
      const names = await readPageNames(url, { levels: usable },
        (done, total) => setReading(`${done}/${total}`))
      setPreview(names)
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

              {levels.map((region, i) => has(region) && (
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
          <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-1.5">
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={page === 0}
                onClick={() => { setPage(p => Math.max(0, p - 1)); setPreview(null) }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {page + 1} of {pages}
              </span>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={page + 1 >= pages}
                onClick={() => { setPage(p => p + 1); setPreview(null) }}
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

            {levels.map((region, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-sky-500" : "bg-violet-500"}`} />
                    {i === 0 ? "First level" : "Second level"}
                  </span>
                  {i > 0 && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setLevels(l => l.slice(0, i))}
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

                {/* A faixa de páginas: vazia, o nível vale para o arquivo
                    inteiro. Preenchida, ele só opina ali dentro, e o nível
                    seguinte assume no resto sem disputa de precedência. */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Pages</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={pages}
                      value={region.fromPage ?? ""}
                      placeholder="1"
                      onChange={e => setLevels(l => l.map((r, k) =>
                        k === i ? { ...r, fromPage: Number(e.target.value) || undefined } : r))}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">to</span>
                    <Input
                      type="number"
                      min={1}
                      max={pages}
                      value={region.toPage ?? ""}
                      placeholder={String(pages)}
                      onChange={e => setLevels(l => l.map((r, k) =>
                        k === i ? { ...r, toPage: Number(e.target.value) || undefined } : r))}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Text direction</Label>
                  <Select
                    value={String(region.rotation)}
                    onValueChange={v => v && setLevels(l => l.map((r, k) =>
                      k === i ? { ...r, rotation: Number(v) } : r))}
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

            {levels.length < 2 && (
              <Button variant="outline" onClick={() => setLevels(l => [...l, { ...EMPTY_REGION }])}>
                <Plus className="h-3.5 w-3.5" />
                Add a second level
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
                  {preview.map(p => (
                    <div
                      key={p.pageIndex}
                      className="flex items-baseline gap-2 py-0.5 text-xs"
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                        {p.pageIndex + 1}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${p.name ? "" : "text-destructive"}`}>
                        {p.name || "no name"}
                      </span>
                      {p.level > 0 && (
                        <span className={`shrink-0 rounded px-1 text-[10px] ${
                          p.level === 1 ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        }`}>
                          {p.level === 1 ? "1st" : "2nd"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            disabled={!usable.length || !!reading}
            onClick={runPreview}
          >
            {reading ? `Reading ${reading}` : "Preview names"}
          </Button>
          <Button
            disabled={!usable.length}
            onClick={() => onSave({ levels: usable })}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
