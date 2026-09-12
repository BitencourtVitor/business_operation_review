"use client"

import { ImportJobsitesDialog } from "@/components/atlas/import-jobsites-dialog"
import {
  JobsiteFormDialog, KIND_META, placeLabel,
} from "@/components/atlas/jobsite-form-dialog"
import { ArchiveConfirm } from "@/components/atlas/archive-confirm"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { useAtlasJobsites } from "@/hooks/use-atlas"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import {
  Archive, ArchiveRestore, ChevronDown, CircleDot, CloudCheck, Layers, MapPin, Pencil, Plus, Search, WifiOff,
} from "lucide-react"
import Link from "next/link"
import { useLiveQuery } from "dexie-react-hooks"
import { local } from "@/lib/offline/db"
import { guardarObras } from "@/lib/offline/index-sync"
import { useEffect, useMemo, useState } from "react"

// A obra arquivada não some, ela sai da frente. O padrão é ver só as ativas,
// que é o trabalho de hoje; as arquivadas se procuram quando se procura por
// elas. Cada opção leva o próprio ícone porque a lista se lê de relance, e três
// palavras parecidas em cinza não se distinguem de relance.
const STATUS_OPTIONS = [
  { value: "active",   label: "Active",   icon: CircleDot },
  { value: "archived", label: "Archived", icon: Archive },
  { value: "all",      label: "All",      icon: Layers },
] as const

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"]

