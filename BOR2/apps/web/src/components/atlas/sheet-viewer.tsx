"use client"

import { PdfPage, downloadPlan } from "@/components/atlas/pdf-page"
import { usePlanSource } from "@/components/atlas/use-plan-url"
import { Button } from "@/components/ui/button"
import {
  useAtlasAnnotations, useAtlasEvents, useCreateAtlasAnnotation,
  useCreateAtlasEvent, useDeleteAtlasAnnotation,
} from "@/hooks/use-atlas"
import type { AtlasSheet, AtlasStrokeGeometry } from "@/services/atlas.service"
import {
  ChevronLeft, ChevronRight, Download, Eraser, Highlighter, MapPin, Minus, Pen, Plus, X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Tool = "pen" | "highlighter" | "pin" | "erase"

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
// translúcida simula o traço largo por cima do desenho (AT-14).
const TOOL_DEFAULTS: Record<"pen" | "highlighter", { width: number; opacity: number }> = {
  pen: { width: 2, opacity: 1 },
  highlighter: { width: 14, opacity: 0.3 },
}

const WIDTHS = [1, 2, 4, 8]
const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

function pointsToPath(points: [number, number][], w: number, h: number): string {
  if (!points.length) return ""
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`)
    .join(" ")
}

/**
 * Leitor de plano: a página do PDF por baixo, a camada de anotação por cima.
 *
 * Cada plano é um PDF de uma página só, recortado na ingestão — abrir custa
 * ~1,7 MB em vez dos 107 MB do set. O anterior e o seguinte já vêm a caminho,
 * para virar página não ter espera.
 *
 * O zoom é escala de render, não `transform: scale`: ampliar redesenha o vetor
 * em vez de esticar o bitmap, que é o que mantém a cota legível numa prancha de
 * 42 polegadas. Em tela de toque, a pinça mexe na mesma escala.
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

  const [tool, setTool] = useState<Tool>("pen")
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(2)
  const [zoom, setZoom] = useState(1)
  const [drawing, setDrawing] = useState<[number, number][]>([])
  const surfaceRef = useRef<HTMLDivElement>(null)

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

  // ── Zoom: botões, roda com ctrl e pinça ───────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null)

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

  useEffect(() => {
    const node = surfaceRef.current?.parentElement
    if (!node) return
    function onWheel(e: WheelEvent) {
      // Ctrl + roda é o gesto de zoom do trackpad; sem ctrl, a roda continua
      // rolando a prancha, que é o que se espera de um documento grande.
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => clampZoom(z - e.deltaY * 0.002))
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [])

  const toNormalized = useCallback((e: React.PointerEvent): [number, number] => {
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!box) return [0, 0]
    return [
      Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    ]
  }, [])

  function handlePointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Dois dedos é pinça, e pinça nunca vira traço: desenhar com a segunda mão
    // apoiada na tela é o acidente clássico do tablet em obra.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      setDrawing([])
      return
    }
    if (!canAnnotate) return

    const point = toNormalized(e)
    if (tool === "pin") {
      const title = window.prompt("What happened at this point of the drawing?")
      if (title?.trim()) {
        createEvent.mutate({
          kind: "issue", title: title.trim(), sheetId: sheet.id,
          pageX: point[0], pageY: point[1],
        })
      }
      return
    }
    if (tool === "erase") return

    e.currentTarget.setPointerCapture(e.pointerId)
    setDrawing([point])
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      setZoom(clampZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance)))
      return
    }
    if (!drawing.length) return
    setDrawing(prevPoints => [...prevPoints, toNormalized(e)])
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null

    if (drawing.length < 2) { setDrawing([]); return }
    const stroke = tool === "highlighter" ? "highlighter" : "pen"
    createAnnotation.mutate({
      // O id nasce no cliente porque o traço precisa existir antes de a rede
      // responder — é o que permite anotar em obra sem sinal e sincronizar
      // depois sem duplicar (AT-14).
      id: crypto.randomUUID(),
      tool: stroke,
      color,
      width: stroke === "highlighter" ? width * 6 : width,
      opacity: TOOL_DEFAULTS[stroke].opacity,
      geometry: { points: drawing } as AtlasStrokeGeometry,
    })
    setDrawing([])
  }

  // ── Teclado: virar página e fechar ────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && next) onNavigate(next)
      if (e.key === "ArrowLeft" && prev) onNavigate(prev)
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, onNavigate, onClose])

  const toolButton = (value: Tool, Icon: typeof Pen, label: string) => (
    <Button
      key={value}
      size="icon"
      variant={tool === value ? "default" : "ghost"}
      onClick={() => setTool(value)}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  const strokeScale = pageHeight / 400

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <Button size="icon" variant="ghost" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!next} onClick={() => next && onNavigate(next)}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {sheet.title || `${index + 1} of ${sheets.length}`}
          </p>
        </div>

        {canAnnotate && (
          <div className="flex items-center gap-1">
            {toolButton("pen", Pen, "Pen")}
            {toolButton("highlighter", Highlighter, "Highlighter")}
            {toolButton("pin", MapPin, "Event pin")}
            {toolButton("erase", Eraser, "Erase stroke")}

            <div className="mx-1 flex items-center gap-1">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  style={{ background: c.value }}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    color === c.value ? "scale-110 border-foreground" : "border-border/60"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1">
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  title={`${w} pt`}
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    width === w ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    className="rounded-full bg-foreground"
                    style={{ width: `${2 + w}px`, height: `${2 + w}px` }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => clampZoom(z - 0.25))}>
            <Minus className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setZoom(1)}
            title="Reset zoom"
            className="w-12 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => clampZoom(z + 0.25))}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
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
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
        <div
          ref={surfaceRef}
          className="relative mx-auto touch-none border border-border/60 bg-white"
          style={{ width: `${1100 * zoom}px`, aspectRatio: `${pageWidth} / ${pageHeight}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {source?.url && (
            <PdfPage
              url={source.url}
              // O recorte tem uma página só; o fallback traz o set inteiro e
              // precisa pular para a página certa.
              pageIndex={source.whole ? sheet.pageIndex : 0}
              scale={1.5 * zoom}
            />
          )}

          <svg
            viewBox={`0 0 ${pageWidth} ${pageHeight}`}
            className="absolute inset-0 h-full w-full select-none"
            style={{ cursor: canAnnotate && tool !== "erase" ? "crosshair" : "default" }}
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
                onClick={() => {
                  if (tool === "erase" && canAnnotate) deleteAnnotation.mutate(a.id)
                }}
                style={{ cursor: tool === "erase" ? "pointer" : "inherit", pointerEvents: tool === "erase" ? "stroke" : "none" }}
              />
            ))}

            {drawing.length > 1 && (
              <path
                d={pointsToPath(drawing, pageWidth, pageHeight)}
                fill="none"
                stroke={color}
                strokeWidth={(tool === "highlighter" ? width * 6 : width) * strokeScale}
                strokeOpacity={TOOL_DEFAULTS[tool === "highlighter" ? "highlighter" : "pen"].opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {events?.filter(e => e.pageX != null && e.pageY != null).map(e => (
              <g key={e.id} transform={`translate(${(e.pageX ?? 0) * pageWidth} ${(e.pageY ?? 0) * pageHeight})`}>
                <circle
                  r={pageHeight / 60}
                  className={e.status === "resolved" ? "fill-emerald-500/80" : "fill-amber-500/80"}
                />
                <title>{e.title || e.body}</title>
              </g>
            ))}
          </svg>

          {!source && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading plan…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
