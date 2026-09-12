"use client"

import { OfflineFolders } from "@/components/atlas/offline-folders"
import { PunchReportDialog } from "@/components/atlas/punch-report-dialog"
import { SyncIndicator } from "@/components/atlas/sync-indicator"
import { EventsPanel } from "@/components/atlas/events-panel"
import { JobsiteVisibilityDialog } from "@/components/atlas/jobsite-visibility-dialog"
import { ArchiveConfirm } from "@/components/atlas/archive-confirm"
import {
  CLOSED_TAXONOMY, JobsiteFormDialog, KIND_META,
} from "@/components/atlas/jobsite-form-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  useAddCategorySlot, useAtlasDocCategories, useAtlasDocuments, useAtlasJobsite,
  useAtlasJobsiteCategories, useCreateAtlasDocument, useCreateDocCategory,
} from "@/hooks/use-atlas"
import { marcarAcesso } from "@/lib/offline/sync"
import { atlasService } from "@/services/atlas.service"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { tagLabel } from "@/components/atlas/document-tags-dialog"
import { stashUpload } from "@/components/atlas/pending-upload"
import { RoleName } from "@/components/atlas/role-icon"
import { UploadPlanDialog, type DocumentIdentity } from "@/components/atlas/upload-plan-dialog"
import type { VinculoConfirmado } from "@/components/atlas/autolink-step"

