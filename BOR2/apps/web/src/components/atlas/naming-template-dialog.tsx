"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import {
  readPageNames, splitSuffix,
  type NamingMode, type NamingRegion, type NamingTemplate, type PageName,
} from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  ChevronLeft, ChevronRight, Crop, Minus, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

const EMPTY_REGION: NamingRegion = { x0: 0, y0: 0, x1: 0, y1: 0, rotation: 0 }

const ROTATIONS = [
  { value: "0", label: "Horizontal" },
  { value: "90", label: "Vertical" },
]

const MIN_ZOOM = 1
const MAX_ZOOM = 6

const has = (r: NamingRegion) => r.x1 > r.x0 && r.y1 > r.y0

/** As oito pontas da região, na posição relativa dela e com o cursor de cada uma. */
const PONTAS = [
  { ponta: "nw", x: 0,   y: 0,   cursor: "nwse-resize" },
  { ponta: "n",  x: 0.5, y: 0,   cursor: "ns-resize" },
  { ponta: "ne", x: 1,   y: 0,   cursor: "nesw-resize" },
  { ponta: "e",  x: 1,   y: 0.5, cursor: "ew-resize" },
  { ponta: "se", x: 1,   y: 1,   cursor: "nwse-resize" },
  { ponta: "s",  x: 0.5, y: 1,   cursor: "ns-resize" },
  { ponta: "sw", x: 0,   y: 1,   cursor: "nesw-resize" },
  { ponta: "w",  x: 0,   y: 0.5, cursor: "ew-resize" },
]

/**
 * As faixas repartem o arquivo inteiro, na ordem.
 *
 * A primeira começa na página 1, a última termina na última página, cada uma
 * começa logo depois da anterior e tem ao menos uma página. Sem buraco e sem
 * página em duas faixas: página em duas faixas teria duas marcações brigando
 * pelo mesmo nome, e faixa que começa na 9 e termina na 8 não é faixa.
 *
 * Gabarito antigo, com limite em branco ou sobreposto, entra aqui e sai
 * repartido. Faixa que não cabe (mais faixas que páginas) sai.
 */
function particionar(levels: NamingRegion[], pages: number): NamingRegion[] {
  if (!levels.length) return levels
  const n = Math.max(1, Math.min(levels.length, pages))
  const out = levels.slice(0, n).map(l => ({ ...l }))
  for (let i = 0; i < n; i++) {
    const from = i === 0 ? 1 : (out[i - 1].toPage as number) + 1
    const teto = pages - (n - 1 - i)
    out[i].fromPage = from
    out[i].toPage = i === n - 1 ? pages : Math.min(teto, Math.max(from, out[i].toPage ?? from))
  }
  return out
}

/**
 * O fim da faixa `i` vai para `v`, e as seguintes andam junto: cada uma começa
 * logo depois da anterior e, espremida, fica com uma página. `v` chega já
 * limitado para sobrar uma página a cada faixa seguinte.
 */
function empurrarFim(levels: NamingRegion[], i: number, v: number): NamingRegion[] {
  const out = levels.map(l => ({ ...l }))
  out[i].toPage = v
  for (let k = i + 1; k < out.length; k++) {
    const from = (out[k - 1].toPage as number) + 1
    out[k].fromPage = from
    if ((out[k].toPage ?? 0) < from) out[k].toPage = from
  }
  return out
}

/** O começo da faixa `i` vai para `v`, e as anteriores cedem do mesmo jeito. */
function empurrarInicio(levels: NamingRegion[], i: number, v: number): NamingRegion[] {
  const out = levels.map(l => ({ ...l }))
  out[i].fromPage = v
  for (let k = i - 1; k >= 0; k--) {
    const to = (out[k + 1].fromPage as number) - 1
    out[k].toPage = to
    if ((out[k].fromPage ?? 1) > to) out[k].fromPage = to
  }
  return out
}

