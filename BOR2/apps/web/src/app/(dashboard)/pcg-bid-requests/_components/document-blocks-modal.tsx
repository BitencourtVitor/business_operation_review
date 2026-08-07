"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Lock, Plus, Sparkles, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { emptyDocumentBlock } from "../_lib/catalog-store"
import {
  DOCUMENT_SCOPE_LABEL, GENERATED_MODULE_LABEL, GENERATED_MODULE_TITLE, moduleNumbers,
} from "../_lib/types"
import type { DocumentBlock, DocumentScope } from "../_lib/types"

const SCOPES: DocumentScope[] = ["bid", "contract", "both"]

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

  // The numbering shown here is the contract's: it is the document that carries
  // the numbered sections, and seeing "4." next to a module is the only way to
  // tell what reordering actually did.
  const numbers = moduleNumbers(draft.filter(b => b.scope !== "bid"))

  function patch(id: string, p: Partial<DocumentBlock>) {
    setDraft(d => d.map(b => (b.id === id ? { ...b, ...p } : b)))
  }

  function move(i: number, by: -1 | 1) {
    setDraft(d => {
      const j = i + by
      if (j < 0 || j >= d.length) return d
      const out = [...d]
      const [item] = out.splice(i, 1)
      out.splice(j, 0, item)
      return out
    })
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex h-[86vh] w-[min(96vw,54rem)] max-w-none! flex-col gap-0 p-0">
        <DialogTitle className="shrink-0 border-b px-5 py-3 text-base">
          Document defaults
        </DialogTitle>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-muted-foreground">
            The body of every document, in the order it prints. Editing a module changes
            every document it applies to. The letterhead, the project data table and the
            footer are not here — those are the shape of the paper, not text.
          </p>

          {draft.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              No module yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {draft.map((block, i) => {
                const generated = block.kind === "generated"
                const locked = block.kind === "locked"
                const fixed = generated || locked

                return (
                  <li
                    key={block.id}
                    className={`flex flex-col gap-2 rounded-lg border p-3 ${fixed ? "border-dashed bg-muted/40" : "bg-card/50"}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex shrink-0 flex-col">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${block.title || "module"} up`}
                          className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === draft.length - 1}
                          aria-label={`Move ${block.title || "module"} down`}
                          className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <span className="mt-2 w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {numbers.get(block.id) ? `${numbers.get(block.id)}.` : ""}
                      </span>

                      {fixed ? (
                        <p className="mt-2 flex flex-1 items-center gap-1.5 text-sm font-medium">
                          {generated
                            ? <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                            : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                          {block.title
                            || (block.generated && GENERATED_MODULE_TITLE[block.generated])
                            || "Standard notice"}
                        </p>
                      ) : (
                        <Input
                          value={block.title}
                          onChange={e => patch(block.id, { title: e.target.value })}
                          placeholder="Section heading in the document"
                          className="flex-1 text-sm"
                        />
                      )}

                      {!fixed && (
                        <button
                          onClick={() => setDraft(d => d.filter(b => b.id !== block.id))}
                          aria-label={`Remove ${block.title || `module ${i + 1}`}`}
                          className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="pl-[3.4rem]">
                      {generated ? (
                        <p className="text-xs italic text-muted-foreground">
                          {block.generated ? GENERATED_MODULE_LABEL[block.generated] : ""}
                        </p>
                      ) : locked ? (
                        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                          {block.body}
                        </p>
                      ) : (
                        <Textarea
                          value={block.body}
                          onChange={e => patch(block.id, { body: e.target.value })}
                          rows={3}
                          placeholder="Text as it should print"
                          className="min-h-0 text-sm"
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pl-[3.4rem]">
                      <Select
                        value={block.scope}
                        onValueChange={v => v && patch(block.id, { scope: v as DocumentScope })}
                        disabled={fixed}
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <span className="flex-1 truncate text-left text-sm">
                            {DOCUMENT_SCOPE_LABEL[block.scope]}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPES.map(s => (
                            <SelectItem key={s} value={s}>{DOCUMENT_SCOPE_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {!fixed && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={block.numbered}
                            onCheckedChange={v => patch(block.id, { numbered: v === true })}
                          />
                          Numbered section
                        </label>
                      )}

                      {fixed && (
                        <span className="text-xs text-muted-foreground">
                          {generated ? "Generated — only its position changes" : "Standard text — only its position changes"}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setDraft(d => [...d, emptyDocumentBlock()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add module
          </Button>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(draft.filter(b => b.kind !== "text" || b.title.trim() || b.body.trim()))}
          >
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