import { useCategoriasDaObra } from "@/components/atlas/category-picker"
import type { AtlasDocTag, AtlasDocument, AtlasJobsiteCategory } from "@/services/atlas.service"
import {
  Archive, ArchiveRestore, Briefcase, Building2, CalendarDays, FileQuestion, FolderOpen,
  FileDown, FileText, Layers, MapPin, Pencil, Plus, Tag,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"


// A data do envio como se fala dela: hoje, ontem, e depois disso o dia.
function when(iso: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - day.getTime()) / 86400000)
  // Maiúscula como qualquer data: "Sep 3" começa com maiúscula, e "yesterday"
  // ao lado dele parecia sobra de frase.
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  // Data cheia, em números, e sempre com o ano: mês por extenso encurtava a
  // coluna mas obrigava a traduzir "Sep" na cabeça, e sem o ano um set de
  // janeiro passado se confundia com o deste ano.
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`
}

// O topo diz em que seção da obra a pessoa está. Que obra é já está dito pela
// barra lateral, e repetir o endereço aqui gastava o título com o que não muda
// ao navegar entre as seções.
//
// Sem frase de apoio. Ela explicava a seção uma vez e ocupava altura para
// sempre: quem abre Documents pela segunda vez já sabe o que é, e o que quer
// ver é a lista. A altura que ela gastava passa a ser lista.
const TAB_META: Record<string, { title: string }> = {
  documents: { title: "Documents" },
  tasks:     { title: "Punch List" },
  access:    { title: "Access" },
}

/**
 * As etiquetas de um documento, sempre uma lista.
 *
 * A API velha não devolvia o campo, e durante um deploy as duas versões
 * convivem: a tela precisa aguentar receber um documento sem `tags` sem quebrar
 * a sala inteira.
 */
const tagsOf = (d: AtlasDocument) => d.tags ?? []


function DocumentsPanel({ jobsiteId, client, kind, canManage }: {
  jobsiteId: string; client: string; kind: string; canManage: boolean
}) {
  const { data: documents, isLoading } = useAtlasDocuments(jobsiteId)
  const categorias = useCategoriasDaObra(client, kind)
  const createDocument = useCreateAtlasDocument(jobsiteId)
  const router = useRouter()

  const [uploading, setUploading] = useState(false)
  // O filtro é o que sobrou da pasta: em vez de entrar nela, a lista encolhe.
  const [filter, setFilter] = useState("")

  const docs = documents ?? []
  // As opções do filtro são as categorias que as pastas desta obra carregam. A
  // pasta é a dona da categoria: não há lista de categorias cadastradas antes.
  const categoriasDasPastas = useMemo(() => {
    const m = new Map<string, AtlasDocTag>()
    for (const d of docs) for (const t of tagsOf(d)) m.set(`${t.categoryId}:${t.subcategory}`, t)
    return [...m.entries()].sort((a, b) => tagLabel(a[1]).localeCompare(tagLabel(b[1])))
  }, [docs])
  // Quem ocupa cada vaga: o seletor do documento novo apaga as tomadas e diz de
  // quem são.
  const ocupadas = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of docs) for (const t of tagsOf(d)) m.set(`${t.categoryId}:${t.subcategory}`, d.name)
    return m
  }, [docs])
  const shown = filter
    ? docs.filter(d => tagsOf(d).some(t => `${t.categoryId}:${t.subcategory}` === filter))
    : docs

  // Documento novo nasce do arquivo: cria a linha com o nome e as etiquetas, e
  // manda a pessoa para a página dele, onde as folhas sobem uma a uma. O
  // arquivo viaja por fora da navegação, que não carrega `File`.
  function startNew(
    file: File,
    names?: Map<number, string>,
    identity?: DocumentIdentity,
    _version?: unknown,
    links?: VinculoConfirmado[],
  ) {
    if (!identity) return
    createDocument.mutate(
      { name: identity.name, tags: identity.tags as AtlasDocument["tags"] },
      {
        onSuccess: ({ id }) => {
          stashUpload(id, { file, names, links }, jobsiteId)
          router.push(`/atlas/${jobsiteId}/documents/${id}`)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <>
      <Panel
        title="Document List"
        action={(
          <div className="flex min-w-0 items-center gap-2">
            {/* As categorias como filtro, e não como pasta: o documento continua
                à vista, e escolher uma etiqueta encolhe a lista em vez de abrir
                outra tela. Num dropdown antes do + New, e não em chips numa
                linha própria: os chips quebravam em várias linhas no celular e
                empurravam a lista para baixo. */}
            {categoriasDasPastas.length > 0 && (
              <Select value={filter || "all"} onValueChange={v => setFilter(!v || v === "all" ? "" : v)}>
                <SelectTrigger size="sm" className="h-8 min-w-0 max-w-[11rem]">
                  {/* Ícone de etiqueta na frente e o nome, sem contador: o que o
                      botão precisa dizer é qual filtro está valendo. A contagem
                      já está na lista logo abaixo. */}
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left text-xs">
                    {(() => {
                      const t = categoriasDasPastas.find(([k]) => k === filter)?.[1]
                      return t ? tagLabel(t) : "All"
                    })()}
                  </span>
                </SelectTrigger>
                {/* A lista aberta tem a largura do nome mais longo, e não a do
                    botão: o botão é estreito de propósito, para caber ao lado do
                    + New, e herdar a largura dele cortava o nome da categoria.
                    O teto evita que um nome enorme passe da borda da tela. */}
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-max min-w-(--anchor-width) max-w-[min(22rem,calc(100vw-2rem))]"
                >
                  <SelectItem value="all">All</SelectItem>
                  {categoriasDasPastas.map(([key, t]) => (
                    <SelectItem key={key} value={key}>
                      {tagLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canManage && (
              <Button size="sm" className="h-8 shrink-0" onClick={() => setUploading(true)}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            )}
          </div>
        )}
      >
        <div className="flex h-full flex-col gap-2">
        {shown.length === 0 ? (
          /* O vazio ocupa o painel inteiro, e não uma tira no topo: é o estado
             da obra agora, e uma caixa baixa com espaço morto embaixo parecia
             que a lista tinha sido cortada. */
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
              <FileQuestion className="h-6 w-6" />
            </span>
            <span>
              <p className="text-sm font-medium">
                {docs.length ? "Nothing with this category" : "No documents yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {docs.length
                  ? "Clear the filter to see everything attached here."
                  : "Attach the PDF and it becomes a document, named after the file."}
              </p>
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-primary/40"
              >
                <Link
                  href={`/atlas/${jobsiteId}/documents/${doc.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                    {doc.versions ? <FolderOpen className="h-4 w-4" /> : <FileQuestion className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* A categoria é o título, e o arquivo vira o subtítulo: o
                        que identifica o documento na obra é o que ele cobre, e
                        não como o PDF foi nomeado na máquina de quem enviou. */}
                    <span className={`block truncate text-sm font-medium leading-tight ${
                      tagsOf(doc).length === 0 ? "text-muted-foreground" : ""
                    }`}>
                      {tagsOf(doc).length === 0
                        ? "No category"
                        : tagsOf(doc).map(tagLabel).join(" · ")}
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{doc.name}</span>
                    </span>
                  </span>
                </Link>

                {!!doc.sheets && (
                  <span className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      {doc.sheets} {doc.sheets === 1 ? "plan" : "plans"}
                    </span>
                    {/* Quem pôs em cima e quando embaixo: é uma informação só, a
                        procedência, e ela se lê de uma vez em vez de virar três
                        blocos soltos na mesma linha. */}
                    <span className="flex flex-col items-end gap-0.5 leading-none">
                      <RoleName
                        name={doc.uploadedBy}
                        role={doc.uploadedRole}
                        className="font-medium text-foreground/80"
                      />
                      {when(doc.uploadedAt) && (
                        <span className="flex items-center gap-1.5 text-muted-foreground/80">
                          <CalendarDays className="h-3 w-3" />
                          {when(doc.uploadedAt)}
                        </span>
                      )}
                    </span>
                  </span>
                )}

              </div>
            ))}
          </div>
        )}
        </div>
      </Panel>


      {canManage && (
        <UploadPlanDialog
          revisionCount={0}
          open={uploading}
          categorias={categorias}
          jobsiteId={jobsiteId}
          ocupadas={ocupadas}
          onStart={startNew}
          onClose={() => setUploading(false)}
        />
      )}
    </>
  )
}

