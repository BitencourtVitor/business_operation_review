"use client"

import { useState } from "react"
import { ListChecks, Lock, Receipt, RotateCcw, Signature } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  documentModules, GENERATED_MODULE_LABEL, GENERATED_MODULE_TITLE, moduleBody, moduleNumbers,
} from "../_lib/types"
import type { DocumentBlock, ProjectTrade } from "../_lib/types"

// A module that takes no number still owns the column the numbers sit in — a
// blank there reads as a numbering bug. What goes in it says why the number is
// missing: this piece is not a clause of the body, it is drawn or it is fixed.
const SLOT_ICON: Record<string, React.ElementType> = {
  scope_of_work: ListChecks,
  signatures: Signature,
  payment_schedule: Receipt,
  locked: Lock,
}

function ModuleSlot({ number, icon: Icon }: { number: number | undefined; icon?: React.ElementType }) {
  return (
    <span className="flex w-6 shrink-0 items-center justify-end text-xs tabular-nums text-muted-foreground">
      {number ? `${number}.` : Icon ? <Icon className="h-3.5 w-3.5" /> : null}
    </span>
  )
}

// One sub arguing a clause is not a reason to change PCG's standard. This edits
// the text of this contract alone: what is stored is the difference, so a module
// nobody touched keeps following the catalog even after the catalog is rewritten.
export function ContractTermsModal({
  blocks, overrides, canEdit, onSave, onClose,
}: {
  blocks: DocumentBlock[]
  overrides: ProjectTrade["moduleOverrides"]
  canEdit: boolean
  onSave: (patch: Pick<ProjectTrade, "moduleOverrides">) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ProjectTrade["moduleOverrides"]>(overrides ?? {})

  // The whole body, in the order it prints — including the modules the renderer
  // draws. Those cannot be rewritten here, but leaving them out made the list
  // read as the entire contract when it was only the editable half of it: the
  // scope of work is the piece the sub argues about most, and it was the one
  // piece missing.
  const modules = documentModules(blocks, "contract")
  const numbers = moduleNumbers(modules)

  function reset(id: string) {
    setDraft(d => {
      const { [id]: _dropped, ...rest } = d
      return rest
    })
  }

  // Typing the standard back in by hand is not an override — storing it would
  // freeze this contract against a catalog correction for no reason.
  function edit(block: DocumentBlock, value: string) {
    if (value === block.body) return reset(block.id)
    setDraft(d => ({ ...d, [block.id]: value }))
  }

  const changed = Object.keys(draft).length

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex h-[86vh] w-[min(96vw,54rem)] max-w-none! flex-col gap-0 p-0">
        <DialogTitle className="shrink-0 border-b px-5 py-3 text-base">
          Terms for this contract
        </DialogTitle>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-muted-foreground">
            The whole contract body, in the order it prints for this trade on this project.
            Rewrite a clause here when the sub negotiates it — $35.00 an hour against their
            $40.00 — and only this contract changes. The modules marked Generated are drawn
            from the trade and the approved bid; they are here to place the rest, not to edit.
          </p>

          <ol className="flex flex-col gap-2">
            {modules.map(block => {
              // Drawn by the renderer from the trade, the answers and the bid —
              // there is no text to rewrite. Shown anyway, and in its real
              // position, so the order of the paper the sub received is legible.
              if (block.kind === "generated" && block.generated) {
                return (
                  <li
                    key={block.id}
                    className="flex flex-col gap-1 rounded-lg border border-dashed bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <ModuleSlot
                        number={numbers.get(block.id)}
                        icon={SLOT_ICON[block.generated]}
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {block.title || GENERATED_MODULE_TITLE[block.generated]}
                      </p>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Generated
                      </span>
                    </div>
                    <p className="pl-8 text-xs text-muted-foreground">
                      {GENERATED_MODULE_LABEL[block.generated]}
                    </p>
                  </li>
                )
              }

              // Standing text nobody rewrites for one contract — the notice that
              // says the trade is delivered whole. Shown in place and read-only:
              // taking it out of the list would hide a paragraph that prints.
              if (block.kind === "locked") {
                return (
                  <li
                    key={block.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-dashed bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <ModuleSlot number={numbers.get(block.id)} icon={SLOT_ICON.locked} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {block.title || "Standard notice"}
                      </p>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Standard
                      </span>
                    </div>
                    <p className="pl-8 text-xs leading-5 text-muted-foreground">{block.body}</p>
                  </li>
                )
              }

              const overridden = draft[block.id] !== undefined
              return (
                <li
                  key={block.id}
                  className={`flex flex-col gap-2 rounded-lg border p-3 ${overridden ? "border-fuchsia-400/50 bg-fuchsia-400/[0.04]" : "bg-card/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <ModuleSlot number={numbers.get(block.id)} />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {block.title || "Standard notice"}
                    </p>
                    {overridden && (
                      <>
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-fuchsia-400">
                          Rewritten
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => reset(block.id)}
                            aria-label={`Reset ${block.title} to the standard text`}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <Textarea
                    value={moduleBody(block, draft)}
                    onChange={e => edit(block, e.target.value)}
                    disabled={!canEdit}
                    rows={overridden ? 8 : 4}
                    className="min-h-0 pl-2 text-sm"
                  />
                </li>
              )
            })}
          </ol>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {changed === 0
              ? "Following the standard on every clause"
              : `${changed} clause${changed > 1 ? "s" : ""} rewritten for this contract`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onSave({ moduleOverrides: draft })}
              disabled={!canEdit}
            >
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
