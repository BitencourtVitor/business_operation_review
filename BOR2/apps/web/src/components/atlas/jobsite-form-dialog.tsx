"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { PersonRow } from "@/components/atlas/person-row"
import { useCreateAtlasJobsite } from "@/hooks/use-atlas"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Briefcase, Building, Building2, Check, ChevronRight, Eye, EyeOff, Hash, MapPin,
  Home, PanelsTopLeft, Plus, Search, X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"


// Ou é prédio ou é casa. "Lot" é como a casa se chama quando ela é numerada
// dentro do loteamento, e é assim que a obra é falada no dia a dia. Por isso
// vale na linha de identificação, e não como um terceiro tipo de obra.
// Mesma composição do backend (jobsiteName): a obra se chama pela comunidade
// mais o tipo e o número.
export function composeName(community: string, kind: string, unit: string): string {
  const label = KIND_META[kind]?.label ?? ""
  const suffix = [label, unit.trim()].filter(Boolean).join(" ")
  const place = community.trim()
  if (!suffix) return place
  return place ? `${place} · ${suffix}` : suffix
}

// Painel é obra de fábrica: a Simpson produz as placas aqui e elas vão para a
// obra de outra empresa, que às vezes é concorrente e nesse trabalho é cliente.
// Não é prédio nem casa porque a Premium não levanta nada; entrega painel.
export const KIND_META: Record<string, { label: string; icon: React.ElementType }> = {
  building: { label: "Building", icon: Building },
  house:    { label: "Lot",      icon: Home },
  panels:   { label: "Building Panels", icon: PanelsTopLeft },
}

