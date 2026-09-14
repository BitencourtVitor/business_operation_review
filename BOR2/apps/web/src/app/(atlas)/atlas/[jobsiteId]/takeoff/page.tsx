"use client"

import { aiTakeoff } from "@/components/atlas/takeoff/ai-takeoff"
import { DictionaryPanel } from "@/components/atlas/takeoff/dictionary-panel"
import { SheetStage } from "@/components/atlas/takeoff/sheet-stage"
import { renderCrop, runTrace, type AreaPt, type Crop } from "@/components/atlas/takeoff/run-trace"
import {
  buildDictionary, crossCheck, strokesFrom, vectorLines, vectorTakeoff, type TakeoffElement,
} from "@/components/atlas/takeoff/takeoff-model"
import { readVectors } from "@/components/atlas/takeoff/vector-read"
import { drawingOrder, type Stroke, type TraceKind } from "@/components/atlas/takeoff/trace"
import { KIND_STYLE, StageButton, TraceStage, type Phase } from "@/components/atlas/takeoff/trace-stage"
import { formatarArea, formatarPes, lerEscala } from "@/components/atlas/tape-measure"
import { usePlanSource } from "@/components/atlas/use-plan-url"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useAtlasDocuments, useAtlasJobsite, useAtlasSheets, useAtlasThumbs } from "@/hooks/use-atlas"
import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import type { AtlasSheet } from "@/services/atlas.service"
import { takeoffService, type TakeoffAIUsage } from "@/services/atlas-takeoff.service"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FolderOpen, Loader2, MousePointerSquareDashed, PanelLeftClose, PanelLeftOpen,
  PenTool, RotateCcw, Ruler, Sparkles, Spline,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Takeoff, protótipo.
 *
 * Escolhe-se a prancha, marca-se o trecho, e o trecho vira decalque: a cópia
 * vai para baixo de um papel vegetal e os traços que a leitura reconhece
 * (parede, janela, porta, telhado) são passados a lápis, um de cada vez. Com o
 * desenho em vetor, a medida sai da escala da folha.
 *
 * Nada aqui é gravado. É para ver se a leitura serve antes de decidir onde ela
 * mora e o que ela guarda.
 */

// Escalas de arquitetura, em pontos de papel por pé: 1/4" = 1'-0" é 18 pt.
const SCALES = [
  { label: '1" = 1\'-0"', ptPerFt: 72 },
  { label: '1/2" = 1\'-0"', ptPerFt: 36 },
  { label: '3/8" = 1\'-0"', ptPerFt: 27 },
  { label: '1/4" = 1\'-0"', ptPerFt: 18 },
  { label: '3/16" = 1\'-0"', ptPerFt: 13.5 },
  { label: '1/8" = 1\'-0"', ptPerFt: 9 },
  { label: '1/16" = 1\'-0"', ptPerFt: 4.5 },
]

const MIN_SCAN_MS = 1400
const NO_NEIGHBOURS: AtlasSheet[] = []

/**
 * As duas leituras do trecho (ATL-103). Vector lê o desenho como dado: linha,
 * texto e a forma em volta de cada tag, cruzados com o dicionário do set. AI
 * manda o trecho ao modelo em pedaços de dez polegadas e resolução ultra_high,
 * com o mesmo dicionário junto.
 */
type TakeoffMode = "vector" | "ai"

