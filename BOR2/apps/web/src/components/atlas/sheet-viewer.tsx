"use client"

import { PdfPage, downloadPlan } from "@/components/atlas/pdf-page"
import { Button } from "@/components/ui/button"
import {
  useAtlasAnnotations, useAtlasEvents, useCreateAtlasAnnotation,
  useCreateAtlasEvent, useDeleteAtlasAnnotation,
} from "@/hooks/use-atlas"
import { atlasService, type AtlasSheet, type AtlasStrokeGeometry } from "@/services/atlas.service"
import {
  ChevronLeft, ChevronRight, Download, Eraser, Highlighter, MapPin, Minus, Pen, Plus, X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Tool = "pen" | "highlighter" | "pin" | "erase"

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827"]

// Opacidade é o que separa caneta de marca-texto: opaca simula tinta,
// translúcida simula o traço largo por cima do desenho (AT-14).
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
 * Leitor de folha: a página do PDF renderizada por baixo, a camada de anotação
 * por cima.
 *
 * O render é no cliente, a partir do original (AT-13). Não existe cópia cortada
 * nem imagem pré-gerada: o navegador desenha a página aberta na escala aberta.
 * A camada de anotação trabalha em coordenada normalizada (0..1), então o traço
 * vale para qualquer zoom e não depende da resolução do render.
 */
export function SheetViewer({ sheet, sheets, jobsiteId, versionId, canAnnotate, onClose, onNavigate }: {
  sheet: AtlasSheet
  sheets: AtlasSheet[]
  jobsiteId: string
  versionId: string
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
  const [color, setColor] = useState(COLORS[0])
  const [zoom, setZoom] = useState(1)
  const [drawing, setDrawing] = useState<[number, number][]>([])
  const [pdfUrl, setPdfUrl] = useState("")
  const surfaceRef = useRef<HTMLDivElement>(null)

  // A URL assinada é curta e vale para a leitura de agora; o pdf.js baixa o
  // documento uma vez e serve todas as folhas dele.
  useEffect(() => {
    let alive = true
    atlasService.versionDownloadUrl(versionId)
      .then(r => { if (alive) setPdfUrl(r.url) })
      .catch(() => {})
    return () => { alive = false }
  }, [versionId])

  const { width, height } = useMemo(() => ({
    width: Number(sheet.widthPt) || 3024,
    height: Number(sheet.heightPt) || 2160,
  }), [sheet.widthPt, sheet.heightPt])

  const index = sheets.findIndex(s => s.id === sheet.id)
  const prev = index > 0 ? sheets[index - 1] : null
  const next = index >= 0 && index < sheets.length - 1 ? sheets[index + 1] : null

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
    if (!drawing.length) return
    setDrawing(prevPoints => [...prevPoints, toNormalized(e)])
  }

  function handlePointerUp() {
    if (drawing.length < 2) { setDrawing([]); return }
    const stroke = tool === "highlighter" ? "highlighter" : "pen"
    const defaults = TOOL_DEFAULTS[stroke]
    createAnnotation.mutate({
      // O id nasce no cliente porque o traço precisa existir antes de a rede
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
        <Button size="icon" variant="ghost" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!next} onClick={() => next && onNavigate(next)}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {sheet.sheetNumber || `Page ${sheet.pageIndex + 1}`}
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
          <Button
            size="icon"
            variant="ghost"
            disabled={!pdfUrl}
            title="Download this plan"
            onClick={() => pdfUrl && downloadPlan(
              pdfUrl,
              sheet.pageIndex,
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
          className="relative mx-auto border border-border/60 bg-white"
          style={{ width: `${1100 * zoom}px`, aspectRatio: `${width} / ${height}` }}
        >
          {pdfUrl && (
            // A escala do render acompanha o zoom: ampliar redesenha o vetor em
            // vez de esticar o bitmap, que é o que mantém a cota legível numa
            // prancha de 42 polegadas.
            <PdfPage url={pdfUrl} pageIndex={sheet.pageIndex} scale={1.5 * zoom} />
          )}

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 h-full w-full touch-none select-none"
            style={{ cursor: canAnnotate && tool !== "erase" ? "crosshair" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
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
          </svg>
        </div>
      </div>
    </div>
  )
}
