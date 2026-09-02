"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useUpdateUserPermissions, useUsers } from "@/hooks/use-settings"
import type { UserWithPermissions } from "@/services/settings.service"
import { Check, Loader2, Search, UserPlus } from "lucide-react"
import { useMemo, useState } from "react"

// O subcontratado é papel do Atlas, não da plataforma. O `role` do banco é um
// enum compartilhado com o BOR, e acrescentar valor ali mudaria a hierarquia de
// papéis do outro produto inteiro — inclusive telas que decidem coisas por
// `role`. Então ele mora numa chave de permissão: para o BOR é um `user` sem
// nenhuma permissão, e para o Atlas é um subcontratado.
export const SUBCONTRACTOR_KEY = "atlas_subcontractor"

export function isSubcontractor(user: { permissions?: Record<string, string> }) {
  return !!user.permissions?.[SUBCONTRACTOR_KEY]
}

const inputCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// ─── Importar alguém que já é da Premium ─────────────────────────────────────

export function ImportUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: users = [], isLoading } = useUsers()
  const updatePerms = useUpdateUserPermissions()
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Só quem ainda não está no Atlas: cargo acima de `user` já entra por
  // definição e não precisa de convite.
  const candidates = useMemo(() => {
    const q = search.toLowerCase()
    return users
      .filter(u => u.role === "user" && !u.permissions?.atlas)
      .filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [users, search])

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function confirm() {
    for (const id of picked) {
      const user = users.find(u => u.id === id)
      // O objeto vai inteiro, com o que a pessoa já tem no BOR: importar para o
      // Atlas não pode tirar nada do outro lado.
      await updatePerms.mutateAsync({
        userId: id,
        permissions: { ...(user?.permissions ?? {}), atlas: "read" },
      })
    }
    setPicked(new Set())
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setPicked(new Set()); onClose() } }}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Import from the BOR
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Everybody with a Premium account is already in the Atlas.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 pr-2">
              {candidates.map(u => {
                const on = picked.has(u.id)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        on ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/50"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {picked.size} selected · comes in with read access
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={picked.size === 0 || updatePerms.isPending} onClick={confirm}>
              {updatePerms.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Check className="h-3.5 w-3.5" />Import</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
