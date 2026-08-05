"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { emptyDocumentBlock } from "../_lib/catalog-store"
import { DOCUMENT_PLACEMENT_LABEL, DOCUMENT_SCOPE_LABEL } from "../_lib/types"
import type { DocumentBlock, DocumentPlacement, DocumentScope } from "../_lib/types"

const SCOPES: DocumentScope[] = ["bid", "contract", "both"]
const PLACEMENTS: DocumentPlacement[] = ["before_sections", "after_sections"]

// Mounted only while open — the draft seeds itself from the store on mount, so
// there is nothing to sync back when the blocks change underneath.
export function DocumentBlocksModal({
  blocks, onSave, onClose,
}: {
  blocks: DocumentBlock[]
  onSave: (blocks: DocumentBlock[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<DocumentBlock[]>(blocks)

  function patch(id: string, p: Partial<DocumentBlock>) {
    setDraft(d => d.map(b => (b.id === id ? { ...b, ...p } : b)))
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex h-[86vh] w-[min(96vw,54rem)] max-w-none! flex-col gap-0 p-0">
        <DialogTitle className="shrink-0 border-b px-5 py-3 text-base">
          Document defaults
        </DialogTitle>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Text that belongs to PCG, not to a trade. Editing a block changes every
            document it applies to.
          </p>

          {draft.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              No default block yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {draft.map((block, i) => (
                <li key={block.id} className="flex flex-col gap-2 rounded-lg border bg-card/50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    <Input
                      value={block.title}
                      onChange={e => patch(block.id, { title: e.target.value })}
                      placeholder="Section heading in the document"
                      className="flex-1 text-sm"
                    />
                    <button
                      onClick={() => setDraft(d => d.filter(b => b.id !== block.id))}
                      aria-label={`Remove block ${i + 1}`}
                      className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="pl-7">
                    <Textarea
                      value={block.body}
                      onChange={e => patch(block.id, { body: e.target.value })}
                      rows={3}
                      placeholder="Text as it should print"
                      className="min-h-0 text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pl-7">
                    <Select value={block.scope} onValueChange={v => v && patch(block.id, { scope: v as DocumentScope })}>
                      <SelectTrigger className="h-8 w-[160px]">
                        <span className="flex-1 truncate text-left text-sm">{DOCUMENT_SCOPE_LABEL[block.scope]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {SCOPES.map(s => (
                          <SelectItem key={s} value={s}>{DOCUMENT_SCOPE_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={block.placement}
                      onValueChange={v => v && patch(block.id, { placement: v as DocumentPlacement })}
                    >
                      <SelectTrigger className="h-8 w-[210px]">
                        <span className="flex-1 truncate text-left text-sm">
                          {DOCUMENT_PLACEMENT_LABEL[block.placement]}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {PLACEMENTS.map(p => (
                          <SelectItem key={p} value={p}>{DOCUMENT_PLACEMENT_LABEL[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setDraft(d => [...d, emptyDocumentBlock()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add block
          </Button>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft.filter(b => b.title.trim() || b.body.trim()))}>
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