// O lugar, sem o que se repete. "Riverview at East Point, East Providence, RI"
// vira "Riverview at East Point, RI": o miolo é a cidade, que toda obra da
// mesma comunidade compartilha e que por isso não distingue nenhuma delas. O
// estado fica porque é o que separa duas comunidades de nome parecido.
export function placeLabel(raw: string): string {
  const parts = raw.split(",").map(v => v.trim()).filter(Boolean)
  if (parts.length <= 2) return parts.join(", ")
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

export type JobsiteKind = keyof typeof KIND_META

const EMPTY = {
  community: "", address: "", client: "", unit: "",
  kind: "building" as JobsiteKind,
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
  // Cadastrar cliente novo sem depender de digitar no campo de busca: a lista
  // abre com a opção, e ela abre um campo próprio.
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState("")

  useEffect(() => setText(value), [value])
  useEffect(() => { if (!open) { setAdding(false); setFresh("") } }, [open])

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
      {/* O gatilho do popover envolve o próprio campo, e é ele quem abre no
          clique. Abrir também no foco fazia os dois brigarem: o foco abria e o
          clique logo em seguida alternava para fechado, então clicar não fazia
          nada. */}
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
            placeholder="Toll Brothers"
            className="pl-8"
          />
        </PopoverTrigger>
        {/* O campo do cliente ocupa 30% da linha, e a lista herdava essa
            largura: nome de construtora não cabe em três palavras truncadas. A
            âncora vira piso, não teto. */}
        <PopoverContent
          align="start"
          sideOffset={4}
          className="min-w-[max(var(--anchor-width),18rem)] p-1"
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

          {adding ? (
            <div className="flex items-center gap-1 border-t border-border/60 p-1 pt-1.5">
              <Input
                autoFocus
                value={fresh}
                placeholder="Tara Construction"
                onChange={e => setFresh(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && fresh.trim()) pick(fresh.trim())
                  if (e.key === "Escape") setAdding(false)
                }}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!fresh.trim()}
                onClick={() => pick(fresh.trim())}
                title="Add this client"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-0.5 flex w-full items-center gap-2 border-t border-border/60 px-2 pb-1.5 pt-2 text-left text-sm text-primary transition-colors hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">New client</span>
            </button>
          )}

          {!typed && !adding && matches.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No clients yet.</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Quem não vê o projeto. O campo carrega só a contagem; a lista abre num painel
// colado à direita do diálogo, o mesmo formato do histórico de observação do
// Forecast. Popover em cima do formulário tapava os campos que a pessoa acabou
// de preencher.
function HiddenFromField({ blocked, open, onToggle }: {
  blocked: string[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Hidden from</Label>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
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
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  )
}

function HiddenFromPanel({ blocked, onChange, people, onClose }: {
  blocked: string[]
  onChange: (ids: string[]) => void
  people: { id: string; name: string }[]
  onClose: () => void
}) {
  // Dois toques também aqui: escolher a pessoa e depois agir. Vale só para esta
  // lista; endereço e os outros campos continuam sendo só escrever.
  const [armed, setArmed] = useState<string | null>(null)
  const available = people.filter(u => !blocked.includes(u.id))

  return (
    <div className="flex max-h-[85vh] w-full shrink-0 flex-col overflow-hidden border-t bg-muted/20 sm:w-[300px] sm:border-l sm:border-t-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Hidden From
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close the hidden from list"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 max-h-[20rem] flex-1 overflow-y-auto p-2">
        <p className="px-1.5 pb-2 text-xs leading-snug text-muted-foreground">
          Everyone with Atlas access sees this project unless listed here.
        </p>

        {people.length === 0 && (
          <p className="px-1.5 py-1 text-sm text-muted-foreground">
            Nobody has Atlas access yet.
          </p>
        )}

        <div className="flex flex-col gap-0.5">
          {blocked.map(id => {
            const person = people.find(u => u.id === id)
            return (
              <PersonRow
                key={id}
                name={person?.name ?? id}
                hidden
                armed={armed === id}
                onSelect={() => setArmed(armed === id ? null : id)}
                onAct={() => { onChange(blocked.filter(v => v !== id)); setArmed(null) }}
              />
            )
          })}

          {blocked.length > 0 && available.length > 0 && (
            <div className="my-1 border-t border-border/60" />
          )}

          {available.map(u => (
            <PersonRow
              key={u.id}
              name={u.name}
              hidden={false}
              armed={armed === u.id}
              onSelect={() => setArmed(armed === u.id ? null : u.id)}
              onAct={() => { onChange([...blocked, u.id]); setArmed(null) }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function JobsiteFormDialog({ open, onOpenChange, clients, editing }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: string[]
  /** Quando vem, o mesmo formulário edita em vez de criar. */
  editing?: AtlasJobsite | null
}) {
  const [form, setForm] = useState(EMPTY)
  const [blocked, setBlocked] = useState<string[]>([])
  const [panel, setPanel] = useState(false)
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
          kind: (editing.kind in KIND_META ? editing.kind : "house") as JobsiteKind,
        }
      : EMPTY)
  }, [open, editing])

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const saving = editing ? update.isPending : create.isPending

  function close() {
    onOpenChange(false)
    setForm(EMPTY)
    setBlocked([])
    setPanel(false)
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
      <DialogContent
        className={panel
          ? "flex max-h-[85vh] w-[min(92vw,460px)] gap-0 overflow-hidden p-0 sm:w-[820px] sm:max-w-[820px] sm:flex-row sm:[&>[data-slot=dialog-close]]:right-[308px]"
          : "flex max-h-[85vh] w-[min(92vw,460px)] gap-0 overflow-hidden p-0 sm:max-w-lg sm:flex-row"}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <DialogHeader><DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[3fr_7fr]">
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
              <Select value={form.kind} onValueChange={v => v && set({ kind: v as JobsiteKind })}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 items-center gap-2 text-left text-sm">
                    {(() => {
                      const K = KIND_META[form.kind].icon
                      return <K className="h-3.5 w-3.5 text-muted-foreground" />
                    })()}
                    {KIND_META[form.kind].label}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {Object.entries(KIND_META).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                  ))}
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
            <HiddenFromField blocked={blocked} open={panel} onToggle={() => setPanel(v => !v)} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!form.community.trim() || saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
        </div>

        {editing && panel && (
          <HiddenFromPanel
            blocked={blocked}
            onChange={setBlocked}
            people={people}
            onClose={() => setPanel(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
