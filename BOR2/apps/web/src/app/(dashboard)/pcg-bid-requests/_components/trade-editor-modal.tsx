"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { TRADE_ICONS, TRADE_ICON_KEYS, tradeIcon } from "../_lib/trade-icons"
import { nextQuestionId } from "../_lib/catalog-store"
import type { Question, Trade, TradeIconKey } from "../_lib/types"
import { QuestionRow } from "./question-row"
import { ScopeList } from "./scope-list"

export function TradeEditorModal({
  trade, isNew, onSave, onClose,
}: {
  trade: Trade | null
  isNew: boolean
  onSave: (trade: Trade) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Trade | null>(trade)

  useEffect(() => setDraft(trade), [trade])

  if (!draft) return null

  function patch(p: Partial<Trade>) {
    setDraft(d => (d ? { ...d, ...p } : d))
  }

  function patchQuestion(id: string, p: Partial<Question>) {
    patch({ questions: draft!.questions.map(q => (q.id === id ? { ...q, ...p } : q)) })
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const next = [...draft!.questions]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ questions: next })
  }

  const Icon = tradeIcon(draft.icon)
  const canSave = draft.name.trim().length > 0

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex h-[86vh] w-[min(96vw,60rem)] max-w-none! flex-col gap-0 p-0">
        <DialogTitle className="flex shrink-0 items-center gap-2 border-b px-5 py-3 text-base">
          <Icon className="h-4 w-4" />
          {isNew ? "New trade" : draft.name || "Trade"}
        </DialogTitle>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── Identity ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trade-name">Name</Label>
                <Input
                  id="trade-name"
                  value={draft.name}
                  onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Plumbing"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trade-code">Document code</Label>
                <Input
                  id="trade-code"
                  value={draft.code ?? ""}
                  onChange={e => patch({ code: e.target.value.trim() || null })}
                  placeholder="e.g. BRF-PLB"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {TRADE_ICON_KEYS.map(key => {
                  const Option = TRADE_ICONS[key].icon
                  const selected = draft.icon === key
                  return (
                    <button
                      key={key}
                      onClick={() => patch({ icon: key as TradeIconKey })}
                      title={TRADE_ICONS[key].label}
                      aria-label={TRADE_ICONS[key].label}
                      aria-pressed={selected}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <Option className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Requires a bid form</p>
                <p className="text-xs text-muted-foreground">
                  Off means the contract is generated straight from the standard scope, with no bid round.
                </p>
              </div>
              <Switch
                checked={draft.hasBidForm}
                onCheckedChange={v => patch({ hasBidForm: v })}
                className="mt-1 shrink-0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-standard">Standard note</Label>
              <Textarea
                id="trade-standard"
                value={draft.standardNote}
                onChange={e => patch({ standardNote: e.target.value })}
                rows={2}
                placeholder="Text that applies to every project for this trade"
              />
            </div>
          </div>

          {/* ── Questionnaire & scope ────────────────────────────────── */}
          <Tabs defaultValue="questions" className="mt-6">
            <TabsList>
              <TabsTrigger value="questions">Questionnaire ({draft.questions.length})</TabsTrigger>
              <TabsTrigger value="scope">Standard scope</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="mt-4">
              <p className="mb-3 text-xs text-muted-foreground">
                These are the fields PCG fills per project to generate this trade&apos;s bid request.
              </p>
              <ol className="flex flex-col gap-2">
                {draft.questions.map((q, i) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    index={i}
                    isFirst={i === 0}
                    isLast={i === draft.questions.length - 1}
                    onChange={p => patchQuestion(q.id, p)}
                    onMove={d => moveQuestion(i, d)}
                    onRemove={() => patch({ questions: draft.questions.filter(x => x.id !== q.id) })}
                  />
                ))}
              </ol>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => patch({
                  questions: [
                    ...draft.questions,
                    { id: nextQuestionId(draft), label: "", type: "yn", options: ["Yes", "No", "To Be Defined"], hint: "", tag: null, needsQuantity: false },
                  ],
                })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add question
              </Button>
            </TabsContent>

            <TabsContent value="scope" className="mt-4 flex flex-col gap-6">
              <ScopeList
                title="Work included"
                description="Copied into every document generated for this trade."
                items={draft.workIncluded}
                onChange={v => patch({ workIncluded: v })}
              />
              <ScopeList
                title="Exclusions"
                description="What this sub is explicitly not responsible for."
                items={draft.exclusions}
                onChange={v => patch({ exclusions: v })}
              />
              <ScopeList
                title="Responsibility matrix"
                description="Who provides what — GC, sub, or to be defined at contract execution."
                items={draft.responsibilityMatrix}
                onChange={v => patch({ responsibilityMatrix: v })}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} onClick={() => onSave(draft)}>
            {isNew ? "Create trade" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