// Contêiner com cabeçalho próprio. As duas partes da sala, a obra e o que está
// guardado nela, são coisas de natureza diferente: uma se lê, a outra se
// percorre. Numa moldura só, a segunda parecia continuação da primeira.
function Panel({ title, action, children }: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/20">
      {/* Cabeçalho com fio embaixo: o corpo rola por dentro, e sem a linha o
          conteúdo passava por baixo do título como se fosse a mesma faixa.
          Título e ações na mesma linha, sempre: com quebra de linha, no celular
          as ações desciam e o cabeçalho virava dois andares. O título não
          encolhe; quem cede espaço são as ações, que cortam o texto. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 pb-2.5 pt-3">
        <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      {/* A lista rola dentro do painel, e não a página inteira: o cabeçalho da
          seção e o rodapé do aparelho ficam no lugar, e a obra com trinta
          documentos não empurra tudo para fora da tela. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}

// O que a obra é, numa linha só.
//
// Era um painel inteiro, com cabeçalho próprio e quatro colunas de rótulo em
// cima e valor embaixo. Ocupava a altura de um bloco de conteúdo para dizer
// quatro coisas que não mudam nunca, e empurrava a lista de documentos para
// baixo da dobra.
//
// O rótulo saiu junto: o ícone diz de que campo se trata, e "CLIENT" escrito
// acima de "Tara Construction" era a mesma informação duas vezes. Quem precisar
// da palavra a encontra ao passar o mouse.
function IdentityFact({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: string
}) {
  if (!value) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={label}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </span>
  )
}

export default function JobsiteRoomPage() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const params = useSearchParams()
  const { data: jobsite, isLoading, isError } = useAtlasJobsite(jobsiteId)

  const canManage = jobsite?.level === "manage"
  const archived = jobsite?.status === "archived"
  const canAnnotate = canManage || jobsite?.level === "annotate"
  // A seção vem da URL porque quem navega é a sidebar. Um link com a seção
  // dentro também é um link que se manda para alguém.
  const router = useRouter()
  // Aba desconhecida cai em Documents. Photos e Diary existiram e saíram: link
  // guardado por alguém não pode abrir uma sala vazia.
  const pedida = params.get("tab") ?? "documents"
  const tab = pedida in TAB_META ? pedida : "documents"
  const [relatorio, setRelatorio] = useState(false)
  const meta = TAB_META[tab]
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const qc = useQueryClient()
  const archive = useMutation({
    mutationFn: (yes: boolean) =>
      atlasService.updateJobsite(jobsiteId, { status: yes ? "archived" : "active" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas", "jobsite", jobsiteId] })
      qc.invalidateQueries({ queryKey: ["atlas", "jobsites"] })
    },
  })

  // Abrir a obra carimba o acesso neste aparelho, que é o relógio da expiração.
  // Não guarda página nem dado: o que fica no aparelho é decisão da pessoa, pelo
  // botão de download do Data Details.
  useEffect(() => {
    void marcarAcesso(jobsiteId).catch(() => undefined)
  }, [jobsiteId])

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  if (isError || !jobsite) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">
          {typeof navigator !== "undefined" && !navigator.onLine
            ? "No connection, and this project hasn't been opened on this device yet."
            : "Jobsite not found, or no access."}
        </p>
        <Button variant="outline" render={<Link href="/atlas" />}>Back to jobsites</Button>
      </div>
    )
  }

  return (
    // A página ocupa a altura da área de conteúdo, nem mais nem menos: quem rola
    // é a lista dentro do painel, e o Data Details fica no pé da tela.
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-5">
      {/* Título e ações na mesma linha. Com os dados da obra entre os dois, os
          botões ficavam alinhados ao topo de um bloco alto e pareciam soltos. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-lg font-semibold">{meta.title}</h1>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Ícone e palavra: um lápis sozinho obriga a passar o mouse para
                descobrir o que faz, e arquivar é grave demais para se descobrir
                assim. */}
            <Button variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            {archived ? (
              <Button
                variant="outline"
                className="gap-1.5 text-emerald-600 dark:text-emerald-400"
                disabled={archive.isPending}
                onClick={() => archive.mutate(false)}
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Reactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                className="gap-1.5 hover:text-destructive"
                onClick={() => setArchiving(true)}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {/* O que a obra é, num contêiner discreto de dois pedaços: cliente, local
          e tipo num, o endereço no outro, com fundo próprio e borda entre eles.
          Em tela larga ficam lado a lado (sobrava meia faixa ao lado das três
          primeiras); em tela estreita o endereço desce para baixo. */}
      <div className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card/30 text-sm text-muted-foreground lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
          <IdentityFact icon={Briefcase} label="Client" value={jobsite.client} />
          <IdentityFact icon={Building2} label="Jobsite" value={jobsite.community || jobsite.name} />
          <IdentityFact
            icon={(KIND_META[jobsite.kind] ?? KIND_META.house).icon}
            label="Build type"
            value={[(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
              .filter(Boolean).join(" ")}
          />
        </div>
        {jobsite.address && (
          <div className="flex min-w-0 items-center border-t border-border/60 bg-muted/20 px-3 py-2 lg:max-w-[50%] lg:border-t-0 lg:border-l">
            <IdentityFact icon={MapPin} label="Address" value={jobsite.address} />
          </div>
        )}
      </div>

      {tab === "documents" && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <DocumentsPanel jobsiteId={jobsiteId} client={jobsite.client} kind={jobsite.kind} canManage={!!canManage} />
          {/* A escolha do que fica no aparelho mora junto das pastas, e não numa
              tela de configuração. É a mesma decisão, tomada no mesmo lugar em
              que se olha a pasta.

              Fica sempre no pé da tela, qualquer que seja o tamanho da lista:
              é rodapé, e rodapé que sobe e desce com o conteúdo deixa de ser lido
              como rodapé. Quem cresce e rola é o painel acima dele. */}
          <div className="shrink-0">
            <OfflineFolders jobsiteId={jobsiteId} />
          </div>
        </div>
      )}
      {tab === "tasks" && (
        <div className="flex flex-col gap-3">
          {/* O relatório sai daqui e não de uma tela à parte: quem está olhando
              a lista é quem quer levá-la para a reunião. */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setRelatorio(true)}>
              <FileDown className="h-3.5 w-3.5" />
              Report
            </Button>
          </div>
          <PunchReportDialog
            jobsiteId={jobsiteId}
            jobsiteName={jobsite.name}
            open={relatorio}
            onOpenChange={setRelatorio}
          />
          {/* O estado da fila desta obra, acima da lista. Aqui e não no
              cabeçalho global porque a pergunta que ele responde é sobre esta
              obra: dá para sair do canteiro, ou ainda tem coisa por subir? */}
          <SyncIndicator jobsiteId={jobsiteId} />
          <EventsPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />
        </div>
      )}
      {/* O mesmo formulário da lista de projetos: a obra se edita de um jeito
          só, esteja quem edita na lista ou dentro dela. */}
      <ArchiveConfirm
        jobsite={archiving ? jobsite : null}
        onClose={() => setArchiving(false)}
        onConfirm={() => { archive.mutate(true); setArchiving(false) }}
      />

      <JobsiteFormDialog
        open={editing}
        onOpenChange={setEditing}
        clients={jobsite.client ? [jobsite.client] : []}
        editing={jobsite}
      />

      {tab === "access" && canManage && (
        <JobsiteVisibilityDialog
          jobsite={jobsite}
          open
          onClose={() => router.replace(`/atlas/${jobsiteId}?tab=documents`)}
        />
      )}
    </div>
  )
}
