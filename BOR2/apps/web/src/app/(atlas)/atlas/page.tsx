"use client"

import { ImportJobsitesDialog } from "@/components/atlas/import-jobsites-dialog"
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
import type { AtlasJobsite } from "@/services/atlas.service"
import {
  Briefcase, Building, Building2, ChevronDown, DoorOpen, FileText, Hash, Home, Layers,
  MapPin, MessageSquareWarning, Plus, Search,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

// Ou é prédio ou é casa. "Lot" é como o Forecast chama a casa, e exibi-lo
// aqui inventava um terceiro tipo de obra que não existe.
// Ou é prédio ou é casa. "Lot" é como a casa se chama quando ela é numerada
// dentro do loteamento, e é assim que a obra é falada no dia a dia — por isso
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
  name: "", address: "", client: "", code: "",
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

function NewJobsiteDialog({ open, onOpenChange, clients }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: string[]
}) {
  const [form, setForm] = useState(EMPTY)
  // O cliente quase sempre já existe, e digitá-lo de novo é como nascem
  // "Pulte Homes" e "Pulte homes" na mesma base. A caixa de texto só aparece
  // para o cliente que ainda não está na lista.
  const [newClient, setNewClient] = useState(false)
  const create = useCreateAtlasJobsite()

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const building = form.kind === "building"

  function close() {
    onOpenChange(false)
    setForm(EMPTY)
    setNewClient(false)
  }

  function submit() {
    if (!form.name.trim()) return
    create.mutate({
      name: form.name.trim(),
      address: form.address.trim(),
      client: form.client.trim(),
      code: form.code.trim(),
      kind: form.kind,
      // Andares e letras de unidade são o que a taxonomia usa para gerar as
      // pastas de documento da obra. Perguntados aqui porque depois da criação
      // ninguém volta para preencher.
      floors: building && form.floors ? Number(form.floors) : undefined,
      unitLabels: building
        ? form.unitLabels.split(",").map(v => v.trim()).filter(Boolean)
        : undefined,
    } satisfies Partial<AtlasJobsite>, { onSuccess: close })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); else onOpenChange(true) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>

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
                value={form.code}
                onChange={e => set({ code: e.target.value })}
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
                hint="Comma separated — C, F, H, I"
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
          <Button onClick={submit} disabled={!form.name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AtlasJobsitesPage() {
  const { data: jobsites, isLoading } = useAtlasJobsites()
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState<"import" | "new" | null>(null)

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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
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

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search projects"
          className="pl-8"
        />
      </div>

      <ImportJobsitesDialog open={adding === "import"} onOpenChange={o => setAdding(o ? "import" : null)} />
      <NewJobsiteDialog open={adding === "new"} onOpenChange={o => setAdding(o ? "new" : null)} clients={clients} />

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
              {filtered.map(j => (
                <Link
                  key={j.id}
                  href={`/atlas/${j.id}`}
                  className="flex flex-col gap-3 rounded-md border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  {/* Do geral ao particular, como no seletor da sidebar:
                      cliente, lugar, e por fim a obra. A identificação vem por
                      último porque é onde a leitura chega, e é ela que ganha o
                      destaque — é como a obra é chamada no dia a dia. */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                      {j.client || "No client"}
                    </span>
                    {j.status === "archived" && <Badge variant="outline">Archived</Badge>}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {/* Só o trecho até a primeira vírgula: é o nome do bairro.
                        O resto é cidade e estado, que se repetem em toda obra
                        da mesma comunidade e não distinguem nada. */}
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{placeLabel(j.community || j.address || j.name)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                      {(() => { const K = (KIND_META[j.kind] ?? KIND_META.house).icon; return <K className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> })()}
                      {[(KIND_META[j.kind] ?? KIND_META.house).label, j.unit || j.code].filter(Boolean).join(" ")}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {j.documents}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquareWarning className="h-3.5 w-3.5" />
                      {j.openEvents}
                    </span>
                    {j.client && <span className="ml-auto truncate">{j.client}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
    </div>
  )
}
