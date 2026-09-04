"use client"

import { downloadPlan } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import { findInPlan, type TextHit } from "@/components/atlas/plan-text"
import { atlasService } from "@/services/atlas.service"
import { useAuth } from "@/hooks/use-auth"
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
  useCreateAtlasEvent, useDeleteAtlasAnnotation, useUpdateAtlasAnnotation, useUpdateAtlasEvent,
} from "@/hooks/use-atlas"
import type { AtlasAnnotation, AtlasSheet, AtlasStrokeGeometry } from "@/services/atlas.service"
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download, Eraser, FileUp,
  Eye, EyeOff, Highlighter, History, Link2, Maximize, MapPin, Minus, Pen, Plus,
  RotateCcw, RotateCw, Search,
  User, Users, X,
} from "lucide-react"
import { SheetLinkDialog } from "@/components/atlas/sheet-link-dialog"
import { SheetRevisions } from "@/components/atlas/sheet-revisions"
import { useRouter } from "next/navigation"
import type { AtlasLinkTarget } from "@/services/atlas.service"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

/**
 * A moldura de tudo que flutua sobre a prancha.
 *
 * Eram três alturas diferentes para a mesma ideia de bloco, e a diferença
 * aparece justo onde eles se encostam, no alto da tela. Cinquenta é a altura,
 * e cada bloco cuida só do que carrega dentro.
 */
/**
 * A casa de um botão nesses blocos, e o respiro em volta dela.
 *
 * Trinta e seis é a caixa, seis é o respiro, quatro é o vão entre duas casas.
 * Daí sai o cinquenta que todo bloco tem: 36 + 6 + 6 + as duas bordas. Estava
 * escrito de quatro jeitos diferentes, e o olho pega a diferença mesmo sem
 * saber medir.
 */
const CASA = "h-9 w-9 shrink-0"

const MOLDURA =
  "rounded-lg border border-white/10 bg-neutral-800/90 shadow-lg backdrop-blur"

/** Deitada: cinquenta de altura, largura livre. */
const FLUTUA = `h-[50px] ${MOLDURA}`

/** Onde o giro preferido fica guardado, por aparelho. */
const SPIN_KEY = "atlas:sheet-spin"

// Nenhuma ferramenta é um estado, e é o estado normal: sem nada escolhido a
// prancha se arrasta e amplia, que é o que a mão fazia. A mão era uma
// ferramenta para voltar ao que já era o padrão, e ocupava um botão para isso.
type Tool = "pen" | "highlighter" | "pin" | "link" | "erase" | null

// A letra é a inicial do nome da ferramenta, para não haver o que decorar. No
// desktop ela aparece dentro do botão: quem lê a prancha o dia inteiro não
// larga o desenho para ir até a barra a cada troca de ferramenta.
// A ferramenta selecionada abre e diz o que o gesto faz. Um ícone de mão não
// ensina que arrastar desloca e que a roda amplia: quem chega na tela pela
// primeira vez tem de descobrir por tentativa.
const TOOLS = [
  { value: "pen",         key: "p", label: "Pen",      hint: "Draw over the sheet",          icon: Pen },
  { value: "highlighter", key: "m", label: "Marker",   hint: "Highlight over the sheet",     icon: Highlighter },
  { value: "pin",         key: "n", label: "Note pin", hint: "Tap the sheet to open a note", icon: MapPin },
  { value: "link",        key: "l", label: "Link",     hint: "Drag over the sheet, then pick where it goes", icon: Link2 },
  { value: "erase",       key: "e", label: "Eraser",   hint: "Tap a stroke or a pin",        icon: Eraser },
] as const satisfies readonly {
  value: NonNullable<Tool>; key: string; label: string; hint: string; icon: React.ElementType
}[]

// Duas paletas, porque são dois gestos. A caneta escreve por cima do desenho e
// precisa de cor cheia que se leia sobre traço preto; o marca-texto passa por
// baixo da leitura e precisa de cor clara, que realce sem esconder. Misturar as
// duas dava marca-texto vermelho-sangue tapando a cota.
// Laranja não entra em paleta nenhuma: é a cor da nota, e uma cor que quer dizer
// "há algo a resolver aqui" só funciona se não aparecer também em traço solto.
const NOTE_COLOR = "#f97316"
// O vínculo tem cor própria pelo mesmo motivo da nota: ele não é marca de
// leitura, é caminho, e precisa se distinguir de traço solto na prancha.
const LINK_COLOR = "#0ea5e9"