// As duas perguntas que o arquivo responde antes de qualquer marcação.
const MODES: { value: NamingMode; label: string; hint: string }[] = [
  {
    value: "layout",
    label: "Same layout",
    hint: "Every page follows the same drawing. Mark where the name is, and a second place for the pages that don't have the first.",
  },
  {
    value: "ranges",
    label: "By page range",
    hint: "The file is several reports glued together. Say from which page to which, and where the name is printed in that stretch.",
  },
  {
    value: "file",
    label: "From the file",
    hint: "Nothing is printed on the pages. The file title names the sheets, numbered by page.",
  },
]

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
/**
 * Um limite de página, com um degrau de cada lado.
 *
 * O teclado numérico do navegador esconde as setas até o ponteiro chegar em
 * cima, e em tablet ele não as mostra nunca. Aqui o menos e o mais são parte do
 * campo: ajustar de uma em uma é o gesto de quem procura onde o layout muda, e
 * ele não pode depender de digitar.
 */
function PageField({ value, min, max, disabled, onChange }: {
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  // O que se digita só vale ao sair do campo: conferir o limite a cada tecla
  // impediria digitar "12" num campo cujo mínimo é 5.
  const [texto, setTexto] = useState(String(value))
  useEffect(() => setTexto(String(value)), [value])
  const aplicar = (n: number) => {
    const v = Math.min(max, Math.max(min, n))
    setTexto(String(v))
    if (v !== value) onChange(v)
  }
  return (
    <div className={`flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent dark:bg-input/30 ${
      disabled ? "opacity-50" : ""
    }`}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => aplicar(value - 1)}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={() => aplicar(Number(texto) || value)}
        onKeyDown={e => { if (e.key === "Enter") aplicar(Number(texto) || value) }}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => aplicar(value + 1)}
        className="flex h-full w-7 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Segurar o botão repete a ação.
 *
 * Virar noventa páginas de uma em uma, ou subir o zoom de 1x a 6x em degraus de
 * 0,25, é o mesmo clique repetido dezenas de vezes. Segurar faz o que a pessoa
 * já tentava fazer: o primeiro toque anda um passo, e depois de um instante a
 * repetição assume.
 */
function useSegurar(acao: () => void) {
  const atual = useRef(acao)
  atual.current = acao
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeticao = useRef<ReturnType<typeof setInterval> | null>(null)

  const parar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current)
    if (repeticao.current) clearInterval(repeticao.current)
    espera.current = null
    repeticao.current = null
  }, [])

  useEffect(() => parar, [parar])

  return {
    onPointerDown: () => {
      atual.current()
      espera.current = setTimeout(() => {
        repeticao.current = setInterval(() => atual.current(), 80)
      }, 400)
    },
    onPointerUp: parar,
    onPointerLeave: parar,
    onPointerCancel: parar,
  }
}

/** O que a marcação entrega a quem monta os botões em volta dela. */
export type NamingEditorContext = {
  template: NamingTemplate
  /** Há o que ler: uma região desenhada, ou o modo que tira o nome do arquivo. */
  ready: boolean
  reading: string
  preview: PageName[] | null
  /** 1 marca onde o nome está; 2 confere o que foi lido. */
  etapa: 1 | 2
  runPreview: () => Promise<PageName[] | undefined>
}

/**
 * A marcação sem moldura. Vive num diálogo próprio, para trocar o set de um
 * documento que já existe, e é a segunda etapa do documento novo: lá ela não
 * é um botão que abre outra janela, é a própria etapa.
 */
