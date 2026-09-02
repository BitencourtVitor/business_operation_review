"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { useQuery } from "@tanstack/react-query"
import { PersonRow } from "@/components/atlas/person-row"
import { Building, Home, MapPin, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

const KIND_META: Record<string, { label: string; icon: React.ElementType }> = {
  building: { label: "Building", icon: Building },
  house:    { label: "Lot",      icon: Home },
}

/** O lugar sem o miolo, igual ao cartão da lista. */
function placeLabel(raw: string): string {
  const parts = raw.split(",").map(v => v.trim()).filter(Boolean)
  if (parts.length <= 2) return parts.join(", ")
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

/**
 * Quem vê e quem não vê a obra.
 *
 * Controlar acesso não é editar a obra: aqui ela só se identifica, e o que se
 * mexe é a lista. Separado do formulário de edição de propósito, porque quem
 * decide quem enxerga não é necessariamente quem corrige o endereço.
 */
export function JobsiteVisibilityDialog({ jobsite, open, onClose }: {
  jobsite: AtlasJobsite
  open: boolean
  onClose: () => void
}) {
  const [blocked, setBlocked] = useState<string[]>([])
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
  }, [open, jobsite.id])

  const people = useMemo(
    () => (users ?? []).map(u => ({ id: u.userId, name: u.name })),
    [users],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter(u => u.name.toLowerCase().includes(q)) : people
  }, [people, query])

  const hidden = shown.filter(u => blocked.includes(u.id))
  const seeing = shown.filter(u => !blocked.includes(u.id))

  async function save() {
    setSaving(true)
    try {
      await atlasService.setBlocked(jobsite.id, blocked)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const Kind = (KIND_META[jobsite.kind] ?? KIND_META.house).icon

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
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

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {people.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Nobody has Atlas access yet.</p>
          )}

          {hidden.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Not seeing it ({hidden.length})
              </p>
              {hidden.map(u => (
                <PersonRow
                  key={u.id}
                  name={u.name}
                  hidden
                  armed={armed === u.id}
                  onSelect={() => setArmed(armed === u.id ? null : u.id)}
                  onAct={() => { setBlocked(blocked.filter(v => v !== u.id)); setArmed(null) }}
                />
              ))}
            </>
          )}

          {seeing.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Seeing it ({seeing.length})
              </p>
              {seeing.map(u => (
                <PersonRow
                  key={u.id}
                  name={u.name}
                  hidden={false}
                  armed={armed === u.id}
                  onSelect={() => setArmed(armed === u.id ? null : u.id)}
                  onAct={() => { setBlocked([...blocked, u.id]); setArmed(null) }}
                />
              ))}
            </>
          )}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {/* Cargo privilegiado não entra na conta: vê tudo antes de a regra
                ser consultada, e listá-lo prometeria um bloqueio que não existe. */}
            Admins and managers always see every project.
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
