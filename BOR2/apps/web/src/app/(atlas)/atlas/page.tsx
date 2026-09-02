"use client"

import { ImportJobsitesDialog } from "@/components/atlas/import-jobsites-dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { useAtlasJobsites, useCreateAtlasJobsite } from "@/hooks/use-atlas"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import {
  Archive, ArchiveRestore, Briefcase, Building, Building2, ChevronDown, DoorOpen, Hash, Home,
  Layers, MapPin, Pencil, Plus, Search,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

// Ou é prédio ou é casa. "Lot" é como o Forecast chama a casa, e exibi-lo
// aqui inventava um terceiro tipo de obra que não existe.
// Ou é prédio ou é casa. "Lot" é como a casa se chama quando ela é numerada
// dentro do loteamento, e é assim que a obra é falada no dia a dia. Por isso
// vale na linha de identificação, e não como um terceiro tipo de obra.
const KIND_META: Record<string, { label: string; icon: React.ElementType }> = {
  building: { label: "Building", icon: Building },
  house:    { label: "Lot",      icon: Home },
}

// O lugar, sem o que se repete. "Riverview at East Point, East Providence, RI"
// vira "Riverview at East Point, RI": o miolo é a cidade, que toda obra da
// mesma comunidade compartilha e que por isso não distingue nenhuma delas. O
// estado fica porque é o que separa duas comunidades de nome parecido.
function placeLabel(raw: string): string {
  const parts = raw.split(",").map(v => v.trim()).filter(Boolean)
  if (parts.length <= 2) return parts.join(", ")
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

const EMPTY = {
  name: "", address: "", client: "", unit: "",
  kind: "building" as "building" | "house",
  floors: "", unitLabels: "",
}

// Um campo com ícone à esquerda. O ícone não é enfeite: diz de que natureza é o
// dado antes de a pessoa ler o rótulo, e é o que faz quatro caixas iguais
// pararem de parecer a mesma pergunta quatro vezes.
function Field({ id, label, icon: Icon, hint, children }: {
  id: string
  label: string
  icon: React.ElementType
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function JobsiteFormDialog({ open, onOpenChange, clients, editing }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: string[]
  /** Quando vem, o mesmo formulário edita em vez de criar. */
  editing?: AtlasJobsite | null
}) {
  const [form, setForm] = useState(EMPTY)
  // O cliente quase sempre já existe, e digitá-lo de novo é como nascem
  // "Pulte Homes" e "Pulte homes" na mesma base. A caixa de texto só aparece
  // para o cliente que ainda não está na lista.
  const [newClient, setNewClient] = useState(false)
  const create = useCreateAtlasJobsite()
  const qc = useQueryClient()
  const update = useMutation({
    mutationFn: (patch: Partial<AtlasJobsite>) => atlasService.updateJobsite(editing!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas", "jobsites"] })
      qc.invalidateQueries({ queryKey: ["atlas", "jobsite", editing!.id] })
      close()
    },
  })

  // O formulário nasce com o que a obra já tem quando abre para editar, e limpo
  // quando abre para criar.
  useEffect(() => {
    if (!open) return
    setNewClient(false)
    setForm(editing
      ? {
          name: editing.name, address: editing.address, client: editing.client,
          unit: editing.unit || editing.code,
          kind: editing.kind === "building" ? "building" : "house",
          floors: editing.floors ? String(editing.floors) : "",
          unitLabels: (editing.unitLabels ?? []).join(", "),
        }
      : EMPTY)
  }, [open, editing])

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const building = form.kind === "building"

  function close() {
    onOpenChange(false)
    setForm(EMPTY)
    setNewClient(false)
  }

  const saving = editing ? update.isPending : create.isPending

  function submit() {
    if (!form.name.trim()) return
    const body = {
      name: form.name.trim(),
      address: form.address.trim(),
      client: form.client.trim(),
      unit: form.unit.trim(),
      kind: form.kind,
      // Andares e letras de unidade são o que a taxonomia usa para gerar as
      // pastas de documento da obra. Perguntados aqui porque depois da criação
      // ninguém volta para preencher.
      floors: building && form.floors ? Number(form.floors) : undefined,
      unitLabels: building
        ? form.unitLabels.split(",").map(v => v.trim()).filter(Boolean)
        : undefined,
    } satisfies Partial<AtlasJobsite>
    if (editing) update.mutate(body)
    else create.mutate(body, { onSuccess: close })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); else onOpenChange(true) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-3">
          <Field id="jobsite-name" label="Identification" icon={Building2}>
            <Input
              id="jobsite-name"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              placeholder="Riverview at East Point · Building 2"
              className="pl-8"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Build type</Label>
              <Select value={form.kind} onValueChange={v => v && set({ kind: v as "building" | "house" })}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 items-center gap-2 text-left text-sm">
                    {building
                      ? <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      : <Home className="h-3.5 w-3.5 text-muted-foreground" />}
                    {building ? "Building" : "House"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="building">Building</SelectItem>
                  <SelectItem value="house">House</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Field id="jobsite-code" label="Lot / unit number" icon={Hash}>
              <Input
                id="jobsite-code"
                value={form.unit}
                onChange={e => set({ unit: e.target.value })}
                placeholder="2"
                className="pl-8"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Client</Label>
            {newClient || clients.length === 0 ? (
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Briefcase className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={form.client}
                    onChange={e => set({ client: e.target.value })}
                    placeholder="Client name"
                    className="pl-8"
                  />
                </div>
                {clients.length > 0 && (
                  <Button variant="outline" onClick={() => { setNewClient(false); set({ client: "" }) }}>
                    Pick
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Select value={form.client} onValueChange={v => set({ client: v ?? "" })}>
                  <SelectTrigger className="flex-1">
                    <span className="flex flex-1 items-center gap-2 truncate text-left text-sm">
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {form.client || <span className="text-muted-foreground">Select a client</span>}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setNewClient(true); set({ client: "" }) }}>
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            )}
          </div>

          <Field id="jobsite-address" label="Address" icon={MapPin}>
            <Input
              id="jobsite-address"
              value={form.address}
              onChange={e => set({ address: e.target.value })}
              placeholder="71 East Point Drive, East Providence, RI 02916"
              className="pl-8"
            />
          </Field>

          {building && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="jobsite-floors"
                label="Floors"
                icon={Layers}
                hint="Generates one document folder per floor"
              >
                <Input
                  id="jobsite-floors"
                  value={form.floors}
                  onChange={e => set({ floors: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  placeholder="5"
                  className="pl-8"
                />
              </Field>
              <Field
                id="jobsite-units"
                label="Unit letters"
                icon={DoorOpen}
                hint="Comma separated: C, F, H, I"
              >
                <Input
                  id="jobsite-units"
                  value={form.unitLabels}
                  onChange={e => set({ unitLabels: e.target.value })}
                  placeholder="C, F, H, I, J"
                  className="pl-8"
                />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Arquivar tira a obra da lista de todo mundo: é quase apagar, e por isso pede
// a mesma cerimônia. O "Yes" só acorda depois de três segundos: o intervalo
// existe para separar o clique deliberado do clique por engano, que é o que
// acontece quando o botão fica ao lado do de editar.
function ArchiveConfirm({ jobsite, onClose, onConfirm }: {
  jobsite: AtlasJobsite | null
  onClose: () => void
  onConfirm: (id: string) => void
}) {
  const [left, setLeft] = useState(3)

  useEffect(() => {
    if (!jobsite) return
    setLeft(3)
    const timer = setInterval(() => setLeft(v => (v <= 1 ? 0 : v - 1)), 1000)
    return () => clearInterval(timer)
  }, [jobsite])

  return (
    <AlertDialog open={!!jobsite} onOpenChange={o => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this project?</AlertDialogTitle>
          {/* A obra se identifica aqui do mesmo jeito que no cartão: lugar em
              cima, identificação embaixo e em negrito. Quem confirma precisa
              reconhecer qual obra está saindo, e um nome corrido no meio do
              parágrafo não se reconhece. */}
          <div className="flex w-full flex-col gap-0.5 text-left">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {jobsite ? placeLabel(jobsite.community || jobsite.address || jobsite.name) : ""}
            </span>
            <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              {jobsite && (() => {
                const K = (KIND_META[jobsite.kind] ?? KIND_META.house).icon
                return <K className="h-4 w-4 shrink-0 text-muted-foreground" />
              })()}
              {jobsite
                ? [(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
                    .filter(Boolean).join(" ")
                : ""}
            </span>
          </div>
          <AlertDialogDescription>
            It leaves the list for everyone. Documents, photos and diary stay on file.
            Nothing is deleted, and the project can be reactivated later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={left > 0}
            onClick={() => jobsite && onConfirm(jobsite.id)}
          >
            {left > 0 ? `Yes, archive (${left})` : "Yes, archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default function AtlasJobsitesPage() {
  const { data: jobsites, isLoading } = useAtlasJobsites()
  const [query, setQuery] = useState("")
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
    const rows = jobsites ?? []
    if (!q) return rows
    return rows.filter(j =>
      [j.name, j.address, j.client, j.code].some(v => v.toLowerCase().includes(q)))
  }, [jobsites, query])

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

      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search projects"
          className="pl-8"
        />
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(j => {
                const Kind = (KIND_META[j.kind] ?? KIND_META.house).icon
                const archived = j.status === "archived"
                return (
                  // Link e botões lado a lado, nunca aninhados: botão dentro de
                  // link é HTML inválido, e o clique de um roubaria o do outro.
                  // Mesma solução do seletor da sidebar.
                  <div
                    key={j.id}
                    className="flex items-stretch overflow-hidden rounded-md border border-border/60 bg-card transition-colors hover:border-primary/40"
                  >
                    <Link
                      href={`/atlas/${j.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-1 p-4 transition-colors hover:bg-accent/30"
                    >
                      {/* Do geral ao particular: cliente, lugar, e por fim a
                          obra. A identificação vem por último porque é onde a
                          leitura chega, e é como a obra é chamada no dia a dia. */}
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                          {j.client || "No client"}
                        </span>
                        {archived && <Badge variant="outline" className="shrink-0">Archived</Badge>}
                      </span>

                      {/* O lugar perde o miolo: a cidade se repete em toda obra
                          da comunidade e não distingue nenhuma delas. */}
                      <span className="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{placeLabel(j.community || j.address || j.name)}</span>
                      </span>

                      <span className="flex items-center gap-1.5 text-base font-semibold leading-tight">
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
                            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
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