// Nenhuma delas é preta de propósito: a prancha é desenhada em preto sobre
// branco, e um traço preto some dentro do desenho que ele deveria comentar. A
// laranja entrou no lugar da tinta por ser a que sobrou longe das outras quatro
// e das cores de preenchimento que os relatórios usam.
const PEN_COLORS = [
  { value: "#dc2626", label: "Red" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#ea580c", label: "Orange" },
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

// O que a prancha mostra por cima do desenho, e de quem.
//
// Numa folha com meia dúzia de leitores, a marcação de todo mundo somada tapa o
// plano. Poder apagar a camada dos outros e ficar só com a sua, ou o contrário,
// é o que deixa a prancha continuar legível sem ninguém ter de apagar nada.
const LAYERS = [
  { key: "myPen",       label: "My pen",            icon: Pen },
  { key: "theirPen",    label: "Pen from others",   icon: Pen },
  { key: "myMarker",    label: "My marker",         icon: Highlighter },
  { key: "theirMarker", label: "Marker from others", icon: Highlighter },
  { key: "notes",       label: "Notes",             icon: MapPin },
  { key: "links",       label: "Links",             icon: Link2 },
] as const

type LayerKey = (typeof LAYERS)[number]["key"]

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
export function SheetViewer({
  sheet, sheets, jobsiteId, canAnnotate, canManage, onClose, onNavigate,
}: {
  sheet: AtlasSheet
  sheets: AtlasSheet[]
  jobsiteId: string
  canAnnotate: boolean
  /** Quem manda na obra pode trocar a prancha; os demais só leem o histórico. */
  canManage?: boolean
  onClose: () => void
  onNavigate: (sheet: AtlasSheet) => void
}) {
  const [revisions, setRevisions] = useState(false)
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: annotations, refetch: refetchAnnotations } = useAtlasAnnotations(sheet.id)
  const { data: events } = useAtlasEvents(jobsiteId, sheet.id)
  const deleteAnnotation = useDeleteAtlasAnnotation(sheet.id)
  const createEvent = useCreateAtlasEvent(jobsiteId, sheet.id)
  const updateEvent = useUpdateAtlasEvent(jobsiteId, sheet.id)

  const [tool, setTool] = useState<Tool>(null)
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
  const updateAnnotation = useUpdateAtlasAnnotation(sheet.id)
  // A área sendo cercada agora, e o vínculo vazio que espera destino.
  const [linkBox, setLinkBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  // Onde o dedo tocou, para a janelinha nascer ali. Ela não é um diálogo: é a
  // resposta a "para onde isto vai", e some ao tocar fora.
  const [peek, setPeek] = useState<{ x: number; y: number; target: AtlasLinkTarget } | null>(null)
  // A trilha de quem chegou por vínculo. Sem ela, seguir um link é entrar num
  // desenho de 97 folhas sem porta de volta.
  const [trail, setTrail] = useState<AtlasSheet[]>([])
  const router = useRouter()
  const [noteText, setNoteText] = useState("")

  // Pelo hook e não pelo store: o store guarda só o token entre recargas, e sem
  // o id do usuário toda marcação virava "de outra pessoa", inclusive a sua.
  const { user } = useAuth()
  const me = user?.id ?? ""
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    myPen: true, theirPen: true, myMarker: true, theirMarker: true, notes: true, links: true,
  })
  const [layersOpen, setLayersOpen] = useState(false)

  // Traço só aparece se a camada dele estiver acesa. O que é meu sai do autor;
  // o que veio sem autor é tratado como meu, que é o caso do traço ainda a
  // caminho do banco.
  const visible = useCallback((a: AtlasAnnotation) => {
    const mine = !a.authorId || a.authorId === me
    // O vínculo não é marcação de leitura, é caminho, e por isso não pertence à
    // camada de ninguém: apagar a caneta dos outros escondia as referências do
    // desenho junto, e elas sumiam sem que ninguém tivesse pedido isso.
    if (a.tool === "link") return layers.links
    if (a.tool === "highlighter") return mine ? layers.myMarker : layers.theirMarker
    return mine ? layers.myPen : layers.theirPen
  }, [me, layers])

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
  const toolRef = useRef<Tool>(null)
  const [panning, setPanning] = useState(false)

  // ── Procurar na prancha ───────────────────────────────────────────────────
  const [finding, setFinding] = useState(false)
  const [needle, setNeedle] = useState("")
  const [hits, setHits] = useState<TextHit[]>([])
  const [hit, setHit] = useState(0)
  const [searching, setSearching] = useState(false)

  // Enquanto a folha nova não está desenhada, a tela mostra o giro e mais nada.
  // Sem isto o canvas pintava o retângulo branco da página antes de o PDF entrar
  // por cima, e por um instante a prancha era uma moldura vazia.
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setReady(false); setFailed(false) }, [sheet.id])
  const markReady = useCallback(() => { setReady(true); setFailed(false) }, [])
  const markFailed = useCallback(() => setFailed(true), [])

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

  // Girar a prancha na tela. O papel não muda: o que muda é de que lado a
  // pessoa está olhando para ele. Um relatório sai retrato, uma elevação sai
  // paisagem, e no tablet em obra ninguém vira o aparelho de lado com a mão
  // suja para ler uma prancha.
  //
  // O giro fica guardado no aparelho, e não na folha: quem lê deitado lê tudo
  // deitado, e girar de novo a cada prancha seria cobrar o mesmo gesto noventa
  // e sete vezes. Fica no aparelho porque é dele que se trata, o tablet
  // apoiado de lado na obra e o monitor em pé na mesa não querem a mesma coisa.
  // Em tela estreita a barra mostra só a cor e a espessura em uso, e o resto
  // vira uma gaveta que abre logo acima dela. Guardar o que está aberto aqui
  // deixa as duas se fecharem uma à outra.
  const [gaveta, setGaveta] = useState<null | "cor" | "espessura">(null)

  const [spin, setSpin] = useState(0)

  useEffect(() => {
    const guardado = Number(localStorage.getItem(SPIN_KEY))
    if (guardado === 90 || guardado === 180 || guardado === 270) setSpin(guardado)
  }, [])

  const gira = useCallback((passo: number) => {
    setSpin(atual => {
      const proximo = (atual + passo + 360) % 360
      try {
        localStorage.setItem(SPIN_KEY, String(proximo))
      } catch {
        // navegador sem armazenamento: gira mesmo assim, só não lembra
      }
      return proximo
    })
  }, [])
  // De pé ou deitado: a 90 e a 270 a largura vira altura, e o enquadramento
  // precisa saber disso para a folha caber girada.
  const deitado = spin % 180 !== 0

  // Gira um deslocamento de tela ao contrário do giro da prancha. Sem isto,
  // arrastar para a direita com a folha a 90 graus a leva para baixo: a mão
  // fala em coordenada de tela, e a prancha vive na dela.
  const desgira = useCallback((dx: number, dy: number): [number, number] => {
    const a = (-spin * Math.PI) / 180
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
  }, [spin])

  // Um ponto da prancha dito em coordenada de tela, já com o giro aplicado.
  const naTela = useCallback((x: number, y: number): [number, number] => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || !spin) return [x, y]
    const ox = box.width / 2
    const oy = box.height / 2
    const a = (spin * Math.PI) / 180
    const dx = x - ox
    const dy = y - oy
    return [ox + dx * Math.cos(a) - dy * Math.sin(a), oy + dx * Math.sin(a) + dy * Math.cos(a)]
  }, [spin])

  // Um ponto da tela dito em coordenada da prancha, antes do giro.
  const noPalco = useCallback((clientX: number, clientY: number): [number, number] => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return [0, 0]
    const ox = box.width / 2
    const oy = box.height / 2
    const [dx, dy] = desgira(clientX - box.left - ox, clientY - box.top - oy)
    return [ox + dx, oy + dy]
  }, [desgira])

  // ── Enquadramento ─────────────────────────────────────────────────────────
  const fitScale = useMemo(() => {
    if (!size.width || !size.height) return 0
    const largura = deitado ? pageHeight : pageWidth
    const altura = deitado ? pageWidth : pageHeight
    return Math.min(size.width / largura, size.height / altura) * 0.96
  }, [size, pageWidth, pageHeight, deitado])

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
      x: size.width / 2 - target.cx * v.scale,
      y: size.height / 2 - target.cy * v.scale,
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
      if (canAnnotate && toolRef.current) return
      e.preventDefault()
      const [x, y] = noPalco(e.clientX, e.clientY)
      zoomAt(Math.exp(-e.deltaY * 0.0015), x, y)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [zoomAt, canAnnotate, noPalco])

  // ── Ponteiros: arrastar, desenhar e pinçar ────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: "pan"; x: number; y: number; view: PlanView }
    | { kind: "pinch"; distance: number; view: PlanView; cx: number; cy: number }
    | null
  >(null)

  const toPage = useCallback((clientX: number, clientY: number): [number, number] => {
    if (!view.scale) return [0, 0]
    const [x, y] = noPalco(clientX, clientY)
    return [
      (x - view.x) / (pageWidth * view.scale),
      (y - view.y) / (pageHeight * view.scale),
    ]
  }, [view, pageWidth, pageHeight, noPalco])

  const drawTool = tool === "pen" || tool === "highlighter"

  useEffect(() => { if (!drawTool) setGaveta(null) }, [drawTool, tool])

  function handlePointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const box = boxRef.current?.getBoundingClientRect()

    // Dois dedos é pinça, e pinça nunca vira traço: desenhar com a segunda mão
    // apoiada na tela é o acidente clássico do tablet em obra.
    if (pointers.current.size === 2 && box) {
      const [a, b] = [...pointers.current.values()]
      const [cx, cy] = noPalco((a.x + b.x) / 2, (a.y + b.y) / 2)
      gesture.current = {
        kind: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        view,
        cx,
        cy,
      }
      setDrawing([])
      return
    }

    // Capturar o ponteiro é conforto para o gesto não escapar do elemento, e
    // ele recusa id que o navegador já soltou. Falhar aqui não pode derrubar o
    // arraste inteiro, que é o gesto mais usado da tela.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // segue sem captura
    }

    // Deslocar é da mão, e de mais nada. Arrastar com a caneta selecionada
    // desenha; com a borracha, apaga. Uma ferramenta, um gesto.
    if (!canAnnotate || !tool) {
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
    if (tool === "link") {
      // Cerca-se a área, como se marca a região no gabarito de nomenclatura: o
      // vínculo pertence a um pedaço do desenho, a bolha de referência ou a
      // chamada de detalhe, e não a um ponto sem tamanho.
      const [x, y] = toPage(e.clientX, e.clientY)
      setLinkBox({ x0: x, y0: y, x1: x, y1: y })
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
      const [dx, dy] = desgira(e.clientX - g.x, e.clientY - g.y)
      setView(clampView(
        { scale: g.view.scale, x: g.view.x + dx, y: g.view.y + dy },
        size, pageWidth, pageHeight,
      ))
      return
    }

    if (linkBox) {
      const [x, y] = toPage(e.clientX, e.clientY)
      setLinkBox(b => b && { ...b, x1: x, y1: y })
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

    if (linkBox) {
      const box = {
        x0: Math.min(linkBox.x0, linkBox.x1), y0: Math.min(linkBox.y0, linkBox.y1),
        x1: Math.max(linkBox.x0, linkBox.x1), y1: Math.max(linkBox.y0, linkBox.y1),
      }
      setLinkBox(null)
      // Toque sem arraste é engano, e some. Mas arraste curto é intenção, e
      // antes ele sumia igual: quem cercava uma bolha de referência, que é
      // pequena, via o vínculo desaparecer sem uma palavra. Agora a área curta
      // cresce até o mínimo que dá para tocar e fica.
      const MIN = 0.012
      if (box.x1 - box.x0 < 0.002 && box.y1 - box.y0 < 0.002) return
      if (box.x1 - box.x0 < MIN) {
        const meio = (box.x0 + box.x1) / 2
        box.x0 = Math.max(0, meio - MIN / 2)
        box.x1 = Math.min(1, meio + MIN / 2)
      }
      if (box.y1 - box.y0 < MIN) {
        const meio = (box.y0 + box.y1) / 2
        box.y0 = Math.max(0, meio - MIN / 2)
        box.y1 = Math.min(1, meio + MIN / 2)
      }
      const mark = {
        id: crypto.randomUUID(),
        tool: "link" as const,
        color: LINK_COLOR,
        width: 2,
        opacity: 1,
        // Nasce compartilhado, ao contrário do traço: caminho que só quem
        // desenhou enxerga não serve para nada, porque a referência é do
        // desenho e não da leitura de uma pessoa.
        shared: true,
        geometry: { ...box, target: null } as AtlasStrokeGeometry,
      }
      setPending(list => [...list, mark as AtlasAnnotation])
      return
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

  function saveLink(target: AtlasLinkTarget) {
    const id = linking
    if (!id) return
    setLinking(null)
    const mark = [...(annotations ?? []), ...pending].find(a => a.id === id)
    if (!mark?.geometry) return
    const geometry = { ...mark.geometry, target }
    // Já gravado no servidor: muda lá. Ainda na fila de envio: muda aqui, e ele
    // sobe uma vez só, com destino e tudo.
    if (annotations?.some(a => a.id === id)) {
      updateAnnotation.mutate({ id, geometry })
    } else {
      setPending(list => list.map(m => m.id === id ? { ...m, geometry } as AtlasAnnotation : m))
    }
  }

  // Seguir o vínculo. Na mesma pasta a folha troca sem sair da tela; noutra, a
  // página do documento abre já com a folha pedida, pelo endereço.
  function follow(target: AtlasLinkTarget) {
    setPeek(null)
    const here = sheets.find(s => s.id === target.sheetId)
    if (here) { setTrail(t => [...t, sheet]); onNavigate(here); return }
    router.push(`/atlas/${jobsiteId}/documents/${target.documentId}?sheet=${target.sheetId}`)
  }

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
    // Tocar de novo na ferramenta ativa larga ela. Antes era preciso ir até a
    // mão para parar de desenhar, e "parar" não deveria exigir escolher outra
    // coisa.
    const next = value === toolRef.current ? null : value
    setTool(next)
    toolRef.current = next
    value = next as Tool
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Digitar num campo é digitar, não comandar: procurar "pen" não pode
      // trocar de ferramenta no meio da palavra.
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA"
        || target?.isContentEditable
      if (typing) return

      if (e.key === "ArrowRight" && next) onNavigate(next)
      if (e.key === "ArrowLeft" && prev) onNavigate(prev)
      if (e.key === "Escape") onClose()
      if (e.key === "0") fit()
      if (e.key === "+" || e.key === "=") zoomCentre(1.25)
      if (e.key === "-") zoomCentre(0.8)

      // Letra solta troca de ferramenta. Com modificador não: Ctrl+P é imprimir
      // e continua sendo.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // "S" larga o que estiver na mão e devolve a prancha ao repouso, que é
      // arrastar e ampliar. Escape não serve para isso porque já fecha a folha,
      // e trocar o que ele faz quebraria o gesto de sair.
      if (e.key.toLowerCase() === "s") { setTool(null); toolRef.current = null; return }

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
  // Um pixel de tela, dito em unidade de página. O traço pertence ao papel e
  // acompanha o zoom; o botão pertence à tela e não pode: ampliar oito vezes o
  // transformaria numa bola tapando o desenho que ele serve para deixar ver.
  const px = 1 / view.scale
  const pageStyle = {
    left: view.x,
    top: view.y,
    width: pageWidth * view.scale,
    height: pageHeight * view.scale,
  }

  const cursor = panning ? "grabbing"
    : !tool || !canAnnotate ? "grab"
    : tool === "erase" ? "pointer"
    : "crosshair"

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
      <div
        ref={boxRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-neutral-800"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
       {/* Prancha e anotação giram como uma coisa só, em volta do centro da
           tela. Girar só o desenho deixaria o traço fora do lugar em que ele
           foi feito. */}
       <div
         className="absolute inset-0"
         style={spin ? { transform: `rotate(${spin}deg)` } : undefined}
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
            onReady={markReady}
            onFail={markFailed}
            key={attempt}
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
          ].filter(visible).filter(a => a.tool !== "link").map(a => (
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

          {/* O vínculo é área, não traço: o retângulo cerca o pedaço do desenho
              que aponta para outro lugar, do jeito que a bolha de referência
              faz no papel. Sem destino ele existe assim mesmo, tracejado e com
              uma interrogação ao lado: é o estado entre cercar e escolher, e
              guardá-lo é o que deixa sair da tela no meio sem perder o gesto. */}
          {[
            ...(annotations ?? []),
            ...pending.filter(m => !annotations?.some(a => a.id === m.id)),
          ].filter(visible).filter(a => a.tool === "link").map(a => {
            const g = a.geometry ?? {}
            const x = (g.x0 ?? 0) * pageWidth
            const y = (g.y0 ?? 0) * pageHeight
            const w = ((g.x1 ?? 0) - (g.x0 ?? 0)) * pageWidth
            const hgt = ((g.y1 ?? 0) - (g.y0 ?? 0)) * pageHeight
            const target = g.target
            const badge = 18 * px
            // Deitada é mais larga que alta: a célula entra pelo lado, onde há
            // folga. Em pé, ela entra por cima.
            const deitada = w >= hgt

            // O toque só segura o gesto: sem isto o arraste sobre a marca vira
            // deslocamento da prancha ou traço novo.
            function hold(e: React.PointerEvent) {
              e.stopPropagation()
              if (tool !== "erase" || !canAnnotate) return
              setErasing(list => [...list, a.id])
              deleteAnnotation.mutate(a.id, {
                onSettled: () => setErasing(list => list.filter(id => id !== a.id)),
              })
            }

            // Abrir janela é no clique, e não no toque. A janela que nascia no
            // `pointerdown` via o `click` seguinte cair fora dela, que é
            // exatamente o gesto de fechar: abria e fechava no mesmo movimento.
            function act(e: React.MouseEvent) {
              e.stopPropagation()
              if (tool === "erase") return
              // Resolvido, o toque não salta: ele abre a janelinha com o nome do
              // destino. Saltar direto tirava a folha do lugar sem avisar, e
              // quem tocou por engano não sabia de onde tinha vindo.
              // Ancorada na etiqueta, e não no dedo: a janela é sobre aquele
              // vínculo, então ela nasce sempre no mesmo lugar em relação a
              // ele. Presa ao toque, ela pulava de posição conforme o canto em
              // que a pessoa acertava, e a mesma marca abria a janela em cinco
              // lugares diferentes.
              const tag = (e.currentTarget as SVGGraphicsElement).closest("g")?.getBoundingClientRect()
              if (target) {
                setPeek(tag
                  ? { x: tag.left + tag.width / 2, y: tag.top, target }
                  : { x: e.clientX, y: e.clientY, target })
              }
              else if (canAnnotate) setLinking(a.id)
            }

            // A célula do ícone é proporcional ao bloco, e não ao zoom: ela
            // cresce junto com a área quando a prancha amplia, como o traço da
            // caneta. Um quadrado do tamanho do lado curto, que é o que deixa o
            // ícone caber inteiro sem espremer.
            const cell = deitada ? hgt : w
            const ox = deitada ? x - cell : x
            const oy = deitada ? y : y - cell

            return (
              <g key={a.id} opacity={fade(a.id)}>
                {/* Uma forma só quando o vínculo está resolvido: a célula do
                    ícone e a área marcada dividem o mesmo contorno e o mesmo
                    fundo, sem linha entre elas. Dois retângulos encostados
                    desenhavam um fio no meio da etiqueta, que é justamente o
                    que uma etiqueta não tem. */}
                <rect
                  x={target ? ox : x}
                  y={target ? oy : y}
                  width={target ? (deitada ? w + cell : w) : w}
                  height={target ? (deitada ? hgt : hgt + cell) : hgt}
                  // Quina bem redonda, como a de um chip: é o que separa a
                  // etiqueta do traço técnico impresso embaixo dela, todo em
                  // canto vivo. O raio acompanha o lado curto, então uma área
                  // fina não vira cápsula nem uma grande vira caixa.
                  rx={Math.min(deitada ? hgt : w, target ? cell : hgt) * 0.32}
                  fill={LINK_COLOR} fillOpacity={0.08}
                  stroke={LINK_COLOR} strokeWidth={1.25 * px}
                  strokeDasharray={target ? undefined : `${4 * px} ${3 * px}`}
                  onPointerEnter={() => tool === "erase" && setUnder(a.id)}
                  onPointerLeave={() => setUnder(u => u === a.id ? null : u)}
                  onPointerDown={hold}
                  onClick={act}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                />

                {target ? (
                  // O mesmo ícone da barra de ferramentas, o link-2 do lucide,
                  // desenhado em coordenada de página: o botão que cria e a
                  // marca que fica não podem ser dois desenhos da mesma ideia.
                  <g
                    transform={`translate(${ox + cell / 2 - cell * 0.3} ${oy + cell / 2 - cell * 0.3}) scale(${cell * 0.6 / 24})`}
                    stroke={LINK_COLOR}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    style={{ pointerEvents: "none" }}
                  >
                    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                    <line x1="8" x2="16" y1="12" y2="12" />
                  </g>
                ) : (
                  <g onPointerDown={hold} onClick={act} style={{ cursor: "pointer", pointerEvents: "all" }}>
                    <circle cx={x + w} cy={y} r={badge * 0.62} fill={LINK_COLOR} />
                    <text
                      x={x + w} y={y + badge * 0.26}
                      textAnchor="middle" fill="#fff"
                      fontSize={badge * 0.78} fontWeight={700}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      ?
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* A área sendo cercada agora. */}
          {linkBox && (
            <rect
              x={Math.min(linkBox.x0, linkBox.x1) * pageWidth}
              y={Math.min(linkBox.y0, linkBox.y1) * pageHeight}
              width={Math.abs(linkBox.x1 - linkBox.x0) * pageWidth}
              height={Math.abs(linkBox.y1 - linkBox.y0) * pageHeight}
              rx={Math.min(
                Math.abs(linkBox.x1 - linkBox.x0) * pageWidth,
                Math.abs(linkBox.y1 - linkBox.y0) * pageHeight,
              ) * 0.32}
              fill={LINK_COLOR} fillOpacity={0.08}
              stroke={LINK_COLOR} strokeWidth={1.25 * px}
              strokeDasharray={`${4 * px} ${3 * px}`}
            />
          )}

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
            // O retângulo nasce na origem do trecho e gira com ele: a base do
            // texto é o zero, então a altura sobe, não desce.
            <rect
              key={`${h.x}-${h.y}-${i}`}
              x={0}
              y={-h.height}
              width={h.width}
              height={h.height}
              transform={`translate(${h.x} ${h.y}) rotate(${h.angle})`}
              className={i === hit ? "fill-orange-500/45" : "fill-yellow-400/35"}
            />
          ))}

          {layers.notes && events?.filter(e => e.pageX != null && e.pageY != null).map(e => (
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
       </div>

        {/* Ancorado no ponto e acima dele, como um balão de fala. Fora do SVG
            porque texto em SVG não quebra linha nem herda a tipografia da casa. */}
        {bubble && (
          <div
            className="pointer-events-none absolute max-w-[16rem] -translate-x-1/2 -translate-y-full duration-150 animate-in fade-in-0 zoom-in-95"
            style={(([left, top]) => ({ left, top }))(naTela(
              view.x + bubble.x * pageWidth * view.scale,
              view.y + bubble.y * pageHeight * view.scale - pageHeight / 70 * view.scale - 10,
            ))}
          >
            <div className="rounded-lg bg-neutral-900 px-3 py-2 text-sm leading-snug text-white shadow-xl ring-1 ring-white/15">
              {bubble.text}
            </div>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-neutral-900" />
          </div>
        )}

        {(!source || !ready) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900">
            {failed ? (
              <>
                <p className="text-sm text-white/70">This plan did not load.</p>
                <Button
                  variant="outline"
                  className="atlas-burst border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => { setFailed(false); setAttempt(n => n + 1) }}
                >
                  Try again
                </Button>
              </>
            ) : (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            )}
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
      <div className="pointer-events-none absolute left-4 top-4 flex max-w-[min(70vw,36rem)] flex-wrap items-start gap-2">
        {jobsite && (
          <div className={`flex min-w-0 items-center gap-2.5 px-2.5 ${FLUTUA}`}>
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

        {/* Chegar por vínculo é diferente de abrir a folha: a leitura veio de
            outro desenho, e o cabeçalho passa a contar isso em dois blocos, o
            de onde se veio e o de onde se está. O caminho de volta fica junto
            da identificação, que é onde a pessoa procura saber onde está, e não
            num botão solto no rodapé. */}
        {trail.length > 0 && (() => {
          const from = trail[trail.length - 1]
          return (
            <button
              type="button"
              onClick={() => { setTrail(t => t.slice(0, -1)); onNavigate(from) }}
              title={`Back to ${from.sheetNumber || `plan ${from.pageIndex + 1}`}`}
              // O cabeçalho inteiro é `pointer-events-none`, para a faixa de
              // identificação não roubar o arraste da prancha embaixo dela. Este
              // bloco é o único que se clica, então ele devolve o ponteiro para
              // si: sem isto o clique atravessava e ia parar no desenho.
              className={`pointer-events-auto flex min-w-0 items-center gap-2 pl-2 pr-3 text-left transition-colors hover:bg-neutral-700/90 ${FLUTUA}`}
            >
              <ChevronLeft className="h-4 w-4 shrink-0 text-white/60" />
              <span className="flex min-w-0 flex-col justify-center">
                <span className="truncate text-sm font-medium leading-tight text-white">
                  {from.sheetNumber || `Plan ${from.pageIndex + 1}`}
                </span>
                <span className="truncate text-xs text-white/60">came from</span>
              </span>
            </button>
          )
        })()}

        {/* Doze do lado do texto, seis do lado do botão: o botão traz o próprio
            respiro interno, e somar os dois deixava o ícone mais longe da borda
            do que o texto está da dele. */}
        <div className={`pointer-events-auto flex min-w-0 items-center gap-2 pl-3 pr-1.5 ${FLUTUA}`}>
         <div className="flex min-w-0 flex-col justify-center">
          <p className="truncate text-sm font-medium leading-tight text-white">
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </p>
          {/* A posição na sequência não cede lugar ao título: saber que folha
              se está lendo e saber onde ela cai no set são duas perguntas, e a
              segunda continua valendo depois de a folha ganhar nome. Cada uma
              num canto, que já as separa sem precisar de sinal no meio. */}
          {/* Os cantos opostos só fazem sentido quando há dois dados. Sozinha,
              a contagem fica onde tudo mais começa, e não pendurada à direita
              com um vão no meio. */}
          <p className={`flex items-baseline gap-8 text-xs text-white/60 ${
            sheet.title ? "justify-between" : ""
          }`}>
            {sheet.title && <span className="truncate">{sheet.title}</span>}
            <span className="shrink-0">{index + 1} of {sheets.length}</span>
          </p>
         </div>

         {/* A linhagem da página, junto da identificação porque é sobre esta
             prancha que ela fala. Só existe a partir da segunda revisão: com uma
             só, o relógio prometia uma tela onde não há nada para ver. Trocar a
             prancha continua na barra da direita, com as outras ações da folha. */}
         {sheet.revisions > 1 && (
           <button
             type="button"
             onClick={() => setRevisions(true)}
             title="Revisions of this sheet"
             className="flex h-9 shrink-0 items-center gap-1 rounded-md px-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
           >
             <History className="h-4 w-4" />
             <span className="text-xs font-medium tabular-nums">{sheet.revisions}</span>
           </button>
         )}
        </div>
      </div>

      <SheetRevisions
        sheet={sheet}
        jobsiteId={jobsiteId}
        canManage={!!canManage}
        open={revisions}
        onClose={() => setRevisions(false)}
        onReplaced={onClose}
      />

      {/* A barra e o painel são dois blocos, não um que estica. Grudados, a
          largura do painel esticava a fileira de ícones e sobrava vão depois do
          X; soltos, cada um tem a largura do que carrega. */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
       {/* Em tela estreita a fileira deitada avança sobre a identificação, que
           é o que a pessoa precisa ler. Então ela fica de pé, e a ordem se
           inverte junto: o X sobe para o topo, onde a mão o procura, e a lupa
           desce para o fim. */}
       <div
         className={`flex items-center gap-1 px-1.5 max-sm:h-auto max-sm:w-[50px] max-sm:flex-col-reverse max-sm:px-0 max-sm:py-1.5 ${FLUTUA}`}
       >
        {/* Procurar texto na prancha. O plano guarda o texto que foi impresso
            nele, então achar "U341" é leitura de PDF, não busca em imagem. */}
        {finding && (
          <div className="flex items-center gap-1">
            <div className="relative">
              <input
                autoFocus
                value={needle}
                onChange={e => setNeedle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") goToHit(e.shiftKey ? -1 : 1)
                  if (e.key === "Escape") { setFinding(false); setNeedle(""); setHits([]) }
                }}
                placeholder="Find on this sheet"
                className="h-9 w-56 rounded-md border border-white/15 bg-white/5 py-1 pl-2.5 pr-8 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus-visible:border-white/40"
              />
              {/* Limpar sem fechar a busca: trocar de palavra é o que mais se faz
                  aqui, e apagar letra por letra num campo de tablet é penoso. */}
              {needle && (
                <button
                  type="button"
                  onClick={() => { setNeedle(""); setHits([]); setHit(0) }}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Contador e setas só existem quando há o que contar e para onde
                ir. Reservados o tempo todo, esticavam a barra em cem pixels que
                ficavam vazios enquanto ninguém tinha digitado nada. */}
            {needle.trim().length >= 2 && (
              <span className="shrink-0 whitespace-nowrap px-1 text-xs tabular-nums text-white/60">
                {searching ? "…" : hits.length ? `${hit + 1} of ${hits.length}` : "none"}
              </span>
            )}
            {hits.length > 0 && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => goToHit(-1)}
                  title="Previous match (Shift+Enter)"
                  className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => goToHit(1)}
                  title="Next match (Enter)"
                  className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </>
            )}
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
          variant={layersOpen ? "default" : "ghost"}
          className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
          title="What to show on the sheet"
          onClick={() => setLayersOpen(v => !v)}
        >
          <Eye className="h-4 w-4" />
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
        {canManage && (
          <Button
            size="icon"
            variant="ghost"
            className="atlas-burst pointer-events-auto h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            title="Replace this plan"
            onClick={() => setRevisions(true)}
          >
            <FileUp className="h-4 w-4" />
          </Button>
        )}
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

        {/* O painel desce da barra e para logo abaixo dela, com folga. */}
        {layersOpen && (
          <div className="w-max rounded-lg border border-white/10 bg-neutral-800/95 p-1.5 shadow-xl backdrop-blur duration-200 animate-in fade-in-0 slide-in-from-top-2">
              <p className="px-1.5 pb-1.5 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
                Show on this sheet
              </p>
              <div className="flex flex-col gap-0.5">
                {LAYERS.map(layer => {
                  const on = layers[layer.key]
                  return (
                    <button
                      key={layer.key}
                      type="button"
                      onClick={() => setLayers(v => ({ ...v, [layer.key]: !v[layer.key] }))}
                      className={`atlas-burst flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        on ? "text-white hover:bg-white/10" : "text-white/35 hover:bg-white/5"
                      }`}
                    >
                      <layer.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 whitespace-nowrap">{layer.label}</span>
                      {/* O olho aberto ou fechado carrega o estado sozinho: um
                          quadradinho marcado obriga a lembrar o que "marcado"
                          quer dizer aqui. */}
                      {on
                        ? <Eye className="h-3.5 w-3.5 shrink-0" />
                        : <EyeOff className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
          </div>
        )}
      </div>

      {/* A seta diz para onde vai; o número diz aonde chega. Ele fica apagado de
          propósito: quem está lendo a prancha quer virar a folha, e só de vez em
          quando quer saber que folha é a de trás. */}
      {prev && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(prev)}
          title={`Plan ${index}`}
          className="atlas-page-turn absolute left-4 top-1/2 h-24 w-10 -translate-y-1/2 flex-col gap-1 rounded-lg bg-neutral-800/95 text-white backdrop-blur hover:bg-neutral-700 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="text-[11px] font-normal tabular-nums text-white/35">{index}</span>
        </Button>
      )}
      {next && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(next)}
          title={`Plan ${index + 2}`}
          className="atlas-page-turn absolute right-4 top-1/2 h-24 w-10 -translate-y-1/2 flex-col gap-1 rounded-lg bg-neutral-800/95 text-white backdrop-blur hover:bg-neutral-700 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
          <span className="text-[11px] font-normal tabular-nums text-white/35">{index + 2}</span>
        </Button>
      )}

      {canAnnotate && (
        // Este cresce quando a ferramenta abre as opções dela, então a altura é
        // piso e não trava: dois blocos empilhados precisam de mais que 50.
        <div className={`absolute bottom-4 left-4 flex max-w-[calc(100vw-9rem)] flex-wrap items-center gap-2 px-1.5 py-1.5 text-white transition-all duration-200 ${FLUTUA} h-auto min-h-[50px]`}>
          <div className="flex items-center gap-1">
            {TOOLS.map(toolButton)}
          </div>

          {drawTool && (
            <>
              <span className="h-6 w-px bg-white/15" />
              {/* Larga, a paleta inteira à mão. Estreita, só a cor em uso, e as
                  outras esperam na gaveta: encolher o contêiner é o certo, e
                  não empurrar a prancha para caber tudo. */}
              <div className="hidden items-center gap-1 lg:flex">
                {palette.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setInk({ color: c.value })}
                    title={c.label}
                    className={`atlas-burst flex items-center justify-center rounded-md transition-colors ${CASA} ${
                      color === c.value ? "bg-white/20" : "hover:bg-white/10"
                    }`}
                  >
                    <span
                      style={{ background: c.value }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        color === c.value ? "scale-110 border-white" : "border-white/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {/* A gaveta sobe do próprio botão, e não do canto da barra: ela é
                  a continuação dele, e quem tocou aqui procura a resposta aqui.
                  De pé, na direção em que o dedo já está subindo. */}
              <span className="relative lg:hidden">
                <button
                  onClick={() => setGaveta(g => (g === "cor" ? null : "cor"))}
                  title="Colour"
                  className={`atlas-burst flex items-center justify-center rounded-md transition-colors ${CASA} ${
                    gaveta === "cor" ? "bg-white/20" : "hover:bg-white/10"
                  }`}
                >
                  <span
                    style={{ background: color }}
                    className={`h-6 w-6 rounded-full border transition-transform ${
                      gaveta === "cor" ? "scale-110 border-white" : "border-white/30"
                    }`}
                  />
                </button>
                {gaveta === "cor" && (
                  <div
                    className={`absolute bottom-full left-1/2 mb-5 flex w-[50px] -translate-x-1/2 flex-col items-center gap-1 p-1.5 duration-150 animate-in fade-in-0 slide-in-from-bottom-1 ${MOLDURA}`}
                  >
                    {/* Sem a cor em uso: ela está no botão logo abaixo, e
                        repeti-la seria oferecer o que se acabou de tocar. */}
                    {palette.filter(c => c.value !== color).reverse().map(c => (
                      <button
                        key={c.value}
                        onClick={() => { setInk({ color: c.value }); setGaveta(null) }}
                        title={c.label}
                        className={`atlas-burst flex items-center justify-center rounded-md transition-colors hover:bg-white/10 ${CASA}`}
                      >
                        <span
                          style={{ background: c.value }}
                          className="h-6 w-6 rounded-full border border-white/30 transition-transform group-hover:scale-110"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </span>

              <span className="h-6 w-px bg-white/15" />
              <div className="hidden items-center gap-1 lg:flex">
                {widths.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => { setInk({ width: w }); showSample() }}
                    title={`Stroke ${i + 1} of ${widths.length}`}
                    className={`atlas-burst flex items-center justify-center rounded-md transition-colors ${CASA} ${
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
              <span className="relative lg:hidden">
                <button
                  onClick={() => setGaveta(g => (g === "espessura" ? null : "espessura"))}
                  title="Stroke width"
                  className={`atlas-burst flex items-center justify-center rounded-md transition-colors ${CASA} ${
                    gaveta === "espessura" ? "bg-white/20" : "hover:bg-white/10"
                  }`}
                >
                  <span
                    className="rounded-full bg-white"
                    style={{
                      width: `${3 + widths.indexOf(width) * 3}px`,
                      height: `${3 + widths.indexOf(width) * 3}px`,
                    }}
                  />
                </button>
                {gaveta === "espessura" && (
                  <div
                    className={`absolute bottom-full left-1/2 mb-5 flex w-[50px] -translate-x-1/2 flex-col items-center gap-1 p-1.5 duration-150 animate-in fade-in-0 slide-in-from-bottom-1 ${MOLDURA}`}
                  >
                    {/* Todas, inclusive a em uso: espessura se escolhe por
                        comparação, e uma bolinha sozinha diz pouco sobre ser a
                        fina ou a média. A atual fica fora de alcance, e é por
                        ela que se sabe qual está valendo. */}
                    {widths.map((w, i) => [w, i] as const).reverse().map(([w, i]) => {
                      const atual = w === width
                      return (
                        <button
                          key={w}
                          disabled={atual}
                          onClick={() => { setInk({ width: w }); showSample(); setGaveta(null) }}
                          title={atual ? "In use" : `Stroke ${i + 1} of ${widths.length}`}
                          className={`atlas-burst flex items-center justify-center rounded-md transition-colors ${CASA} ${
                            atual
                              ? "cursor-default bg-white/10 opacity-40 ring-1 ring-inset ring-white/40"
                              : "hover:bg-white/10"
                          }`}
                        >
                          <span
                            className="rounded-full bg-white"
                            style={{ width: `${3 + i * 3}px`, height: `${3 + i * 3}px` }}
                          />
                        </button>
                      )
                    })}
                  </div>
                )}
              </span>

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
                // Sem o rótulo ao lado ele é um botão de ícone como os outros,
                // e botão de ícone é quadrado: 36 por 36. Com o rótulo, a
                // largura passa a ser a do texto.
                className={`atlas-burst flex h-9 w-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-all duration-200 lg:w-auto lg:justify-start lg:px-2 ${
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
                // Fechada, a amostra tem largura zero mas continua sendo filha
                // da fileira, e o vão de oito da fileira sobra depois do último
                // botão. A margem negativa devolve esse vão enquanto ela está
                // fechada, sem tirá-la do fluxo: fora dele, a abertura deixaria
                // de ser animada.
                className={`flex items-center overflow-hidden transition-all duration-200 ${
                  sample ? "max-w-[9rem] opacity-100" : "-ml-2 max-w-0 opacity-0"
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

      {/* Nome do destino e o botão de ir, ancorados onde o dedo tocou. */}
      {peek && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setPeek(null)} />
          <div
            className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-lg border border-white/10 bg-neutral-800/95 px-2.5 py-2 text-white shadow-xl backdrop-blur"
            // Centrada na etiqueta e um respiro acima dela.
            style={{ left: peek.x, top: Math.max(64, peek.y - 10) }}
          >
            <span className="max-w-56 truncate text-sm">
              <span className="text-white/50">{peek.target.documentName} · </span>
              {peek.target.sheetName}
            </span>
            <Button size="sm" onClick={() => follow(peek.target)}>
              Open
            </Button>
          </div>
        </>
      )}

      <SheetLinkDialog
        jobsiteId={jobsiteId}
        open={!!linking}
        onClose={() => setLinking(null)}
        onPick={saveLink}
      />

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

      {/* Dois blocos conjugados, não uma fileira de botões soldados: em cima
          o zoom, embaixo o giro, com o mesmo respiro entre eles que separa
          qualquer outro par aqui. Cada um é a mesma moldura dos demais, de pé:
          cinquenta de largura, botão de trinta e seis, sete de cada lado. */}
      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-2">
        <div className={`flex w-[50px] flex-col items-center gap-1 p-1.5 ${MOLDURA}`}>
          <Button
            size="icon"
            variant="ghost"
            className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            onClick={() => zoomCentre(1.25)}
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {/* Enquadrar e o nível de zoom eram dois: o segundo dizia em que
              ponto se está, o primeiro levava de volta ao começo, e são a mesma
              conversa. Viraram um botão só, com o fio de borda da moldura para
              se distinguir dos outros dois sem sair da família. */}
          <button
            onClick={fit}
            title="Fit the sheet to the screen"
            // Carrega dois recursos, então ocupa o espaço dos dois: trinta e
            // seis do enquadrar, quinze da conta, e os quatro do vão que sumiu
            // entre eles. O bloco fica com a mesma altura de antes.
            className="flex h-[55px] w-9 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-white/10 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Maximize className="h-4 w-4" />
            <span className="text-[10px] leading-none tabular-nums">{zoomLabel(zoom)}</span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            onClick={() => zoomCentre(0.8)}
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        {/* Girar é outro assunto que não o zoom, e por isso outro bloco.
            Noventa graus por vez, para os dois lados: documento sai retrato ou
            paisagem conforme quem o emitiu, e virar o tablet de lado com a mão
            suja não é opção. */}
        <div className={`flex w-[50px] flex-col items-center gap-1 p-1.5 ${MOLDURA}`}>
          <Button
            size="icon"
            variant="ghost"
            className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            onClick={() => gira(-90)}
            title="Rotate left"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="atlas-burst h-9 w-9 text-white transition-all hover:bg-white/10 hover:text-white"
            onClick={() => gira(90)}
            title="Rotate right"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
