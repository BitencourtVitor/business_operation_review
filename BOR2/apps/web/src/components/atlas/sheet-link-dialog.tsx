"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAtlasDocuments, useAtlasSheets, useAtlasVersions } from "@/hooks/use-atlas"
import type { AtlasLinkTarget } from "@/services/atlas.service"
import { FileText, Layers, Loader2, Search } from "lucide-react"
import { useMemo, useState } from "react"

/**
 * Para onde este ponto da prancha aponta.
 *
 * A bolha de referência já existe impressa no desenho: "veja o detalhe 3 na
 * A-501". No papel, quem lê anota o número e vai procurar a folha; aqui ele
 * toca e chega. O que esta janela faz é dizer qual é a folha do outro lado.
 *
 * Duas etapas, porque a segunda depende da primeira: primeiro a pasta, depois a
 * folha dentro dela. Listar todas as folhas de todas as pastas de uma vez daria
 * uma lista de centenas onde o nome se repete entre documentos.
 */
export function SheetLinkDialog({ jobsiteId, open, onClose, onPick }: {
  jobsiteId: string
  open: boolean
  onClose: () => void
  onPick: (target: AtlasLinkTarget) => void
}) {
  const { data: documents = [] } = useAtlasDocuments(jobsiteId)
  const [docId, setDocId] = useState("")
  const [query, setQuery] = useState("")

  const { data: versions } = useAtlasVersions(docId)
  const versionId = versions?.[0]?.id ?? ""
  const { data: sheets, isLoading } = useAtlasSheets(versionId)

  const doc = documents.find(d => d.id === docId)
  const withPlans = documents.filter(d => d.sheets > 0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = sheets ?? []
    return q
      ? list.filter(s =>
          s.sheetNumber.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q) ||
          String(s.pageIndex + 1) === q)
      : list
  }, [sheets, query])

  function close() {
    setDocId("")
    setQuery("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close() }}>
      <DialogContent className="flex h-[70vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{docId ? "Which sheet" : "Which folder"}</DialogTitle>
        </DialogHeader>

        {!docId ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {withPlans.length === 0 && (
              <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                {/* Sem plan set não há para onde apontar, e dizer isso aqui
                    evita a leitura de que a busca falhou. */}
                No folder in this project has plans yet.
              </p>
            )}
            {withPlans.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDocId(d.id)}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  {d.sheets}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or page"
                className="pl-8"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {isLoading && (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {shown.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onPick({
                      documentId: docId,
                      documentName: doc?.name ?? "",
                      sheetId: s.id,
                      sheetName: s.sheetNumber || `Page ${s.pageIndex + 1}`,
                      pageIndex: s.pageIndex,
                    })
                    close()
                  }}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <span className="w-7 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                    {s.pageIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.sheetNumber || `Page ${s.pageIndex + 1}`}
                  </span>
                  {s.title && (
                    <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
                      {s.title}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="truncate text-xs text-muted-foreground">
            {doc ? doc.name : "Pick the folder first"}
          </span>
          <div className="flex gap-2">
            {docId && (
              <Button variant="outline" onClick={() => { setDocId(""); setQuery("") }}>
                Back
              </Button>
            )}
            <Button variant="outline" onClick={close}>Cancel</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
