"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { useForecastJobsites, useImportAtlasJobsites } from "@/hooks/use-atlas"
import { Check, DownloadCloud, Search } from "lucide-react"
import { useMemo, useState } from "react"

const COMPANIES = ["", "framing", "hvac", "pcg"]

/**
 * Importa obra do Forecast em vez de redigitar.
 *
 * O Forecast tem a lista mais completa que existe — comunidade, cliente, tipo,
 * número e endereço de todas as obras. Digitar de novo aqui criaria uma segunda
 * lista para divergir da primeira no mês seguinte.
 *
 * A obra já importada continua aparecendo, marcada: some da fila sem sumir da
 * tela, para quem procura entender por que ela não está na lista de escolha.
 */
export function ImportJobsitesDialog() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [company, setCompany] = useState("framing")
  const [status, setStatus] = useState("open")
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const { data: rows, isLoading } = useForecastJobsites({ q: query, company, status })
  const importer = useImportAtlasJobsites()

  const available = useMemo(() => (rows ?? []).filter(r => !r.imported), [rows])
  const alreadyIn = (rows ?? []).length - available.length

  function toggle(id: number) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setPicked(new Set()) }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <DownloadCloud className="h-4 w-4" />
        Import from Forecast
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import jobsites from Forecast</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Community, client, lot, address"
              className="pl-8"
            />
          </div>
          <NativeSelect value={company} onChange={e => setCompany(e.target.value)} className="sm:w-36">
            {COMPANIES.map(c => (
              <option key={c || "all"} value={c}>{c ? c.toUpperCase() : "All companies"}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={status} onChange={e => setStatus(e.target.value)} className="sm:w-32">
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </NativeSelect>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : available.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {alreadyIn > 0
                ? "Every jobsite in this filter is already in Atlas."
                : "No jobsites match this filter."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {available.map(r => {
                const on = picked.has(r.forecastId)
                return (
                  <li key={r.forecastId}>
                    <button
                      onClick={() => toggle(r.forecastId)}
                      className={`flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-accent/40 ${
                        on ? "bg-accent/30" : ""
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.client, r.address].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 capitalize">{r.type}</Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {picked.size} selected{alreadyIn > 0 ? ` · ${alreadyIn} already in Atlas` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={picked.size === 0 || importer.isPending}
              onClick={() => importer.mutate([...picked], {
                onSuccess: () => { setPicked(new Set()); setOpen(false) },
              })}
            >
              {importer.isPending ? "Importing…" : `Import ${picked.size || ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
