"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, Pentagon, RotateCcw, Ruler, Trash2, X } from "lucide-react"
import { HoldButton } from "@/components/atlas/hold-button"
import { useRef, useState } from "react"

/**
 * A trena do leitor de prancha.
 *
 * Em obra a pergunta "quanto dá isso aqui" é constante, e até aqui ela saía do
 * Atlas: ia para a régua do Bluebeam ou para a trena de mão. Aqui se mede por
 * cima da própria folha.
 *
 * ── A escala é o que falta ao desenho ──
 *
 * O PDF sabe o tamanho do papel em pontos, mas não sabe que um palmo daquele
 * papel vale um pé de parede. A escala se dá de um jeito só: dois toques nas
 * pontas de uma cota que se conhece e o valor dela. Serve para qualquer folha,
 * inclusive a escaneada ou impressa fora de escala.
 *
 * ── Onde a escala fica ──
 *
 * Na folha, no servidor, e vale para todo mundo da obra: quem calibrou uma vez
 * poupou a calibração de todos os outros. Uma cópia fica também neste aparelho,
 * para a trena funcionar sem rede e para o caso de o servidor recusar.
 *
 * ── O que se mede ──
 *
 * Toque por toque, uma linha: cada trecho mostra o comprimento dele, e o painel
 * soma. Fechada, a linha vira polígono e o painel dá a área, que é o que conta
 * painel, forro e metro de chão.
 */

/** Pontos de PDF por pé de medida real. É a escala inteira numa conta só. */
export type Escala = { ptPorPe: number; rotulo: string }

export type Ponto = [number, number]

const CHAVE = (sheetId: string) => `atlas:escala:${sheetId}`

export function lerEscala(sheetId: string): Escala | null {
  try {
    const bruto = localStorage.getItem(CHAVE(sheetId))
    if (!bruto) return null
    const e = JSON.parse(bruto) as Escala
    return e && e.ptPorPe > 0 ? e : null
  } catch {
    return null
  }
}

export function gravarEscala(sheetId: string, escala: Escala | null) {
  try {
    if (escala) localStorage.setItem(CHAVE(sheetId), JSON.stringify(escala))
    else localStorage.removeItem(CHAVE(sheetId))
  } catch {
    // Sem armazenamento a escala vale até fechar a folha, e mais nada.
  }
}

/** O comprimento de um trecho, em pontos de PDF. */
export function trechoPt(a: Ponto, b: Ponto, largura: number, altura: number) {
  return Math.hypot((b[0] - a[0]) * largura, (b[1] - a[1]) * altura)
}

/** A área de um polígono, em pontos quadrados, pela fórmula do cadarço. */
export function areaPt2(pontos: Ponto[], largura: number, altura: number) {
  let soma = 0
  for (let i = 0; i < pontos.length; i++) {
    const [x1, y1] = pontos[i]
    const [x2, y2] = pontos[(i + 1) % pontos.length]
    soma += x1 * largura * y2 * altura - x2 * largura * y1 * altura
  }
  return Math.abs(soma) / 2
}

/**
 * Pés escritos como se escreve na obra: 12'-4 1/2".
 *
 * A polegada vai ao oitavo, que é a menor marca da trena de bolso. Mais fino que
 * isso é precisão que o desenho não tem: a espessura do traço já é maior.
 */
export function formatarPes(pes: number): string {
  if (!Number.isFinite(pes)) return "-"
  const oitavosTotais = Math.round(Math.abs(pes) * 12 * 8)
  const pe = Math.floor(oitavosTotais / 96)
  const resto = oitavosTotais - pe * 96
  const pol = Math.floor(resto / 8)
  let oitavos = resto - pol * 8
  let den = 8
  while (oitavos > 0 && oitavos % 2 === 0) { oitavos /= 2; den /= 2 }
  const fracao = oitavos ? ` ${oitavos}/${den}` : ""
  return `${pes < 0 ? "-" : ""}${pe}'-${pol}${fracao}"`
}