export default function TakeoffPage() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const { user } = useAuth()
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: documents } = useAtlasDocuments(jobsiteId)

  const [documentId, setDocumentId] = useState("")
  const doc = documents?.find(d => d.id === documentId)
  const versionId = doc?.latestVersionId ?? ""
  const { data: sheets } = useAtlasSheets(versionId)
  const { data: thumbs } = useAtlasThumbs(versionId)
  const [sheetId, setSheetId] = useState("")
  const sheet = sheets?.find(s => s.id === sheetId)

  useEffect(() => {
    if (!documentId && documents?.length) setDocumentId(documents[0].id)
  }, [documents, documentId])

  const [area, setArea] = useState<AreaPt | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [phase, setPhase] = useState<Phase | null>(null)
  const [drawn, setDrawn] = useState(0)
  const [runKey, setRunKey] = useState(0)
  const [error, setError] = useState("")
  const [scaleChoice, setScaleChoice] = useState("sheet")
  const [wallHeight, setWallHeight] = useState("8")
  const [panelOpen, setPanelOpen] = useState(true)
  const [mode, setMode] = useState<TakeoffMode>("vector")
  const [elements, setElements] = useState<TakeoffElement[]>([])
  const [usage, setUsage] = useState<(TakeoffAIUsage & { tiles: number }) | null>(null)
  const [progress, setProgress] = useState("")

  const dictionary = useQuery({
    queryKey: ["atlas", "takeoff-dictionary", documentId],
    queryFn: () => takeoffService.dictionary(documentId),
    enabled: !!documentId,
    refetchInterval: q => q.state.data?.extraction?.state === "running" ? 3000 : false,
  })
  const refetchDictionary = dictionary.refetch
  const onDictionaryChanged = useCallback(() => { void refetchDictionary() }, [refetchDictionary])

  const sheetScale = useMemo(() => {
    if (!sheet) return null
    const u = Number(sheet.scaleUnitsPerPt)
    if (u > 0) return { ptPerFt: 1 / u, label: sheet.scaleLabel || "calibrated" }
    const local = lerEscala(sheet.id)
    return local ? { ptPerFt: local.ptPorPe, label: local.rotulo } : null
  }, [sheet])

  // Só ao trocar de folha: a lista se recarrega ao voltar à aba, e isso não pode
  // desfazer a escala que a pessoa acabou de escolher.
  const hasSheetScale = !!sheetScale
  useEffect(() => {
    setScaleChoice(hasSheetScale ? "sheet" : "")
  }, [sheetId, hasSheetScale])

  const ptPerFt = scaleChoice === "sheet"
    ? sheetScale?.ptPerFt ?? null
    : Number(scaleChoice) > 0 ? Number(scaleChoice) : null

  const scaleLabel = scaleChoice === "sheet" && sheetScale
    ? `Sheet calibration (${sheetScale.label})`
    : SCALES.find(s => String(s.ptPerFt) === scaleChoice)?.label ?? "No scale"

  function pickSheet(s: AtlasSheet) {
    setSheetId(s.id)
    backToSheet()
  }

  function backToSheet() {
    setArea(null)
    setPhase(null)
    setStrokes([])
    setElements([])
    setUsage(null)
    setProgress("")
    setDrawn(0)
    setError("")
    setCrop(c => {
      if (c) URL.revokeObjectURL(c.url)
      return null
    })
  }

  // Protótipo do desenvolvedor: quem chega pelo endereço não vê a ferramenta.
  if (user && user.role !== "dev") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Ruler className="h-8 w-8" />
        Takeoff is coming soon.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* O painel recolhe para a prancha ficar com a largura toda: é nela que se
          lê a cota e se confere o traço. */}
      <aside className={`${panelOpen ? "flex" : "hidden"} w-full shrink-0 flex-col gap-5 overflow-y-auto lg:w-80`}>
        <div>
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Takeoff</h1>
            <Badge variant="outline" className="ml-auto">Prototype</Badge>
            <StageButton label="Hide panel" onClick={() => setPanelOpen(false)}>
              <PanelLeftClose />
            </StageButton>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {jobsite?.name ?? "Jobsite"}: pick a plan, mark an area and let it trace walls, openings and roof lines.
          </p>
        </div>

        <section className="flex shrink-0 flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">1. Plan</Label>
          <Select
            value={documentId}
            onValueChange={v => { if (!v) return; setDocumentId(v); setSheetId(""); backToSheet() }}
          >
            <SelectTrigger className="w-full">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc?.name ?? "Choose a document"}</span>
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {(documents ?? []).map(d => (
                <SelectItem key={d.id} value={d.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{d.sheets} pages</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid max-h-80 auto-rows-max grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
            {(sheets ?? []).map(s => {
              const thumb = thumbs?.get(s.id)
              const active = s.id === sheetId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSheet(s)}
                  className={`group flex flex-col overflow-hidden rounded-md border text-left transition-colors ${
                    active ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30"
                  }`}
                >
                  <div className="aspect-[3/2] w-full bg-white">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-contain" loading="lazy" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 text-[11px]">
                    <span className="truncate font-medium">{s.sheetNumber || "No number"}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">p. {s.pageIndex + 1}</span>
                  </div>
                </button>
              )
            })}
            {doc && !sheets?.length && (
              <p className="col-span-2 text-xs text-muted-foreground">No plans in this document yet.</p>
            )}
          </div>
        </section>

        <section className="flex shrink-0 flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">2. Scale</Label>
          <Select value={scaleChoice || "none"} onValueChange={v => setScaleChoice(!v || v === "none" ? "" : v)}>
            <SelectTrigger className="w-full">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                <Ruler className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{scaleLabel}</span>
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {sheetScale
                ? <SelectItem value="sheet">Sheet calibration ({sheetScale.label})</SelectItem>
                : <SelectItem value="none">No scale</SelectItem>}
              {SCALES.map(s => (
                <SelectItem key={s.ptPerFt} value={String(s.ptPerFt)}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="wall-height" className="text-xs text-muted-foreground">Wall height (ft)</Label>
            <Input
              id="wall-height"
              className="ml-auto h-8 w-20"
              inputMode="decimal"
              value={wallHeight}
              onChange={e => setWallHeight(e.target.value)}
            />
          </div>
        </section>

        {documentId && (
          <DictionaryPanel
            documentId={documentId}
            versionId={versionId}
            data={dictionary.data}
            onChanged={onDictionaryChanged}
          />
        )}

        {phase && (
          <Results
            strokes={strokes}
            drawn={phase === "done" ? strokes.length : drawn}
            crop={crop}
            area={area}
            ptPerFt={ptPerFt}
            wallHeight={Number(wallHeight) || 0}
            phase={phase}
            elements={elements}
            usage={usage}
          />
        )}
      </aside>

      <section className="relative min-h-[460px] flex-1 overflow-hidden rounded-lg border bg-muted/40">
        {!panelOpen && (
          <div className="absolute left-3 top-3 z-10 rounded-md border bg-background/90 shadow-sm backdrop-blur">
            <StageButton label="Show panel" onClick={() => setPanelOpen(true)}>
              <PanelLeftOpen />
            </StageButton>
          </div>
        )}

        {!sheet && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MousePointerSquareDashed className="h-8 w-8" />
            Pick a plan on the left to start.
          </div>
        )}

        {sheet && !phase && (
          <PlanArea sheet={sheet} area={area} onArea={setArea} onTrace={trace} error={error} inset={!panelOpen} mode={mode} onMode={setMode} />
        )}

        {sheet && phase && crop && (
          <>
            <TraceStage
              imageUrl={crop.url}
              width={crop.width}
              height={crop.height}
              strokes={strokes}
              phase={phase}
              runKey={runKey}
              onProgress={setDrawn}
              onDone={() => setPhase("done")}
            />
            <div className={`absolute top-3 flex items-center gap-2 ${panelOpen ? "left-3" : "left-14"}`}>
              <Button size="sm" variant="secondary" onClick={backToSheet}>
                <ArrowLeft /> Back to sheet
              </Button>
              {phase === "done" && (
                <Button size="sm" variant="secondary" onClick={() => { setDrawn(0); setRunKey(k => k + 1); setPhase("drawing") }}>
                  <RotateCcw /> Replay
                </Button>
              )}
            </div>
            <div className="absolute right-3 top-3 rounded-md border bg-background/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
              {phase === "scanning" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress || "Reading the drawing…"}
                </span>
              )}
              {phase === "drawing" && <span>Tracing {drawn} / {strokes.length}</span>}
              {phase === "done" && <span>{strokes.length} vectors traced</span>}
            </div>
          </>
        )}
      </section>
    </div>
  )

  async function trace(source: { url: string; pageIndex: number }) {
    if (!area || !sheet) return
    setError("")
    setDrawn(0)
    setElements([])
    setUsage(null)
    setProgress("")
    try {
      const c = await renderCrop(source.url, source.pageIndex, area)
      setCrop(c)
      setPhase("scanning")
      const started = performance.now()
      const dic = buildDictionary(dictionary.data?.terms ?? [])
      const read = await readVectors(source.url, source.pageIndex, area)

      let found: Stroke[]
      if (mode === "ai") {
        const result = await aiTakeoff({
          sheetId: sheet.id, pdfUrl: source.url, pageIndex: source.pageIndex, area, read,
          onProgress: (done, total) => setProgress(`Reading with AI · piece ${Math.min(done + 1, total)} of ${total}`),
        })
        found = strokesFrom(result.elements, result.lines, area, c.pxPerPt)
        setElements(crossCheck(result.elements, dic, ptPerFt))
        setUsage(result.usage)
      } else if (read.segs.length === 0) {
        // Set escaneado não tem vetor: a leitura por pixel ainda dá o decalque.
        found = await runTrace({ width: c.width, height: c.height, gray: c.gray, pxPerPt: c.pxPerPt, ptPerFt })
      } else {
        const { elements: found_, outlines } = vectorTakeoff(read, area, dic)
        found = strokesFrom(found_, vectorLines(read, area, outlines), area, c.pxPerPt)
        setElements(crossCheck(found_, dic, ptPerFt))
      }

      const wait = MIN_SCAN_MS - (performance.now() - started)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      setStrokes(drawingOrder(found))
      setRunKey(k => k + 1)
      setPhase("drawing")
    } catch (err) {
      console.error("takeoff", err)
      setError(err instanceof ApiError ? err.message : "Could not read this area.")
      setPhase(null)
    }
  }
}

