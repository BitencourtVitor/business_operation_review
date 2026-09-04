"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { renderThumb } from "@/components/atlas/plan-split"
import { readPdfOutline } from "@/components/atlas/pdf-page"
import { atlasService, uploadToR2 } from "@/services/atlas.service"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileUp, History, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { AtlasSheet } from "@/services/atlas.service"

/**
 * O histórico de uma página, e a troca de uma prancha só.
 *
 * O projetista não devolve o set: devolve a prancha corrigida. Antes disto,
 * trocar uma folha significava subir as 97 de novo, e as folhas antigas sumiam
 * junto, levando as anotações feitas sobre elas.
 *
 * Aqui a página guarda linhagem. A prancha que vale é a última; as anteriores
 * continuam no banco com quem as trocou, quando, e com que nome e observação.
 * As anotações ficam com a revisão em que foram feitas, e é isso que se quer:
 * elas apontam para traços que podem ter mudado de lugar na prancha nova.
 */

/** A data como se fala dela numa linha de histórico. */
function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SheetRevisions({ sheet, canManage, open, onClose, onReplaced }: {
  sheet: AtlasSheet
  canManage: boolean
  open: boolean
  onClose: () => void
  /** A folha trocou: quem abriu a prancha precisa recarregar a que vale. */
  onReplaced: () => void
}) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["atlas", "sheet-history", sheet.id],
    queryFn: () => atlasService.sheetHistory(sheet.id),
    enabled: open,
  })

  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) return
    setFile(null); setName(""); setNotes(""); setBusy(""); setError("")
  }, [open])

  async function replace() {
    if (!file) return
    setError("")
    try {
      // A medida sai do próprio arquivo: a prancha nova pode chegar em outro
      // tamanho de papel, e o leitor desenha a anotação em fração da página.
      setBusy("Reading")
      let size: { width: number; height: number } | null = null
      try {
        const outline = await readPdfOutline(file)
        size = { width: outline.width, height: outline.height }
      } catch {
        // PDF que o pdf.js não abre ainda sobe: a folha fica com a medida da
        // anterior, que é melhor que recusar o arquivo.
      }

      setBusy("Opening")
      const ticket = await atlasService.openSheetRevision(sheet.id)

      setBusy("Uploading")
      await uploadToR2(ticket.uploadUrl, file, "application/pdf")

      // A prévia é conforto: falhar aqui deixa a folha com a miniatura antiga e
      // não estraga a troca.
      let thumbKey = ""
      const local = URL.createObjectURL(file)
      try {
        const thumb = await renderThumb(local, 0)
        if (thumb) {
          await uploadToR2(ticket.thumbUploadUrl, thumb, "image/jpeg")
          thumbKey = ticket.thumbKey
        }
      } catch {
        // segue sem miniatura nova
      } finally {
        URL.revokeObjectURL(local)
      }

      setBusy("Saving")
      await atlasService.commitSheetRevision(sheet.id, {
        sheetId: ticket.sheetId,
        r2Key: ticket.r2Key,
        thumbKey,
        byteSize: file.size,
        widthPt: size?.width,
        heightPt: size?.height,
        name: name.trim(),
        notes: notes.trim(),
      })

      qc.invalidateQueries({ queryKey: ["atlas", "sheets"] })
      qc.invalidateQueries({ queryKey: ["atlas", "sheet-history", sheet.id] })
      onReplaced()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not replace this sheet")
    } finally {
      setBusy("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sheet.sheetNumber || `Plan ${sheet.pageIndex + 1}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setError("") }}
              />
              <Button
                variant="outline"
                className="h-auto justify-start py-3"
                disabled={!!busy}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate">
                    {file ? file.name : "Choose the corrected sheet"}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : "A one-page PDF replacing this plan only"}
                  </span>
                </span>
              </Button>

              {file && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rev-name">Version name</Label>
                    <Input
                      id="rev-name"
                      value={name}
                      placeholder="What changed, in a few words"
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rev-notes">Notes</Label>
                    <Input
                      id="rev-notes"
                      value={notes}
                      placeholder="Optional"
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                  {/* Dito onde a decisão acontece: o que estava vira histórico,
                      e as marcações feitas sobre ele continuam lá, não vêm
                      junto. */}
                  <p className="text-xs text-muted-foreground">
                    The current sheet becomes history. Marks made on it stay with it, and the
                    new plan starts clean.
                  </p>
                </>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>History</Label>
            {isLoading ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {history.map(r => (
                  <div
                    key={r.id}
                    className={`flex items-start gap-3 rounded-lg border p-2.5 ${
                      r.supersededAt ? "border-border/40 bg-muted/20" : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-tight">
                        {r.name || (r.supersededAt ? "Replaced" : "Original")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[when(r.revisedAt), r.revisedBy.split(" ")[0], r.notes]
                          .filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.supersededAt
                        ? `${r.annotations} ${r.annotations === 1 ? "mark" : "marks"}`
                        : "Current"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-center text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>Close</Button>
          {canManage && (
            <Button disabled={!file || !!busy} onClick={replace}>
              {busy ? `${busy}…` : "Replace this sheet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
