"use client"

import { useState } from "react"
import { Link2, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useBuildingAtlasJobsites, useSetBuildingAtlasJobsite } from "@/hooks/use-buildings"
import type { BuildingListItem } from "@/services/buildings.service"

const NONE = "none"

/**
 * O projeto do Atlas que este cronograma descreve.
 *
 * Ligado, o Atlas mostra o cronograma dentro do projeto, no item Schedule da
 * barra. Um projeto recebe um prédio só: o que já está ligado a outro aparece
 * apagado, com o nome de quem o ocupa, em vez de ser tomado sem aviso.
 */
export function AtlasLink({ building }: { building: BuildingListItem }) {
  const [aberto, setAberto] = useState(false)
  const { data: projetos = [], isLoading } = useBuildingAtlasJobsites(aberto || !!building.atlas_jobsite_id)
  const setLink = useSetBuildingAtlasJobsite()
  const [erro, setErro] = useState("")

  const valor = building.atlas_jobsite_id ?? NONE

  function escolher(v: string | null) {
    const alvo = !v || v === NONE ? null : v
    if (alvo === building.atlas_jobsite_id) return
    setErro("")
    setLink.mutate(
      { id: building.id, atlasJobsiteId: alvo },
      { onError: e => setErro(e instanceof Error ? e.message : "Could not link the project") },
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Atlas project</span>
      <Select value={valor} onValueChange={escolher} onOpenChange={setAberto}>
        <SelectTrigger size="sm" className="h-8 w-full min-w-0" disabled={setLink.isPending}>
          {setLink.isPending
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            : <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className={`min-w-0 flex-1 truncate text-left text-xs ${building.atlas_jobsite_id ? "" : "text-muted-foreground"}`}>
            {building.atlas_jobsite_name ?? "Not linked"}
          </span>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          className="w-max min-w-(--anchor-width) max-w-[min(26rem,calc(100vw-2rem))]"
        >
          <SelectItem value={NONE}>Not linked</SelectItem>
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
          {projetos.map(p => {
            const deOutro = !!p.building_id && p.building_id !== building.id
            return (
              <SelectItem key={p.id} value={p.id} disabled={deOutro}>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate">{p.name}</span>
                  {(deOutro || p.status === "archived" || p.client) && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {[p.client, p.status === "archived" ? "Archived" : "", deOutro ? `Linked to ${p.building_name}` : ""]
                        .filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  )
}