export function NamingTemplateEditor({ url, open, initial, fileName, paginas, actions }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  /** O nome do arquivo anexado, de onde o modo "From the file" tira o título. */
  fileName?: string
  /**
   * As folhas escolhidas na grade, quando a nomeação vale só para elas.
   *
   * Vazio é o arquivo inteiro. Com escolha, a virada de página anda só por
   * dentro dela e a leitura só cobre essas: quem escolheu onze folhas quer
   * marcar o gabarito numa delas, e não caçá-las no meio de noventa e sete.
   */
  paginas?: number[]
  /** Os botões, no pé da coluna de controles. */
  actions: (ctx: NamingEditorContext) => ReactNode
}) {
  const [page, setPage] = useState(0)
  // Zero enquanto o arquivo não contou as páginas: as faixas só se repartem
  // com o número certo, senão uma conta de uma página só apagaria faixas.
  const [pages, setPages] = useState(0)
  const [mode, setMode] = useState<NamingMode>("layout")
  const [levels, setLevels] = useState<NamingRegion[]>([{ ...EMPTY_REGION }])
  const [drawing, setDrawing] = useState<number | null>(null)
  const [preview, setPreview] = useState<PageName[] | null>(null)
  const [reading, setReading] = useState("")
  // A marcação tem duas etapas: marcar onde o nome está, e conferir o que foi
  // lido. Conferir é outro trabalho, com outros controles, e misturado ao
  // primeiro virava uma coluna que não cabia na tela.
  const [etapa, setEtapa] = useState<1 | 2>(1)

  // A lista por onde a virada de página anda: a escolha, quando existe, ou o
  // arquivo inteiro. Os números são índices de página, base zero.
  const lista = useMemo(
    () => (paginas?.length ? [...paginas].sort((a, b) => a - b) : null),
    [paginas],
  )
  const ondeEstou = lista ? Math.max(0, lista.indexOf(page)) : page
  const quantas = lista ? lista.length : pages

  const folhaRef = useRef<HTMLDivElement>(null)
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
    setEtapa(1)
    setMode(initial?.mode ?? "layout")
    setLevels(initial?.levels?.length ? initial.levels.map(l => ({ ...l })) : [{ ...EMPTY_REGION }])
    setPage(paginas?.length ? Math.min(...paginas) : 0)
  }, [open, initial, paginas])

  // Por trecho, as faixas sempre repartem o arquivo inteiro: confere ao abrir,
  // ao trocar para este modo e quando o arquivo termina de contar as páginas.
  useEffect(() => {
    if (open && mode === "ranges" && pages) setLevels(l => particionar(l, pages))
  }, [open, initial, mode, pages])

  // A folha usa o mesmo motor do leitor de prancha (`PlanCanvas`): a página
  // inteira desenhada uma vez por baixo, o pedaço visível refinado quando a mão
  // para, e o gesto acompanhado por transformação. É o que faz o zoom do leitor
  // não piscar, e era o que faltava aqui: com um canvas só, cada passo do zoom
  // redesenhava o vetor inteiro e a tela travava.
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [pagina, setPagina] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<PlanView>({ scale: 0, x: 0, y: 0 })
  const areaRef = useRef<HTMLDivElement | null>(null)
  const spaceRef = useCallback((el: HTMLDivElement | null) => {
    areaRef.current = el
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
  }, [])

  // O tamanho da página em pontos do PDF: é nele que a região é medida, e é o
  // que o motor precisa para posicionar a folha.
  useEffect(() => {
    if (!open || !url) return
    let vivo = true
    loadPdf(url)
      .then(pdf => pdf.getPage(page + 1))
      .then(p => {
        const v = p.getViewport({ scale: 1 })
        if (vivo) setPagina({ w: v.width, h: v.height })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [open, url, page])

  const fitScale = size.w && pagina.w ? Math.min(size.w / pagina.w, size.h / pagina.h) : 0
  const zoom = fitScale && view.scale ? view.scale / fitScale : 1

  const enquadrar = useCallback(() => {
    if (!fitScale) return
    setView({
      scale: fitScale,
      x: (size.w - pagina.w * fitScale) / 2,
      y: (size.h - pagina.h * fitScale) / 2,
    })
  }, [fitScale, size, pagina])

  // Enquadra ao abrir, ao trocar de folha e enquanto ninguém mexeu no
  // enquadramento: a área ainda está se acomodando quando o diálogo abre, e sem
  // isto a folha nascia num 1,06x torto em vez de caber inteira.
  const mexeu = useRef(false)
  useEffect(() => { if (!view.scale || !mexeu.current) enquadrar() }, [enquadrar, view.scale])
  useEffect(() => { mexeu.current = false; setView(v => ({ ...v, scale: 0 })) }, [page, open])

  const zoomAt = useCallback((fator: number, px: number, py: number) => {
    mexeu.current = true
    setView(v => {
      if (!v.scale || !fitScale) return v
      const alvo = Math.min(MAX_ZOOM * fitScale, Math.max(MIN_ZOOM * fitScale, v.scale * fator))
      const k = alvo / v.scale
      return { scale: alvo, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [fitScale])

  const zoomNoCentro = (fator: number) => zoomAt(fator, size.w / 2, size.h / 2)

  // O número da página é campo: quem procura a folha 60 escreve 60.
  const [paginaTexto, setPaginaTexto] = useState("1")
  useEffect(() => setPaginaTexto(String(ondeEstou + 1)), [ondeEstou])
  const irParaPagina = (texto: string) => {
    const n = Number(texto)
    if (!quantas || !Number.isFinite(n) || n < 1) { setPaginaTexto(String(ondeEstou + 1)); return }
    const alvo = Math.min(quantas, Math.round(n)) - 1
    setPage(lista ? lista[alvo] : alvo)
  }

  const anterior = useSegurar(() => setPage(p => {
    if (!lista) return Math.max(0, p - 1)
    const i = Math.max(0, lista.indexOf(p))
    return lista[Math.max(0, i - 1)] ?? p
  }))
  const proxima = useSegurar(() => setPage(p => {
    if (!lista) return pages ? Math.min(pages - 1, p + 1) : p
    const i = Math.max(0, lista.indexOf(p))
    return lista[Math.min(lista.length - 1, i + 1)] ?? p
  }))
  const afastar = useSegurar(() => zoomNoCentro(1 / 1.2))
  const aproximar = useSegurar(() => zoomNoCentro(1.2))

  // A roda aproxima e afasta em cima do ponto apontado, como no leitor. O
  // ouvinte é montado à mão porque o React registra a roda como passiva, e
  // passiva não pode barrar a rolagem da página.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const naRoda = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
    }
    el.addEventListener("wheel", naRoda, { passive: false })
    return () => el.removeEventListener("wheel", naRoda)
  }, [zoomAt, open])

  // Fora da marcação, arrastar desloca a folha, que é o gesto de quem ampliou e
  // quer chegar ao canto da prancha.
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  function areaDown(e: React.PointerEvent<HTMLDivElement>) {
    if (drawing !== null) return
    mexeu.current = true
    arrasto.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    areaRef.current?.setPointerCapture(e.pointerId)
  }

  function areaMove(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a) return
    setView(v => ({ ...v, x: a.vx + (e.clientX - a.x), y: a.vy + (e.clientY - a.y) }))
  }

  function areaUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current) return
    arrasto.current = null
    areaRef.current?.releasePointerCapture(e.pointerId)
  }

  // O ponto do gesto em fração da página, que é como a região é guardada: assim
  // ela não muda de lugar quando o zoom muda.
  const point = useCallback((e: React.PointerEvent) => {
    const box = areaRef.current?.getBoundingClientRect()
    if (!box || !pagina.w || !view.scale) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left - view.x) / (pagina.w * view.scale))),
      y: Math.min(1, Math.max(0, (e.clientY - box.top - view.y) / (pagina.h * view.scale))),
    }
  }, [pagina, view])

  function down(e: React.PointerEvent) {
    if (drawing === null) return
    folhaRef.current?.setPointerCapture(e.pointerId)
    start.current = point(e)
    setPreview(null)
  }

  // Qual ponta da região está sendo puxada. Com oito pontas, acertar um canto
  // que ficou dois milímetros curto deixa de exigir redesenhar tudo.
  const ajuste = useRef<{ i: number; ponta: string } | null>(null)

  function pegarPonta(e: React.PointerEvent, i: number, ponta: string) {
    e.preventDefault()
    // O arraste da folha mora no contêiner acima: sem isto, puxar a alça
    // arrastaria a prancha inteira junto.
    e.stopPropagation()
    ajuste.current = { i, ponta }
    folhaRef.current?.setPointerCapture(e.pointerId)
    setPreview(null)
  }

  function move(e: React.PointerEvent) {
    const puxando = ajuste.current
    if (puxando) {
      const p = point(e)
      setLevels(list => list.map((l, i) => {
        if (i !== puxando.i) return l
        const y0 = puxando.ponta.includes("n") ? p.y : l.y0
        const y1 = puxando.ponta.includes("s") ? p.y : l.y1
        const x0 = puxando.ponta.includes("w") ? p.x : l.x0
        const x1 = puxando.ponta.includes("e") ? p.x : l.x1
        return {
          ...l,
          x0: Math.min(x0, x1), x1: Math.max(x0, x1),
          y0: Math.min(y0, y1), y1: Math.max(y0, y1),
        }
      }))
      return
    }
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
    if (ajuste.current) {
      ajuste.current = null
      return
    }
    if (drawing === null) return
    start.current = null
    setDrawing(null)
  }

  function mudarFim(i: number, v: number) {
    setLevels(l => empurrarFim(l, i, v))
    setPreview(null)
  }

  function mudarInicio(i: number, v: number) {
    setLevels(l => empurrarInicio(l, i, v))
    setPreview(null)
  }

  // A faixa nova toma a última página da última faixa: 1 a 9 vira 1 a 8 e 9 a
  // 9. Com a última faixa numa página só, não há de onde tirar.
  const ultima = levels[levels.length - 1]
  const cabeOutraFaixa = !!pages && (ultima?.toPage ?? pages) > (ultima?.fromPage ?? 1)

  function novaFaixa() {
    if (!cabeOutraFaixa) return
    setLevels(l => [
      ...l.slice(0, -1),
      { ...l[l.length - 1], toPage: pages - 1 },
      { ...EMPTY_REGION, fromPage: pages, toPage: pages },
    ])
    setPreview(null)
  }

  function removerNivel(i: number) {
    // Por trecho, as páginas da faixa que sai voltam para a de antes.
    setLevels(l => mode === "ranges"
      ? l.flatMap((r, k) => k === i ? [] : k === i - 1 ? [{ ...r, toPage: l[i].toPage }] : [r])
      : l.slice(0, i))
    setPreview(null)
  }

  async function runPreview(): Promise<PageName[] | undefined> {
    const usable = levels.filter(has)
    if (mode !== "file" && !usable.length) return
    setReading("0")
    try {
      const names = await readPageNames(url, { mode, levels: usable },
        (done, total) => setReading(`${done}/${total}`), undefined, fileName,
        lista ?? undefined)
      setPreview(names)
      // Lida a prévia, o trabalho passa a ser conferir: a coluna troca de guia
      // sozinha, porque é para isso que a pessoa pediu a leitura.
      setEtapa(2)
      return names
    } finally {
      setReading("")
    }
  }

  // Refazer é voltar para a marcação com o que já está marcado: mexer em
  // qualquer coisa lá apaga a leitura, e a prévia terá de ser rodada de novo.
  function refazer() {
    setEtapa(1)
  }

  const usable = levels.filter(has)
  const named = preview?.filter(p => p.name).length ?? 0
  // Quantas folhas leram um nome que outra também leu, e por isso ganharam
  // sufixo. Vale dizer: é o número que explica um "1-01-L-B" na lista.
  const suffixed = preview?.filter(p => p.name !== p.read).length ?? 0
  const pending = preview ? preview.length - named : 0

  // Sem leitura não há o que conferir: qualquer mudança na marcação apaga a
  // prévia e devolve a coluna para a guia de marcar.
  const etapaAtual: 1 | 2 = preview ? etapa : 1
  const lidas = preview?.length ?? 0
  const cheio = lidas ? Math.round((named / lidas) * 100) : 0

  const ctx: NamingEditorContext = {
    template: { mode, levels: usable },
    ready: mode === "file" || usable.length > 0,
    reading, preview, etapa: etapaAtual, runPreview,
  }

  return (
    <>
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Só a folha deste lado. */}
          <div
            ref={spaceRef}
            onPointerDown={areaDown}
            onPointerMove={areaMove}
            onPointerUp={areaUp}
            onPointerCancel={areaUp}
            className={`relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/40 ${
              drawing === null ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
            }`}
          >
            <div
              ref={folhaRef}
              className="absolute inset-0"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              {/* O motor do leitor de prancha, com o mesmo enquadramento: a
                  folha inteira embaixo, o pedaço visível nítido em cima. */}
              {!!pagina.w && !!view.scale && (
                <PlanCanvas
                  url={url}
                  pageIndex={page}
                  view={view}
                  width={size.w}
                  height={size.h}
                  pageWidth={pagina.w}
                  pageHeight={pagina.h}
                />
              )}

              {/* Tirando o nome do arquivo, nada na folha é lido: as áreas
                  marcadas saem de vista, e voltam ao trocar de modo. A posição
                  segue o enquadramento, porque a região é fração da página. */}
              {mode !== "file" && !!view.scale && levels.map((region, i) => has(region) && (
                <div
                  key={i}
                  className={`pointer-events-none absolute border-2 ${
                    i === 0 ? "border-sky-500 bg-sky-500/15" : "border-violet-500 bg-violet-500/15"
                  }`}
                  style={{
                    left: view.x + region.x0 * pagina.w * view.scale,
                    top: view.y + region.y0 * pagina.h * view.scale,
                    width: (region.x1 - region.x0) * pagina.w * view.scale,
                    height: (region.y1 - region.y0) * pagina.h * view.scale,
                  }}
                >
                  <span className={`absolute -top-5 left-0 rounded px-1 text-[10px] font-medium text-white ${
                    i === 0 ? "bg-sky-500" : "bg-violet-500"
                  }`}>
                    {i === 0 ? "1st" : "2nd"}
                  </span>

                  {/* As oito pontas. Puxar a quina ou a lateral acerta a região
                      que ficou curta por um triz, em vez de obrigar a marcar
                      tudo de novo. */}
                  {PONTAS.map(({ ponta, x, y, cursor }) => (
                    <span
                      key={ponta}
                      onPointerDown={e => pegarPonta(e, i, ponta)}
                      style={{ left: `${x * 100}%`, top: `${y * 100}%`, cursor }}
                      className={`pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-white shadow-sm ${
                        i === 0 ? "bg-sky-500" : "bg-violet-500"
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Todo controle deste. */}
          <div className="flex min-h-0 w-80 shrink-0 flex-col gap-3">
            {/* As duas guias da marcação: marcar e, depois de ler, conferir. A
                segunda só existe com leitura feita. */}
            <div className="flex shrink-0 gap-1 rounded-lg border border-border/60 p-1">
              {([1, 2] as const).map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={n === 2 && !preview}
                  onClick={() => setEtapa(n)}
                  className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                    etapaAtual === n
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {/* O número é crachá, não texto com ponto no meio. */}
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                    etapaAtual === n ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
                  }`}>
                    {n}
                  </span>
                  {n === 1 ? "Marking" : "Names"}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {etapaAtual === 1 && (<>
            {/* A primeira decisão, e a que mudaria o sentido de tudo abaixo se
                ficasse implícita: como o arquivo está organizado. Por isso ela
                é a maior coisa escrita na coluna. */}
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-2">
              <div className="flex gap-1">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setMode(m.value)
                      // Por layout são dois níveis no máximo.
                      if (m.value === "layout") setLevels(l => l.slice(0, 2))
                      setPreview(null)
                    }}
                    className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors ${
                      mode === m.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {/* A descrição é o que decide de verdade: ela diz como o arquivo
                  está organizado, e quem lê isso por alto marca a região certa
                  no lugar errado. Por isso ela é a maior coisa escrita aqui. */}
              <p className="px-0.5 text-sm leading-snug text-foreground/90">
                {MODES.find(m => m.value === mode)?.hint}
              </p>
            </div>

            {/* A página se escreve, e as setas seguram: procurar onde o layout
                muda na folha 60 de 97 não pode custar 59 cliques. */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-1.5">
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={page === 0}
                title="Previous page. Hold to run through the file"
                {...anterior}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                Page
                <input
                  type="number"
                  min={1}
                  max={quantas || 1}
                  value={paginaTexto}
                  disabled={!quantas}
                  onChange={e => setPaginaTexto(e.target.value)}
                  onBlur={() => irParaPagina(paginaTexto)}
                  onKeyDown={e => { if (e.key === "Enter") irParaPagina(paginaTexto) }}
                  className="h-7 w-10 rounded-md border border-input bg-transparent text-center text-xs tabular-nums outline-none focus-visible:border-ring dark:bg-input/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                of {quantas || "…"}
              </span>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={ondeEstou + 1 >= quantas}
                title="Next page. Hold to run through the file"
                {...proxima}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-1.5">
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={zoom <= MIN_ZOOM}
                title="Zoom out. Hold to keep going"
                {...afastar}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={enquadrar}
                className="rounded px-2 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                title="Fit the sheet to the area"
              >
                {zoom.toFixed(2)}x
              </button>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                disabled={zoom >= MAX_ZOOM}
                title="Zoom in. Hold to keep going"
                {...aproximar}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {mode === "file" && (
              <div className="rounded-lg border border-border/60 p-3 text-xs leading-snug text-muted-foreground">
                Nothing to mark here. Run the preview to see the names the file title gives, and
                save it to keep the choice for the next upload of this folder.
              </div>
            )}

            {mode !== "file" && levels.map((region, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-sky-500" : "bg-violet-500"}`} />
                    {mode === "ranges"
                      ? `Range ${i + 1}`
                      : i === 0 ? "First level" : "Second level"}
                  </span>
                  {i > 0 && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => removerNivel(i)}
                      title="Remove this level"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Desenhando, o botão vira aviso de coisa acontecendo: o
                    tracejado azul corre em volta dele, o mesmo desenho que a
                    seleção por trecho usa. Sem isso, o clique não mudava nada à
                    vista e a pessoa ficava esperando algo abrir. */}
                <Button
                  variant="outline"
                  className={drawing === i
                    ? "atlas-ants relative border-primary/40 text-primary"
                    : ""}
                  onClick={() => setDrawing(drawing === i ? null : i)}
                >
                  <Crop className="h-3.5 w-3.5" />
                  {drawing === i ? "Drawing…"
                    : has(region) ? "Redraw the area" : "Draw the area"}
                </Button>

                {/* A faixa só existe no modo por trecho: no de layout ela não
                    significa nada, e mostrá-la ali seria oferecer uma decisão
                    que não muda resultado nenhum. */}
                {mode === "ranges" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Pages</Label>
                  <div className="flex items-center gap-1.5">
                    {/* A primeira faixa começa sempre na página 1 e a última
                        termina sempre na última: esses dois limites ficam
                        travados. O começo não passa do fim, e cada faixa
                        deixa ao menos uma página para as vizinhas. */}
                    <PageField
                      value={region.fromPage ?? 1}
                      min={i + 1}
                      max={region.toPage ?? pages}
                      disabled={i === 0 || !pages}
                      onChange={v => mudarInicio(i, v)}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">to</span>
                    <PageField
                      value={region.toPage ?? pages}
                      min={region.fromPage ?? 1}
                      max={pages - (levels.length - 1 - i)}
                      disabled={i === levels.length - 1 || !pages}
                      onChange={v => mudarFim(i, v)}
                    />
                  </div>
                </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Text direction</Label>
                  <Select
                    value={String(region.rotation)}
                    onValueChange={v => {
                      if (!v) return
                      setLevels(l => l.map((r, k) => k === i ? { ...r, rotation: Number(v) } : r))
                      // A leitura antiga era da outra direção: o envio não pode usá-la.
                      setPreview(null)
                    }}
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

            {/* Por layout são dois, porque precedência com três já é regra que
                ninguém acompanha. Por trecho não há teto: o arquivo tem os
                trechos que tiver. */}
            {mode === "layout" && levels.length < 2 && (
              <Button
                variant="outline"
                onClick={() => { setLevels(l => [...l, { ...EMPTY_REGION }]); setPreview(null) }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add a second level
              </Button>
            )}
            {mode === "ranges" && (
              <Button variant="outline" disabled={!cabeOutraFaixa} onClick={novaFaixa}>
                <Plus className="h-3.5 w-3.5" />
                {cabeOutraFaixa || !pages ? "Add a page range" : "No page left for another range"}
              </Button>
            )}
            </>)}

            {etapaAtual === 2 && preview && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {/* Quanto do arquivo saiu nomeado, que é a pergunta desta guia:
                    subir um set com folha sem nome é descobrir isso em campo. */}
                <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                  <p className="text-sm font-medium">
                    {named} of {preview.length} named
                    {pending > 0 && <span className="text-destructive"> · {pending} pending</span>}
                    {suffixed > 0 && (
                      <span className="text-muted-foreground"> · {suffixed} disambiguated</span>
                    )}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pending > 0 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${cheio}%` }}
                    />
                  </div>
                  <Button variant="outline" onClick={refazer}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Redo the naming
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {/* A linha leva até a página que ela descreve.

                      Conferir a leitura era navegar à mão: a lista dizia que a
                      página 47 leu errado, e chegar lá custava quarenta e seis
                      cliques na seta. Quem lê a prévia está justamente
                      procurando a página que destoa, então a linha é o caminho
                      mais curto até ela.

                      Nem isto nem as setas limpam a prévia: virar página não
                      muda o que é lido. Quem limpa é mexer na leitura (a área,
                      a direção, as faixas, o modo), e sem prévia o envio não
                      sai. */}
                  {preview.map(p => (
                    <button
                      key={p.pageIndex}
                      type="button"
                      onClick={() => setPage(p.pageIndex)}
                      title="Show this page"
                      className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent ${
                        p.pageIndex === page ? "bg-accent/60" : ""
                      }`}
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                        {p.pageIndex + 1}
                      </span>
                      {/* O sufixo de desempate sai em itálico e cinza: ele não
                          faz parte do que foi lido da prancha, é o que o
                          sistema acrescentou para separar duas folhas
                          homônimas. Misturado ao título, pareceria nome. */}
                      <span className={`min-w-0 flex-1 truncate ${p.name ? "" : "text-destructive"}`}>
                        {p.name ? (
                          <>
                            {splitSuffix(p.name).base}
                            {splitSuffix(p.name).suffix && (
                              <span className="italic text-muted-foreground">
                                {splitSuffix(p.name).suffix}
                              </span>
                            )}
                          </>
                        ) : "no name"}
                      </span>
                      {p.level > 0 && (
                        <span className={`shrink-0 rounded px-1 text-[10px] ${
                          p.level === 1 ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        }`}>
                          {p.level === 1 ? "1st" : "2nd"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div>

            {/* As ações moram no pé da coluna, e não num rodapé embaixo de
                tudo: a folha fica com a altura inteira da tela. */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 pt-3">
              {actions(ctx)}
            </div>
          </div>
        </div>
    </>
  )
}

export function NamingTemplateDialog({ url, open, initial, paginas, onClose, onSave }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  /** As folhas escolhidas, quando a nomeação vale só para elas. */
  paginas?: number[]
  onClose: () => void
  onSave: (template: NamingTemplate) => void
}) {
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
        <NamingTemplateEditor
          url={url}
          open={open}
          initial={initial}
          paginas={paginas}
          actions={({ template, ready, reading, etapa, runPreview }) => (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {etapa === 1 ? (
                <Button className="flex-1" disabled={!ready || !!reading} onClick={runPreview}>
                  {reading ? `Reading ${reading}` : "Preview names"}
                </Button>
              ) : (
                <Button className="flex-1" disabled={!ready} onClick={() => onSave(template)}>
                  Save template
                </Button>
              )}
            </div>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}
