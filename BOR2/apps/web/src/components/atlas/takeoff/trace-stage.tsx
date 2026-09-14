"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Stroke, TraceKind } from "./trace"
import { Eye, EyeOff, Maximize, Minus, Plus } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

// A tinta de cada coisa reconhecida. Fixa, e não do tema: o decalque é papel
// vegetal sobre a cópia, e papel é claro no modo escuro também.
export const KIND_STYLE: Record<TraceKind, { color: string; label: string; width: number; dash?: string }> = {
  wall:    { color: "#1d4ed8", label: "Walls",        width: 3 },
  window:  { color: "#0891b2", label: "Windows",      width: 3 },
  door:    { color: "#d97706", label: "Doors",        width: 3, dash: "0.06 0.035" },
  opening: { color: "#64748b", label: "Openings",     width: 2, dash: "0.04 0.04" },
  slope:   { color: "#dc2626", label: "Roof / slope", width: 2.5 },
  line:    { color: "#475569", label: "Other lines",  width: 1 },
}

export type Phase = "scanning" | "drawing" | "done"

// O desenho inteiro cabe em dez segundos, com vários lápis ao mesmo tempo.
// Um traço sozinho leva no máximo 1,2 s: mais que isso parece travado.
const TOTAL_MS = 10_000
const STROKE_MS = 1200
const PENS = 12
const MAX_ZOOM = 16

/** Um traço de mão: a reta com uma barriga leve e a ponta passando um pouco do fim. */
function sketch(s: Stroke, seed: number): string {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1
  const ux = (s.x2 - s.x1) / len
  const uy = (s.y2 - s.y1) / len
  const rnd = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453
    return x - Math.floor(x) - 0.5
  }
  const over = len * 0.02
  const bow = len * 0.006 * rnd(1) * 2
  const x1 = s.x1 - ux * over
  const y1 = s.y1 - uy * over
  const x2 = s.x2 + ux * over
  const y2 = s.y2 + uy * over
  const mx = (x1 + x2) / 2 - uy * bow
  const my = (y1 + y2) / 2 + ux * bow
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

/**
 * Quando cada traço começa e quanto dura. A ordem de desenho é mantida (o
 * primeiro traço começa primeiro), mas os inícios se espalham pelos dez
 * segundos e se sobrepõem: o traço longo dura mais, e ninguém espera ele acabar.
 */
function schedule(strokes: Stroke[]): { start: number; dur: number }[] {
  const n = strokes.length
  if (!n) return []
  const lens = strokes.map(s => Math.hypot(s.x2 - s.x1, s.y2 - s.y1))
  const longest = Math.max(...lens) || 1
  const window = TOTAL_MS - STROKE_MS
  return strokes.map((s, i) => {
    const dur = Math.max(180, STROKE_MS * Math.sqrt(lens[i] / longest)) * (s.kind === "line" ? 0.6 : 1)
    return { start: n === 1 ? 0 : (i / (n - 1)) * window, dur }
  })
}

