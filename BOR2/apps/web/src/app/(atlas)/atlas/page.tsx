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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { useAtlasJobsites, useCreateAtlasJobsite } from "@/hooks/use-atlas"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import {
  Archive, ArchiveRestore, Briefcase, Building, Building2, Check, ChevronDown, Eye, EyeOff, Hash,
  Home, MapPin, Pencil, Plus, Search, X,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

// Ou é prédio ou é casa. "Lot" é como o Forecast chama a casa, e exibi-lo
// aqui inventava um terceiro tipo de obra que não existe.
// Ou é prédio ou é casa. "Lot" é como a casa se chama quando ela é numerada
// dentro do loteamento, e é assim que a obra é falada no dia a dia. Por isso
// vale na linha de identificação, e não como um terceiro tipo de obra.
// Mesma composição do backend (jobsiteName): a obra se chama pela comunidade
// mais o tipo e o número.
function composeName(community: string, kind: string, unit: string): string {
  const label = KIND_META[kind]?.label ?? ""
  const suffix = [label, unit.trim()].filter(Boolean).join(" ")
  const place = community.trim()
  if (!suffix) return place
  return place ? `${place} · ${suffix}` : suffix
}

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
  community: "", address: "", client: "", unit: "",
  kind: "building" as "building" | "house",
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

// Escrever e escolher no mesmo campo. O botão "New" separado obrigava a decidir
// antes de digitar se o cliente já existia; aqui a lista filtra conforme se
// escreve, e o nome que não casa com ninguém vira a opção de acrescentar.
function ClientField({ value, onChange, clients }: {
  value: string
  onChange: (value: string) => void
  clients: string[]
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)

  useEffect(() => setText(value), [value])

  const matches = clients.filter(c => c.toLowerCase().includes(text.trim().toLowerCase()))
  const exact = clients.some(c => c.toLowerCase() === text.trim().toLowerCase())
  const typed = text.trim()

  function pick(name: string) {
    onChange(name)
    setText(name)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="jobsite-client" className="text-xs text-muted-foreground">Client</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<div />}
          nativeButton={false}
          className="relative"
        >
          <Briefcase className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="jobsite-client"
            value={text}
            onChange={e => { setText(e.target.value); onChange(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Toll Brothers"
            className="pl-8"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--anchor-width) p-1"
        >
          {matches.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c}</span>
              {c === value && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          {typed && !exact && (
            <button
              type="button"
              onClick={() => pick(typed)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Add &ldquo;{typed}&rdquo; as a new client</span>
            </button>
          )}
          {!typed && matches.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No clients yet.</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Quem não vê o projeto. O campo carrega só a contagem; a lista abre num painel
// ao lado do diálogo, para não empurrar um dropdown do tamanho do cadastro no
// meio do formulário.
function HiddenFromField({ blocked, onChange, people }: {
  blocked: string[]
  onChange: (ids: string[]) => void
  people: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const available = people.filter(u => !blocked.includes(u.id))

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Hidden from</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<button type="button" />}
          className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className="flex items-center gap-2">
            {blocked.length === 0
              ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              : <EyeOff className="h-3.5 w-3.5 text-destructive" />}
            <span className={blocked.length === 0 ? "text-muted-foreground" : "text-destructive"}>
              {blocked.length === 0
                ? "Visible to everyone"
                : `${blocked.length} ${blocked.length === 1 ? "person" : "people"} blocked`}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent side="right" align="start" sideOffset={12} className="w-64 p-1.5">
          <p className="px-1.5 pb-1.5 text-xs text-muted-foreground">
            Everyone with Atlas access sees this project unless listed here.
          </p>
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-1">
            {people.length === 0 && (
              <p className="px-1.5 py-1 text-sm text-muted-foreground">
                Nobody has Atlas access yet.
              </p>
            )}
            {blocked.map(id => {
              const person = people.find(u => u.id === id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange(blocked.filter(v => v !== id))}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{person?.name ?? id}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              )
            })}
            {available.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => onChange([...blocked, u.id])}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent"
              >
                <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
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
  const [blocked, setBlocked] = useState<string[]>([])
  // Só quem tem a chave do Atlas. Oferecer o cadastro inteiro deixava a tela
  // prometer um bloqueio que não acontece: cargo privilegiado vê tudo antes de
  // a regra ser consultada.
  const { data: users } = useQuery({
    queryKey: ["atlas", "blockable-users"],
    queryFn: () => atlasService.listBlockableUsers(),
    staleTime: 5 * 60 * 1000,
  })
  const people = useMemo(
    () => (users ?? []).map(u => ({ id: u.userId, name: u.name })),
    [users],
  )
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

  useEffect(() => {
    if (!open) return
    if (editing) {
      atlasService.listBlocked(editing.id)
        .then(rows => setBlocked(rows.map(r => r.userId)))
        .catch(() => setBlocked([]))
    } else {
      setBlocked([])
    }
    setForm(editing
      ? {
          community: editing.community || editing.name,
          address: editing.address,
          client: editing.client,
          unit: editing.unit || editing.code,
          kind: editing.kind === "building" ? "building" : "house",
        }
      : EMPTY)
  }, [open, editing])

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const saving = editing ? update.isPending : create.isPending

  function close() {
    onOpenChange(false)
    setForm(EMPTY)
    setBlocked([])
  }

  function submit() {
    if (!form.community.trim()) return
    const body = {
      name: composeName(form.community, form.kind, form.unit),
      community: form.community.trim(),
      address: form.address.trim(),
      client: form.client.trim(),
      unit: form.unit.trim(),
      kind: form.kind,
    } satisfies Partial<AtlasJobsite>
    if (editing) {
      atlasService.setBlocked(editing.id, blocked).catch(() => {})
      update.mutate(body)
    }
    else create.mutate(body, { onSuccess: close })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); else onOpenChange(true) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ClientField
              value={form.client}
              onChange={v => set({ client: v })}
              clients={clients}
            />
            <Field id="jobsite-community" label="Jobsite" icon={Building2}>
              <Input
                id="jobsite-community"
                value={form.community}
                onChange={e => set({ community: e.target.value })}
                placeholder="Riverview at East Point, East Providence, RI"
                className="pl-8"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Build type</Label>
              <Select value={form.kind} onValueChange={v => v && set({ kind: v as "building" | "house" })}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 items-center gap-2 text-left text-sm">
                    {form.kind === "building"
                      ? <Building className="h-3.5 w-3.5 text-muted-foreground" />
                      : <Home className="h-3.5 w-3.5 text-muted-foreground" />}
                    {form.kind === "building" ? "Building" : "Lot"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="building">Building</SelectItem>
                  <SelectItem value="house">Lot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Field id="jobsite-code" label="Number" icon={Hash}>
              <Input
                id="jobsite-code"
                value={form.unit}
                onChange={e => set({ unit: e.target.value })}
                placeholder="2"
                className="pl-8"
              />
            </Field>
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

          {/* Só na edição: um projeto que ainda não existe não tem quem bloquear. */}
          {editing && (
            <HiddenFromField blocked={blocked} onChange={setBlocked} people={people} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!form.community.trim() || saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
