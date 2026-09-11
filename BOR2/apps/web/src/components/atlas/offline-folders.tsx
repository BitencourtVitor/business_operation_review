"use client"

import { useLiveQuery } from "dexie-react-hooks"
import {
  AlertTriangle, Check, Download, HardDrive, Loader2, Trash2, WifiOff,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { aquecerRotas, paginaGuardada } from "@/lib/offline/aquecer"
import { local, type PastaLocal } from "@/lib/offline/db"
import {
  baixarIndice, baixarMiniaturas, baixarPasta, liberarPasta,
} from "@/lib/offline/index-sync"
import { mb, medirEspaco, type Espaco } from "@/lib/offline/storage"

/**
 * As pastas da obra, e o que cada uma tem no aparelho.
 *
 * Não existe botão de obra offline inteira, e isso é decisão e não omissão. A
 * pasta é a unidade porque corresponde a um documento anexado e a uma categoria,
 * que é como o pessoal de campo raciocina: "a planta de painéis do primeiro
 * andar", não "a obra". Um botão de obra faria a pessoa baixar 2.800 pranchas
 * para consultar quarenta.
 *
 * Cada pasta mostra o próprio estado, e o tamanho **antes** da confirmação: sem
 * o número, escolher é apostar.
 */

const ESTADO: Record<PastaLocal["estado"], { rotulo: string; classe: string }> = {
  ausente:       { rotulo: "Not downloaded", classe: "text-muted-foreground" },
  baixando:      { rotulo: "Downloading",    classe: "text-sky-600 dark:text-sky-400" },
  disponivel:    { rotulo: "Available",      classe: "text-emerald-600 dark:text-emerald-400" },
  desatualizada: { rotulo: "Out of date",    classe: "text-amber-600 dark:text-amber-400" },
}

const rotaDaPasta = (jobsiteId: string, pastaId: string) =>
  `/atlas/${jobsiteId}/documents/${pastaId}`

export function OfflineFolders({ jobsiteId }: { jobsiteId: string }) {
  const [espaco, setEspaco] = useState<Espaco | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [erro, setErro] = useState("")
  const [online, setOnline] = useState(true)
  // Se a página de cada pasta baixada já está guardada. O arquivo no disco não
  // basta: sem a página, tocar na pasta sem rede devolvia a pessoa para a lista.
  const [paginas, setPaginas] = useState<Record<string, boolean | null>>({})

  const pastas = useLiveQuery(
    () => local.pastas.where("obraId").equals(jobsiteId).sortBy("name"),
    [jobsiteId],
  )

  // Quantas folhas de cada pasta têm o arquivo no aparelho. É a resposta a "está
  // guardado mesmo?", que o rótulo sozinho não dava: "Available" dizia que a
  // pasta foi baixada, não quantas pranchas de fato estão no disco.
  const contagem = useLiveQuery(async () => {
    const planos = await local.planos.where("obraId").equals(jobsiteId).toArray()
    const r: Record<string, { total: number; arquivos: number }> = {}
    for (const p of planos) {
      const c = (r[p.pastaId] ??= { total: 0, arquivos: 0 })
      c.total++
      if (p.arquivo) c.arquivos++
    }
    return r
  }, [jobsiteId])

  useEffect(() => {
    // O índice desce sempre, e desce em segundo plano.
    //
    // Custa poucas dezenas de MB e garante que, sem internet, a pessoa navegue,
    // busque e saiba que o plano existe. É a diferença entre "não tenho o
    // arquivo" e "não sei o que existe", e a segunda é a que faz alguém voltar
    // ao escritório.
    void baixarIndice(jobsiteId).catch(() => undefined)
    void medirEspaco().then(setEspaco)
  }, [jobsiteId])

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

  const guardadas = useMemo(
    () => (pastas ?? []).filter(p => p.estado !== "ausente").map(p => p.id),
    [pastas],
  )
  const chave = guardadas.join(",")

  useEffect(() => {
    if (!guardadas.length) return
    // Toda visita com rede guarda de novo a página de cada pasta baixada.
    //
    // Guardar só no momento do download deixava de fora quem baixou antes de o
    // worker saber guardar páginas, e pasta baixada não mostra mais o botão de
    // baixar: não havia como corrigir pela tela. Reaquecer é barato, porque o
    // código que a página cita já está guardado e não desce de novo.
    aquecerRotas(guardadas.map(id => rotaDaPasta(jobsiteId, id)))
    void import("@/components/atlas/pdf-page").then(m => m.aquecerPdf()).catch(() => undefined)
    // E completa as miniaturas que faltam, pelo mesmo motivo: pasta baixada antes
    // de as miniaturas descerem abriria sem rede com a grade girando.
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

  async function baixar(pasta: PastaLocal) {
    setOcupada(pasta.id); setErro("")
    const r = await baixarPasta(pasta.id)
    if (!r.ok) setErro(r.mensagem)
    void medirEspaco().then(setEspaco)
    setOcupada(null)
  }

  async function liberar(pasta: PastaLocal) {
    setOcupada(pasta.id)
    await liberarPasta(pasta.id)
    void medirEspaco().then(setEspaco)
    setOcupada(null)
  }

  if (!pastas?.length) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Keep on this device</span>
        {espaco?.suportado && espaco.cota > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {mb(espaco.usado)} de {mb(espaco.cota)}
            {/* Sem a promessa de persistência, o sistema pode descartar tudo sob
                aperto de espaço. Vale dizer, porque a saída é instalar o app na
                tela de início e isso a pessoa consegue fazer. */}
            {!espaco.persistente && (
              <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                · install to the home screen to keep it safe
              </span>
            )}
          </span>
        )}
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{erro}</span>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/50">
        {pastas.map(p => {
          const e = ESTADO[p.estado]
          const trabalhando = ocupada === p.id || p.estado === "baixando"
          // A pasta só se diz pronta para o offline quando arquivo e página estão
          // no aparelho. Nulo é não haver como conferir (sem worker), e aí vale o
          // rótulo de sempre.
          const pagina = paginas[p.id]
          const faltaPagina = p.estado === "disponivel" && pagina === false
          return (
            <div key={p.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className={`text-xs ${faltaPagina ? "text-amber-600 dark:text-amber-400" : e.classe}`}>
                  {p.estado === "disponivel" && pagina === true
                    ? "Ready offline"
                    : faltaPagina
                      ? online ? "Downloaded · saving the page" : "Downloaded, but the page was not saved. Open once with a connection"
                      : e.rotulo}
                  {p.estado !== "ausente" && contagem?.[p.id] &&
                    ` · ${contagem[p.id].arquivos}/${contagem[p.id].total} plans`}
                  {p.bytes > 0 && ` · ${mb(p.bytes)}`}
                  {p.estado === "desatualizada" &&
                    ` · rev ${p.revisaoLocal} → ${p.revisaoServidor}`}
                </span>
              </span>

              {trabalhando ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : p.estado === "disponivel" ? (
                <>
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <button
                    type="button"
                    title="Remove from this device"
                    onClick={() => liberar(p)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => baixar(p)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" />
                  {p.estado === "desatualizada" ? "Update" : "Download"}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
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