/** Área em pés quadrados, com uma casa quando ela é pequena. */
export function formatarArea(pes2: number): string {
  if (!Number.isFinite(pes2)) return "-"
  const casas = pes2 < 100 ? 1 : 0
  return `${pes2.toLocaleString("en-US", { maximumFractionDigits: casas, minimumFractionDigits: casas })} sq ft`
}

/**
 * Lê uma medida escrita à mão: 12'-4", 12' 4 1/2", 12.5', 148", 12.5.
 *
 * Número sem marca é pé, porque é assim que se lê uma cota em planta. Devolve
 * pés, ou nulo quando o texto não é medida nenhuma.
 */
export function lerPes(texto: string): number | null {
  const t = texto.trim().replace(/[′’]/g, "'").replace(/[″”]/g, '"')
  if (!t) return null
  const fracao = (s: string) => {
    const m = s.trim().match(/^(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?$/)
    if (!m || (!m[1] && !m[2])) return null
    return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0)
  }
  const pesEPol = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*?)\s*"?\s*$/)
  if (pesEPol) {
    const pol = pesEPol[2] ? fracao(pesEPol[2]) : 0
    if (pol == null) return null
    return Number(pesEPol[1]) + pol / 12
  }
  const soPol = t.match(/^(.+?)\s*"$/)
  if (soPol) {
    const pol = fracao(soPol[1])
    return pol == null ? null : pol / 12
  }
  const numero = fracao(t)
  return numero
}

/**
 * O desenho da medida, dentro da camada da folha.
 *
 * Mora no mesmo SVG das anotações, em coordenada de papel, e por isso gira e
 * amplia junto com a prancha. O traço e o texto têm tamanho de tela: \`px\` é um
 * pixel dito em unidade de página, e sem ele a etiqueta viraria um cartaz no
 * zoom de oito vezes.
 */
