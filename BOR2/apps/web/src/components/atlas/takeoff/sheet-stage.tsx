"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import type { AreaPt } from "./run-trace"
import { StageButton } from "./trace-stage"
import { Hand, Maximize, Minus, Plus, SquareDashed } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

type Tool = "pan" | "area"

const MAX_ZOOM = 64

/**
 * A prancha inteira, para escolher o trecho que vai ser decalcado.
 *
 * O desenho é o do leitor de plantas (`PlanCanvas`): fundo esticado e pedaço
 * nítido por cima, então dá para ampliar até ler a cota. Arrastar move a
 * prancha, a roda amplia no cursor, e marcar a área é ferramenta própria (ou
 * Shift + arrastar), porque arrastar para ler e arrastar para marcar não podem
 * disputar o mesmo gesto.
 */
export function SheetStage({ url, pageIndex, area, onArea }: {
  url: string
  pageIndex: number
  area: AreaPt | null
  onArea: (area: AreaPt | null) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [pagePt, setPagePt] = useState<{ w: number; h: number } | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [view, setView] = useState<PlanView | null>(null)
  const [tool, setTool] = useState<Tool>("pan")
  const [draft, setDraft] = useState<AreaPt | null>(null)
  const drag = useRef<{ mode: Tool; sx: number; sy: number; vx: number; vy: number; ax: number; ay: number } | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    setState("loading")
    setPagePt(null)
    setView(null)
    setDraft(null)
    loadPdf(url)
      .then(pdf => pdf.getPage(pageIndex + 1))
      .then(page => {
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        setPagePt({ w: base.width, h: base.height })
      })
      .catch(() => { if (!cancelled) setState("error") })
    return () => { cancelled = true }
  }, [url, pageIndex])

  const fitScale = pagePt && box.w ? Math.min((box.w - 32) / pagePt.w, (box.h - 32) / pagePt.h) : 0

  const fitView = useCallback((): PlanView | null => {
    if (!pagePt || !fitScale) return null
    return { scale: fitScale, x: (box.w - pagePt.w * fitScale) / 2, y: (box.h - pagePt.h * fitScale) / 2 }
  }, [pagePt, fitScale, box.w, box.h])

  useEffect(() => {
    if (!view) setView(fitView())
  }, [view, fitView])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView(v => {
      if (!v || !fitScale) return v
      const scale = Math.max(fitScale * 0.5, Math.min(fitScale * MAX_ZOOM, v.scale * factor))
      const k = scale / v.scale
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }, [fitScale])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  const toPt = (clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el || !view || !pagePt) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(pagePt.w, (clientX - r.left - view.x) / view.scale)),
      y: Math.max(0, Math.min(pagePt.h, (clientY - r.top - view.y) / view.scale)),
    }
  }

  // Referências estáveis, como no leitor de Documents: o `PlanCanvas` redesenha
  // a folha inteira quando `onFail` muda, e uma função nova a cada quadro do
  // arraste fazia isso sessenta vezes por segundo.
  const markReady = useCallback(() => setState("ready"), [])
  const markFailed = useCallback(() => setState("error"), [])

  const shown = draft ?? area

  return (
    <div
      ref={boxRef}
      className={`absolute inset-0 touch-none overflow-hidden select-none ${
        tool === "area" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
      onPointerDown={e => {
        if (!view || !pagePt || (e.target as HTMLElement).closest("[data-stage-ui]")) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const mode: Tool = e.button === 1 ? "pan" : e.shiftKey ? "area" : tool
        const p = toPt(e.clientX, e.clientY)
        drag.current = { mode, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, ax: p.x, ay: p.y }
        if (mode === "area") setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        if (d.mode === "pan") {
          setView(v => v && { ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })
          return
        }
        const p = toPt(e.clientX, e.clientY)
        setDraft({ x: Math.min(d.ax, p.x), y: Math.min(d.ay, p.y), w: Math.abs(p.x - d.ax), h: Math.abs(p.y - d.ay) })
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d?.mode !== "area") return
        // Um clique solto não é área. O mínimo é em tela, e não no papel: com a
        // prancha ampliada, um cômodo pequeno é uma área legítima.
        if (draft && view && draft.w * view.scale > 12 && draft.h * view.scale > 12) {
          onArea(draft)
          setTool("pan")
        } else {
          onArea(null)
        }
        setDraft(null)
      }}
    >
      {view && pagePt && box.w > 0 && (
        <PlanCanvas
          url={url}
          pageIndex={pageIndex}
          view={view}
          width={box.w}
          height={box.h}
          pageWidth={pagePt.w}
          pageHeight={pagePt.h}
          onReady={markReady}
          onFail={markFailed}
        />
      )}

      {shown && view && pagePt && (
        // O resto da folha escurece, e só o trecho marcado fica aceso.
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            fillRule="evenodd"
            fill="rgb(0 0 0 / 0.45)"
            d={`M${view.x} ${view.y}h${pagePt.w * view.scale}v${pagePt.h * view.scale}h${-pagePt.w * view.scale}Z M${view.x + shown.x * view.scale} ${view.y + shown.y * view.scale}h${shown.w * view.scale}v${shown.h * view.scale}h${-shown.w * view.scale}Z`}
          />
          <rect
            x={view.x + shown.x * view.scale}
            y={view.y + shown.y * view.scale}
            width={shown.w * view.scale}
            height={shown.h * view.scale}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </svg>
      )}

      <div
        data-stage-ui
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-md backdrop-blur"
      >
        <StageButton label="Pan: drag the plan" active={tool === "pan"} onClick={() => setTool("pan")}>
          <Hand />
        </StageButton>
        <StageButton label="Mark area (or Shift + drag)" active={tool === "area"} onClick={() => setTool("area")}>
          <SquareDashed />
        </StageButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <StageButton label="Zoom out" onClick={() => zoomAt(1 / 1.5, box.w / 2, box.h / 2)}>
          <Minus />
        </StageButton>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {view && fitScale ? `${Math.round((view.scale / fitScale) * 100)}%` : ""}
        </span>
        <StageButton label="Zoom in" onClick={() => zoomAt(1.5, box.w / 2, box.h / 2)}>
          <Plus />
        </StageButton>
        <StageButton label="Fit sheet" onClick={() => setView(fitView())}>
          <Maximize />
        </StageButton>
      </div>

      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {state === "loading" ? "Rendering sheet…" : "Could not render this page"}
        </div>
      )}
    </div>
  )
}
