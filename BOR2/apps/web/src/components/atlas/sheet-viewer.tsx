"use client"

import { downloadPlan } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import { findInPlan, type TextHit } from "@/components/atlas/plan-text"
import { atlasService } from "@/services/atlas.service"
import { usePlanSource } from "@/components/atlas/use-plan-url"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Kbd } from "@/components/ui/kbd"
import { KIND_META, placeLabel } from "@/components/atlas/jobsite-form-dialog"
import {
  useAtlasAnnotations, useAtlasEvents, useAtlasJobsite,
  useCreateAtlasEvent, useDeleteAtlasAnnotation, useUpdateAtlasEvent,
} from "@/hooks/use-atlas"
import type { AtlasAnnotation, AtlasSheet, AtlasStrokeGeometry } from "@/services/atlas.service"
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download, Eraser, Hand,
  Highlighter, Maximize, MapPin, Minus, Pen, Plus, Search, User, Users, X,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

type Tool = "pan" | "pen" | "highlighter" | "pin" | "erase"

// A letra é a inicial do nome da ferramenta, para não haver o que decorar. No
// desktop ela aparece dentro do botão: quem lê a prancha o dia inteiro não
// larga o desenho para ir até a barra a cada troca de ferramenta.
// A ferramenta selecionada abre e diz o que o gesto faz. Um ícone de mão não
// ensina que arrastar desloca e que a roda amplia: quem chega na tela pela
// primeira vez tem de descobrir por tentativa.
const TOOLS = [
  { value: "pan",         key: "h", label: "Hand",     hint: "Drag to move, scroll to zoom", icon: Hand },
  { value: "pen",         key: "p", label: "Pen",      hint: "Draw over the sheet",          icon: Pen },
  { value: "highlighter", key: "m", label: "Marker",   hint: "Highlight over the sheet",     icon: Highlighter },
  { value: "pin",         key: "n", label: "Note pin", hint: "Tap the sheet to open a note", icon: MapPin },
  { value: "erase",       key: "e", label: "Eraser",   hint: "Tap a stroke or a pin",        icon: Eraser },
] as const satisfies readonly {
  value: Tool; key: string; label: string; hint: string; icon: React.ElementType
}[]

// Duas paletas, porque são dois gestos. A caneta escreve por cima do desenho e
// precisa de cor cheia que se leia sobre traço preto; o marca-texto passa por
// baixo da leitura e precisa de cor clara, que realce sem esconder. Misturar as
// duas dava marca-texto vermelho-sangue tapando a cota.
// Laranja não entra em paleta nenhuma: é a cor da nota, e uma cor que quer dizer
// "há algo a resolver aqui" só funciona se não aparecer também em traço solto.
const NOTE_COLOR = "#f97316"