function PlanArea({ sheet, area, onArea, onTrace, error, inset, mode, onMode }: {
  sheet: AtlasSheet
  area: AreaPt | null
  onArea: (area: AreaPt | null) => void
  onTrace: (source: { url: string; pageIndex: number }) => void
  error: string
  /** Deixa a quina esquerda livre para o botão que reabre o painel. */
  inset: boolean
  mode: TakeoffMode
  onMode: (mode: TakeoffMode) => void
}) {
  const source = usePlanSource(sheet, NO_NEIGHBOURS)
  const pageIndex = source?.whole ? sheet.pageIndex : 0
  const [busy, setBusy] = useState(false)

  if (!source) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening plan…
      </div>
    )
  }

  return (
    <>
      <SheetStage url={source.url} pageIndex={pageIndex} area={area} onArea={onArea} />
      <div className={`pointer-events-none absolute right-3 top-3 flex items-start justify-between gap-2 ${inset ? "left-14" : "left-3"}`}>
        <div className="rounded-md border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {busy
            ? "Rendering the area at full resolution…"
            : area ? "Area marked. Shift + drag to mark it again." : "Drag to move, scroll to zoom. Mark the area with the dashed-square tool or Shift + drag."}
          {error && <span className="ml-2 text-destructive">{error}</span>}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <div role="radiogroup" aria-label="Takeoff format" className="flex items-center rounded-md border bg-background/90 p-0.5 shadow-sm backdrop-blur">
            {([
              { value: "vector", label: "Vector", Icon: Spline },
              { value: "ai", label: "AI", Icon: Sparkles },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => onMode(value)}
                className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!area || busy}
            onClick={async () => {
              setBusy(true)
              try { await onTrace({ url: source.url, pageIndex }) } finally { setBusy(false) }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <PenTool />} Trace area
          </Button>
        </div>
      </div>
    </>
  )
}

