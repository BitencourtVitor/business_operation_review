"use client"

import { useLiveQuery } from "dexie-react-hooks"
import {
  AlertTriangle, CloudAlert, CloudCheck, CloudDownload, Download, Eye, FileText, HardDrive, Layers,
  Loader2, Eraser, WifiOff, X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { tagLabel } from "@/components/atlas/document-tags-dialog"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useAtlasDocuments } from "@/hooks/use-atlas"
import { aquecerRotas, paginaGuardada } from "@/lib/offline/aquecer"
import { local, type PastaLocal } from "@/lib/offline/db"
import {
  baixarIndice, baixarMiniaturas, baixarObra, pararDownload, removerObra,
} from "@/lib/offline/index-sync"
import {
  cabe, mb, medirEspaco, tamanhosDaObra, type Cabimento, type Espaco,
} from "@/lib/offline/storage"

/**
 * O que esta obra guarda no aparelho, e a decisão de guardar.
 *
 * Nada desce sozinho. Abrir uma obra não grava índice, página nem miniatura: a
 * pessoa escolhe o que leva para o canteiro, e o espaço do aparelho é dela. A
 * decisão é por obra, tomada nesta faixa no fim da página:
 *   - nada salvo: o botão é Download, e baixa a obra inteira;
 *   - baixando: a faixa mostra o progresso;
 *   - salva: o botão volta a ser View, e abre o detalhe por pasta;
 *   - salva, mas com pasta nova ou revisão: o botão é Update, e baixa o que falta.
 *
 * O modal é consulta: cada pasta com a categoria, o estado e o peso, e o total da
 * obra contra o espaço do aparelho. As ações por pasta saíram dele.
 */

const ESTADO: Record<PastaLocal["estado"], { rotulo: string; classe: string }> = {
  ausente:       { rotulo: "Not downloaded", classe: "text-muted-foreground" },
  baixando:      { rotulo: "Downloading",    classe: "text-sky-600 dark:text-sky-400" },
  disponivel:    { rotulo: "Available",      classe: "text-emerald-600 dark:text-emerald-400" },
  desatualizada: { rotulo: "Out of date",    classe: "text-amber-600 dark:text-amber-400" },
}

const rotaDaPasta = (jobsiteId: string, pastaId: string) =>
  `/atlas/${jobsiteId}/documents/${pastaId}`

/** Baixado sobre total na mesma unidade, escolhida pelo total: "2.7 / 5.1 MB". */
function fracao(feito: number, total: number): string {
  const [div, unidade, casas] = total >= 1024 ** 3 ? [1024 ** 3, "GB", 2]
    : total >= 1024 ** 2 ? [1024 ** 2, "MB", 1]
    : [1024, "KB", 0]
  return `${(feito / div).toFixed(casas)} / ${(total / div).toFixed(casas)} ${unidade}`
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const m = () => setOnline(navigator.onLine)
    m()
    window.addEventListener("online", m)
    window.addEventListener("offline", m)
    return () => {
      window.removeEventListener("online", m)
      window.removeEventListener("offline", m)
    }
  }, [])
  return online
}

