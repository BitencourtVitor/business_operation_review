"use client"

import { PointPhase, ehImagem, ehVideo } from "@/components/atlas/point-media"
import { RoleName } from "@/components/atlas/role-icon"
import { SolutionDialog } from "@/components/atlas/solution-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAtlasMedia, useDeleteAtlasMedia, useUpdateAtlasEvent, useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { useAuthStore } from "@/store/auth.store"
import { AlignLeft, CalendarDays, Camera, Check, CheckCircle2, Flag, Type, Video, X } from "lucide-react"
import { useRef, useState } from "react"

/** Data e hora como quem confere: dia curto e relógio de 24 horas. */
function quando(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Uma metade do ponto: o problema, ou a correção.
 *
 * O escrito à esquerda, as peças à direita, e a assinatura embaixo das duas,
 * na largura inteira. Presa dentro da coluna do texto, ela ficava espremida
 * na metade da largura sempre que o baralho de fotos era mais baixo que o
 * texto, com o resto da linha vazio ao lado. É a mesma forma que o ponto tem
 * na janelinha sobre a prancha e no relatório impresso: três superfícies
 * mostram a mesma coisa, e quem aprende uma sabe ler as outras.
 *
 * As peças flutuam à direita e o texto contorna. Em duas colunas, o texto
 * longo descia espremido do lado das peças e, abaixo delas, a coluna da
 * direita ficava vazia até o fim da metade; contornando, o texto volta à
 * largura inteira assim que as peças acabam.
 */
function Metade({ rotulo, icone: Icone, tom, titulo, texto, vazio, nome, cargo, data, flutuar = true, children }: {
  rotulo: string
  icone: React.ElementType
  tom: "problema" | "solucao"
  /** O título do problema, ou da solução, logo abaixo do rótulo. */
  titulo?: string
  texto: string
  /** O que se diz quando não há texto: a metade existe, o escrito ainda não. */
  vazio: string
  nome?: string
  cargo?: string
  data?: string
  /**
   * As peças contornadas pelo texto. Desligado, é a forma de duas colunas com
   * o lado direito centrado na altura, que serve ao botão sozinho da solução
   * ainda não registrada.
   */
  flutuar?: boolean
  children: React.ReactNode
}) {
  const escrito = (
    <>
      <span className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
        tom === "solucao" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
      }`}>
        <Icone className="h-3.5 w-3.5 shrink-0" />
        {rotulo}
      </span>

      {titulo && <p className="mb-1.5 text-sm font-semibold leading-snug">{titulo}</p>}
      {texto
        ? <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
        : !titulo && <p className="text-sm italic text-muted-foreground">{vazio}</p>}
    </>
  )

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      {flutuar ? (
        // flow-root encerra a flutuação aqui dentro: sem ele, a assinatura
        // subia para o lado das peças quando o texto era mais curto que elas.
        <div className="flow-root">
          <div className="float-right mb-1.5 ml-3">{children}</div>
          {escrito}
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">{escrito}</div>
          {children}
        </div>
      )}

      {/* Fora da coluna do texto, na largura inteira: quem fez e quando é o
          fecho do registro, e não um detalhe amarrado a uma das duas metades. */}
      {(nome || data) && (
        <span className="flex flex-wrap items-center justify-evenly gap-2 pt-1 text-[11px] text-muted-foreground">
          {nome && <RoleName name={nome} role={cargo} />}
          {nome && data && <span aria-hidden className="h-3 w-px shrink-0 bg-border" />}
          {data && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {quando(data)}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/**
 * O miolo de um ponto, onde quer que ele seja aberto.
 *
 * A lista de tasks da obra e a verificação de um escopo mostram o mesmo ponto
 * por dois caminhos, e o que se faz com ele é o mesmo: ler o problema, ver a
 * prova, registrar o conserto. Duas cópias disso divergiriam na primeira
 * mudança, e a primeira mudança já aconteceu duas vezes.
 *
 * ── Duas metades, e não faixas soltas ──
 *
 * O problema com o texto e a prova dele, e a correção com o que foi feito e a
 * prova disso, separados por uma linha.
 *
 * ── Cada metade é de quem a escreveu ──
 *
 * O problema se edita por quem levantou o ponto, a solução por quem resolveu.
 * Quem não é autor lê as duas e não mexe em nenhuma: nem no texto, nem nas
 * peças. A API aplica a mesma regra.
 *
 * ── O que saiu ──
 *
 * O comentário solto e o áudio, que produziam conversa perdida e não entravam
 * no relatório. Por decisão do Vitor em 13/09, nem o que já existia aparece.
 */
export function PointDetail({ jobsiteId, point, canWrite, rodape }: {
  jobsiteId: string
  point: {
    id: string
    status: string
    title?: string
    body: string
    solutionTitle?: string
    solutionBody?: string
    createdBy?: string
    createdName?: string
    createdRole?: string
    createdAt?: string
    resolvedAt?: string
    resolvedBy?: string
    resolvedName?: string
    resolvedRole?: string
  }
  canWrite: boolean
  /**
   * As ações do ponto, no pé da ficha. Quem monta a lista decide o que entra
   * aqui, porque é ela que sabe quem pode o quê.
   */
  rodape?: React.ReactNode
}) {
  const { data: media } = useAtlasMedia(jobsiteId, { eventId: point.id })
  const pecas = (media ?? []).filter((m: AtlasMedia) => m.url)
  const visuais = pecas.filter(m => ehImagem(m) || ehVideo(m))
  const antes = visuais.filter(m => m.phase !== "after")
  const depois = visuais.filter(m => m.phase === "after")
  const eu = useAuthStore(st => st.user)
  const [registrando, setRegistrando] = useState(false)
  const [editando, setEditando] = useState<"problema" | "solucao" | null>(null)

  const donoDoProblema = canWrite && !!eu && point.createdBy === eu.id
  const donoDaSolucao = canWrite && !!eu && point.resolvedBy === eu.id

  // A correção aparece quando existe prova dela, quando alguém marcou o ponto
  // como resolvido, ou quando há quem registre. Para quem só lê, ponto pendente
  // não ganha metade vazia.
  const temSolucao = depois.length > 0 || point.status === "resolved" || canWrite

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border/60">
        <Metade
          rotulo="Problem"
          icone={Flag}
          tom="problema"
          titulo={point.title}
          texto={point.body}
          vazio="No description."
          nome={point.createdName}
          cargo={point.createdRole}
          data={point.createdAt}
        >
          <PointPhase
            canWrite={donoDoProblema}
            pecas={antes}
            onEditar={() => setEditando("problema")}
          />
        </Metade>

        {temSolucao && (
          <Metade
            rotulo="Solution"
            icone={CheckCircle2}
            tom={depois.length > 0 || point.status === "resolved" ? "solucao" : "problema"}
            titulo={point.solutionTitle}
            texto={point.solutionBody ?? ""}
            vazio={point.status === "resolved"
              ? "Marked as resolved, with nothing written about the fix."
              : "Not fixed yet."}
            nome={point.resolvedName}
            cargo={point.resolvedRole}
            // A solução tem data como o problema tem. Resolvido, é quando foi
            // marcado; ainda sem marca, é quando a última prova do conserto subiu.
            data={point.resolvedAt || depois[depois.length - 1]?.uploadedAt}
            flutuar={depois.length > 0}
          >
            {/* Sem solução registrada, a metade oferece o registro inteiro, e não
                uma câmera solta: o mesmo formulário com que o problema entrou. */}
            {depois.length === 0 ? (
              canWrite && (
                <button
                  type="button"
                  onClick={() => setRegistrando(true)}
                  className="flex h-8 shrink-0 items-center gap-1.5 self-center rounded-lg border border-emerald-500/40 px-3 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Problem solved
                </button>
              )
            ) : (
              <PointPhase
                canWrite={donoDaSolucao}
                pecas={depois}
                onEditar={() => setEditando("solucao")}
              />
            )}
          </Metade>
        )}
      </div>

      {canWrite && (
        <SolutionDialog
          jobsiteId={jobsiteId}
          eventId={point.id}
          jaResolvido={point.status === "resolved"}
          open={registrando}
          onClose={() => setRegistrando(false)}
        />
      )}

      <EditarMetade
        jobsiteId={jobsiteId}
        eventId={point.id}
        metade={editando}
        titulo={editando === "solucao" ? point.solutionTitle ?? "" : point.title ?? ""}
        corpo={editando === "solucao" ? point.solutionBody ?? "" : point.body}
        pecas={editando === "solucao" ? depois : antes}
        onClose={() => setEditando(null)}
      />

      {rodape && (
        // As ações dividem a largura: com um vão no meio, a de cada ponta
        // parecia um botão perdido no canto.
        // O rodapé tem o fundo e o fio do cabeçalho do ponto: sai do fundo do
        // corpo até as bordas do cartão, e o corpo fica emoldurado pelos dois.
        <div className="-mx-3 -mb-3 flex items-center gap-2 border-t border-border/60 bg-card px-3 py-3 [&>*]:flex-1 [&>*]:justify-center">
          {rodape}
        </div>
      )}
    </div>
  )
}

/**
 * Editar o escrito de uma metade do ponto: título e relato.
 *
 * O mesmo formato nas duas, porque o problema e a solução são o mesmo tipo de
 * registro: uma linha que diz o que é, e o parágrafo que conta.
 */
export function EditarMetade({ jobsiteId, eventId, metade, titulo, corpo, pecas, onClose }: {
  jobsiteId: string
  eventId: string
  metade: "problema" | "solucao" | null
  titulo: string
  corpo: string
  /** As fotos e os vídeos desta metade: saem e entram aqui, junto com o texto. */
  pecas: AtlasMedia[]
  onClose: () => void
}) {
  const atualizar = useUpdateAtlasEvent(jobsiteId)
  const subir = useUploadAtlasMedia(jobsiteId)
  const tirar = useDeleteAtlasMedia(jobsiteId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [tirando, setTirando] = useState<string | null>(null)
  const fase = metade === "solucao" ? "after" : "before"

  async function adicionar(arquivos: File[]) {
    setErro("")
    try {
      for (const file of arquivos) await subir.mutateAsync({ file, eventId, phase: fase })
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Could not add the file. Try again.")
    }
  }

  async function remover(mediaId: string) {
    setErro("")
    setTirando(mediaId)
    try {
      await tirar.mutateAsync({ mediaId, eventId })
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Could not remove. Try again.")
    } finally {
      setTirando(null)
    }
  }
  const [aberta, setAberta] = useState<typeof metade>(null)
  const [t, setT] = useState("")
  const [c, setC] = useState("")
  const [erro, setErro] = useState("")
  // Cada abertura começa do que está gravado, e não do rascunho que ficou.
  if (metade !== aberta) {
    setAberta(metade)
    if (metade) { setT(titulo); setC(corpo); setErro("") }
  }

  async function salvar() {
    if (!metade || !t.trim()) return
    setErro("")
    const patch = metade === "solucao"
      ? { solutionTitle: t.trim(), solutionBody: c.trim() }
      : { title: t.trim(), body: c.trim() }
    try {
      await atualizar.mutateAsync({ eventId, patch })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Could not save. Try again.")
    }
  }

  return (
    <Dialog open={!!metade} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {metade === "solucao"
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              : <Flag className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {metade === "solucao" ? "Edit solution" : "Edit problem"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`editar-titulo-${eventId}`}>
            {metade === "solucao" ? "What was done?" : "What is the problem?"}
          </Label>
          <div className="relative">
            <Type className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`editar-titulo-${eventId}`}
              autoFocus
              value={t}
              placeholder="A short title"
              onChange={e => setT(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`editar-corpo-${eventId}`}>Description</Label>
          <div className="relative">
            <AlignLeft className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <textarea
              id={`editar-corpo-${eventId}`}
              rows={4}
              value={c}
              placeholder="Details"
              onChange={e => setC(e.target.value)}
              className="w-full resize-y rounded-md border border-input bg-transparent py-2 pl-8 pr-3 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Photos and videos</Label>
          {/* Tirar e pôr uma peça vale na hora, sem esperar o Save: é arquivo, e
              não rascunho. O Save é só do texto. */}
          <div className="grid grid-cols-4 gap-2">
            {pecas.map(m => (
              <div key={m.id} className="relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted">
                {ehVideo(m)
                  ? <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={m.url} alt={m.fileName} className="h-full w-full object-cover" />}
                <button
                  type="button"
                  title="Remove"
                  aria-label="Remove"
                  disabled={tirando === m.id}
                  onClick={() => void remover(m.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/80 text-white transition-colors hover:bg-destructive disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={subir.isPending}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Photo
            </button>
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              disabled={subir.isPending}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            >
              <Video className="h-4 w-4" />
              Video
            </button>
          </div>
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void adicionar(f) }}
          />
          <input
            ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void adicionar(f) }}
          />
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <DialogFooter>
          <Button onClick={() => void salvar()} disabled={!t.trim() || atualizar.isPending}>
            <Check className="h-4 w-4" />
            {atualizar.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Data e hora como quem confere. Exportada porque a verificação usa a mesma. */
export { quando }