const PEN_COLORS = [
  { value: "#dc2626", label: "Red" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#111827", label: "Ink" },
]

const MARKER_COLORS = [
  { value: "#d4ff3f", label: "Highlighter" },
  { value: "#fde047", label: "Yellow" },
  { value: "#4ade80", label: "Green" },
  { value: "#38bdf8", label: "Sky" },
  { value: "#f472b6", label: "Pink" },
]

// Cada ferramenta guarda a própria tinta. Antes era um estado só para as duas, e
// bastava regular a espessura de uma para a outra herdá-la.
interface Ink { color: string; width: number; shared: boolean }

// Nasce privado. Anotar é pensar em voz alta sobre o desenho, e se cada rabisco
// caísse na prancha de todo mundo por padrão a folha encheria de conferência
// alheia até ninguém mais anotar nada. Quem quer que a equipe veja, diz antes.
const PEN_INK: Ink = { color: PEN_COLORS[0].value, width: 1, shared: false }
const MARKER_INK: Ink = { color: MARKER_COLORS[0].value, width: 6, shared: false }

// A opacidade não se regula: é ela que define o que cada ferramenta é. Caneta é
// tinta, e tinta cobre; marca-texto passa por cima e deixa ler o que está
// embaixo. Deixar isso solto só criava caneta apagada e marca-texto tapando a
// cota, que são as duas ferramentas erradas.
const TOOL_OPACITY = { pen: 1, highlighter: 0.35 } as const

// Espessura medida no papel, e não em pixels de tela: o traço pertence à
// prancha, então ele acompanha o zoom como acompanharia se tivesse sido feito à
// mão sobre o papel impresso.
//
// A folha é de 42x30 polegadas. Uma caneta fina de verdade rende perto de meio
// milímetro, um marca-texto rende um centímetro, e é essa proporção que estes
// números guardam. Antes o marca-texto multiplicava a largura por seis e ainda
// passava pela escala da página: o tamanho maior saía com um oitavo da altura
// da prancha, uma tarja e não um traço.
const PEN_WIDTHS = [0.5, 1, 2, 3]
const MARKER_WIDTHS = [3, 6, 9, 12]

// O zoom é relativo ao enquadramento inicial: 100% é a prancha inteira na tela.
// O teto alto não custa memória porque só a área visível é rasterizada, e é ele
// que permite ler a cota impressa em corpo 6 numa folha de 42 polegadas.
//
// O piso é 75% porque abaixo disso a folha já cabe inteira com sobra: só afasta
// a prancha e a deixa ilegível no meio de uma tela vazia.
// Espera entre as tentativas de gravar um traço, em segundos. Cresce para não
// martelar uma rede que já está ruim, e para de crescer em meio minuto porque
// obra recupera sinal em ondas: passar de um minuto seria desistir cedo demais
// e tarde demais ao mesmo tempo.
const RETRY_STEPS = [2, 5, 10, 20, 30]

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
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: annotations, refetch: refetchAnnotations } = useAtlasAnnotations(sheet.id)
  const { data: events } = useAtlasEvents(jobsiteId, sheet.id)
  const deleteAnnotation = useDeleteAtlasAnnotation(sheet.id)
  const createEvent = useCreateAtlasEvent(jobsiteId, sheet.id)
  const updateEvent = useUpdateAtlasEvent(jobsiteId, sheet.id)

  const [tool, setTool] = useState<Tool>("pan")
  const [penInk, setPenInk] = useState<Ink>(PEN_INK)
  const [markerInk, setMarkerInk] = useState<Ink>(MARKER_INK)
  const marking = tool === "highlighter"
  const ink = marking ? markerInk : penInk
  const setInk = (patch: Partial<Ink>) =>
    (marking ? setMarkerInk : setPenInk)(current => ({ ...current, ...patch }))
  const { color, width, shared } = ink
  const opacity = marking ? TOOL_OPACITY.highlighter : TOOL_OPACITY.pen
  const palette = marking ? MARKER_COLORS : PEN_COLORS
  const widths = marking ? MARKER_WIDTHS : PEN_WIDTHS
  const [drawing, setDrawing] = useState<[number, number][]>([])
