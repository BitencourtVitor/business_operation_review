"use client"

import { useState } from "react"
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useClients } from "@/hooks/use-clients"
import { useSaveHVACJobsite } from "@/hooks/use-forecast"

// Criar ou editar um jobsite da HVAC: o nome e quem responde por ele.
//
// Renomear troca o nome em todas as obras da HVAC do jobsite, e o nome antigo
// fica guardado como nome de origem, para a rotina de atualização traduzir.

export interface JobsiteDraft {
  /** Nome atual. Vazio é jobsite novo. */
  name: string
  client: string
  responsibles: string[]
  sourceName?: string | null
}

export function JobsiteDialog({
  jobsite, people, open, onOpenChange, onSaved,
}: {
  jobsite: JobsiteDraft
  /** Os nomes já usados em algum jobsite, para escolher sem redigitar. */
  people: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (name: string) => void
}) {
  const isNew = !jobsite.name
  const [name, setName] = useState(jobsite.name)
  const [client, setClient] = useState(jobsite.client)
  const [responsibles, setResponsibles] = useState(jobsite.responsibles)
  const [error, setError] = useState("")
  const { data: clients = [] } = useClients()
  const save = useSaveHVACJobsite()

  async function confirm() {
    setError("")
    const newName = name.trim()
    if (!newName) return setError("Write the jobsite name.")
    if (isNew && !client) return setError("Choose the client of this jobsite.")
    try {
      await save.mutateAsync({ name: jobsite.name, newName, client, responsibles })
      onSaved?.(newName)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add jobsite" : "Edit jobsite"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "A jobsite groups the lots of the same community."
              : "Renaming changes the jobsite on every HVAC lot that belongs to it."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jobsite-name">Name</Label>
            <Input id="jobsite-name" value={name} onChange={e => setName(e.target.value)} placeholder="Broadleaf at Plymouth, MA" />
            {jobsite.sourceName && (
              <p className="text-xs text-muted-foreground">Name in SupplyPro: {jobsite.sourceName}</p>
            )}
          </div>

          {isNew && (
            <div className="flex flex-col gap-1.5">
              <Label>Client</Label>
              <Select value={client} onValueChange={v => v && setClient(v)}>
                <SelectTrigger className="h-8 w-full">
                  <span className={`truncate text-sm ${client ? "" : "text-muted-foreground"}`}>
                    {client || "Choose a client"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Responsible</Label>
            <PeoplePicker value={responsibles} onChange={setResponsibles} people={people} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Seleção múltipla de nomes: escolhe da lista ou digita. Nome que ainda não
// existe aparece como "+ Add <nome>". É anotação, não usuário do sistema.
function PeoplePicker({
  value, onChange, people,
}: {
  value: string[]
  onChange: (value: string[]) => void
  people: string[]
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")

  const term = typed.trim()
  const has = (list: string[], n: string) => list.some(x => x.toLowerCase() === n.toLowerCase())
  const options = [...new Set([...people, ...value])]
    .filter(p => p.toLowerCase().includes(term.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
  const toggle = (n: string) =>
    onChange(has(value, n) ? value.filter(x => x.toLowerCase() !== n.toLowerCase()) : [...value, n])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex min-h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 text-left text-sm transition-colors outline-none focus-visible:border-ring dark:bg-input/30"
          >
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {value.length === 0 && <span className="text-muted-foreground">Nobody yet</span>}
              {value.map(n => (
                <span key={n} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                  {n}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${n}`}
                    onClick={e => { e.stopPropagation(); toggle(n) }}
                    onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); toggle(n) } }}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-(--anchor-width) p-1.5">
        <Input
          autoFocus
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            if (e.key !== "Enter" || !term) return
            e.preventDefault()
            if (!has(value, term)) onChange([...value, options.find(o => o.toLowerCase() === term.toLowerCase()) ?? term])
            setTyped("")
          }}
          placeholder="Search or type a name…"
        />
        <div className="mt-1.5 flex max-h-48 flex-col overflow-y-auto">
          {options.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <Check className={`h-3.5 w-3.5 ${has(value, n) ? "" : "opacity-0"}`} />
              {n}
            </button>
          ))}
          {term && !has(options, term) && (
            <button
              type="button"
              onClick={() => { onChange([...value, term]); setTyped("") }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {term}
            </button>
          )}
          {!term && options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Type a name to add it.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
