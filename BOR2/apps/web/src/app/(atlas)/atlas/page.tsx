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
  Archive, ArchiveRestore, ChevronDown, CircleDot, Layers, MapPin, Pencil, Plus, Search,
} from "lucide-react"
import Link from "next/link"
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
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("active")
  const [adding, setAdding] = useState<"import" | "new" | null>(null)
  const [editing, setEditing] = useState<AtlasJobsite | null>(null)
  const [archiving, setArchiving] = useState<AtlasJobsite | null>(null)
  const qc = useQueryClient()
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      atlasService.updateJobsite(id, { status: archived ? "archived" : "active" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "jobsites"] }),
  })

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
        <div>
          <h1 className="text-lg font-semibold">Project List</h1>
          <p className="text-sm text-muted-foreground">
            Every project is a room: documents, drawings and diary in one place.
          </p>
        </div>
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
        <div className="h-full overflow-y-auto pr-3">
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
                  : "Import from the Forecast, or create one by hand, to start uploading documents."}
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(j => {
                const Kind = (KIND_META[j.kind] ?? KIND_META.house).icon
                const archived = j.status === "archived"
                return (
                  // Link e botões lado a lado, nunca aninhados: botão dentro de
                  // link é HTML inválido, e o clique de um roubaria o do outro.
                  // Mesma solução do seletor da sidebar.
                  // Arquivada se reconhece pelo peso, não por uma etiqueta ao
                  // lado do cliente: o cartão inteiro recua, que é o que o
                  // arquivamento fez com a obra.
                  <div
                    key={j.id}
                    className={`flex items-stretch overflow-hidden rounded-md border transition-colors hover:border-primary/40 ${
                      archived
                        ? "border-dashed border-border/50 bg-muted/30 opacity-75 hover:opacity-100"
                        : "border-border/60 bg-card"
                    }`}
                  >
                    <Link
                      href={`/atlas/${j.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-1 p-4 transition-colors hover:bg-accent/30"
                    >
                      {/* Do geral ao particular: cliente, lugar, e por fim a
                          obra. A identificação vem por último porque é onde a
                          leitura chega, e é como a obra é chamada no dia a dia. */}
                      <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                        {j.client || "No client"}
                      </span>

                      {/* O lugar perde o miolo: a cidade se repete em toda obra
                          da comunidade e não distingue nenhuma delas. */}
                      <span className="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{placeLabel(j.community || j.address || j.name)}</span>
                      </span>

                      {/* Mesmo corpo do lugar, logo acima: as duas linhas são a
                          identificação da obra, e o degrau de tamanho entre
                          elas sugeria uma hierarquia que não existe. O que
                          separa as duas passa a ser peso e cor, como na barra
                          lateral, e não escala. */}
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
                        <Kind className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {[(KIND_META[j.kind] ?? KIND_META.house).label, j.unit || j.code]
                          .filter(Boolean).join(" ")}
                      </span>
                    </Link>

                    <div className="flex shrink-0 flex-col border-l border-border/60">
                      <button
                        type="button"
                        title={archived ? "Reactivate project" : "Archive project"}
                        onClick={() => archived ? archive.mutate({ id: j.id, archived: false }) : setArchiving(j)}
                        disabled={archive.isPending}
                        className={`flex flex-1 items-center justify-center px-2.5 transition-colors disabled:opacity-50 ${
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
                        className="flex flex-1 items-center justify-center border-t border-border/60 px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