export function OfflineFolders({ jobsiteId }: { jobsiteId: string }) {
  const [espaco, setEspaco] = useState<Espaco | null>(null)
  const [aberto, setAberto] = useState(false)
  const [baixandoObra, setBaixandoObra] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState("")
  const online = useOnline()
  // Se a página de cada pasta baixada já está guardada. O arquivo no disco não
  // basta: sem a página, tocar na pasta sem rede devolvia a pessoa para a lista.
  const [paginas, setPaginas] = useState<Record<string, boolean | null>>({})
  // O que cada arquivo desta obra ocupa de fato no disco.
  const [disco, setDisco] = useState<{ total: number; porArquivo: Map<string, number> } | null>(null)

  // As pastas vêm do servidor (ou do cache das consultas, sem rede). O banco
  // local só conhece as pastas de obra que já foi baixada, e a faixa precisa
  // existir antes disso: é nela que se decide baixar.
  const { data: documentos = [] } = useAtlasDocuments(jobsiteId)

  const pastas = useLiveQuery(
    () => local.pastas.where("obraId").equals(jobsiteId).toArray(),
    [jobsiteId],
  )
  const planos = useLiveQuery(
    () => local.planos.where("obraId").equals(jobsiteId).toArray(),
    [jobsiteId],
  )

  // Por pasta: quantas folhas têm arquivo no aparelho, quais caminhos usam, e
  // quanto das pranchas já desceu. Os caminhos somam o tamanho real no disco.
  const porPasta = useMemo(() => {
    const r: Record<string, {
      total: number; arquivos: number; caminhos: Set<string>
      bytesTotal: number; bytesFeitos: number
    }> = {}
    for (const p of planos ?? []) {
      const c = (r[p.pastaId] ??= {
        total: 0, arquivos: 0, caminhos: new Set(), bytesTotal: 0, bytesFeitos: 0,
      })
      c.total++
      c.bytesTotal += p.bytes ?? 0
      if (p.arquivo) { c.arquivos++; c.caminhos.add(p.arquivo); c.bytesFeitos += p.bytes ?? 0 }
      if (p.thumb) c.caminhos.add(p.thumb)
    }
    return r
  }, [planos])

  const mapaPastas = useMemo(() => new Map((pastas ?? []).map(p => [p.id, p])), [pastas])

  // As linhas do modal: os documentos da obra, cada um com o que o aparelho
  // sabe dele. Sem a lista do servidor (sem rede e sem cache), valem as pastas
  // do banco local.
  const linhas = useMemo(() => documentos.length
    ? [...documentos]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => ({ id: d.id, nome: d.name, etiquetas: d.tags ?? [], pasta: mapaPastas.get(d.id) }))
    : [...(pastas ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({ id: p.id, nome: p.name, etiquetas: [], pasta: p as PastaLocal | undefined })),
  [documentos, pastas, mapaPastas])

  const guardadas = useMemo(
    () => (pastas ?? []).filter(p => p.estado !== "ausente").map(p => p.id),
    [pastas],
  )
  const chave = guardadas.join(",")

  const medirTudo = () => {
    void medirEspaco().then(setEspaco)
    void tamanhosDaObra(jobsiteId).then(setDisco)
  }

  // O peso acompanha o download. A contagem de pranchas vem do banco local e se
  // atualiza sozinha; o peso vem do disco, e sem isto só era medido ao abrir a
  // página, ao abrir o modal e no fim do download, então ficava parado em 0 KB
  // enquanto as pranchas subiam. Mede de novo quando entra arquivo, no máximo
  // uma vez a cada 0,8 s, para não ler o disco a cada prancha.
  const arquivosNoAparelho = useMemo(
    () => (planos ?? []).reduce((n, p) => n + (p.arquivo ? 1 : 0) + (p.thumb ? 1 : 0), 0),
    [planos],
  )
  const medidaAgendada = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (medidaAgendada.current) return
    medidaAgendada.current = setTimeout(() => {
      medidaAgendada.current = null
      medirTudo()
    }, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivosNoAparelho])
  useEffect(() => () => {
    if (medidaAgendada.current) clearTimeout(medidaAgendada.current)
  }, [])

  useEffect(() => {
    medirTudo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsiteId])

  // Abrir o modal mede de novo: miniaturas e páginas descem em segundo plano, e
  // o número de quando a página abriu já pode estar velho.
  useEffect(() => {
    if (aberto) medirTudo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  useEffect(() => {
    if (!guardadas.length) return
    // Só obra que a pessoa escolheu guardar se mantém em dia sozinha: a cada
    // visita com rede o índice, as páginas, o leitor e as miniaturas que faltam
    // são conferidos. Obra que nunca foi baixada não grava nada ao ser aberta.
    if (navigator.onLine) void baixarIndice(jobsiteId).catch(() => undefined)
    aquecerRotas(["/atlas", `/atlas/${jobsiteId}`, ...guardadas.map(id => rotaDaPasta(jobsiteId, id))])
    void import("@/components/atlas/pdf-page").then(m => m.aquecerPdf()).catch(() => undefined)
    for (const id of guardadas) void baixarMiniaturas(id).catch(() => 0)

    let vivo = true
    const conferir = async () => {
      const r: Record<string, boolean | null> = {}
      for (const id of guardadas) r[id] = await paginaGuardada(rotaDaPasta(jobsiteId, id))
      if (vivo) setPaginas(r)
    }
    void conferir()
    // O worker guarda em segundo plano e não avisa quando termina. Conferir de
    // novo depois de alguns segundos é o bastante para o rótulo mudar sozinho.
    const t1 = setTimeout(conferir, 4000)
    const t2 = setTimeout(conferir, 12000)
    return () => { vivo = false; clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsiteId, chave])

  async function baixar() {
    if (!navigator.onLine || baixandoObra) return
    setBaixandoObra(true); setErro("")
    try {
      const r = await baixarObra(jobsiteId)
      if (!r.ok) setErro(r.mensagem)
    } catch {
      setErro("The download stopped. Try again with a connection.")
    } finally {
      medirTudo()
      setBaixandoObra(false)
    }
  }

  async function remover() {
    setRemovendo(true)
    try {
      await removerObra(jobsiteId)
    } finally {
      medirTudo()
      setRemovendo(false)
    }
  }

  // O estado da obra no aparelho, que decide o botão da faixa.
  const emAndamento = (pastas ?? []).filter(p => p.estado === "baixando")
  const baixando = baixandoObra || emAndamento.length > 0
  // Salva é ter prancha no aparelho, não qualquer arquivo: miniatura sozinha não
  // abre planta nenhuma sem rede.
  const salva = Object.values(porPasta).some(c => c.arquivos > 0)
  const faltando = useMemo(
    () => linhas.filter(l => !l.pasta || l.pasta.estado === "ausente" || l.pasta.estado === "desatualizada"),
    [linhas],
  )
  const acao: "download" | "update" | "view" = baixando ? "view"
    : !salva ? "download"
    : faltando.length ? "update"
    : "view"

  // O que ainda falta descer, pelo tamanho que o servidor informa. É o número
  // que o botão mostra antes de baixar: aceitar sem saber o peso é assinar em
  // branco o espaço do aparelho.
  const pesoPendente = useMemo(() => {
    const porDoc = new Map(documentos.map(d => [d.id, d.bytes ?? 0]))
    return faltando.reduce((t, l) => t + (porDoc.get(l.id) || l.pasta?.bytes || 0), 0)
  }, [faltando, documentos])

  // Cabe no aparelho? A medida é do navegador e muda com o tempo, então é
  // refeita quando o que falta muda e quando a faixa volta a aparecer.
  const [cabimento, setCabimento] = useState<Cabimento | null>(null)
  useEffect(() => {
    if (!pesoPendente) { setCabimento(null); return }
    let vivo = true
    void cabe(pesoPendente).then(r => { if (vivo) setCabimento(r) })
    return () => { vivo = false }
  }, [pesoPendente, espaco?.livre])

  if (!linhas.length) return null

  const semEspaco = acao !== "view" && !!cabimento && !cabimento.cabe
  const bloqueada = acao !== "view" && (!online || semEspaco)

  // O tamanho real, somado do disco, para pasta que tem algo guardado. Pasta
  // ausente mostra a estimativa do servidor, com til, que é o que ela vai custar.
  const tamanhoDaPasta = (p: PastaLocal | undefined) => {
    if (!p) return ""
    const c = porPasta[p.id]
    if (p.estado === "ausente" || !c || !disco) return p.bytes > 0 ? `~${mb(p.bytes)}` : ""
    let soma = 0
    for (const caminho of c.caminhos) soma += disco.porArquivo.get(caminho) ?? 0
    return mb(soma)
  }

  return (
    <>
      {/* O rodapé inteiro é o botão. Um alvo do tamanho da faixa é o que se
          acerta com o polegar; um botão pequeno no canto obrigava a mirar.

          Baixando, a faixa se parte em dois: o corpo continua abrindo o modal,
          e a ponta vira Cancel. Antes não havia como parar, e download que
          trava, por rede que cai ou por versão nova do app entrar no lugar,
          deixava a pasta girando para sempre. */}
      <div className={`flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-left transition-colors ${
        bloqueada ? "" : "hover:bg-accent/40"
      }`}>
        <button
          type="button"
          disabled={bloqueada}
          onClick={() => (acao === "view" ? setAberto(true) : void baixar())}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
        <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 whitespace-nowrap text-sm font-medium">Data Details</span>
        {/* A nuvem diz o estado dos documentos desta obra no aparelho, e o texto
            ao lado diz quanto:
              - baixando: nuvem descendo, em azul e pulsando, com o baixado sobre
                o total ("2.7 / 5.1 MB");
              - salva: nuvem com ok, em verde, com o peso medido no disco;
              - nada salvo: nuvem com alerta, em âmbar. */}
        {baixando ? (() => {
          let feito = 0, total = 0
          for (const p of emAndamento) {
            const c = porPasta[p.id]
            feito += c?.bytesFeitos ?? 0
            total += c?.bytesTotal || p.bytes
          }
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <CloudDownload
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-pulse text-sky-600 dark:text-sky-400"
              />
              <span className="truncate whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {total > 0 ? fracao(Math.min(feito, total), total) : "Preparing"}
              </span>
            </span>
          )
        })() : (
          <span className="flex min-w-0 items-center gap-1.5">
            {salva
              ? <CloudCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              : <CloudAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            {/* No celular a barra não tem largura para as duas coisas, e "Not
                saved" é justamente a que o ícone já diz sozinho: nuvem com
                alerta, em âmbar. O peso guardado fica, porque esse número o
                ícone não tem como dar. */}
            <span className={`truncate whitespace-nowrap text-xs tabular-nums text-muted-foreground ${
              salva && disco ? "" : "hidden sm:inline"
            }`}>
              {salva && disco ? mb(disco.total) : "Not saved"}
            </span>
          </span>
        )}
        </button>

        {/* Cancelar vem antes da ação e é só o X, em vermelho: no celular a
            faixa não tem largura para duas palavras, e parar um download é o
            gesto que precisa ser achado de primeira. Não apaga o que já desceu,
            as folhas ficam no aparelho e a próxima tentativa as pula. */}
        {baixando && (
          <button
            type="button"
            title="Cancel the download"
            aria-label="Cancel the download"
            onClick={() => { void pararDownload(jobsiteId); setBaixandoObra(false) }}
            className="ml-auto flex shrink-0 items-center rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* A ação é botão à parte, e não o fim do primeiro: é entre ela e o
            corpo da faixa que o Cancel precisa caber. Os dois fazem a mesma
            coisa, para o alvo continuar sendo a faixa inteira. */}
        <button
          type="button"
          disabled={bloqueada}
          onClick={() => (acao === "view" ? setAberto(true) : void baixar())}
          className={`flex shrink-0 items-center gap-1.5 text-xs font-medium disabled:cursor-not-allowed ${
            baixando ? "" : "ml-auto"
          } ${acao === "view" ? "text-muted-foreground" : "text-primary"} ${bloqueada ? "opacity-40" : ""}`}
        >
          {acao === "view" ? <Eye className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
          {acao === "view" ? "View" : acao === "update" ? "Update" : "Download"}
          {/* O peso do que vai descer fica no próprio botão: é a informação que
              decide o toque, e ela não pode estar dentro do modal que só abre
              depois de a obra já estar baixada. */}
          {acao !== "view" && pesoPendente > 0 && (
            <span className="tabular-nums font-normal opacity-70">{mb(pesoPendente)}</span>
          )}
        </button>
      </div>

      {/* O motivo de o botão estar apagado fica logo abaixo dele, como etiqueta
          e não como caixa: é um aviso curto pendurado no botão, e um bloco de
          fundo cheio pesava mais do que a própria faixa. */}
      {(erro || (semEspaco && cabimento?.mensagem)) && (
        <div className="mt-2 flex w-full items-start gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span className="min-w-0">{erro || cabimento?.mensagem}</span>
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border/60 p-4">
            <DialogTitle>Data Details</DialogTitle>
            <DialogDescription>
              Folders saved on this device.
            </DialogDescription>
          </DialogHeader>

          {/* A lista tem teto próprio e rola por dentro. Com muitas pastas e
              categorias, o modal crescia até a borda da tela e empurrava o total
              e o Delete para fora da vista; assim o rodapé fica sempre à mostra. */}
          <div className="max-h-[min(50dvh,22rem)] min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto overscroll-contain px-4">
            {linhas.map(l => {
              const p = l.pasta
              const estado = p?.estado ?? "ausente"
              const e = ESTADO[estado]
              const pagina = paginas[l.id]
              const faltaPagina = estado === "disponivel" && pagina === false
              const c = porPasta[l.id]
              // O estado não se escreve mais: vira a cor da contagem de pranchas.
              // O texto fica no title, para quem passa o mouse ou usa leitor de tela.
              const rotulo = estado === "disponivel" && pagina === true
                ? "Ready offline"
                : faltaPagina
                  ? online ? "Downloaded, saving the page" : "Page not saved. Open once with a connection"
                  : e.rotulo
              const cor = faltaPagina ? "text-amber-600 dark:text-amber-400" : e.classe
              return (
                <div key={l.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    {/* A categoria em cima e o arquivo embaixo, como na lista de
                        documentos: é pela categoria que se reconhece o que está
                        guardado, e não pelo nome que o PDF tinha na máquina de
                        quem o enviou. */}
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span className={`max-w-full truncate text-sm font-medium leading-tight ${
                        l.etiquetas.length === 0 ? "text-muted-foreground" : ""
                      }`}>
                        {l.etiquetas.length === 0
                          ? "No category"
                          : l.etiquetas.map(tagLabel).join(" · ")}
                      </span>
                      <span className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.nome}</span>
                      </span>
                    </span>
                  </span>

                  {/* À direita, o peso e, embaixo dele, as pranchas que já estão
                      no aparelho sobre o total. Na linha do estado as duas
                      contagens disputavam espaço com a etiqueta e quebravam. */}
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs tabular-nums text-muted-foreground">
                    <span>{tamanhoDaPasta(p)}</span>
                    {c && (
                      <span title={rotulo} aria-label={`${rotulo}, ${c.arquivos} of ${c.total} plans`} className={`flex items-center gap-1 ${cor}`}>
                        <Layers className="h-3 w-3" />
                        {c.arquivos}/{c.total}
                      </span>
                    )}
                  </span>

                  {/* Parar também daqui: é nesta lista que se vê qual pasta está
                      descendo, e mandar a pessoa fechar o modal para achar o
                      Cancel na faixa é fazer ela procurar o que está na frente
                      dela. O mesmo X vermelho, pelo mesmo motivo. */}
                  {estado === "baixando" && (
                    <button
                      type="button"
                      title="Cancel the download"
                      aria-label="Cancel the download"
                      onClick={() => { void pararDownload(jobsiteId); setBaixandoObra(false) }}
                      className="flex shrink-0 items-center rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* O rodapé tem dois andares. Em cima, o total da obra contra o espaço
              do aparelho, de ponta a ponta. Embaixo, a saída para liberar esse
              espaço, com a frase que diz o que ela apaga e o que não apaga: sem
              as ações por pasta, é o único jeito de devolver o que foi baixado. */}
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>This project on this device</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium text-foreground">{mb(disco?.total ?? 0)}</span>
                {espaco?.suportado && espaco.cota > 0 && ` of ${mb(espaco.cota)}`}
              </span>
            </div>
            {salva && !baixando && (
              <SegurarParaLimpar ocupado={removendo} onConfirmar={() => void remover()} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

const DURACAO_SEGURAR = 1500

/**
 * O botão de limpar a memória, que só age se for segurado.
 *
 * Limpar apaga o que a pessoa baixou no Wi-Fi para usar no canteiro, e um toque
 * sem querer no rodapé do modal não pode custar isso. Segurando, o fundo enche da
 * esquerda para a direita; soltar antes do fim, ou arrastar o dedo para fora,
 * desfaz o preenchimento e não apaga nada. Pelo teclado vale o mesmo, segurando
 * Enter ou espaço.
 */
function SegurarParaLimpar({ ocupado, onConfirmar }: {
  ocupado: boolean
  onConfirmar: () => void
}) {
  const [progresso, setProgresso] = useState(0)
  const [segurando, setSegurando] = useState(false)
  const quadro = useRef<number | null>(null)
  const inicio = useRef(0)

  const parar = () => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current)
    quadro.current = null
    setSegurando(false)
    setProgresso(0)
  }

  const comecar = () => {
    if (ocupado || quadro.current !== null) return
    setSegurando(true)
    inicio.current = performance.now()
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio.current) / DURACAO_SEGURAR)
      setProgresso(p)
      if (p >= 1) {
        quadro.current = null
        setSegurando(false)
        setProgresso(0)
        onConfirmar()
        return
      }
      quadro.current = requestAnimationFrame(passo)
    }
    quadro.current = requestAnimationFrame(passo)
  }

  useEffect(() => () => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current)
  }, [])

  return (
    <button
      type="button"
      disabled={ocupado}
      aria-label="Hold to clear memory"
      onPointerDown={comecar}
      onPointerUp={parar}
      onPointerLeave={parar}
      onPointerCancel={parar}
      onKeyDown={e => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); comecar() }
      }}
      onKeyUp={e => { if (e.key === "Enter" || e.key === " ") parar() }}
      // Segurar no celular abre o menu de contexto e seleciona o texto; os dois
      // interromperiam o gesto no meio.
      onContextMenu={e => e.preventDefault()}
      className="relative flex w-full touch-none select-none items-center gap-3 overflow-hidden rounded-md border border-destructive/30 bg-background px-3 py-2 text-left disabled:opacity-50"
    >
      {/* O preenchimento. Enquanto segura, a largura acompanha o tempo quadro a
          quadro; ao soltar, volta a zero com uma transição curta, para a
          desistência ser vista e não parecer um salto. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 bg-destructive/15 ${segurando ? "" : "transition-[width] duration-300"}`}
        style={{ width: `${progresso * 100}%` }}
      />
      {ocupado
        ? <Loader2 className="relative h-4 w-4 shrink-0 animate-spin text-destructive" />
        : <Eraser className="relative h-4 w-4 shrink-0 text-destructive" />}
      <span className="relative flex min-w-0 flex-col">
        <span className="text-sm font-medium text-destructive">Clear memory</span>
        <span className="text-xs text-muted-foreground">Hold to delete the plans saved here.</span>
      </span>
    </button>
  )
}

/**
 * O aviso de que este plano não está no aparelho.
 *
 * Aparece quando um link atravessa para uma pasta que ninguém baixou, que é o
 * caso mais frequente dos vínculos automáticos: eles apontam para onde a prancha
 * manda, e a prancha não sabe o que a pessoa escolheu manter.
 *
 * Sem isto o link vira beco sem saída no canteiro: a pessoa toca, não acontece
 * nada, e ela conclui que o vínculo está quebrado. Com a miniatura e o botão,
 * ela ao menos vê do que se trata e sabe o que fazer quando houver rede.
 */
export function PlanoAusente({ thumb, nome, pastaId, onBaixar }: {
  thumb: string | null; nome: string; pastaId: string
  onBaixar: (pastaId: string) => void
}) {
  const online = useOnline()

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 p-8 text-center">
      {thumb
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={thumb} alt={nome} className="max-h-48 rounded border border-border/60 opacity-70" />
        : <WifiOff className="h-6 w-6 text-muted-foreground" />}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{nome}</p>
        <p className="text-sm text-muted-foreground">
          The full resolution is not on this device.
        </p>
      </div>
      <button
        type="button"
        disabled={!online}
        onClick={() => onBaixar(pastaId)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {online ? "Download this folder" : "Needs a connection"}
      </button>
    </div>
  )
}