// Traços já feitos e ainda não confirmados pelo banco. O traço nasce aqui e só
  // sai quando a listagem do servidor passa a trazê-lo: antes disso ele sumia da
  // tela no instante em que a mão saía do papel e voltava um segundo depois,
  // quando a resposta chegava. Desenhar não pode piscar.
  //
  // Enquanto estiver aqui, ele continua sendo oferecido ao servidor. Sinal de
  // obra cai e volta o tempo todo, e o gravar deste traço é assunto do sistema,
  // não de quem está com a caneta na mão.
  const [pending, setPending] = useState<AtlasAnnotation[]>([])
  const tries = useRef(new Map<string, number>())

  // A borracha responde antes de agir: o que está sob o cursor enfraquece, e o
  // que acabou de ser clicado enfraquece mais, até a resposta chegar. Sem isso a
  // única confirmação de ter acertado o traço certo era ele sumir, o que é tarde
  // demais para se arrepender.
  // A amostra aparece quando se escolhe uma espessura e se recolhe sozinha: é
  // resposta ao gesto, não um painel a mais ocupando a barra.
  // O balão da nota: o título aparece por alguns segundos e some sozinho. Um
  // círculo tracejado no meio da prancha não diz o que foi anotado ali, e abrir
  // Tasks para descobrir é sair do desenho.
  const [bubble, setBubble] = useState<{ id: string; text: string; x: number; y: number } | null>(null)
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showBubble = (id: string, text: string, x: number, y: number) => {
    setBubble({ id, text, x, y })
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(null), 5000)
  }

  const [noteAt, setNoteAt] = useState<{ x: number; y: number } | null>(null)
  const [noteText, setNoteText] = useState("")

  const [sample, setSample] = useState(false)
  const sampleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSample = () => {
    setSample(true)
    if (sampleTimer.current) clearTimeout(sampleTimer.current)
    sampleTimer.current = setTimeout(() => setSample(false), 2200)
  }

  const [under, setUnder] = useState<string | null>(null)
  const [erasing, setErasing] = useState<string[]>([])
  const fade = (id: string) => erasing.includes(id) ? 0.15 : under === id ? 0.4 : 1
  // O ouvinte da roda é nativo e é montado uma vez; sem esta referência ele
  // ficaria preso à ferramenta que estava selecionada quando foi montado.
  const toolRef = useRef<Tool>("pan")
  const [panning, setPanning] = useState(false)

  // ── Procurar na prancha ───────────────────────────────────────────────────
  const [finding, setFinding] = useState(false)
  const [needle, setNeedle] = useState("")
  const [hits, setHits] = useState<TextHit[]>([])
  const [hit, setHit] = useState(0)
  const [searching, setSearching] = useState(false)

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

  // Leva o resultado para o meio da tela sem mexer no zoom: quem procurou já
  // escolheu a aproximação em que estava lendo.
  const centreOn = useCallback((target: TextHit) => {
    setView(v => clampView({
      scale: v.scale,
      x: size.width / 2 - (target.x + target.width / 2) * v.scale,
      y: size.height / 2 - (target.y + target.height / 2) * v.scale,
    }, size, pageWidth, pageHeight))
  }, [size, pageWidth, pageHeight])

  // Procura enquanto se digita, com uma pausa curta: cada tecla custa uma
  // leitura do texto da página, e a página não muda no meio da digitação.
  useEffect(() => {
    if (!finding || !source?.url) { setHits([]); return }
    const q = needle.trim()
    if (q.length < 2) { setHits([]); setHit(0); return }

    let alive = true
    setSearching(true)
    const timer = setTimeout(() => {
      findInPlan(source.url, source.whole ? sheet.pageIndex : 0, q)
        .then(found => {
          if (!alive) return
          setHits(found)
          setHit(0)
          if (found.length) centreOn(found[0])
        })
        .catch(() => { if (alive) setHits([]) })
        .finally(() => { if (alive) setSearching(false) })
    }, 250)

    return () => { alive = false; clearTimeout(timer) }
  }, [finding, needle, source, sheet.pageIndex, centreOn])

  const goToHit = useCallback((step: number) => {
    if (!hits.length) return
    const next = (hit + step + hits.length) % hits.length
    setHit(next)
    centreOn(hits[next])
  }, [hits, hit, centreOn])

  // ── Roda: zoom direto, sem tecla modificadora ─────────────────────────────
  useEffect(() => {
    const node = boxRef.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      // A prancha não rola: ela é uma folha só, e o gesto que se espera dela é
      // aproximar, como em qualquer mapa. Rolar a página inteira num leitor de
      // plano nunca leva a lugar nenhum.
      //
      // Com caneta na mão a roda não faz nada: quem está desenhando encosta o
      // dedo no scroll sem querer, e o desenho saltando de escala no meio do
      // traço é pior do que não ampliar.
      if (canAnnotate && toolRef.current !== "pan") return
      e.preventDefault()
      const box = node!.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [zoomAt, canAnnotate])

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

    // Deslocar é da mão, e de mais nada. Arrastar com a caneta selecionada
    // desenha; com a borracha, apaga. Uma ferramenta, um gesto.
    if (!canAnnotate || tool === "pan") {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, view }
      setPanning(true)
      return
    }

    if (tool === "pin") {
      // O ponto fica guardado e o texto vem num diálogo. Era window.prompt, que
      // o navegador bloqueia em silêncio conforme o contexto: o clique não fazia
      // nada e não havia como saber por quê.
      const [x, y] = toPage(e.clientX, e.clientY)
      setNoteAt({ x, y })
      setNoteText("")
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
    const stroke: AtlasAnnotation["tool"] = marking ? "highlighter" : "pen"
    const mark = {
      // O id nasce no cliente porque o traço precisa existir antes de a rede
      // responder: é o que permite anotar em obra sem sinal e sincronizar
      // depois sem duplicar (AT-14). É também o que deixa reconhecê-lo quando
      // ele volta do servidor.
      id: crypto.randomUUID(),
      tool: stroke,
      color,
      width,
      opacity,
      shared,
      geometry: { points: drawing } as AtlasStrokeGeometry,
    }
    setPending(list => [...list, mark as AtlasAnnotation])
    setDrawing([])
  }

  // O que o servidor já confirmou sai da memória: dali em diante o traço vem da
  // listagem como qualquer outro.
  useEffect(() => {
    if (!annotations?.length || !pending.length) return
    const saved = new Set(annotations.map(a => a.id))
    setPending(list => list.some(m => saved.has(m.id))
      ? list.filter(m => !saved.has(m.id))
      : list)
  }, [annotations, pending.length])

  // A fila insiste sozinha. Gravar duas vezes o mesmo traço não faz mal: o id
  // nasce no cliente e o servidor ignora o repetido, então tentar de novo é
  // sempre seguro.
  useEffect(() => {
    if (!pending.length) return
    let alive = true

    async function attempt(mark: AtlasAnnotation) {
      try {
        await atlasService.createAnnotation(sheet.id, mark)
        if (alive) refetchAnnotations()
        tries.current.delete(mark.id)
      } catch {
        // Erro aqui é rede ou servidor fora do ar. A próxima rodada tenta de
        // novo, um pouco mais tarde a cada vez.
        tries.current.set(mark.id, (tries.current.get(mark.id) ?? 0) + 1)
        schedule()
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null
    function schedule() {
      if (timer) clearTimeout(timer)
      const worst = Math.max(...pending.map(m => tries.current.get(m.id) ?? 0), 0)
      const wait = RETRY_STEPS[Math.min(worst, RETRY_STEPS.length - 1)] * 1000
      timer = setTimeout(() => {
        if (!alive) return
        for (const mark of pending) void attempt(mark)
      }, wait)
    }

    // A primeira tentativa é imediata; as seguintes esperam.
    for (const mark of pending) {
      if ((tries.current.get(mark.id) ?? 0) === 0) {
        tries.current.set(mark.id, 0)
        void attempt(mark)
      }
    }
    schedule()

    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [pending, sheet.id, refetchAnnotations])

  function saveNote() {
    if (!noteAt || !noteText.trim()) return
    createEvent.mutate({
      kind: "issue", title: noteText.trim(), sheetId: sheet.id,
      pageX: noteAt.x, pageY: noteAt.y,
    })
    setNoteAt(null)
    setNoteText("")
  }

  // Trocar de ferramenta não mexe em tinta nenhuma: cada uma volta exatamente
  // como foi deixada.
  function pickTool(value: Tool) {
    setTool(value)
    toolRef.current = value
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

      // Letra solta troca de ferramenta. Com modificador não: Ctrl+P é imprimir
      // e continua sendo.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const picked = TOOLS.find(t => t.key === e.key.toLowerCase())
      if (picked && canAnnotate) pickTool(picked.value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const toolButton = ({ value, key, label, hint, icon: Icon }: (typeof TOOLS)[number]) => {
    const active = tool === value
    return (
      <Button
        key={value}
        variant={active ? "default" : "ghost"}
        onClick={() => pickTool(value)}
        title={`${label} (${key.toUpperCase()})`}
        className="atlas-burst h-9 gap-1.5 px-2 transition-all duration-200"
      >
        <Icon className="h-4 w-4" />
        {/* Aberto só quando ativo, e só onde há largura: a dica é para quem
            acabou de escolher a ferramenta, não uma legenda permanente de
            cinco botões. */}
        <span
          className={`hidden overflow-hidden whitespace-nowrap text-xs transition-all duration-200 lg:inline-block ${
            active ? "max-w-[15rem] opacity-90" : "max-w-0 opacity-0"
          }`}
        >
          {hint}
        </span>
        {/* A tecla só no computador: no tablet não há teclado para ela indicar. */}
        <Kbd className="hidden bg-black/20 text-current md:inline-flex">{key.toUpperCase()}</Kbd>
      </Button>
    )
  }

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
            pageWidth={pageWidth}
            pageHeight={pageHeight}
          />
        )}

        {/* A camada de anotação segue a página, não a tela: mesma origem, mesmo
            tamanho, e o viewBox mantém o traço em coordenada de papel. */}
        <svg
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          className="pointer-events-none absolute select-none"
          style={pageStyle}
        >
          {/* Entre a resposta do servidor e a limpeza da memória existe um
              quadro em que o mesmo traço está nas duas listas. Sem este filtro
              ele é desenhado duas vezes, com a mesma chave. */}
          {[
            ...(annotations ?? []),
            ...pending.filter(m => !annotations?.some(a => a.id === m.id)),
          ].map(a => (
            <path
              key={a.id}
              d={pointsToPath(a.geometry?.points ?? [], pageWidth, pageHeight)}
              fill="none"
              stroke={a.color}
              strokeWidth={Number(a.width) * strokeScale}
              strokeOpacity={Number(a.opacity) * fade(a.id)}
              strokeLinecap="round"
              strokeLinejoin="round"
              onPointerEnter={() => tool === "erase" && setUnder(a.id)}
              onPointerLeave={() => setUnder(u => u === a.id ? null : u)}
              onPointerDown={e => {
                if (tool !== "erase" || !canAnnotate) return
                e.stopPropagation()
                setErasing(list => [...list, a.id])
                deleteAnnotation.mutate(a.id, {
                  // Some da lista de apagados quando a resposta chega: se deu
                  // certo o traço já saiu da listagem, e se falhou ele volta ao
                  // peso normal em vez de ficar meio apagado para sempre.
                  onSettled: () => setErasing(list => list.filter(id => id !== a.id)),
                })
              }}
              style={{
                cursor: tool === "erase" ? "pointer" : "inherit",
                pointerEvents: tool === "erase" ? "stroke" : "none",
                transition: "stroke-opacity 150ms ease",
              }}
            />
          ))}

          {drawing.length > 1 && (
            <path
              d={pointsToPath(drawing, pageWidth, pageHeight)}
              fill="none"
              stroke={color}
              strokeWidth={width * strokeScale}
              strokeOpacity={opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* O achado fica marcado como marca-texto sobre papel: o da vez em
              laranja forte, os outros em amarelo, para a leitura saber onde
              está e quantos faltam sem precisar contar. */}
          {hits.map((h, i) => (
            <rect
              key={`${h.x}-${h.y}-${i}`}
              x={h.x}
              y={h.y}
              width={h.width}
              height={h.height}
              className={i === hit ? "fill-orange-500/45" : "fill-yellow-400/35"}
            />
          ))}

          {events?.filter(e => e.pageX != null && e.pageY != null).map(e => (
            <g
              key={e.id}
              transform={`translate(${(e.pageX ?? 0) * pageWidth} ${(e.pageY ?? 0) * pageHeight})`}
              onPointerEnter={() => tool === "erase" && setUnder(e.id)}
              onPointerLeave={() => setUnder(u => u === e.id ? null : u)}
              onPointerDown={ev => {
                ev.stopPropagation()
                if (tool === "erase" && canAnnotate) {
                  setErasing(list => [...list, e.id])
                  // Soltar o pino não apaga o evento: ele fica em Tasks, com o
                  // que já foi respondido nele. O que sai é a marca da prancha.
                  updateEvent.mutate(
                    { eventId: e.id, patch: { detach: true } },
                    { onSettled: () => setErasing(list => list.filter(id => id !== e.id)) },
                  )
                  return
                }
                // Com qualquer outra ferramenta o pino se lê, não se altera: o
                // toque abre o que foi anotado ali e devolve o desenho depois.
                showBubble(e.id, e.title || e.body || "No title", e.pageX ?? 0, e.pageY ?? 0)
              }}
              style={{
                cursor: "pointer",
                pointerEvents: "auto",
                opacity: fade(e.id),
                transition: "opacity 150ms ease",
              }}
            >
              {/* Vazado, para não esconder o que está marcado, e tracejado, para
                  se ler como anotação e não como parte do desenho. Resolvido
                  fica verde; o resto é laranja, a cor reservada da nota. */}
              <circle
                r={pageHeight / 70}
                fill="none"
                stroke={e.status === "resolved" ? "#10b981" : NOTE_COLOR}
                strokeWidth={strokeScale * 1.5}
                strokeDasharray={`${strokeScale * 4} ${strokeScale * 3}`}
              />
              <circle r={strokeScale * 1.5} fill={e.status === "resolved" ? "#10b981" : NOTE_COLOR} />
              <title>{e.title || e.body}</title>
            </g>
          ))}
        </svg>

        {/* Ancorado no ponto e acima dele, como um balão de fala. Fora do SVG
            porque texto em SVG não quebra linha nem herda a tipografia da casa. */}
        {bubble && (
          <div
            className="pointer-events-none absolute z-10 max-w-[16rem] -translate-x-1/2 -translate-y-full duration-150 animate-in fade-in-0 zoom-in-95"
            style={{
              left: view.x + bubble.x * pageWidth * view.scale,
              top: view.y + bubble.y * pageHeight * view.scale - pageHeight / 70 * view.scale - 10,
            }}
          >
            <div className="rounded-lg bg-neutral-900 px-3 py-2 text-sm leading-snug text-white shadow-xl ring-1 ring-white/15">
              {bubble.text}
            </div>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-neutral-900" />
          </div>
        )}

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
      {/* Que obra, e depois que folha. Em tela cheia a barra lateral some, e sem
          isto a prancha aberta não diz de qual projeto ela é: numa comunidade
          com trinta lotes iguais, isso é a diferença entre marcar a casa certa e
          a errada. */}
      <div className="pointer-events-none absolute left-4 top-4 flex max-w-[min(70vw,36rem)] items-stretch gap-2">
        {jobsite && (
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-white/10 bg-neutral-800/90 px-2.5 py-1.5 shadow-lg backdrop-blur">
            {/* O selo da casa na prancha aberta. O leitor ocupa a tela inteira e
                perde toda a moldura do produto: sem isto, a folha em tela cheia
                podia ser de qualquer visualizador de PDF. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/minilogo_white.png"
              alt="Premium Group"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <span className="h-8 w-px shrink-0 bg-white/10" />

            <span className="flex min-w-0 flex-col justify-center gap-0.5">
            <span className="flex items-center gap-1.5 text-xs text-white/70">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {placeLabel(jobsite.community || jobsite.address || jobsite.name)}
              </span>
            </span>
            {/* A obra à esquerda e o cliente à direita, na mesma linha: são os
                dois dados de mesmo peso, e empilhá-los fazia o bloco crescer
                para dizer o que cabia lado a lado. */}
            <span className="flex items-center justify-between gap-2.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-white">
                {(() => {
                  const K = (KIND_META[jobsite.kind] ?? KIND_META.house).icon
                  return <K className="h-3.5 w-3.5 shrink-0 text-white/60" />
                })()}
                <span className="truncate">
                  {[(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
                    .filter(Boolean).join(" ")}
                </span>
              </span>
              {/* Sem caixa alta: o nome vem do cadastro já escrito como se
                  escreve, e gritá-lo aqui não acrescenta nada. */}
              <span className="shrink-0 truncate text-xs capitalize text-white/60">
                {jobsite.client || "No client"}
              </span>
            </span>
            </span>
          </div>
        )}

        <div className="flex min-w-0 flex-col justify-center rounded-lg border border-white/10 bg-neutral-800/90 px-3 py-1.5 shadow-lg backdrop-blur">
          <p className="truncate text-sm font-medium leading-tight text-white">
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </p>
          <p className="truncate text-xs text-white/60">
            {sheet.title || `${index + 1} of ${sheets.length}`}
          </p>
        </div>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-lg border border-white/10 bg-neutral-800/90 p-1 shadow-lg backdrop-blur">
        {/* Procurar texto na prancha. O plano guarda o texto que foi impresso
            nele, então achar "U341" é leitura de PDF, não busca em imagem. */}
        {finding && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={needle}
              onChange={e => setNeedle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") goToHit(e.shiftKey ? -1 : 1)
                if (e.key === "Escape") { setFinding(false); setNeedle(""); setHits([]) }
              }}
              placeholder="Find on this sheet"
              className="h-9 w-44 rounded-md border border-white/15 bg-white/5 px-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus-visible:border-white/40"
            />
            <span className="w-16 shrink-0 text-center text-xs tabular-nums text-white/60">
              {searching ? "…"
                : needle.trim().length < 2 ? ""
                : hits.length ? `${hit + 1} of ${hits.length}`
                : "none"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={!hits.length}
              onClick={() => goToHit(-1)}
              title="Previous match (Shift+Enter)"
              className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={!hits.length}
              onClick={() => goToHit(1)}
              title="Next match (Enter)"
              className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Button
          size="icon"
          variant={finding ? "default" : "ghost"}
          className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
          title="Find text on this sheet"
          onClick={() => {
            const open = !finding
            setFinding(open)
            if (!open) { setNeedle(""); setHits([]) }
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="atlas-burst pointer-events-auto h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
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
          className="atlas-burst pointer-events-auto h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
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
          className="atlas-burst atlas-page-turn absolute left-4 top-1/2 h-24 w-10 -translate-y-1/2 rounded-lg border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur transition-all hover:bg-neutral-700 hover:text-white"
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
          className="atlas-burst atlas-page-turn absolute right-4 top-1/2 h-24 w-10 -translate-y-1/2 rounded-lg border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur transition-all hover:bg-neutral-700 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}

      {canAnnotate && (
        <div className="absolute bottom-4 left-4 flex max-w-[calc(100vw-9rem)] flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-neutral-800/90 p-1.5 text-white shadow-lg backdrop-blur transition-all duration-200">
          <div className="flex items-center gap-1">
            {TOOLS.map(toolButton)}
          </div>

          {drawTool && (
            <>
              <span className="h-6 w-px bg-white/15" />
              <div className="flex items-center gap-1">
                {palette.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setInk({ color: c.value })}
                    title={c.label}
                    style={{ background: c.value }}
                    className={`atlas-burst h-6 w-6 rounded-full border transition-transform ${
                      color === c.value ? "scale-110 border-white" : "border-white/30"
                    }`}
                  />
                ))}
              </div>

              <span className="h-6 w-px bg-white/15" />
              <div className="flex items-center gap-1">
                {widths.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => { setInk({ width: w }); showSample() }}
                    title={`Stroke ${i + 1} of ${widths.length}`}
                    className={`atlas-burst flex h-7 w-7 items-center justify-center rounded transition-colors ${
                      width === w ? "bg-white/20" : "hover:bg-white/10"
                    }`}
                  >
                    <span
                      className="rounded-full bg-white"
                      style={{ width: `${3 + i * 3}px`, height: `${3 + i * 3}px` }}
                    />
                  </button>
                ))}
              </div>

              <span className="h-6 w-px bg-white/15" />
              {/* Com quem o traço fica. Privado é o padrão, e o botão só ganha
                  peso quando está ligado: um estado que muda o que os outros
                  veem não pode ser descoberto depois. */}
              <button
                type="button"
                onClick={() => setInk({ shared: !shared })}
                title={shared
                  ? "Everyone on this project sees what you mark"
                  : "Only you see what you mark"}
                style={shared ? { ["--burst" as string]: "rgb(56 189 248 / 0.45)" } : undefined}
                className={`atlas-burst flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-all duration-200 ${
                  shared
                    ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40"
                    : "text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {shared ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                {/* Quem vê, e não o nome do estado: "privado" e "compartilhado"
                    obrigam a traduzir para saber o que muda. */}
                <span className="hidden lg:inline">{shared ? "Everyone sees" : "Only me"}</span>
              </button>

              {/* A amostra do traço escolhido, do tamanho que ele vai sair no
                  zoom em que a prancha está. Uma bolinha de sete pixels no botão
                  não diz nada sobre o que cai no papel; esta linha diz. */}
              <div
                className={`flex items-center overflow-hidden transition-all duration-200 ${
                  sample ? "max-w-[9rem] opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                <span className="flex h-9 w-32 shrink-0 items-center justify-center rounded-md bg-white px-2">
                  <span
                    className="w-full rounded-full"
                    style={{
                      background: color,
                      opacity,
                      height: Math.max(1, Math.min(28, width * strokeScale * view.scale)),
                    }}
                  />
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={!!noteAt} onOpenChange={o => { if (!o) setNoteAt(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New note on this sheet</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-text">What happened here?</Label>
            <Input
              id="note-text"
              autoFocus
              value={noteText}
              placeholder="Beam is 2 in. off the grid line"
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveNote() }}
            />
            <p className="text-xs text-muted-foreground">
              It lands on Tasks, anchored to this point of the drawing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteAt(null)}>Cancel</Button>
            <Button onClick={saveNote} disabled={!noteText.trim()}>Add note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-px">
        <Button
          size="icon"
          variant="ghost"
          className="atlas-burst h-10 w-10 rounded-b-none rounded-t-lg border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur transition-all hover:bg-neutral-700 hover:text-white"
          onClick={() => zoomCentre(1.25)}
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <button
          onClick={fit}
          title="Fit the sheet to the screen"
          className="flex w-10 items-center justify-center gap-1 border-x border-white/10 bg-neutral-800/90 py-1 text-[10px] tabular-nums text-white/70 shadow-lg backdrop-blur transition-all hover:text-white"
        >
          {zoomLabel(zoom)}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="atlas-burst h-10 w-10 rounded-none border-x border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur transition-all hover:bg-neutral-700 hover:text-white"
          onClick={fit}
          title="Fit to screen"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="atlas-burst h-10 w-10 rounded-b-lg rounded-t-none border border-white/10 bg-neutral-800/90 text-white shadow-lg backdrop-blur transition-all hover:bg-neutral-700 hover:text-white"
          onClick={() => zoomCentre(0.8)}
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