export default function AtlasJobsitesPage() {
  const { data: jobsites, isLoading } = useAtlasJobsites()
  // Sem rede, só as obras mantidas no aparelho abrem.
  //
  // As demais continuam listadas e desabilitadas. Sumir da lista pareceria perda
  // de acesso, e a pessoa concluiria que foi tirada do projeto quando o que
  // houve foi ela ter escolhido não guardar aquela obra.
  const [online, setOnline] = useState(true)
  const locais = useLiveQuery(() => local.obras.toArray(), [])
  const guardadas = useMemo(
    () => new Set((locais ?? []).filter(o => o.selecionada && !o.expiradaEm).map(o => o.id)),
    [locais],
  )
  // As obras baixadas por inteiro: todas as pastas com as pranchas no aparelho.
  // É o que acende a nuvem no card, com ou sem rede.
  const pastasLocais = useLiveQuery(() => local.pastas.toArray(), [])
  const completas = useMemo(() => {
    const porObra = new Map<string, boolean>()
    for (const p of pastasLocais ?? []) {
      const noAparelho = p.estado === "disponivel" || p.estado === "desatualizada"
      porObra.set(p.obraId, (porObra.get(p.obraId) ?? true) && noAparelho)
    }
    return new Set([...porObra].filter(([, ok]) => ok).map(([id]) => id))
  }, [pastasLocais])
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
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("active")
  const [adding, setAdding] = useState<"import" | "new" | null>(null)
  const [editing, setEditing] = useState<AtlasJobsite | null>(null)
  const [archiving, setArchiving] = useState<AtlasJobsite | null>(null)
  // A obra que está mostrando o aviso de "não salva". Volta sozinha ao normal:
  // é um recado de relance, e um aviso que precisa ser fechado vira mais uma
  // tarefa na tela.
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 3000)
    return () => clearTimeout(t)
  }, [aviso])
  const qc = useQueryClient()
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      atlasService.updateJobsite(id, { status: archived ? "archived" : "active" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "jobsites"] }),
  })

  // Toda lista que chega do servidor vai para o aparelho. É dela que sai a
  // resposta a "esta obra está guardada aqui?" quando o sinal falta.
  useEffect(() => {
    if (jobsites?.length) void guardarObras(jobsites).catch(() => undefined)
  }, [jobsites])

  // Os clientes sugeridos são os que já entraram por alguma obra: não há
  // catálogo à parte, e inventar um seria mais uma lista para divergir.
  const clients = useMemo(
    () => [...new Set((jobsites ?? []).map(j => j.client).filter(Boolean))].sort(),
    [jobsites],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (jobsites ?? []).filter(j =>
      status === "all" ? true
        : status === "archived" ? j.status === "archived"
        : j.status !== "archived")
    if (!q) return rows
    return rows.filter(j =>
      [j.name, j.address, j.client, j.code].some(v => v.toLowerCase().includes(q)))
  }, [jobsites, query, status])

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        {/* Só o título. A frase de apoio explicava a tela uma vez e ocupava
            altura em toda visita; a lista é o que se veio ver. */}
        <h1 className="text-lg font-semibold">Project List</h1>
        {/* Uma porta só para as duas maneiras de a obra entrar, como na tela de
            usuários. Dois botões lado a lado obrigavam a ler os dois para
            descobrir que fazem a mesma coisa por caminhos diferentes. */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button className="shrink-0 gap-1.5" />}>
            <Plus className="h-3.5 w-3.5" />
            Add project
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onClick={() => setAdding("import")}>
              {/* O selo da Framing, e não uma nuvem genérica: a obra vem do
                  Forecast daquela empresa, e é isso que a linha promete. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/sublogo_framing.png" alt="" className="h-4 w-4 object-contain" />
              <span className="flex flex-col">
                <span>Import from Framing Forecast</span>
                <span className="text-xs text-muted-foreground">Community, client and address already filled</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAdding("new")}>
              <Plus className="h-4 w-4" />
              <span className="flex flex-col">
                <span>New project</span>
                <span className="text-xs text-muted-foreground">Type it in by hand</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={v => v && setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-36 shrink-0">
            <span className="flex flex-1 items-center gap-2 text-left text-sm">
              {(() => {
                const picked = STATUS_OPTIONS.find(o => o.value === status)!
                return <picked.icon className="h-3.5 w-3.5 text-muted-foreground" />
              })()}
              {STATUS_OPTIONS.find(o => o.value === status)!.label}
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                <span className="flex items-center gap-2">
                  <o.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ImportJobsitesDialog open={adding === "import"} onOpenChange={o => setAdding(o ? "import" : null)} />
      <JobsiteFormDialog open={adding === "new"} onOpenChange={o => setAdding(o ? "new" : null)} clients={clients} />
      <ArchiveConfirm
        jobsite={archiving}
        onClose={() => setArchiving(null)}
        onConfirm={id => { archive.mutate({ id, archived: true }); setArchiving(null) }}
      />

      <JobsiteFormDialog
        open={!!editing}
        onOpenChange={o => { if (!o) setEditing(null) }}
        clients={clients}
        editing={editing}
      />

      {/* A listagem tem moldura e rola por dentro. Sem isso, uma lista de trinta
          obras leva o cabeçalho e a busca embora justamente quando a busca
          passa a ser necessária. */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-card/20 p-3">
        {/* O respiro à direita é para a barra de rolagem do desktop não encostar
            no cartão. No celular não há barra ocupando lugar, e ele virava um
            vão: 12px de moldura à esquerda contra 24px à direita, com o cartão
            visivelmente fora do centro. */}
        <div className="h-full overflow-y-auto sm:pr-3">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
              <p className="text-sm font-medium">No projects here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobsites?.length
                  ? "Nothing matches this search."
                  : !online
                    ? "No connection, and this list hasn't been saved on this device yet. Open the Atlas once with a connection."
                    : "Import from the Forecast, or create one by hand, to start uploading documents."}
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(j => {
                const Kind = (KIND_META[j.kind] ?? KIND_META.house).icon
                const archived = j.status === "archived"
                const alcancavel = online || guardadas.has(j.id)
                const salva = completas.has(j.id)
                return (
                  // Link e botões lado a lado, nunca aninhados: botão dentro de
                  // link é HTML inválido, e o clique de um roubaria o do outro.
                  // Mesma solução do seletor da sidebar.
                  // Arquivada se reconhece pelo peso, não por uma etiqueta ao
                  // lado do cliente: o cartão inteiro recua, que é o que o
                  // arquivamento fez com a obra.
                  <div
                    key={j.id}
                    className={`flex items-stretch overflow-hidden rounded-md border transition-colors duration-300 ${
                      aviso === j.id
                        ? "border-red-500/50 bg-red-500/[0.06]"
                        : archived
                          ? "border-dashed border-border/50 bg-muted/30 opacity-75 hover:border-primary/40 hover:opacity-100"
                          : "border-border/60 bg-card hover:border-primary/40"
                    }`}
                  >
                    <Link
                      href={alcancavel ? `/atlas/${j.id}` : "#"}
                      aria-disabled={!alcancavel}
                      // O toque em qualquer ponto do card explica, e não só no
                      // ícone: no celular ninguém mira num ícone de 16 px, e o
                      // `title` que havia aqui nunca aparece em tela de toque.
                      onClick={e => {
                        if (alcancavel) return
                        e.preventDefault()
                        setAviso(j.id)
                      }}
                      className={`relative flex min-w-0 flex-1 flex-col gap-1 p-4 transition-colors ${
                        alcancavel ? `hover:bg-accent/30 ${salva ? "pr-10" : ""}`
                          : `cursor-not-allowed pr-10 [&>span]:transition-opacity [&>span]:duration-300 ${
                            aviso === j.id ? "[&>span]:opacity-0" : "[&>span]:opacity-50"
                          }`
                      }`}
                    >
                      {/* O esmaecido vai só no texto. Aplicado ao card inteiro,
                          apagava junto o ícone, e o vermelho é o que faz a pessoa
                          perceber de longe por que a obra não abre.

                          O ícone fica à direita do texto, na altura do meio,
                          encostado nos botões de arquivar e editar: é o lado das
                          ações, e é ali que a pessoa procura por que não pode
                          agir sobre a obra. */}
                      {/* Tocar no card troca a aparência dele inteiro por alguns
                          segundos, e não abre balão: a borda e o fundo puxam
                          para o vermelho, o texto some, e no lugar dele entra o
                          ícone maior com o motivo. Depois tudo volta esmaecendo.
                          O aviso mora dentro do próprio card, que é onde o olho
                          já está quando o toque não abre nada. */}
                      {/* Obra baixada por inteiro leva a nuvem no mesmo lugar do
                          aviso de sem rede, na cor do texto. Aparece também com
                          rede: é como se vê de relance o que já está no aparelho
                          antes de sair para onde não há sinal. */}
                      {alcancavel && salva && (
                        <CloudCheck
                          aria-label="Saved on this device"
                          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        >
                          <title>Saved on this device</title>
                        </CloudCheck>
                      )}
                      {!alcancavel && (
                        <>
                          <WifiOff
                            aria-label="Offline"
                            className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500 transition-opacity duration-300 dark:text-red-400 ${
                              aviso === j.id ? "opacity-0" : "opacity-100"
                            }`}
                          />
                          <div
                            role="status"
                            aria-hidden={aviso !== j.id}
                            className={`pointer-events-none absolute inset-0 flex items-center gap-3 px-4 transition-opacity duration-300 ${
                              aviso === j.id ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            <WifiOff className="h-6 w-6 shrink-0 text-red-500 dark:text-red-400" />
                            <div className="flex min-w-0 flex-col">
                              <span className="text-sm font-semibold text-red-600 dark:text-red-400">You're offline</span>
                              <span className="text-xs text-muted-foreground">This project isn't saved on this device</span>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Do geral ao particular: cliente, lugar, e por fim a
                          obra. A identificação vem por último porque é onde a
                          leitura chega, e é como a obra é chamada no dia a dia. */}
                      <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                        {j.client || "No client"}
                      </span>

                      {/* O lugar perde o miolo: a cidade se repete em toda obra
                          da comunidade e não distingue nenhuma delas. */}
                      <span className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{placeLabel(j.community || j.address || j.name)}</span>
                      </span>

                      {/* Mesmo corpo do lugar, logo acima: as duas linhas são a
                          identificação da obra, e o degrau de tamanho entre
                          elas sugeria uma hierarquia que não existe. As duas
                          são bold e do mesmo tamanho; o que separa uma da outra
                          é a cor, como na barra lateral.

                          Menores do que eram: o cartão se lê de relance, em
                          grade de três colunas, e nome de obra é longo. Corpo
                          menor cabe mais linha antes de o nome truncar. */}
                      <span className="flex items-center gap-1.5 text-xs font-semibold leading-snug">
                        <Kind className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {[(KIND_META[j.kind] ?? KIND_META.house).label, j.unit || j.code]
                          .filter(Boolean).join(" ")}
                      </span>
                    </Link>

                    {/* Sem rede, arquivar e editar ficam desabilitados em toda
                        obra, salva ou não. Os dois gravam no servidor, e sem
                        conexão o toque não faria nada além de parecer quebrado. */}
                    <div className="flex shrink-0 flex-col border-l border-border/60">
                      <button
                        type="button"
                        title={archived ? "Reactivate project" : "Archive project"}
                        onClick={() => archived ? archive.mutate({ id: j.id, archived: false }) : setArchiving(j)}
                        disabled={archive.isPending || !online}
                        className={`flex flex-1 items-center justify-center px-2.5 transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                          archived
                            ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                            : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        }`}
                      >
                        {archived
                          ? <ArchiveRestore className="h-3.5 w-3.5" />
                          : <Archive className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        title="Edit project"
                        onClick={() => setEditing(j)}
                        disabled={!online}
                        className="flex flex-1 items-center justify-center border-t border-border/60 px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
