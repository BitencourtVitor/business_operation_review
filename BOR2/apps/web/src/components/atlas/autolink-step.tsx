"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { PlanCanvas, type PlanView } from "@/components/atlas/plan-canvas"
import { sugerirVinculos } from "@/components/atlas/plan-autolink"
import { HoldButton } from "@/components/common/hold-button"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, FolderOpen, Link2, Maximize,
  Minus, Plus, ScanSearch, X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import type { AtlasAutolinkPage, AtlasAutolinkSuggestion } from "@/services/atlas.service"

/**
 * A terceira etapa do envio: os hiperlinks que o desenho pede.
 *
 * A prancha de conjunto traz o código de outra folha escrito sobre o desenho. No
 * papel, quem lê procura a folha; aqui toca e chega. O código aparece no miolo,
 * sem posição esperada. Por padrão a varredura fica dentro do próprio arquivo,
 * que é de onde vem a quase totalidade das citações; procurar destino nas outras
 * pastas da obra é escolha de quem envia, porque alcança mais e também aproxima
 * códigos parecidos de sets diferentes.
 *
 * **Nada é concluído pelo sistema.** A automação propõe, e cada vínculo é
 * confirmado ou recusado por quem envia. Vínculo falso é pior que vínculo
 * ausente: quem toca e cai na folha errada perde a confiança em todos os outros.
 *
 * Aceitar tudo de uma vez existe, porque conferir duzentos um a um é trabalho
 * que ninguém faz. Mas custa tempo de dedo: o atalho tem de ser deliberado.
 */

/** Um vínculo já confirmado, no formato que o envio grava depois. */
export interface VinculoConfirmado {
  pageIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
  text: string
  targetSheetId: string
  targetPageIndex: number
  targetName: string
}

const chave = (p: number, i: number) => `${p}#${i}`

const MIN_ZOOM = 1
const MAX_ZOOM = 8

