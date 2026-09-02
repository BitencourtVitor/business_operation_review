"use client"

import { downloadPlan } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import { usePlanSource } from "@/components/atlas/use-plan-url"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  useAtlasAnnotations, useAtlasEvents, useCreateAtlasAnnotation,
  useCreateAtlasEvent, useDeleteAtlasAnnotation, useUpdateAtlasEvent,
} from "@/hooks/use-atlas"
import type { AtlasSheet, AtlasStrokeGeometry } from "@/services/atlas.service"
import {
  ChevronLeft, ChevronRight, Download, Eraser, Hand, Highlighter, Maximize,
  MapPin, Minus, Pen, Plus, X,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

type Tool = "pan" | "pen" | "highlighter" | "pin" | "erase"

// Paleta fechada, escolhida para ler sobre papel branco nas duas ferramentas:
// opaca como caneta e translúcida como marca-texto. Cor livre deixaria o
// usuário escolher amarelo claro de caneta, que some na prancha.
const COLORS = [
  { value: "#dc2626", label: "Red" },
  { value: "#ea580c", label: "Orange" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#111827", label: "Ink" },
]

// Opacidade é o que separa caneta de marca-texto: opaca simula tinta,
// translúcida simula o traço largo por cima do desenho (AT-14). É ponto de
// partida, não trava: o controle deixa regular traço a traço.
const TOOL_DEFAULTS: Record<"pen" | "highlighter", { width: number; opacity: number }> = {
  pen: { width: 2, opacity: 1 },
  highlighter: { width: 14, opacity: 0.3 },
}

const WIDTHS = [1, 2, 4, 8]

// O zoom é relativo ao enquadramento inicial: 100% é a prancha inteira na tela.
// O teto alto não custa memória porque só a área visível é rasterizada, e é ele
// que permite ler a cota impressa em corpo 6 numa folha de 42 polegadas.
//
// O piso é 75% porque abaixo disso a folha já cabe inteira com sobra: só afasta
// a prancha e a deixa ilegível no meio de uma tela vazia.
const MIN_ZOOM = 0.75
const MAX_ZOOM = 64

// Quantas vezes a prancha está maior do que cabe na tela, e não porcentagem:
// "6400%" assusta e não diz nada, "64x" diz que a folha está sessenta e quatro
// vezes o tamanho de leitura. Casa decimal só onde ela distingue algo, então
// 0.75x e 1.5x aparecem inteiros de leitura e 21x não vira 21.3x.
function zoomLabel(value: number): string {
  if (value >= 10) return `${Math.round(value)}x`
  return `${(Math.round(value * 20) / 20).toFixed(2).replace(/.?0+$/, "")}x`
}

// Sobra de tela que a folha pode deixar de cada lado. Alguma folga é útil, para
// a quina não ficar colada na moldura quando se olha um canto; muito mais que
// isso e a prancha some da tela, que é o jeito de se perder num desenho grande.
const SLACK = 0.15

/**
 * Segura a folha dentro da tela.
 *
 * Menor que a área visível, ela fica centrada, e não há para onde arrastar.
 * Maior, ela anda até a borda e para: quem arrasta demais bate no limite em vez
 * de sair para o branco e ter de procurar o desenho de volta.
 */
function clampView(v: PlanView, box: { width: number; height: number }, pw: number, ph: number): PlanView {
  const w = pw * v.scale
  const h = ph * v.scale
  const slackX = box.width * SLACK
  const slackY = box.height * SLACK
  return {
    scale: v.scale,
    x: w <= box.width
      ? (box.width - w) / 2
      : Math.min(slackX, Math.max(box.width - w - slackX, v.x)),
    y: h <= box.height
      ? (box.height - h) / 2
      : Math.min(slackY, Math.max(box.height - h - slackY, v.y)),
  }
}

function pointsToPath(points: [number, number][], w: number, h: number): string {
  if (!points.length) return ""
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`)
    .join(" ")
}

/**
 * Leitor de plano: a página do PDF por baixo, a camada de anotação por cima.
 *
 * Cada plano é um PDF de uma página só, recortado na ingestão: abrir custa
 * ~1,7 MB em vez dos 107 MB do set. O anterior e o seguinte já vêm a caminho,
 * para virar página não ter espera.
 *
 * A prancha se move como mapa: arrastar desloca, roda e pinça dão zoom em cima
 * do ponto apontado. O zoom é escala de render, não `transform: scale`, então
 * ampliar redesenha o vetor em vez de esticar o bitmap.
 */
export function SheetViewer({ sheet, sheets, jobsiteId, canAnnotate, onClose, onNavigate }: {
  sheet: AtlasSheet
  sheets: AtlasSheet[]
  jobsiteId: string
  canAnnotate: boolean
  onClose: () => void
  onNavigate: (sheet: AtlasSheet) => void
}) {
  const { data: annotations } = useAtlasAnnotations(sheet.id)
  const { data: events } = useAtlasEvents(jobsiteId, sheet.id)
  const createAnnotation = useCreateAtlasAnnotation(sheet.id)
  const deleteAnnotation = useDeleteAtlasAnnotation(sheet.id)
  const createEvent = useCreateAtlasEvent(jobsiteId, sheet.id)
  const updateEvent = useUpdateAtlasEvent(jobsiteId, sheet.id)

  const [tool, setTool] = useState<Tool>("pan")
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(2)
  const [opacity, setOpacity] = useState(1)
  const [drawing, setDrawing] = useState<[number, number][]>([])
  const [panning, setPanning] = useState(false)

  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<PlanView>({ scale: 0, x: 0, y: 0 })

  const index = sheets.findIndex(s => s.id === sheet.id)
  const prev = index > 0 ? sheets[index - 1] : null
  const next = index >= 0 && index < sheets.length - 1 ? sheets[index + 1] : null

  const neighbours = useMemo(
    () => [prev, next].filter(Boolean) as AtlasSheet[],
    [prev, next],
  )
  const source = usePlanSource(sheet, neighbours)

  const { pageWidth, pageHeight } = useMemo(() => ({
    pageWidth: Number(sheet.widthPt) || 3024,
    pageHeight: Number(sheet.heightPt) || 2160,
  }), [sheet.widthPt, sheet.heightPt])

  // ── Enquadramento ─────────────────────────────────────────────────────────
  const fitScale = useMemo(() => {
    if (!size.width || !size.height) return 0
    return Math.min(size.width / pageWidth, size.height / pageHeight) * 0.96
  }, [size, pageWidth, pageHeight])

  const fit = useCallback(() => {
    if (!fitScale) return
    setView({
      scale: fitScale,
      x: (size.width - pageWidth * fitScale) / 2,
      y: (size.height - pageHeight * fitScale) / 2,
    })
  }, [fitScale, size, pageWidth, pageHeight])

  useLayoutEffect(() => {
    const node = boxRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setSize({ width: box.width, height: box.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Enquadra ao abrir, ao trocar de folha e quando a tela muda de tamanho sem
  // que ninguém tenha mexido no zoom ainda.
  useEffect(() => { fit() }, [fit, sheet.id])

  const zoom = fitScale ? view.scale / fitScale : 1

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView(v => {
      if (!fitScale) return v
      const nextScale = Math.min(
        MAX_ZOOM * fitScale,
        Math.max(MIN_ZOOM * fitScale, v.scale * factor),
      )
      const k = nextScale / v.scale
      return clampView(
        { scale: nextScale, x: px - (px - v.x) * k, y: py - (py - v.y) * k },
        size, pageWidth, pageHeight,
      )
    })
  }, [fitScale, size, pageWidth, pageHeight])

  const zoomCentre = useCallback((factor: number) => {
    zoomAt(factor, size.width / 2, size.height / 2)
  }, [zoomAt, size])

  // ── Roda: zoom direto, sem tecla modificadora ─────────────────────────────
  useEffect(() => {
    const node = boxRef.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      // A prancha não rola: ela é uma folha só, e o gesto que se espera dela é
      // aproximar, como em qualquer mapa. Rolar a página inteira num leitor de
      // plano nunca leva a lugar nenhum.
      e.preventDefault()
      const box = node!.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  // ── Ponteiros: arrastar, desenhar e pinçar ────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: "pan"; x: number; y: number; view: PlanView }
    | { kind: "pinch"; distance: number; view: PlanView; cx: number; cy: number }
    | null
  >(null)

  const toPage = useCallback((clientX: number, clientY: number): [number, number] => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || !view.scale) return [0, 0]
    return [
      (clientX - box.left - view.x) / (pageWidth * view.scale),
      (clientY - box.top - view.y) / (pageHeight * view.scale),
    ]
  }, [view, pageWidth, pageHeight])

  const drawTool = tool === "pen" || tool === "highlighter"

  function handlePointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const box = boxRef.current?.getBoundingClientRect()

    // Dois dedos é pinça, e pinça nunca vira traço: desenhar com a segunda mão
    // apoiada na tela é o acidente clássico do tablet em obra.
    if (pointers.current.size === 2 && box) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        kind: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        view,
        cx: (a.x + b.x) / 2 - box.left,
        cy: (a.y + b.y) / 2 - box.top,
      }
      setDrawing([])
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)

    // Botão do meio arrasta com qualquer ferramenta na mão: é o atalho que quem
    // desenha muito espera, para não ter de largar a caneta a cada deslocada.
    if (!canAnnotate || tool === "pan" || e.button === 1) {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, view }
      setPanning(true)
      return
    }

    if (tool === "pin") {
      const title = window.prompt("What happened at this point of the drawing?")
      if (title?.trim()) {
        const [x, y] = toPage(e.clientX, e.clientY)
        createEvent.mutate({
          kind: "issue", title: title.trim(), sheetId: sheet.id, pageX: x, pageY: y,
        })
      }
      return
    }
    if (tool === "erase") return

    setDrawing([toPage(e.clientX, e.clientY)])
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    const g = gesture.current
    if (g?.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const k = Math.hypot(a.x - b.x, a.y - b.y) / g.distance
      const scale = Math.min(
        MAX_ZOOM * fitScale,
        Math.max(MIN_ZOOM * fitScale, g.view.scale * k),
      )
      const ratio = scale / g.view.scale
      setView(clampView({
        scale,
        x: g.cx - (g.cx - g.view.x) * ratio,
        y: g.cy - (g.cy - g.view.y) * ratio,
      }, size, pageWidth, pageHeight))
      return
    }

    if (g?.kind === "pan") {
      setView(clampView(
        { scale: g.view.scale, x: g.view.x + (e.clientX - g.x), y: g.view.y + (e.clientY - g.y) },
        size, pageWidth, pageHeight,
      ))
      return
    }

    if (!drawing.length) return
    setDrawing(points => [...points, toPage(e.clientX, e.clientY)])
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) {
      gesture.current = null
      setPanning(false)
    }

    if (drawing.length < 2) { setDrawing([]); return }
    const stroke = tool === "highlighter" ? "highlighter" : "pen"
    createAnnotation.mutate({
      // O id nasce no cliente porque o traço precisa existir antes de a rede
      // responder: é o que permite anotar em obra sem sinal e sincronizar
      // depois sem duplicar (AT-14).
      id: crypto.randomUUID(),
      tool: stroke,
      color,
      width: stroke === "highlighter" ? width * 6 : width,
      opacity,
      geometry: { points: drawing } as AtlasStrokeGeometry,
    })
    setDrawing([])
  }

  // Trocar de ferramenta troca a opacidade sugerida, sem prender: quem regulou
  // um marca-texto mais forte continua com ele até mudar de ideia.
  function pickTool(value: Tool) {
    setTool(value)
    if (value === "pen" || value === "highlighter") {
      setOpacity(TOOL_DEFAULTS[value].opacity)
      setWidth(TOOL_DEFAULTS[value].width === 14 ? 2 : TOOL_DEFAULTS[value].width)
    }
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && next) onNavigate(next)
      if (e.key === "ArrowLeft" && prev) onNavigate(prev)
      if (e.key === "Escape") onClose()
      if (e.key === "0") fit()
      if (e.key === "+" || e.key === "=") zoomCentre(1.25)
      if (e.key === "-") zoomCentre(0.8)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, onNavigate, onClose, fit, zoomCentre])

  const toolButton = (value: Tool, Icon: typeof Pen, label: string) => (
    <Button
      key={value}
      size="icon"
      variant={tool === value ? "default" : "ghost"}
      onClick={() => pickTool(value)}
      title={label}
      className="h-9 w-9"
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  const strokeScale = pageHeight / 400
  const pageStyle = {
    left: view.x,
    top: view.y,
    width: pageWidth * view.scale,
    height: pageHeight * view.scale,
  }

  const cursor = panning ? "grabbing"
    : tool === "pan" || !canAnnotate ? "grab"
    : tool === "erase" ? "pointer"
    : "crosshair"

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
      <div
        ref={boxRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {source?.url && view.scale > 0 && (
          <PlanCanvas
            url={source.url}
            // O recorte tem uma página só; o fallback traz o set inteiro e
            // precisa pular para a página certa.
            pageIndex={source.whole ? sheet.pageIndex : 0}
            view={view}
            width={size.width}
            height={size.height}
          />
        )}

        {/* A camada de anotação segue a página, não a tela: mesma origem, mesmo
            tamanho, e o viewBox mantém o traço em coordenada de papel. */}
        <svg
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          className="pointer-events-none absolute select-none"
          style={pageStyle}
        >
          {annotations?.map(a => (
            <path
              key={a.id}
              d={pointsToPath(a.geometry?.points ?? [], pageWidth, pageHeight)}
              fill="none"
              stroke={a.color}
              strokeWidth={Number(a.width) * strokeScale}
              strokeOpacity={Number(a.opacity)}
              strokeLinecap="round"
              strokeLinejoin="round"
              onPointerDown={e => {
                if (tool !== "erase" || !canAnnotate) return
                e.stopPropagation()
                deleteAnnotation.mutate(a.id)
              }}
              style={{
                cursor: tool === "erase" ? "pointer" : "inherit",
                pointerEvents: tool === "erase" ? "stroke" : "none",
              }}
            />
          ))}

          {drawing.length > 1 && (
            <path
              d={pointsToPath(drawing, pageWidth, pageHeight)}
              fill="none"
              stroke={color}
              strokeWidth={(tool === "highlighter" ? width * 6 : width) * strokeScale}
              strokeOpacity={opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {events?.filter(e => e.pageX != null && e.pageY != null).map(e => (
            <g
              key={e.id}
              transform={`translate(${(e.pageX ?? 0) * pageWidth} ${(e.pageY ?? 0) * pageHeight})`}
              onPointerDown={ev => {
                if (tool !== "erase" || !canAnnotate) return
                ev.stopPropagation()
                // Soltar o pino não apaga o evento: ele fica em Tasks, com o que
                // já foi respondido nele. O que sai é a marca sobre a prancha.
                updateEvent.mutate({ eventId: e.id, patch: { detach: true } })
              }}
              style={{
                cursor: tool === "erase" ? "pointer" : "inherit",
                pointerEvents: tool === "erase" ? "auto" : "none",
              }}
            >
              <circle
                r={pageHeight / 60}
                className={e.status === "resolved" ? "fill-emerald-500/80" : "fill-amber-500/80"}
              />
              <title>{e.title || e.body}</title>
            </g>
          ))}
        </svg>

        {!source && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Loading plan…
          </div>
        )}
      </div>

      {/* Os controles flutuam nas quatro bordas, sobre a prancha: barra fixa no
          topo rouba altura da folha, que é o que a pessoa veio ver. Em cima a
          identificação e a saída, nas laterais a virada de página, embaixo as
          ferramentas e o zoom, onde o polegar chega sem soltar o tablet. */}
      <div className="pointer-events-none absolute left-4 top-4 flex max-w-[min(60vw,28rem)] items-center gap-2 rounded-lg border border-white/10 bg-neutral-800/90 px-3 py-2 shadow-lg backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight text-white">
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </p>
          <p className="truncate text-xs text-white/60">
            {sheet.title || `${index + 1} of ${sheets.length}`}
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1 rounded-lg border border-white/10 bg-neutral-800/90 p-1 shadow-lg backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          className="pointer-events-auto h-9 w-9 text-white hover:bg-white/10 hover:text-white"
          disabled={!source?.url}
          title="Download this plan"
          onClick={() => source && downloadPlan(
            source.url,
            source.whole ? sheet.pageIndex : 0,
            sheet.sheetNumber || `plan-${String(sheet.pageIndex + 1).padStart(3, "0")}`,
          )}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="pointer-events-auto h-9 w-9 text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {prev && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(prev)}
          title="Previous plan"
          className="absolute left-4 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur hover:bg-neutral-700 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
      {next && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(next)}
          title="Next plan"
          className="absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur hover:bg-neutral-700 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}

      {canAnnotate && (
        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-neutral-800/90 p-1.5 text-white shadow-lg backdrop-blur">
          <div className="flex items-center gap-1">
            {toolButton("pan", Hand, "Move the sheet")}
            {toolButton("pen", Pen, "Pen")}
            {toolButton("highlighter", Highlighter, "Highlighter")}
            {toolButton("pin", MapPin, "Event pin")}
            {toolButton("erase", Eraser, "Erase stroke or take the pin off")}
          </div>

          {drawTool && (
            <>
              <span className="h-6 w-px bg-white/15" />
              <div className="flex items-center gap-1">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    title={c.label}
                    style={{ background: c.value }}
                    className={`h-6 w-6 rounded-full border transition-transform ${
                      color === c.value ? "scale-110 border-white" : "border-white/30"
                    }`}
                  />
                ))}
              </div>

              <span className="h-6 w-px bg-white/15" />
              <div className="flex items-center gap-1">
                {WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => setWidth(w)}
                    title={`${w} pt`}
                    className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                      width === w ? "bg-white/20" : "hover:bg-white/10"
                    }`}
                  >
                    <span
                      className="rounded-full bg-white"
                      style={{ width: `${2 + w}px`, height: `${2 + w}px` }}
                    />
                  </button>
                ))}
              </div>

              <span className="h-6 w-px bg-white/15" />
              {/* Opacidade solta o traço da ferramenta: marca-texto mais forte
                  sobre hachura, caneta mais fraca sobre cota que não pode
                  sumir. */}
              <div className="flex w-36 items-center gap-2 px-1">
                <Slider
                  value={[Math.round(opacity * 100)]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={v => setOpacity((Array.isArray(v) ? v[0] : v) / 100)}
                  className="flex-1"
                />
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/70">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-px">
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-b-none rounded-t-lg border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur hover:bg-neutral-700 hover:text-white"
          onClick={() => zoomCentre(1.25)}
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <button
          onClick={fit}
          title="Fit the sheet to the screen"
          className="flex w-10 items-center justify-center gap-1 border-x border-white/10 bg-neutral-800/90 py-1 text-[10px] tabular-nums text-white/70 shadow-lg backdrop-blur hover:text-white"
        >
          {zoomLabel(zoom)}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-none border-x border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur hover:bg-neutral-700 hover:text-white"
          onClick={fit}
          title="Fit to screen"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-b-lg rounded-t-none border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur hover:bg-neutral-700 hover:text-white"
          onClick={() => zoomCentre(0.8)}
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