const ORDER: TraceKind[] = ["wall", "window", "door", "opening", "slope", "line"]

function Results({ strokes, drawn, crop, area, ptPerFt, wallHeight, phase, elements, usage }: {
  strokes: Stroke[]
  drawn: number
  crop: Crop | null
  area: AreaPt | null
  ptPerFt: number | null
  wallHeight: number
  phase: Phase
  elements: TakeoffElement[]
  usage: (TakeoffAIUsage & { tiles: number }) | null
}) {
  // A contagem acompanha o lápis: o que ainda não foi desenhado não entra.
  const visible = strokes.slice(0, drawn)
  const ft = (s: Stroke) =>
    crop && ptPerFt ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / crop.pxPerPt / ptPerFt : 0

  const rows = ORDER.map(kind => {
    const items = visible.filter(s => s.kind === kind)
    return { kind, count: items.length, length: items.reduce((sum, s) => sum + ft(s), 0) }
  })
  const by = Object.fromEntries(rows.map(r => [r.kind, r])) as Record<TraceKind, (typeof rows)[number]>

  const wallLF = by.wall.length
  const studs = wallLF ? Math.ceil(wallLF / (16 / 12)) + by.wall.count : 0
  const windowArea = by.window.length * 4
  const doorArea = by.door.count * 20
  const drywall = Math.max(0, wallLF * wallHeight * 2 - (windowArea + doorArea) * 2)
  const areaSqFt = area && ptPerFt ? (area.w / ptPerFt) * (area.h / ptPerFt) : 0

  return (
    <section className="flex shrink-0 flex-col gap-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">3. Takeoff</Label>
      <div className="overflow-hidden rounded-md border">
        {rows.map(r => (
          <div key={r.kind} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_STYLE[r.kind].color }} />
            <span>{KIND_STYLE[r.kind].label}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{r.count}</span>
            {ptPerFt && r.kind !== "door" && r.kind !== "opening" && (
              <span className="w-24 text-right font-mono text-xs tabular-nums">{formatarPes(r.length)}</span>
            )}
          </div>
        ))}
      </div>

      {!ptPerFt && (
        <p className="text-xs text-muted-foreground">
          Choose a scale above to turn the traced vectors into feet and material.
        </p>
      )}

      {ptPerFt && (
        <div className={`overflow-hidden rounded-md border transition-opacity ${phase === "done" ? "opacity-100" : "opacity-60"}`}>
          <div className="border-b bg-muted/50 px-3 py-1.5 text-xs font-medium">Material estimate</div>
          <Line label="Selected area" value={formatarArea(areaSqFt)} />
          <Line label="Wall length" value={formatarPes(wallLF)} />
          <Line label='Studs @ 16" o.c.' value={studs.toLocaleString("en-US")} />
          <Line label="Plates (1 bottom + 2 top)" value={formatarPes(wallLF * 3)} />
          <Line label="Drywall, both sides" value={formatarArea(drywall)} />
          <Line label="Roof / slope edge" value={formatarPes(by.slope.length)} />
        </div>
      )}
      {phase === "done" && <ElementList elements={elements} usage={usage} />}

      <p className="text-[11px] leading-snug text-muted-foreground">
        Prototype reading: wall length follows the traced centerlines, windows assume 4 ft of
        height and doors 20 sq ft. Review the tracing before ordering.
      </p>
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
  )
}