export function AutolinkStep({ jobsiteId, url, nomes, paginas, ligado, onLigado, onChange, onEstado }: {
  jobsiteId: string
  /** O arquivo local, que é de onde o texto sai. */
  url: string
  /** O nome que a marcação leu para cada página. */
  nomes: Map<number, string>
  paginas: number
  /** A resposta da pergunta de sim ou não. Nulo é ainda sem resposta. */
  ligado: boolean | null
  onLigado: (v: boolean) => void
  onChange: (links: VinculoConfirmado[]) => void
  /** Quanto falta decidir: o envio só libera com a conferência terminada. */
  onEstado: (e: { varrido: boolean; pendentes: number }) => void
}) {
  const [sugestoes, setSugestoes] = useState<AtlasAutolinkPage[] | null>(null)
  const [varrendo, setVarrendo] = useState("")
  const [erro, setErro] = useState("")
  // Decidido por vínculo: verdadeiro confirma, falso recusa, ausente é pendente.
  const [decisao, setDecisao] = useState<Record<string, boolean>>({})
  const [aberta, setAberta] = useState<number | null>(null)
  const [confirmandoTudo, setConfirmandoTudo] = useState(false)
  // Procurar destino nas outras pastas da obra. Começa desligado.
  const [outrasPastas, setOutrasPastas] = useState(false)

  const comLinks = (sugestoes ?? []).filter(p => p.links.length > 0)

  // O que sobe é só o confirmado.
  useEffect(() => {
    const out: VinculoConfirmado[] = []
    for (const p of sugestoes ?? []) {
      p.links.forEach((l, i) => {
        if (!decisao[chave(p.pageIndex, i)]) return
        out.push({
          pageIndex: p.pageIndex,
          x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1,
          text: l.text,
          targetSheetId: l.sheetId,
          targetPageIndex: l.pageIndex,
          targetName: l.sheetName,
        })
      })
    }
    onChange(out)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisao, sugestoes])

  async function varrer() {
    setErro("")
    setVarrendo("0")
    try {
      const r = await sugerirVinculos(jobsiteId, url, nomes, paginas, (feitas, total) => {
        setVarrendo(`${feitas}/${total}`)
      }, outrasPastas)
      setSugestoes(r.paginas)
      const primeira = r.paginas.find(p => p.links.length > 0)
      setAberta(primeira ? primeira.pageIndex : null)
    } catch {
      setErro("The scan did not finish. Try again with a connection.")
    } finally {
      setVarrendo("")
    }
  }

  const decidir = (p: number, i: number, valor: boolean) =>
    setDecisao(d => ({ ...d, [chave(p, i)]: valor }))

  const decidirPagina = (p: AtlasAutolinkPage, valor: boolean) =>
    setDecisao(d => {
      const out = { ...d }
      p.links.forEach((_, i) => { out[chave(p.pageIndex, i)] = valor })
      return out
    })

  const confirmarTudo = () => {
    setDecisao(() => {
      const out: Record<string, boolean> = {}
      for (const p of comLinks) p.links.forEach((_, i) => { out[chave(p.pageIndex, i)] = true })
      return out
    })
    setConfirmandoTudo(false)
  }

  const total = comLinks.reduce((n, p) => n + p.links.length, 0)
  const confirmados = Object.values(decisao).filter(Boolean).length
  const decididos = Object.keys(decisao).length
  const pendentes = total - decididos

  // O envio espera a conferência terminar: sugestão pendente é sugestão que
  // ninguém olhou, e subir assim é o mesmo que deixar a automação decidir.
  useEffect(() => {
    onEstado({ varrido: !!sugestoes, pendentes })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestoes, pendentes])

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {/* A folha da página escolhida, com os marcadores onde o vínculo entraria. */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/40">
        {aberta === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {sugestoes
              ? "No page cites other sheets of this project."
              : "Run the scan to see what this set points to."}
          </div>
        ) : (
          <PaginaComMarcas
            url={url}
            pageIndex={aberta}
            links={comLinks.find(p => p.pageIndex === aberta)?.links ?? []}
            decisao={decisao}
            onDecidir={(i, v) => decidir(aberta, i, v)}
          />
        )}
      </div>

      <div className="flex min-h-0 w-80 shrink-0 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {/* A pergunta só existe antes da varredura: respondida e rodada, ela
              vira espaço ocupado por uma decisão já tomada. */}
          {!sugestoes && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">Create hyperlinks automatically?</p>
              <p className="text-xs leading-snug text-muted-foreground">
                The scan looks for codes of other sheets written on the drawing and proposes a link
                for each one. You confirm them one by one.
              </p>
              <div className="flex gap-2">
                <Button
                  variant={ligado === true ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => onLigado(true)}
                >
                  Yes
                </Button>
                <Button
                  variant={ligado === false ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => { onLigado(false); setSugestoes(null); setDecisao({}) }}
                >
                  No
                </Button>
              </div>
            </div>
          )}

          {ligado === true && !sugestoes && (
            <>
              {/* Sair da própria pasta é escolha, e não padrão. O código citado
                  no desenho quase sempre é folha do próprio arquivo; procurar
                  destino nas outras pastas da obra alcança mais, e também
                  aproxima códigos parecidos de sets diferentes. */}
              <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
                <Switch
                  checked={outrasPastas}
                  onCheckedChange={v => setOutrasPastas(!!v)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Look in other folders</span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    Off, the scan only links sheets of this file. On, it also looks at the other
                    documents of this project.
                  </span>
                </span>
              </label>

              <Button disabled={!!varrendo} onClick={varrer}>
                <ScanSearch className="h-4 w-4" />
                {varrendo ? `Reading the sheets ${varrendo}` : "Scan for links"}
              </Button>
            </>
          )}

          {erro && <p className="text-xs text-destructive">{erro}</p>}

          {ligado === true && sugestoes && (
            <>
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                {/* O que falta decidir mora no rodapé, ao lado do botão que ele
                    segura. Repetir aqui era dizer duas vezes a mesma coisa. */}
                <p className="text-sm font-medium">
                  {total} link{total === 1 ? "" : "s"} found
                </p>
                <p className="text-xs text-muted-foreground">
                  {confirmados} confirmed, on {comLinks.length} page{comLinks.length === 1 ? "" : "s"}.
                  {" "}Repeated codes always point to the first sheet that carries them.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={varrer} disabled={!!varrendo}>
                    <ScanSearch className="h-3.5 w-3.5" />
                    {varrendo ? `Reading ${varrendo}` : "Scan again"}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!total}
                    onClick={() => setConfirmandoTudo(true)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirm every
                  </Button>
                </div>
              </div>

              {/* Acordeão: uma página aberta por vez, e os painéis colados num
                  bloco só, com a quina arredondada apenas nas pontas. Com trinta
                  páginas abertas a coluna virava um rolo sem fim, e achar a
                  página que se queria conferir custava mais que conferir. */}
              {/* A lista de páginas rola por dentro, como a de vínculos da página
                  aberta: com trinta e duas páginas, ela sozinha jogava o resumo
                  e a chave para fora da vista. */}
              <div className="flex max-h-[60vh] flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-lg border border-border/60">
              {comLinks.map(p => {
                const abertaAqui = aberta === p.pageIndex
                const confirmadosAqui = p.links.filter((_, i) => decisao[chave(p.pageIndex, i)] === true).length
                return (
                  <div key={p.pageIndex} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setAberta(abertaAqui ? null : p.pageIndex)}
                      className={`flex items-center gap-2 px-2 py-2 text-left text-xs transition-colors hover:bg-accent ${
                        abertaAqui ? "bg-accent/60 font-medium" : ""
                      }`}
                    >
                      {abertaAqui
                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                        {p.pageIndex + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {nomes.get(p.pageIndex) || `Page ${p.pageIndex + 1}`}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        {confirmadosAqui > 0 && (
                          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                            {confirmadosAqui}/
                          </span>
                        )}
                        <Link2 className="h-3.5 w-3.5" />
                        {p.links.length}
                      </span>
                    </button>

                    {abertaAqui && (
                      <div className="flex flex-col gap-2 border-t border-border/60 p-2">
                        {/* Aceitar a página inteira custa dois segundos de dedo:
                            é atalho, e atalho que se aciona sem querer volta a
                            ser problema. */}
                        <div className="flex gap-2">
                          <HoldButton
                            duracao={2000}
                            className="h-7 flex-1 px-2 text-xs"
                            onConfirmar={() => decidirPagina(p, true)}
                            aria-label="Hold to confirm every link on this page"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Hold to confirm all
                          </HoldButton>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => decidirPagina(p, false)}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject all
                          </Button>
                        </div>

                        {/* A lista rola por dentro: uma página com quarenta
                            citações não pode empurrar as outras para fora. */}
                        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain">
                          {p.links.map((l, i) => (
                            <LinhaDoVinculo
                              key={`${l.text}-${i}`}
                              link={l}
                              estado={decisao[chave(p.pageIndex, i)]}
                              onDecidir={v => decidir(p.pageIndex, i, v)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Aceitar tudo de uma vez, com o aviso do que isso significa. */}
      <ConfirmarTudo
        aberto={confirmandoTudo}
        total={total}
        onFechar={() => setConfirmandoTudo(false)}
        onConfirmar={confirmarTudo}
      />
    </div>
  )
}

/**
 * O aviso antes de aceitar tudo.
 *
 * Olhar de cima e dizer que está bem é onde nasce o link que não faz sentido. O
 * botão de sim só acorda depois de três segundos, e ainda precisa de um segundo
 * e meio de dedo: tempo suficiente para ler a frase que está acima dele.
 */
function ConfirmarTudo({ aberto, total, onFechar, onConfirmar }: {
  aberto: boolean
  total: number
  onFechar: () => void
  onConfirmar: () => void
}) {
  // A contagem aparece: botão apagado sem explicação parece defeito, e o número
  // correndo diz que a espera é de propósito e quanto falta dela.
  const [restam, setRestam] = useState(3)

  useEffect(() => {
    if (!aberto) { setRestam(3); return }
    setRestam(3)
    const t = setInterval(() => setRestam(n => (n <= 1 ? 0 : n - 1)), 1000)
    return () => clearInterval(t)
  }, [aberto])

  const pronto = restam === 0

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm every suggestion?</DialogTitle>
        </DialogHeader>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Accepting {total} link{total === 1 ? "" : "s"} without looking at them one by one is how a
            wrong link gets in, and a wrong link is worse than no link.
          </span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancel</Button>
          <HoldButton
            duracao={1500}
            disabled={!pronto}
            tone="danger"
            className="h-8 px-3"
            onConfirmar={onConfirmar}
            aria-label="Hold to confirm every suggestion"
          >
            <Check className="h-4 w-4" />
            {pronto ? "Hold to confirm" : `Read first… ${restam}`}
          </HoldButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Uma linha da lista: o código lido, o destino, e as duas decisões. */
function LinhaDoVinculo({ link, estado, onDecidir }: {
  link: AtlasAutolinkSuggestion
  estado: boolean | undefined
  onDecidir: (v: boolean) => void
}) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md px-1 py-1 text-xs ${
      estado === true ? "bg-emerald-500/10"
        : estado === false ? "bg-destructive/10 text-destructive"
        : ""
    }`}>
      {/* O código lido, a seta, e a folha onde ele vai dar. Numa linha só, porque
          é uma frase: isto leva àquilo. */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0 font-medium">{link.text}</span>
        <ArrowRight className={`h-3 w-3 shrink-0 ${
          estado === false ? "text-destructive/70" : "text-muted-foreground"
        }`} />
        {/* O ícone de pasta diz que o destino mora em outra categoria da obra;
            o nome dela aparece ao passar o mouse. */}
        {link.otherFolder && (
          <FolderOpen
            className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
            aria-label={`In ${link.documentName}`}
          />
        )}
        <span
          className={`min-w-0 truncate ${estado === false ? "text-destructive/80" : "text-muted-foreground"}`}
          title={link.otherFolder
            ? `${link.documentName}${link.category ? ` · ${link.category}` : ""}`
            : `Page ${link.pageIndex + 1} of this document`}
        >
          {link.sheetName || `Page ${link.pageIndex + 1}`}
          {link.otherFolder ? ` · ${link.documentName}` : ""}
        </span>
      </span>
      <Button
        size="icon"
        variant={estado === true ? "default" : "ghost"}
        className="h-7 w-7 shrink-0"
        title="Confirm this link"
        onClick={() => onDecidir(true)}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant={estado === false ? "destructive" : "ghost"}
        className="h-7 w-7 shrink-0"
        title="Reject this link"
        onClick={() => onDecidir(false)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/**
 * A folha com os marcadores desenhados onde cada vínculo entraria.
 *
 * Ver o código no lugar em que ele está impresso é o que permite dizer se o
 * vínculo faz sentido: a mesma sequência pode ser referência numa prancha e
 * medida noutra. Por isso a folha se aproxima e se move como no leitor: sem
 * chegar perto, conferir é chutar.
 */
function PaginaComMarcas({ url, pageIndex, links, decisao, onDecidir }: {
  url: string
  pageIndex: number
  links: AtlasAutolinkSuggestion[]
  decisao: Record<string, boolean>
  onDecidir: (i: number, v: boolean) => void
}) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [pagina, setPagina] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<PlanView>({ scale: 0, x: 0, y: 0 })
  const areaRef = useRef<HTMLDivElement | null>(null)

  const medirRef = useCallback((el: HTMLDivElement | null) => {
    areaRef.current = el
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
  }, [])

  useEffect(() => {
    let vivo = true
    loadPdf(url)
      .then(pdf => pdf.getPage(pageIndex + 1))
      .then(p => {
        const v = p.getViewport({ scale: 1 })
        if (vivo) setPagina({ w: v.width, h: v.height })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [url, pageIndex])

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

  // Trocar de página volta ao enquadramento: a marca que se vai conferir é
  // outra, e herdar a aproximação da anterior mostra um canto qualquer.
  const mexeu = useRef(false)
  useEffect(() => { mexeu.current = false; setView(v => ({ ...v, scale: 0 })) }, [pageIndex])
  useEffect(() => { if (!view.scale || !mexeu.current) enquadrar() }, [enquadrar, view.scale])

  const zoomAt = useCallback((fator: number, px: number, py: number) => {
    mexeu.current = true
    setView(v => {
      if (!v.scale || !fitScale) return v
      const alvo = Math.min(MAX_ZOOM * fitScale, Math.max(MIN_ZOOM * fitScale, v.scale * fator))
      const k = alvo / v.scale
      return { scale: alvo, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [fitScale])

  // A roda aproxima em cima do ponto apontado. O ouvinte é montado à mão porque
  // o React registra a roda como passiva, e passiva não barra a rolagem.
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
  }, [zoomAt])

  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; moveu: boolean } | null>(null)

  function areaDown(e: React.PointerEvent<HTMLDivElement>) {
    // Clique em botão é clique em botão: capturar o ponteiro aqui roubaria o
    // evento, e o controle de zoom e os marcadores deixariam de responder.
    if ((e.target as HTMLElement).closest("button")) return
    mexeu.current = true
    arrasto.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moveu: false }
    areaRef.current?.setPointerCapture(e.pointerId)
  }

  function areaMove(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) a.moveu = true
    setView(v => ({ ...v, x: a.vx + dx, y: a.vy + dy }))
  }

  function areaUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current) return
    arrasto.current = null
    areaRef.current?.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      ref={medirRef}
      onPointerDown={areaDown}
      onPointerMove={areaMove}
      onPointerUp={areaUp}
      onPointerCancel={areaUp}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      {!!pagina.w && !!view.scale && (
        <PlanCanvas
          url={url}
          pageIndex={pageIndex}
          view={view}
          width={size.w}
          height={size.h}
          pageWidth={pagina.w}
          pageHeight={pagina.h}
        />
      )}

      {!!view.scale && links.map((l, i) => {
        const estado = decisao[chave(pageIndex, i)]
        return (
          <button
            key={`${l.text}-${i}`}
            type="button"
            // Tocar a marca decide, como na lista. Depois de arrastar, não: o
            // gesto era mover a folha, e decidir junto seria decidir sem querer.
            onClick={() => { if (!arrasto.current?.moveu) onDecidir(i, estado !== true) }}
            title={`${l.text} → ${l.sheetName}${l.otherFolder ? ` (${l.documentName})` : ""}`}
            style={{
              left: view.x + l.x0 * pagina.w * view.scale,
              top: view.y + l.y0 * pagina.h * view.scale,
              width: Math.max(6, (l.x1 - l.x0) * pagina.w * view.scale),
              height: Math.max(6, (l.y1 - l.y0) * pagina.h * view.scale),
            }}
            className={`absolute rounded-[2px] border-2 transition-colors ${
              estado === true ? "border-emerald-500 bg-emerald-500/20"
                : estado === false ? "border-destructive/70 bg-destructive/15"
                : "border-sky-500 bg-sky-500/20"
            }`}
          />
        )
      })}

      {/* O controle de aproximação flutua sobre a folha, como no leitor. */}
      <div className="absolute bottom-2 right-2 flex w-10 flex-col items-center gap-1 rounded-lg border border-white/10 bg-neutral-800/90 p-1.5 shadow-lg backdrop-blur">
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
          title="Zoom in"
          onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <button
          type="button"
          title="Fit the sheet"
          onClick={enquadrar}
          className="flex h-10 w-8 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-white/10 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize className="h-3.5 w-3.5" />
          <span className="text-[10px] leading-none tabular-nums">{zoom.toFixed(2)}x</span>
        </button>
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
          title="Zoom out"
          onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
