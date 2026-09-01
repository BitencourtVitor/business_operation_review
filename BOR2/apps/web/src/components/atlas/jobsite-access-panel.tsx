"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { useAtlasAccess, useGrantAtlasAccess, useRevokeAtlasAccess } from "@/hooks/use-atlas"
import { useUsers } from "@/hooks/use-settings"
import type { AtlasLevel } from "@/services/atlas.service"
import { ShieldOff, UserPlus } from "lucide-react"
import { useMemo, useState } from "react"

const LEVELS: { value: AtlasLevel; label: string; hint: string }[] = [
  { value: "read",     label: "Leitura",   hint: "Abre documentos e plantas" },
  { value: "annotate", label: "Anotação",  hint: "Marca a planta, abre evento, escreve no diário" },
  { value: "manage",   label: "Gestão",    hint: "Sobe documento, publica versão e concede acesso" },
]

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  LEVELS.map(l => [l.value, l.label]),
)

/**
 * Acesso do Atlas é por obra (AT-6, eixo 2), e não por feature como no BOR.
 * A tela vive aqui, dentro da obra, e não em Settings: quem concede é quem
 * gerencia esta obra, não necessariamente quem administra a plataforma.
 */
export function JobsiteAccessPanel({ jobsiteId }: { jobsiteId: string }) {
  const { data: access, isLoading } = useAtlasAccess(jobsiteId)
  const { data: users } = useUsers()
  const grant = useGrantAtlasAccess(jobsiteId)
  const revoke = useRevokeAtlasAccess(jobsiteId)

  const [userId, setUserId] = useState("")
  const [level, setLevel] = useState<AtlasLevel>("read")

  const active = useMemo(() => (access ?? []).filter(a => !a.revokedAt), [access])
  const revoked = useMemo(() => (access ?? []).filter(a => a.revokedAt), [access])

  const candidates = useMemo(() => {
    const taken = new Set(active.map(a => a.userId))
    return (users ?? []).filter(u => !taken.has(u.id))
  }, [users, active])

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm font-medium">Conceder acesso</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="flex-1"
          >
            <option value="">Selecione a pessoa</option>
            {candidates.map(u => (
              <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={level}
            onChange={e => setLevel(e.target.value as AtlasLevel)}
            className="sm:w-44"
          >
            {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </NativeSelect>
          <Button
            disabled={!userId || grant.isPending}
            onClick={() => grant.mutate({ userId, level }, { onSuccess: () => setUserId("") })}
          >
            <UserPlus className="h-4 w-4" />
            Conceder
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {LEVELS.find(l => l.value === level)?.hint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém tem acesso concedido a esta obra ainda. Quem administra a plataforma
            enxerga todas as obras sem precisar de concessão.
          </p>
        ) : active.map(a => (
          <div key={a.userId} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{a.userName}</p>
              <p className="truncate text-xs text-muted-foreground">{a.userEmail}</p>
            </div>
            {a.expiresAt && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                expira {new Date(a.expiresAt).toLocaleDateString()}
              </Badge>
            )}
            <Badge variant="outline">{LEVEL_LABEL[a.level] ?? a.level}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => revoke.mutate(a.userId)}
            >
              <ShieldOff className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {revoked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Revogados
          </p>
          {/* A linha revogada continua aqui de propósito: concessão e revogação
              fazem parte da trilha (AT-7), e apagar a linha apagaria a prova de
              que o acesso existiu. */}
          {revoked.map(a => (
            <div key={a.userId} className="flex items-center gap-3 rounded-lg border border-dashed border-border/60 p-3 opacity-70">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-tight">{a.userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  revogado em {new Date(a.revokedAt!).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => grant.mutate({ userId: a.userId, level: a.level })}
              >
                Restaurar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
