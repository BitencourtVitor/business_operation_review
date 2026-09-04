"use client"

import { DailyLogPanel } from "@/components/atlas/daily-log-panel"
import { EventsPanel } from "@/components/atlas/events-panel"
import { JobsiteVisibilityDialog } from "@/components/atlas/jobsite-visibility-dialog"
import { ArchiveConfirm } from "@/components/atlas/archive-confirm"
import {
  CLOSED_TAXONOMY, JobsiteFormDialog, KIND_META,
} from "@/components/atlas/jobsite-form-dialog"
import { PhotosPanel } from "@/components/atlas/photos-panel"
import { Badge } from "@/components/ui/badge"
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
import { atlasService } from "@/services/atlas.service"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { tagLabel } from "@/components/atlas/document-tags-dialog"
import { stashUpload } from "@/components/atlas/pending-upload"
import { UploadPlanDialog, type DocumentIdentity } from "@/components/atlas/upload-plan-dialog"

import type { AtlasDocument, AtlasJobsiteCategory } from "@/services/atlas.service"
import {
  Archive, ArchiveRestore, Briefcase, Building2, CalendarDays, CodeXml, FileQuestion, FolderOpen,
  Gauge, HardHat, Layers, MapPin, Pencil, Plus, UserRound, Users,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

// O crachá de quem subiu, o mesmo da tela de usuários: numa obra com
// subcontratado dentro, saber que o set veio de fora vale mais que o nome.
const UPLOADER_ROLE: Record<string, { icon: React.ElementType; className: string }> = {
  dev:           { icon: CodeXml, className: "text-yellow-600 dark:text-yellow-400" },
  owner:         { icon: Gauge,   className: "text-emerald-600 dark:text-emerald-400" },
  manager:       { icon: Users,   className: "text-primary" },
  subcontractor: { icon: HardHat, className: "text-brand-red" },
  user:          { icon: UserRound, className: "text-muted-foreground" },
}

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

const AXIS_OPTIONS = [
  { value: "none", label: "Single folder" },
  { value: "floor", label: "One per floor" },
  { value: "unit", label: "One per unit" },
]

// O topo diz em que seção da obra a pessoa está. Que obra é já está dito pela
// barra lateral, e repetir o endereço aqui gastava o título com o que não muda
// ao navegar entre as seções.
const TAB_META: Record<string, { title: string; hint: string }> = {
  documents: { title: "Documents", hint: "Every file attached here, by what it is." },
  photos:    { title: "Photos",    hint: "What the site looked like, by the day it was shot." },
  tasks:     { title: "Tasks",     hint: "What was asked on the plan, and what got done." },
  diary:     { title: "Diary",     hint: "What happened on site, day by day." },
  access:    { title: "Access",    hint: "Who sees this project." },
}

function NewCategoryDialog({ jobsiteId, client, kind, usedCategoryIds }: {
  jobsiteId: string; client: string; kind: string; usedCategoryIds: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const addSlot = useAddCategorySlot(jobsiteId)
  const createCategory = useCreateDocCategory()

  // A categoria é etiqueta, e etiqueta não se inventa por obra: ou se escolhe
  // uma que a taxonomia já conhece, ou se cria uma, que fica guardada para as
  // outras obras poderem usar depois. Sem isso volta o problema do Fieldwire,
  // três grafias para a mesma coisa.
  const { data: categories = [] } = useAtlasDocCategories()
  // Tipo fechado só enxerga o que é dele; os demais somam as categorias de
  // build type vazio, que valem para qualquer obra levantada.
  const closed = CLOSED_TAXONOMY.has(kind.toLowerCase())
  const available = categories
    .filter(c => !c.client || c.client.toLowerCase() === client.toLowerCase())
    .filter(c => closed
      ? c.buildType.toLowerCase() === kind.toLowerCase()
      : !c.buildType || c.buildType.toLowerCase() === kind.toLowerCase())
    .filter(c => !usedCategoryIds.has(c.id))

  const [mode, setMode] = useState<"pick" | "new">("pick")
  const [picked, setPicked] = useState("")
  const [draft, setDraft] = useState({ name: "", axis: "none" })

  function close() {
    setOpen(false)
    setMode("pick"); setPicked(""); setDraft({ name: "", axis: "none" })
  }

  function confirm() {
    if (mode === "pick") {
      if (!picked) return
      addSlot.mutate(Number(picked), { onSuccess: close })
      return
    }
    if (!draft.name.trim()) return
    // Nasce como sugestão: só esta obra recebe a pasta agora. As demais a
    // acrescentam quando precisarem — inclusive as já cadastradas.
    createCategory.mutate(
      { client: "", buildType: kind, name: draft.name.trim(), axis: draft.axis, defaultSlot: false, jobsiteId },
      { onSuccess: close },
    )
  }

  const pending = addSlot.isPending || createCategory.isPending

  return (
    <Dialog open={open} onOpenChange={v => (v ? setOpen(true) : close())}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="h-4 w-4" />
        Add category
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>What this jobsite should have</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-lg border border-border/60 p-1">
            {(["pick", "new"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "pick" ? "From the taxonomy" : "New category"}
              </button>
            ))}
          </div>

          {mode === "pick" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-category">Category</Label>
              <Select value={picked} onValueChange={v => setPicked(v ?? "")}>
                <SelectTrigger id="slot-category" className="w-full">
                  <span className="flex-1 truncate text-left text-sm">
                    {available.find(o => String(o.id) === picked)?.name ?? "Select a category…"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {available.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.axis === "floor" ? `${o.name} — one per floor`
                        : o.axis === "unit" ? `${o.name} — one per unit`
                        : o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {available.length === 0
                  ? "Every category in the taxonomy is already here."
                  : "Only what this jobsite doesn't have yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-name">Category name</Label>
                <Input
                  id="cat-name"
                  value={draft.name}
                  placeholder="Panels - Elevation - Bearing Walls…"
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-axis">Subcategory</Label>
                <Select value={draft.axis} onValueChange={v => setDraft(d => ({ ...d, axis: v ?? "none" }))}>
                  <SelectTrigger id="cat-axis" className="w-full">
                    <span className="flex-1 text-left text-sm">
                      {AXIS_OPTIONS.find(a => a.value === draft.axis)?.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {AXIS_OPTIONS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Saved for every jobsite to use later — added here only for now.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            disabled={pending || (mode === "pick" ? !picked : !draft.name.trim())}
            onClick={confirm}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const { data: slots = [] } = useAtlasJobsiteCategories(jobsiteId)
  const createDocument = useCreateAtlasDocument(jobsiteId)
  const router = useRouter()

  const [uploading, setUploading] = useState(false)
  // O filtro é o que sobrou da pasta: em vez de entrar nela, a lista encolhe.
  const [filter, setFilter] = useState("")

  const docs = documents ?? []
  const shown = filter
    ? docs.filter(d => tagsOf(d).some(t => `${t.categoryId}:${t.subcategory}` === filter))
    : docs

  // Documento novo nasce do arquivo: cria a linha com o nome e as etiquetas, e
  // manda a pessoa para a página dele, onde as folhas sobem uma a uma. O
  // arquivo viaja por fora da navegação, que não carrega `File`.
  function startNew(file: File, names?: Map<number, string>, identity?: DocumentIdentity) {
    if (!identity) return
    createDocument.mutate(
      { name: identity.name, tags: identity.tags as AtlasDocument["tags"] },
      {
        onSuccess: ({ id }) => {
          stashUpload(id, { file, names })
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
        title="Documents"
        hint="Every file attached to this jobsite, by what it is."
        action={canManage && (
          <div className="flex items-center gap-2">
            <NewCategoryDialog
              jobsiteId={jobsiteId}
              client={client}
              kind={kind}
              usedCategoryIds={new Set(slots.map(sl => sl.categoryId))}
            />
            <Button onClick={() => setUploading(true)}>
              <Plus className="h-4 w-4" />
              New document
            </Button>
          </div>
        )}
      >
        {/* As categorias como filtro, e não como pasta: o documento continua à
            vista, e escolher uma etiqueta encolhe a lista em vez de abrir outra
            tela. */}
        {slots.length > 0 && docs.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("")}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === ""
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              All {docs.length}
            </button>
            {slots.map(sl => {
              const key = `${sl.categoryId}:${sl.subcategory}`
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(f => (f === key ? "" : key))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === key
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {tagLabel(sl)}
                  <span className="ml-1.5 text-muted-foreground">{sl.documents}</span>
                </button>
              )
            })}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
            <p className="text-sm font-medium">
              {docs.length ? "Nothing with this category" : "No documents yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {docs.length
                ? "Clear the filter to see everything attached here."
                : "Attach the PDF and it becomes a document, named after the file."}
            </p>
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
                    <span className="block truncate text-sm font-medium leading-tight">
                      {doc.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {tagsOf(doc).length === 0 ? (
                        <span className="text-xs text-muted-foreground">No category</span>
                      ) : tagsOf(doc).map(t => (
                        <Badge
                          key={`${t.categoryId}:${t.subcategory}`}
                          variant="outline"
                          className="text-[11px] font-normal text-muted-foreground"
                        >
                          {tagLabel(t)}
                        </Badge>
                      ))}
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
                      {doc.uploadedBy && (() => {
                        const role = UPLOADER_ROLE[doc.uploadedRole] ?? UPLOADER_ROLE.user
                        const RoleIcon = role.icon
                        return (
                          <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                            <RoleIcon className={`h-3.5 w-3.5 ${role.className}`} />
                            {doc.uploadedBy.split(" ")[0]}
                          </span>
                        )
                      })()}
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
      </Panel>


      {canManage && (
        <UploadPlanDialog
          revisionCount={0}
          open={uploading}
          slots={slots}
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
function Panel({ title, hint, action, children }: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card/20">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

// A obra por inteiro, sem abreviar: aqui não falta largura, e é a única tela em
// que a pessoa confere o que está cadastrado antes de sair editando.
function IdentityRow({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="flex items-start gap-1.5 text-sm leading-snug">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words">{value || "Not set"}</span>
      </span>
    </div>
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
  const tab = params.get("tab") ?? "documents"
  const meta = TAB_META[tab] ?? TAB_META.documents
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
        <p className="text-sm text-muted-foreground">Jobsite not found, or no access.</p>
        <Button variant="outline" render={<Link href="/atlas" />}>Back to jobsites</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.hint}</p>
        </div>
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

      <Panel title="Project Information">
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <IdentityRow icon={Briefcase} label="Client" value={jobsite.client} />
          <IdentityRow icon={Building2} label="Jobsite" value={jobsite.community || jobsite.name} />
          <IdentityRow
            icon={(KIND_META[jobsite.kind] ?? KIND_META.house).icon}
            label="Build type"
            value={[(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
              .filter(Boolean).join(" ")}
          />
          <IdentityRow icon={MapPin} label="Address" value={jobsite.address} />
        </div>
      </Panel>

      {tab === "documents" && (
        <DocumentsPanel jobsiteId={jobsiteId} client={jobsite.client} kind={jobsite.kind} canManage={!!canManage} />
      )}
      {tab === "diary" && <DailyLogPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "tasks" && <EventsPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "photos" && <PhotosPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
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