/** O que a leitura identificou, com o motivo de cada coisa que precisa de conferência. */
function ElementList({ elements, usage }: {
  elements: TakeoffElement[]
  usage: (TakeoffAIUsage & { tiles: number }) | null
}) {
  const toReview = elements.filter(e => e.review.length).length
  const groups = new Map<string, TakeoffElement[]>()
  for (const e of elements) groups.set(e.category, [...(groups.get(e.category) ?? []), e])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Elements</span>
        <span className="tabular-nums text-muted-foreground">{elements.length}</span>
        {toReview > 0 && (
          <Badge variant="outline" className="ml-auto gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> {toReview} to review
          </Badge>
        )}
      </div>
      {elements.length === 0 && (
        <p className="text-xs text-muted-foreground">No tagged element found in this area.</p>
      )}
      {[...groups].map(([category, list]) => (
        <div key={category} className="overflow-hidden rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs font-medium capitalize">
            {category.replace(/_/g, " ")}
            <span className="ml-auto tabular-nums text-muted-foreground">{list.length}</span>
          </div>
          <div className="max-h-56 divide-y overflow-y-auto">
            {list.map(e => (
              <div key={e.id} className="flex flex-col gap-0.5 px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {e.review.length
                    ? <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                    : <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
                  <span className="font-mono font-semibold">{e.tag || "No tag"}</span>
                  {e.units !== undefined && <span className="text-muted-foreground">{e.units} u</span>}
                  {e.substrate && <span className="text-muted-foreground">{e.substrate}</span>}
                  {e.confidence !== undefined && (
                    <span className="ml-auto tabular-nums text-muted-foreground">{Math.round(e.confidence * 100)}%</span>
                  )}
                </div>
                {e.meaning && <span className="truncate pl-5 text-muted-foreground">{e.meaning}</span>}
                {e.review.map(r => (
                  <span key={r} className="pl-5 text-[11px] text-amber-600 dark:text-amber-400">{r}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      {usage && (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          AI: {usage.tiles} {usage.tiles === 1 ? "piece" : "pieces"} · {usage.input.toLocaleString("en-US")} in ·{" "}
          {(usage.output + usage.thoughts).toLocaleString("en-US")} out · US$ {usage.costUsd.toFixed(3)}
        </p>
      )}
    </div>
  )
}
