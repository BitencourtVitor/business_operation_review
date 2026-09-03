"use client"

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useAtlasUserJobsites } from "@/hooks/use-atlas"
import { KIND_META, placeLabel } from "@/components/atlas/jobsite-form-dialog"
import { Building2, HardHat, Loader2, MapPin } from "lucide-react"

// O que cada nível deixa fazer, dito em uma palavra. O mesmo vocabulário do
// painel de acesso da obra, para quem concede não ter de traduzir duas vezes.
const LEVEL: Record<string, { label: string; className: string }> = {
  read:     { label: "View",     className: "border-border text-muted-foreground" },
  annotate: { label: "Annotate", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  manage:   { label: "Manage",   className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
}

/**
 * O que este subcontratado enxerga.
 *
 * Existe porque o subcontratado nasce sem ver nada e passa a ver obra a obra: a
 * pergunta "o que ele está vendo?" não tem resposta em lugar nenhum sem abrir
 * cada obra e procurar o nome dele na lista de acesso. Aqui ela se responde de
 * uma vez, do lado de quem concede.
 *
 * Só lê. Conceder e revogar continua sendo dentro da obra, junto do contexto
 * que faz a decisão ter sentido.
 */
export function SubcontractorScopeDialog({ user, company, open, onClose }: {
  user: { id: string; name: string; email: string } | null
  company?: string
  open: boolean
  onClose: () => void
}) {
  const { data: jobsites = [], isLoading } = useAtlasUserJobsites(user?.id ?? "", open)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-4 w-4 text-brand-red" />
            What this subcontractor sees
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Quem é, antes do que ele vê: numa lista de dez subs, o nome sozinho
              não diz de qual empresa é a pessoa. */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            {company && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {company}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Shared projects
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{jobsites.length}</span>
            </div>

            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : jobsites.length === 0 ? (
              // Não é falha, é o estado inicial de todo subcontratado: ele nasce
              // sem ver nada, e dizer isso aqui evita a leitura de que quebrou.
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm font-medium">No project shared yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  A subcontractor starts seeing nothing. Share a project from the jobsite&apos;s
                  Manage Access panel and it shows up here.
                </p>
              </div>
            ) : (
              <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                {jobsites.map(j => {
                  const Icon = (KIND_META[j.kind] ?? KIND_META.house).icon
                  const level = LEVEL[j.level] ?? LEVEL.read
                  return (
                    <div
                      key={j.jobsiteId}
                      className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{placeLabel(j.community || j.name)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[(KIND_META[j.kind] ?? KIND_META.house).label, j.unit, j.client]
                            .filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${level.className}`}>
                        {level.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
