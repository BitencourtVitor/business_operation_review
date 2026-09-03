"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { useQuery } from "@tanstack/react-query"
import { PersonRow } from "@/components/atlas/person-row"
import { KIND_META, placeLabel } from "@/components/atlas/jobsite-form-dialog"
import { HardHat, MapPin, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

// A tabela de tipos e a regra do lugar vêm do formulário: eram cópias, e um
// tipo novo aparecia em toda tela menos nesta.

// O que um subcontratado recebe ao ser convidado. Anotar é o que ele veio
// fazer: ler a prancha sem poder marcar nada devolveria o problema para o
// WhatsApp, que é de onde o Atlas está tirando essa conversa.
const SUB_LEVEL = "annotate" as const

type Person = { id: string; name: string }

export function JobsiteVisibilityDialog({ jobsite, open, onClose }: {
  jobsite: AtlasJobsite
  open: boolean
  onClose: () => void
}) {
  // Duas listas porque são dois mecanismos. Para quem é da Premium o padrão é
  // ver, e o que se guarda é a exceção: `blocked` é uma regra de deny. Para o
  // subcontratado o padrão é não ver, e o que se guarda é o convite: `granted`
  // é uma linha de acesso à obra. Juntar os dois numa lista só faria a tela
  // mentir sobre o que acontece ao mover alguém de lado.
  const [blocked, setBlocked] = useState<string[]>([])
  const [granted, setGranted] = useState<string[]>([])
  const [wasGranted, setWasGranted] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  // Dois toques: o primeiro escolhe a pessoa, o segundo age.
  const [armed, setArmed] = useState<string | null>(null)

  const { data: users } = useQuery({
    queryKey: ["atlas", "blockable-users"],
    queryFn: () => atlasService.listBlockableUsers(),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!open) return
    setQuery("")
    setArmed(null)
    atlasService.listBlocked(jobsite.id)
      .then(rows => setBlocked(rows.map(r => r.userId)))
      .catch(() => setBlocked([]))
    atlasService.listAccess(jobsite.id)
      .then(rows => {
        const live = rows.filter(r => !r.revokedAt).map(r => r.userId)
        setGranted(live)
        setWasGranted(live)
      })
      .catch(() => { setGranted([]); setWasGranted([]) })
  }, [open, jobsite.id])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (users ?? []).map(u => ({ id: u.userId, name: u.name, sub: u.subcontractor }))
    return q ? all.filter(u => u.name.toLowerCase().includes(q)) : all
  }, [users, query])

  const premium = shown.filter(u => !u.sub)
  const subs = shown.filter(u => u.sub)

  async function save() {
    setSaving(true)
    try {
      await atlasService.setBlocked(jobsite.id, blocked)
      // O convite é linha a linha: só o que mudou vai, para não reescrever
      // concessão de quem ninguém tocou e perder a data em que ela foi dada.
      await Promise.all([
        ...granted.filter(id => !wasGranted.includes(id))
          .map(id => atlasService.grantAccess(jobsite.id, id, SUB_LEVEL)),
        ...wasGranted.filter(id => !granted.includes(id))
          .map(id => atlasService.revokeAccess(jobsite.id, id)),
      ])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const Kind = (KIND_META[jobsite.kind] ?? KIND_META.house).icon

  // Uma partição da coluna, cheia ou vazia.
  function Bucket({ label, people, hidden, empty, onAct, className = "" }: {
    label: string
    people: Person[]
    hidden: boolean
    empty: string
    onAct: (id: string) => void
    className?: string
  }) {
    return (
      <div className={`flex min-h-0 flex-1 basis-0 flex-col ${className}`}>
        {/* O rótulo fica parado e só a lista rola: com ele dentro do scroll,
            saber de qual metade é o nome exigia subir de volta. */}
        <p className="shrink-0 px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {label} ({people.length})
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {people.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/50 px-2 py-3 text-center text-xs text-muted-foreground/70">
            {empty}
          </p>
        ) : (
          people.map(u => (
            <PersonRow
              key={u.id}
              name={u.name}
              hidden={hidden}
              armed={armed === u.id}
              onSelect={() => setArmed(armed === u.id ? null : u.id)}
              onAct={() => onAct(u.id)}
            />
          ))
        )}
        </div>
      </div>
    )
  }

  // Uma coluna: em cima quem não pode, embaixo quem pode. A ordem é a mesma dos
  // dois lados para o olho não ter de reaprender a leitura no meio da tela.
  function Column({ title, icon: Icon, logo, people, canSee, onToggle, emptySeeing }: {
    title: string
    icon?: React.ElementType
    /** A marca da casa, em cinza: identifica sem puxar o olho. */
    logo?: boolean
    people: Person[]
    canSee: (id: string) => boolean
    onToggle: (id: string, next: boolean) => void
    /** O que dizer quando ninguém desta metade enxerga a obra. */
    emptySeeing: string
  }) {
    const no = people.filter(u => !canSee(u.id))
    const yes = people.filter(u => canSee(u.id))
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
        <p className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/30 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {logo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/minilogo_black.png" alt="" className="h-3.5 w-3.5 object-contain opacity-50 grayscale dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/minilogo_white.png" alt="" className="hidden h-3.5 w-3.5 object-contain opacity-50 grayscale dark:block" />
            </>
          ) : Icon ? (
            <Icon className="h-3.5 w-3.5" />
          ) : null}
          {title}
        </p>
        <div className="flex min-h-0 flex-1 flex-col">
          {/* As duas partições existem sempre, mesmo vazias. Some uma delas e a
              coluna passa a mentir por omissão: uma lista de oito nomes sob o
              título da obra não diz se é a de quem vê ou a de quem não vê, e o
              alvo do arrastar deixa de existir justo quando ele é mais
              necessário, que é para tirar o primeiro nome do bloco cheio. */}
          {/* Vermelho para quem está fora, verde para quem está dentro, os dois
              em 6% de opacidade: o suficiente para o olho separar as metades de
              relance, pouco o bastante para o nome continuar sendo a informação
              e não o fundo. As duas metades dividem a altura por igual mesmo
              quando uma está vazia, senão o bloco cheio empurra o vazio para um
              filete e some com o alvo de quem quer mover alguém. */}
          <Bucket
            label="Not seeing it"
            people={no}
            hidden
            empty={`Nobody from ${title} is blocked here.`}
            onAct={id => { onToggle(id, true); setArmed(null) }}
            className="bg-destructive/6"
          />
          <span className="block h-px shrink-0 bg-border/60" />
          <Bucket
            label="Seeing it"
            people={yes}
            hidden={false}
            empty={emptySeeing}
            onAct={id => { onToggle(id, false); setArmed(null) }}
            className="bg-emerald-500/6"
          />
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader><DialogTitle>Who sees this project</DialogTitle></DialogHeader>

        {/* A obra só se identifica: nada aqui se edita. */}
        <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {jobsite.client || "No client"}
          </span>
          <span className="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {placeLabel(jobsite.community || jobsite.address || jobsite.name)}
          </span>
          <span className="flex items-center gap-1.5 text-base font-semibold leading-tight">
            <Kind className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {[(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
              .filter(Boolean).join(" ")}
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search people"
            className="pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <Column
            title="Premium Group"
            logo
            people={premium}
            canSee={id => !blocked.includes(id)}
            onToggle={(id, next) =>
              setBlocked(next ? blocked.filter(v => v !== id) : [...blocked, id])}
            emptySeeing="Nobody from Premium Group is seeing this project."
          />

          <Column
            title="Subcontractors"
            icon={HardHat}
            people={subs}
            canSee={id => granted.includes(id)}
            onToggle={(id, next) =>
              setGranted(next ? [...granted, id] : granted.filter(v => v !== id))}
            emptySeeing="No subcontractor was invited to this project yet."
          />
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="max-w-sm text-xs text-muted-foreground">
            {/* As duas metades se governam por regras opostas, e a nota diz isso
                onde a decisão acontece. Cargo privilegiado fica de fora da
                conta: vê tudo antes de a regra ser consultada, e listá-lo
                prometeria um bloqueio que não existe. */}
            Admins and managers always see every project. Premium people see it unless you say
            otherwise; a subcontractor sees nothing until you share it.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
