"use client"

import { Button } from "@/components/ui/button"
import {
  useAtlasAnnotations, useAtlasEvents, useCreateAtlasAnnotation,
  useCreateAtlasEvent, useDeleteAtlasAnnotation,
} from "@/hooks/use-atlas"
import type { AtlasSheet, AtlasStrokeGeometry } from "@/services/atlas.service"
import { Eraser, Highlighter, MapPin, Minus, Pen, Plus, X } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"

type Tool = "pen" | "highlighter" | "pin" | "erase"

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827"]

// Opacidade é o que separa caneta de marca-texto: opaco simula tinta, translúcido
// simula o traço largo por cima do desenho (AT-14).
const TOOL_DEFAULTS: Record<"pen" | "highlighter", { width: number; opacity: number }> = {
  pen: { width: 2, opacity: 1 },
  highlighter: { width: 14, opacity: 0.35 },
}

function pointsToPath(points: [number, number][], w: number, h: number): string {
  if (!points.length) return ""
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`)
    .join(" ")
}

/**
 * Leitor de folha com a camada de anotação.
 *
 * A imagem da folha ainda não entra aqui: renderizar a página sob demanda a
 * partir do original — no servidor ou no cliente — é a decisão mais cara ainda
 * aberta do Atlas (AT-13), e ela muda a arquitetura do leitor inteiro. O que
 * está pronto é tudo o que não depende dela: a superfície com zoom, as
 * coordenadas normalizadas, as ferramentas, a persistência traço a traço e o
 * pin de evento. Quando o render existir, ele entra como um `<image>` atrás do
 * `<g>` de anotações — sem mexer em coordenada nenhuma, porque nada aqui
 * depende da resolução.
 */
export function SheetViewer({ sheet, jobsiteId, canAnnotate, onClose }: {
  sheet: AtlasSheet
  jobsiteId: string
  canAnnotate: boolean
  onClose: () => void
}) {
  const { data: annotations } = useAtlasAnnotations(sheet.id)
  const { data: events } = useAtlasEvents(jobsiteId, sheet.id)
  const createAnnotation = useCreateAtlasAnnotation(sheet.id)
  const deleteAnnotation = useDeleteAtlasAnnotation(sheet.id)
  const createEvent = useCreateAtlasEvent(jobsiteId, sheet.id)

  const [tool, setTool] = useState<Tool>("pen")
  const [color, setColor] = useState(COLORS[0])
  const [zoom, setZoom] = useState(1)
  const [drawing, setDrawing] = useState<[number, number][]>([])
  const surfaceRef = useRef<SVGSVGElement>(null)

  // Proporção da folha: ARCH E1 é 42×30 quando o PDF não disse outra coisa.
  const { width, height } = useMemo(() => {
    const w = Number(sheet.widthPt) || 3024
    const h = Number(sheet.heightPt) || 2160
    return { width: w, height: h }
  }, [sheet.widthPt, sheet.heightPt])

  const toNormalized = useCallback((e: React.PointerEvent): [number, number] => {
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!box) return [0, 0]
    return [
      Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    ]
  }, [])

  function handlePointerDown(e: React.PointerEvent) {
    if (!canAnnotate) return
    const point = toNormalized(e)

    if (tool === "pin") {
      const title = window.prompt("O que aconteceu neste ponto da planta?")
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
    if (!drawing.length) return
    setDrawing(prev => [...prev, toNormalized(e)])
  }

  function handlePointerUp() {
    if (drawing.length < 2) { setDrawing([]); return }
    const stroke = tool === "highlighter" ? "highlighter" : "pen"
    const defaults = TOOL_DEFAULTS[stroke]
    createAnnotation.mutate({
      // O id nasce no cliente porque o traço precisa existir antes da rede
      // responder — é o que permite anotar em obra sem sinal e sincronizar
      // depois sem duplicar (AT-14).
      id: crypto.randomUUID(),
      tool: stroke,
      color,
      width: defaults.width,
      opacity: defaults.opacity,
      geometry: { points: drawing } as AtlasStrokeGeometry,
    })
    setDrawing([])
  }

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {sheet.sheetNumber || `Página ${sheet.pageIndex + 1}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">{sheet.title}</p>
        </div>

        {canAnnotate && (
          <div className="flex items-center gap-1">
            {toolButton("pen", Pen, "Caneta")}
            {toolButton("highlighter", Highlighter, "Marca-texto")}
            {toolButton("pin", MapPin, "Pin de evento")}
            {toolButton("erase", Eraser, "Apagar traço")}
            <div className="mx-1 flex items-center gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    color === c ? "scale-110 border-foreground" : "border-border/60"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
        <div
          className="mx-auto bg-background shadow-sm"
          style={{ width: `${Math.min(1400, width) * zoom}px`, maxWidth: "none" }}
        >
          <svg
            ref={surfaceRef}
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full touch-none select-none border border-border/60"
            style={{ cursor: canAnnotate && tool !== "erase" ? "crosshair" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Lugar do render da folha (AT-13). Enquanto ele não existe, a
                superfície mantém a proporção real da prancha, para o traço
                nascer com a coordenada certa desde já. */}
            <rect x={0} y={0} width={width} height={height} fill="transparent" />
            <text
              x={width / 2} y={height / 2}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: Math.round(height / 40) }}
            >
              render da folha pendente — anotações já são gravadas
            </text>

            <g>
              {annotations?.map(a => (
                <path
                  key={a.id}
                  d={pointsToPath(a.geometry?.points ?? [], width, height)}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={Number(a.width) * (height / 400)}
                  strokeOpacity={Number(a.opacity)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={() => {
                    if (tool === "erase" && canAnnotate) deleteAnnotation.mutate(a.id)
                  }}
                  style={{ cursor: tool === "erase" ? "pointer" : "inherit" }}
                />
              ))}

              {drawing.length > 1 && (
                <path
                  d={pointsToPath(drawing, width, height)}
                  fill="none"
                  stroke={color}
                  strokeWidth={TOOL_DEFAULTS[tool === "highlighter" ? "highlighter" : "pen"].width * (height / 400)}
                  strokeOpacity={TOOL_DEFAULTS[tool === "highlighter" ? "highlighter" : "pen"].opacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {events?.filter(e => e.pageX != null && e.pageY != null).map(e => (
                <g key={e.id} transform={`translate(${(e.pageX ?? 0) * width} ${(e.pageY ?? 0) * height})`}>
                  <circle
                    r={height / 60}
                    className={e.status === "resolved" ? "fill-emerald-500/80" : "fill-amber-500/80"}
                  />
                  <title>{e.title || e.body}</title>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
