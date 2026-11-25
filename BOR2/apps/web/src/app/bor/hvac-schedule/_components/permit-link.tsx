"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Ban, CheckCircle2, Circle, Link2, Loader2, Search, Unlink } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePermits } from "@/hooks/use-permits"
import { permitService } from "@/services/permit.service"
import type { ForecastProject } from "@bor2/shared"

// O Permit da obra vem do Permit Control (23/11/2026): aqui só se escolhe a
// linha de lá que é desta obra. As etapas são marcadas pelas datas da linha,
// no banco, e não se editam mais por aqui.
export function PermitLink({ project }: { project: ForecastProject }) {
  const qc = useQueryClient()
  const { data: permits = [] } = usePermits()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const linked = permits.find(r => r.projectId === project.id)
  const steps = project.permit ?? []

  const link = useMutation({
    mutationFn: (permitId: string | null) => permitService.link(project.id, permitId),
    onSuccess: () => {
      setOpen(false)
      setError("")
      qc.invalidateQueries({ queryKey: ["permits"] })
      qc.invalidateQueries({ queryKey: ["forecast"] })
    },
    onError: () => setError("Could not link. The permit may already belong to another project."),
  })

  const q = query.trim().toLowerCase()
  const options = permits
    .filter(r => !q || `${r.client} ${r.jobsite} ${r.lotAddress}`.toLowerCase().includes(q))
    .slice(0, 50)

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Permit</span>
        <span className="ml-auto text-[11px] text-muted-foreground">from Permit Control</span>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {linked ? <>{linked.jobsite} · {linked.lotAddress}</> : <span className="text-muted-foreground">Not linked</span>}
        </span>
        {link.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          <>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger render={<button type="button" aria-label="Link permit" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}>
                <Link2 className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-2">
                <label className="mb-2 flex items-center gap-2 rounded-md border px-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Jobsite or address"
                    className="h-8 w-full bg-transparent text-xs outline-none" />
                </label>
                <div className="grid max-h-64 gap-0.5 overflow-y-auto">
                  {options.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No permit found.</p>}
                  {options.map(r => {
                    const taken = !!r.projectId && r.projectId !== project.id
                    return (
                      <button key={r.id} type="button" disabled={taken} onClick={() => link.mutate(r.id)}
                        className="flex flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
                        <span className="w-full truncate">{r.lotAddress}</span>
                        <span className="w-full truncate text-[11px] text-muted-foreground">
                          {r.jobsite} · {r.situacao || "Pending"}{taken ? " · linked to another project" : ""}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {linked && (
              <button type="button" aria-label="Unlink permit" onClick={() => link.mutate(null)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <Unlink className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-col gap-0.5">
        {steps.map(s => {
          const v = String(s.status ?? "").toLowerCase()
          return (
            <div key={s.id} className="flex items-center gap-2 px-1 py-1 text-[13px]">
              {v === "dispensed" ? <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                : v ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />}
              {s.step}
            </div>
          )
        })}
      </div>
    </div>
  )
}