export function TraceStage({ imageUrl, width, height, strokes, phase, runKey, onProgress, onDone }: {
  imageUrl: string
  width: number
  height: number
  strokes: Stroke[]
  phase: Phase
  /** Muda a cada "desenhar de novo", para a animação recomeçar. */
  runKey: number
  onProgress: (drawn: number) => void
  onDone: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const pathRefs = useRef<(SVGPathElement | null)[]>([])
  const badgeRefs = useRef<(SVGGElement | null)[]>([])
  const penRefs = useRef<(SVGGElement | null)[]>([])
  const [showPlan, setShowPlan] = useState(true)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = box.w ? Math.min((box.w - 32) / width, (box.h - 32) / height) : 0
  const scale = fit * view.zoom
  // A espessura vem em pixels de tela e é convertida para a unidade do recorte.
  const px = scale ? 1 / scale : 1

  const paths = useMemo(() => strokes.map((s, i) => sketch(s, i + 1)), [strokes])

  const callbacks = useRef({ onProgress, onDone })
  callbacks.current = { onProgress, onDone }

  useEffect(() => {
    if (phase !== "drawing" || !strokes.length) return
    const els = pathRefs.current
    const plan = schedule(strokes)
    const lengths = els.map(el => el?.getTotalLength() ?? 0)

    // O traço cresce como linha cheia e só ao fim ganha o tracejado da
    // categoria: animar um tracejado faz os pedaços correrem, em vez de o
    // lápis avançar.
    for (const el of els) if (el) el.style.strokeDasharray = "0 1"
    for (const b of badgeRefs.current) if (b) b.style.opacity = "0"
    const finished = new Uint8Array(strokes.length)

    const t0 = performance.now()
    let raf = 0
    let lastReport = 0
    let done = 0

    const frame = (now: number) => {
      const t = now - t0
      let pen = 0
      for (let i = 0; i < strokes.length; i++) {
        if (finished[i]) continue
        const { start, dur } = plan[i]
        if (t < start) break
        const el = els[i]
        const p = Math.min(1, (t - start) / dur)
        if (p >= 1) {
          finished[i] = 1
          done++
          if (el) el.style.strokeDasharray = KIND_STYLE[strokes[i].kind].dash ?? "1 0"
          const badge = badgeRefs.current[i]
          if (badge) badge.style.opacity = "1"
          continue
        }
        if (!el) continue
        el.style.strokeDasharray = `${p} 1`
        const g = penRefs.current[pen]
        if (g && strokes[i].kind !== "line") {
          const pt = el.getPointAtLength(lengths[i] * p)
          g.setAttribute("transform", `translate(${pt.x} ${pt.y})`)
          g.setAttribute("fill", KIND_STYLE[strokes[i].kind].color)
          g.style.opacity = "1"
          pen++
        }
      }
      for (let k = pen; k < PENS; k++) {
        const g = penRefs.current[k]
        if (g) g.style.opacity = "0"
      }
      if (now - lastReport > 90) {
        callbacks.current.onProgress(done)
        lastReport = now
      }
      if (done >= strokes.length) {
        callbacks.current.onProgress(strokes.length)
        callbacks.current.onDone()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, strokes, runKey])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView(v => {
      const zoom = Math.max(0.5, Math.min(MAX_ZOOM, v.zoom * factor))
      const k = zoom / v.zoom
      // O centro do papel fica em (box/2 + x, box/2 + y); o ponto sob o cursor não se move.
      const ox = cx - box.w / 2
      const oy = cy - box.h / 2
      return { zoom, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k }
    })
  }, [box.w, box.h])

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

  const w = width * scale
  const h = height * scale

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest("[data-stage-ui]")) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }))
      }}
      onPointerUp={() => { drag.current = null }}
    >
      <style>{`
        @keyframes takeoff-scan { from { transform: translateY(-100%) } to { transform: translateY(${Math.max(h, 1)}px) } }
      `}</style>
      {fit > 0 && (
        <div
          className="absolute overflow-hidden rounded-sm shadow-lg"
          style={{ left: (box.w - w) / 2 + view.x, top: (box.h - h) / 2 + view.y, width: w, height: h }}
        >
          {/* O fundo de papel existe com a prancha oculta também: sem ele o
              decalque ficaria solto sobre o cinza da página. */}
          <div className="absolute inset-0 bg-white" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full transition-[filter,opacity] duration-700"
            style={phase === "scanning"
              ? { filter: "none", opacity: 1 }
              : { filter: "grayscale(1)", opacity: showPlan ? 1 : 0 }}
          />

          {/* O papel vegetal: entra quando a leitura termina e o lápis começa. */}
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: phase === "scanning" ? 0 : 1,
              // Véu leve: a prancha de baixo tem de continuar legível, ou o
              // decalque não tem contra o que ser conferido.
              background: "rgb(248 250 252 / 0.3)",
              backgroundImage:
                "linear-gradient(rgb(29 78 216 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(29 78 216 / 0.06) 1px, transparent 1px)",
              backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
            }}
          />

          {phase === "scanning" && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-x-0 top-0 h-24"
                style={{
                  background: "linear-gradient(to bottom, transparent, rgb(29 78 216 / 0.18) 85%, rgb(29 78 216 / 0.9) 99%, transparent)",
                  animation: "takeoff-scan 1.6s cubic-bezier(.45,.05,.55,.95) infinite",
                }}
              />
            </div>
          )}

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: phase === "scanning" ? 0 : 1 }}
            aria-hidden="true"
          >
            {strokes.map((s, i) => {
              const st = KIND_STYLE[s.kind]
              return (
                <path
                  key={`${runKey}-${s.id}`}
                  ref={el => { pathRefs.current[i] = el }}
                  d={paths[i]}
                  pathLength={1}
                  fill="none"
                  stroke={st.color}
                  strokeOpacity={s.kind === "line" ? 0.55 : 0.95}
                  strokeWidth={st.width * px}
                  strokeLinecap="round"
                  strokeDasharray={phase === "done" ? st.dash ?? "1 0" : "0 1"}
                />
              )
            })}
            {strokes.map((s, i) => {
              if (s.kind !== "door" && s.kind !== "window") return null
              const st = KIND_STYLE[s.kind]
              return (
                <g
                  key={`b-${runKey}-${s.id}`}
                  ref={el => { badgeRefs.current[i] = el }}
                  transform={`translate(${(s.x1 + s.x2) / 2} ${(s.y1 + s.y2) / 2})`}
                  style={{ opacity: phase === "done" ? 1 : 0, transition: "opacity 250ms" }}
                >
                  <circle r={9 * px} fill="#fff" stroke={st.color} strokeWidth={1.5 * px} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={10 * px} fontWeight={700} fill={st.color}>
                    {s.kind === "door" ? "D" : "W"}
                  </text>
                </g>
              )
            })}
            {Array.from({ length: PENS }, (_, k) => (
              <g key={k} ref={el => { penRefs.current[k] = el }} style={{ opacity: 0 }}>
                <circle r={9 * px} fillOpacity={0.15} />
                <circle r={3 * px} />
              </g>
            ))}
          </svg>
        </div>
      )}

      <div
        data-stage-ui
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-md backdrop-blur"
      >
        <StageButton label={showPlan ? "Hide plan underneath" : "Show plan underneath"} active={!showPlan} onClick={() => setShowPlan(v => !v)}>
          {showPlan ? <Eye /> : <EyeOff />}
        </StageButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <StageButton label="Zoom out" onClick={() => zoomAt(1 / 1.5, box.w / 2, box.h / 2)}>
          <Minus />
        </StageButton>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.zoom * 100)}%</span>
        <StageButton label="Zoom in" onClick={() => zoomAt(1.5, box.w / 2, box.h / 2)}>
          <Plus />
        </StageButton>
        <StageButton label="Fit area" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
          <Maximize />
        </StageButton>
      </div>
    </div>
  )
}

export function StageButton({ label, active, onClick, children }: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant={active ? "secondary" : "ghost"}
            className={`h-8 w-8 ${active ? "text-primary" : ""}`}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