export function TapeOverlay({ pontos, fechada, calibrando, escala, largura, altura, px }: {
  pontos: Ponto[]
  fechada: boolean
  /** Os dois toques da cota conhecida, enquanto a escala está sendo dita. */
  calibrando: Ponto[] | null
  escala: Escala | null
  largura: number
  altura: number
  px: number
}) {
  const cor = "#facc15"
  const linha = (lista: Ponto[], fechar: boolean, tracejada: boolean) => {
    if (lista.length < 1) return null
    const d = lista
      .map(([x, y], i) => `${i ? "L" : "M"}${x * largura} ${y * altura}`)
      .join(" ") + (fechar && lista.length > 2 ? " Z" : "")
    return (
      <>
        {fechar && lista.length > 2 && (
          <path d={d} fill={cor} fillOpacity={0.14} stroke="none" />
        )}
        {/* O contorno escuro por baixo é o que deixa o amarelo legível tanto
            sobre papel branco quanto sobre hachura preta. */}
        <path d={d} fill="none" stroke="#0a0a0a" strokeOpacity={0.55}
          strokeWidth={4.5 * px} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke={cor} strokeWidth={2 * px}
          strokeDasharray={tracejada ? `${6 * px} ${4 * px}` : undefined}
          strokeLinejoin="round" strokeLinecap="round" />
        {lista.map(([x, y], i) => (
          // Quadrado, e não bolinha: é a alça que se pega para reposicionar.
          <rect key={i} x={x * largura - 5 * px} y={y * altura - 5 * px}
            width={10 * px} height={10 * px} rx={1.5 * px}
            fill={cor} stroke="#0a0a0a" strokeWidth={1.5 * px} />
        ))}
      </>
    )
  }

  // As etiquetas de cada trecho, no meio dele. Sem escala não há o que dizer.
  const etiquetas = escala && pontos.length > 1
    ? [...pontos.slice(1).map((b, i) => [pontos[i], b] as const),
       ...(fechada && pontos.length > 2 ? [[pontos[pontos.length - 1], pontos[0]] as const] : [])]
    : []

  return (
    <g style={{ pointerEvents: "none" }}>
      {linha(pontos, fechada, false)}
      {calibrando && linha(calibrando, false, true)}
      {etiquetas.map(([a, b], i) => {
        const pes = trechoPt(a, b, largura, altura) / escala!.ptPorPe
        const cx = ((a[0] + b[0]) / 2) * largura
        const cy = ((a[1] + b[1]) / 2) * altura
        const texto = formatarPes(pes)
        const w = (texto.length * 6.4 + 10) * px
        const h = 16 * px
        return (
          <g key={i}>
            <rect x={cx - w / 2} y={cy - h / 2 - 12 * px} width={w} height={h}
              rx={4 * px} fill="#0a0a0a" fillOpacity={0.85} />
            <text x={cx} y={cy - 12 * px + 4 * px} textAnchor="middle"
              fontSize={11 * px} fontWeight={600} fill="#fde68a"
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {texto}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Apagar a escala, segurando: vale para todos, então não sai num toque. */
function SegurarParaConfirmar({ onConfirmar }: { onConfirmar: () => void }) {
  return (
    <HoldButton
      onConfirm={onConfirmar}
      acao="delete"
      andamento="Deleting"
      faixa="bg-red-500/25"
      className="flex h-8 flex-1 items-center justify-center rounded-md border border-red-400/40 bg-red-500/5 px-3 text-sm text-red-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Hold to delete
    </HoldButton>
  )
}

/**
 * A escala escrita como no carimbo: `1/4" = 1'-0"`.
 *
 * Quando a calibração cai perto de uma escala de arquiteto, mostra a de
 * arquiteto; perto de uma de engenheiro, `1" = 20'`. Fora disso, o número com
 * `≈`: calibração à mão nunca bate exato, e fingir que bate mentiria.
 */
export function escalaNoPapel(ptPorPe: number): string {
  const polPorPe = ptPorPe / 72
  const arquiteto: [number, string][] = [
    [1 / 32, `1/32"`], [1 / 16, `1/16"`], [3 / 32, `3/32"`], [1 / 8, `1/8"`], [3 / 16, `3/16"`],
    [1 / 4, `1/4"`], [3 / 8, `3/8"`], [1 / 2, `1/2"`], [3 / 4, `3/4"`], [1, `1"`],
    [1.5, `1 1/2"`], [3, `3"`],
  ]
  for (const [v, r] of arquiteto) {
    if (Math.abs(polPorPe - v) / v < 0.03) return `${r} = 1'-0"`
  }
  const pesPorPol = 1 / polPorPe
  for (const v of [10, 20, 30, 40, 50, 60, 100, 200]) {
    if (Math.abs(pesPorPol - v) / v < 0.03) return `1" = ${v}'`
  }
  return `1" ≈ ${pesPorPol < 10 ? pesPorPol.toFixed(2) : pesPorPol.toFixed(1)}'`
}

/**
 * O painel da trena: a escala, a soma, a área e o que se faz com a medida.
 *
 * Fica no rodapé, onde mora a barra de ferramentas, e não no meio da prancha:
 * medir é olhar para o desenho, e um painel flutuando sobre ele tapa justamente
 * a cota que se quer conferir.
 *
 * ── A escala só se dá por uma cota ──
 *
 * Havia também uma lista de escalas de carimbo ("1/4" = 1'-0"" e outras). Saiu
 * por decisão do Vitor em 13/09: escala de carimbo depende de a folha ter sido
 * impressa na escala, e a pessoa escolhendo numa lista não confere nada. Dois
 * toques numa cota que se conhece e o valor dela: é o único caminho, e é o que
 * vale para qualquer folha.
 */
export function TapePanel({
  escala, pontos, fechada, calibrando, largura, altura, salvando, erroAoSalvar,
  onEscala, onCalibrar, onApagarEscala, onCancelarCalibracao, onFechar, onLimpar,
}: {
  escala: Escala | null
  pontos: Ponto[]
  fechada: boolean
  calibrando: Ponto[] | null
  largura: number
  altura: number
  /** A escala está indo para o servidor. */
  salvando?: boolean
  /** O servidor recusou ou não respondeu: a escala vale só neste aparelho. */
  erroAoSalvar?: string
  /** A escala nova, com a medida real da cota que a originou. */
  onEscala: (e: Escala, pes: number) => void
  onCalibrar: () => void
  /** Apaga a escala da folha, para todos. */
  onApagarEscala: () => void
  onCancelarCalibracao: () => void
  onFechar: () => void
  onLimpar: () => void
}) {
  const [valor, setValor] = useState("")
  const [erro, setErro] = useState("")
  const [menuDaEscala, setMenuDaEscala] = useState(false)
  const [apagarConfirmar, setApagarConfirmar] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  // No celular o chip mora numa moldura própria, e o popover se alinha a ela,
  // na mesma distância que separa os blocos da barra. Largo, a moldura é a barra
  // inteira, e o popover sai do chip, acima da barra.
  const [largo, setLargo] = useState(false)

  // Calibrando: dois toques e o valor.
  if (calibrando) {
    const faltam = 2 - calibrando.length
    const ptCota = calibrando.length === 2
      ? trechoPt(calibrando[0], calibrando[1], largura, altura) : 0

    const confirmar = () => {
      const pes = lerPes(valor)
      if (!pes || pes <= 0) { setErro(`Write it like 12'-4" or 148"`); return }
      onEscala({ ptPorPe: ptCota / pes, rotulo: formatarPes(pes) }, pes)
      setValor("")
      setErro("")
    }

    return (
      <div className="flex flex-1 items-center gap-2 text-sm sm:flex-none">
        <Ruler className="mx-1.5 h-4 w-4 shrink-0 text-yellow-300 sm:mx-0" />
        {faltam > 0 ? (
          <span className="whitespace-nowrap text-white/80">
            {faltam === 2 ? "Tap both ends" : "Now the other end"}
          </span>
        ) : (
          <>
            <Input
              autoFocus
              value={valor}
              placeholder={`12'-4"`}
              aria-label="The real length of that dimension"
              onChange={e => { setValor(e.target.value); setErro("") }}
              onKeyDown={e => { if (e.key === "Enter") confirmar() }}
              className={`h-8 w-24 flex-1 bg-black/40 sm:flex-none text-white placeholder:text-white/30 ${
                erro ? "border-amber-400/70" : "border-white/20"
              }`}
            />
            <Button size="sm" className="h-8 gap-1.5" onClick={confirmar} title={erro || undefined}>
              <Check className="h-3.5 w-3.5" />
              Set
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" aria-label="Cancel calibration" title="Cancel"
          style={{ marginLeft: faltam > 0 ? "auto" : undefined }}
          onClick={() => { setValor(""); setErro(""); onCancelarCalibracao() }}
          className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  // Sem escala: só a porta para calibrar.
  if (!escala) {
    return (
      <Button size="sm" onClick={onCalibrar}
        className="h-8 gap-1.5 bg-yellow-300 text-neutral-900 shadow-lg hover:bg-yellow-200 sm:shadow-none">
        <Ruler className="h-3.5 w-3.5" />
        Calibrate
      </Button>
    )
  }

  // Medindo.
  // Escalas guardadas antes vinham com o texto do chip junto. A cota é só a medida.
  const cota = escala.rotulo.replace(/^Calibrated on /, "").replace(/^calibrated$/, "")
  const area = fechada && pontos.length > 2
    ? areaPt2(pontos, largura, altura) / (escala.ptPorPe * escala.ptPorPe) : null

  return (
    <div ref={raiz} className="flex items-center gap-2 text-sm sm:flex-wrap">
      {/* A escala em uso. O chip só diz que há uma; o que ela vale e o que se
          faz com ela moram no popover, para a barra não carregar texto. */}
      <Popover open={menuDaEscala} onOpenChange={aberto => {
        if (aberto) setLargo(window.matchMedia("(min-width: 640px)").matches)
        setMenuDaEscala(aberto)
        setApagarConfirmar(false)
      }}>
        <PopoverTrigger
          title={erroAoSalvar ? `Only on this device: ${erroAoSalvar}` : "Scale of this sheet"}
          className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/15 px-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Ruler className={`h-3.5 w-3.5 ${erroAoSalvar ? "text-amber-400" : "text-emerald-400"}`} />
          {/* Com a área na linha, o texto só cabe de lg para cima: abaixo disso a
              barra quebrava em duas, porque as ferramentas já trazem os atalhos. */}
          <span className={area != null ? "hidden lg:inline" : ""}>
            {salvando ? "Saving" : "Calibrated"}
          </span>
        </PopoverTrigger>
        <PopoverContent side="top" align="start"
          anchor={largo ? undefined : () => raiz.current?.parentElement ?? null}
          sideOffset={largo ? 17 : 8}
          className="w-64 gap-3 border border-white/10 bg-neutral-800/90 p-3 text-white shadow-lg ring-0 backdrop-blur">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Scale</span>
            <span className="text-base font-semibold tabular-nums text-yellow-200">
              {escalaNoPapel(escala.ptPorPe)}
            </span>
            {cota && (
              <span className="text-xs text-white/60">Measured on a {cota} dimension</span>
            )}
            <span className={`text-xs ${erroAoSalvar ? "text-amber-400" : "text-white/40"}`}>
              {erroAoSalvar ? "Saved only on this device" : "Everyone on this jobsite uses it"}
            </span>
          </div>
          <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
            {!apagarConfirmar && (
              <button type="button"
                onClick={() => { setMenuDaEscala(false); onCalibrar() }}
                className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                <Ruler className="h-3.5 w-3.5" />
                Recalibrate
              </button>
            )}
            {apagarConfirmar ? (
              // Apagar vale para todos: pergunta, e a confirmação é segurar, não
              // tocar. Um toque só escapa sem querer; segurar um segundo, não.
              <div className="flex flex-col gap-2">
                <span className="px-1 text-sm text-white">Are you sure?</span>
                <span className="px-1 text-xs text-white/50">
                  Everyone on this jobsite loses this scale.
                </span>
                <div className="flex items-center gap-2">
                  <SegurarParaConfirmar
                    onConfirmar={() => {
                      setMenuDaEscala(false)
                      setApagarConfirmar(false)
                      onApagarEscala()
                    }}
                  />
                  <button type="button" onClick={() => setApagarConfirmar(false)}
                    aria-label="Cancel" title="Cancel"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setApagarConfirmar(true)}
                className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-red-300/80 transition-colors hover:bg-white/10 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" />
                Delete calibration
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {pontos.length < 2 ? (
        <span className="whitespace-nowrap text-white/60">
          Tap to start
        </span>
      ) : area != null && (
        // O comprimento já está escrito em cada trecho, no desenho. A área não
        // tem onde morar lá, então fica aqui.
        <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums" title="Area">
          <Pentagon className="h-3.5 w-3.5 shrink-0 text-white/50" />
          <span className="font-semibold text-yellow-200">{formatarArea(area)}</span>
        </span>
      )}

      <span className="flex items-center gap-1">
        {pontos.length > 2 && !fechada && (
          <Button size="sm" variant="ghost" onClick={onFechar} title="Close the shape to get its area"
            className="h-8 gap-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            <Pentagon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Area</span>
          </Button>
        )}
        {pontos.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onLimpar} title="Start a new measurement"
            className="h-8 gap-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Clear</span>
          </Button>
        )}
      </span>
    </div>
  )
}

/**
 * A lupa que sobe acima do dedo enquanto um ponto da trena é arrastado.
 *
 * No celular o dedo cobre exatamente o lugar onde o ponto está sendo posto: a
 * pessoa arrasta às cegas e só descobre onde ele caiu quando levanta a mão. A
 * lupa mostra, ampliado e acima do toque, o pedaço da prancha que está debaixo
 * do dedo, com a mira no centro e os trechos que chegam no ponto.
 *
 * Os pixels vêm do próprio canvas da prancha, e não de uma segunda renderização
 * do PDF: é o que já está desenhado na tela, copiado e ampliado, sem custo de
 * abrir a folha de novo a cada movimento do dedo.
 */
export function TapeLoupe({ ponto, vizinhos, clientX, clientY, palco, view, largura, altura, larguraDoPalco }: {
  /** O ponto sendo arrastado, em coordenada normalizada da página. */
  ponto: Ponto
  /** Os pontos ligados a ele, para a lupa mostrar os trechos chegando na mira. */
  vizinhos: Ponto[]
  clientX: number
  clientY: number
  /** O elemento que contém os canvas da prancha. */
  palco: HTMLElement | null
  view: { x: number; y: number; scale: number }
  largura: number
  altura: number
  /** A largura do palco em pixels de CSS, para achar a densidade do canvas nítido. */
  larguraDoPalco: number
}) {
  const LADO = 120
  const ZOOM = 2.5

  const desenhar = (lupa: HTMLCanvasElement | null) => {
    if (!lupa || !palco) return
    const dpr = window.devicePixelRatio || 1
    lupa.width = LADO * dpr
    lupa.height = LADO * dpr
    const ctx = lupa.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, LADO, LADO)

    // O ponto no palco, em pixels de CSS: é a mesma conta que posiciona a folha.
    const sx = view.x + ponto[0] * largura * view.scale
    const sy = view.y + ponto[1] * altura * view.scale
    const meio = LADO / ZOOM / 2

    // O canvas nítido que está à frente é o que a pessoa vê. Ele cobre o palco
    // inteiro na densidade dele; o de base, quando o nítido ainda não saiu,
    // cobre só a folha e em resolução menor, mas serve de reserva.
    const nitidos = Array.from(palco.querySelectorAll<HTMLCanvasElement>("canvas.inset-0"))
    const nitido = nitidos.find(c => c.style.opacity === "1" && c.width > 0)
    if (nitido && larguraDoPalco > 0) {
      const k = nitido.width / larguraDoPalco
      ctx.drawImage(nitido, (sx - meio) * k, (sy - meio) * k, meio * 2 * k, meio * 2 * k, 0, 0, LADO, LADO)
    } else {
      const base = palco.querySelector<HTMLCanvasElement>("canvas.origin-top-left")
      if (base && base.width > 0) {
        const kx = base.width / (largura * view.scale)
        const ky = base.height / (altura * view.scale)
        const bx = ponto[0] * largura * view.scale
        const by = ponto[1] * altura * view.scale
        ctx.drawImage(base, (bx - meio) * kx, (by - meio) * ky, meio * 2 * kx, meio * 2 * ky, 0, 0, LADO, LADO)
      }
    }

    const c = LADO / 2
    // Os trechos que chegam no ponto, na mesma ampliação da imagem.
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    for (const v of vizinhos) {
      const vx = c + (v[0] - ponto[0]) * largura * view.scale * ZOOM
      const vy = c + (v[1] - ponto[1]) * altura * view.scale * ZOOM
      ctx.strokeStyle = "rgba(10,10,10,0.55)"
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(vx, vy); ctx.stroke()
      ctx.strokeStyle = "#facc15"
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(vx, vy); ctx.stroke()
    }
    // A mira: fio fino e escuro, que se lê sobre papel branco, com o miolo
    // vazio para não tapar justamente o traço que se quer acertar.
    ctx.strokeStyle = "rgba(220,38,38,0.9)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(c, c - 18); ctx.lineTo(c, c - 5)
    ctx.moveTo(c, c + 5); ctx.lineTo(c, c + 18)
    ctx.moveTo(c - 18, c); ctx.lineTo(c - 5, c)
    ctx.moveTo(c + 5, c); ctx.lineTo(c + 18, c)
    ctx.stroke()
  }

  // Acima do dedo, com folga para ele não cobrir a própria lupa. Perto do topo
  // da tela não há acima: ela desce para o lado de baixo.
  const acima = clientY - LADO - 36 > 8
  const top = acima ? clientY - LADO - 36 : clientY + 36
  const left = Math.min(Math.max(8, clientX - LADO / 2), (typeof window !== "undefined" ? window.innerWidth : 0) - LADO - 8)

  return (
    <canvas
      ref={desenhar}
      aria-hidden
      className="pointer-events-none fixed z-[60] rounded-full border-2 border-white shadow-2xl"
      style={{ left, top, width: LADO, height: LADO }}
    />
  )
}
