"use client"

import { useEffect, useState } from "react"
import { ChevronDown, FileText, GitBranch, Info, ListChecks, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { TRADE_ICONS, TRADE_ICON_KEYS, tradeIcon } from "../_lib/trade-icons"
import { nextQuestionId, useCatalogStore } from "../_lib/catalog-store"
import type { Question, Trade, TradeIconKey } from "../_lib/types"
import { QuestionRow } from "./question-row"
import { RuleList } from "./rule-list"
import { ScopeList } from "./scope-list"

export function TradeEditorModal({
  trade, isNew, onSave, onClose,
}: {
  trade: Trade | null
  isNew: boolean
  onSave: (trade: Trade) => void
  onClose: () => void
}) {
  const trades = useCatalogStore(s => s.trades)
  const [draft, setDraft] = useState<Trade | null>(trade)
  const [pickingIcon, setPickingIcon] = useState(false)
  const [openSection, setOpenSection] = useState<"details" | "content">("details")
  const [tab, setTab] = useState("scope")

  // An icon identifies a trade at a glance — two trades sharing one defeats it.
  const takenIcons = new Set(trades.filter(t => t.id !== draft?.id).map(t => t.icon))

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
      {/* max-h, not h: with the document sections collapsed the modal hugs the
          fields instead of leaving dead space below them. */}
      <DialogContent className="flex max-h-[86vh] w-[min(96vw,60rem)] max-w-none! flex-col gap-0 p-0">
        <DialogTitle className="flex shrink-0 items-center gap-2 border-b px-5 py-3 text-base">
          <Icon className="h-4 w-4" />
          {isNew ? "New trade" : draft.name || "Trade"}
        </DialogTitle>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
          {/* ── Trade information ───────────────────────────────────────
              Two sections share the height: whichever is open takes what is
              left, and there is always exactly one open. */}
          <section className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <button
              onClick={() => setOpenSection("details")}
              aria-expanded={openSection === "details"}
              className="flex shrink-0 items-center gap-3 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold leading-none">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Trade information
              </span>
              {openSection !== "details" && draft.name && (
                <span className="truncate text-xs leading-none text-muted-foreground">{draft.name}</span>
              )}
              <ChevronDown
                className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  openSection === "details" ? "rotate-180" : ""
                }`}
              />
            </button>

            {openSection === "details" && (
          <div className="flex flex-col gap-4 border-t border-border/50 p-4">
            <div className="flex shrink-0 items-end gap-3 rounded-xl border border-border/60 p-4">
              <div className="flex flex-col gap-1.5">
                <Label>Icon</Label>
                <Popover open={pickingIcon} onOpenChange={setPickingIcon}>
                  <PopoverTrigger
                    aria-label="Change icon"
                    className="flex h-8 w-9 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30"
                  >
                    <Icon className="h-4 w-4" />
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-auto p-2">
                    {/* Three rows tall: 3×36px of button plus the two 6px gaps between them. */}
                    <div className="no-scrollbar grid max-h-[120px] grid-cols-7 gap-1.5 overflow-y-auto">
                      {TRADE_ICON_KEYS.map(key => {
                        const Option = TRADE_ICONS[key].icon
                        const selected = draft!.icon === key
                        const taken = takenIcons.has(key as TradeIconKey)
                        return (
                          <button
                            key={key}
                            onClick={() => { patch({ icon: key as TradeIconKey }); setPickingIcon(false) }}
                            disabled={taken}
                            title={taken ? `${TRADE_ICONS[key].label} — already used by another trade` : TRADE_ICONS[key].label}
                            aria-label={TRADE_ICONS[key].label}
                            aria-pressed={selected}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30"
                            }`}
                          >
                            <Option className="h-4 w-4" />
                          </button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-[3] flex-col gap-1.5">
                <Label htmlFor="trade-name">Name</Label>
                <Input
                  id="trade-name"
                  value={draft.name}
                  onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Plumbing"
                />
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="trade-code">Document code</Label>
                <Input
                  id="trade-code"
                  value={draft.code ?? ""}
                  onChange={e => patch({ code: e.target.value.trim() || null })}
                  placeholder="e.g. BRF-PLB"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-start justify-between gap-4 rounded-lg border p-3">
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

            <div className="flex shrink-0 flex-col gap-1.5">
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
            )}
          </section>

          {/* ── Document content ─────────────────────────────────────────
              The tab bar doubles as this section's header: picking a tab is
              what opens it. */}
          <Tabs
            // Collapsed, the value points at no tab at all — nothing should read as
            // active while its panel is out of sight.
            value={openSection === "content" ? tab : ""}
            onValueChange={v => { if (v) { setTab(v); setOpenSection("content") } }}
            className={`flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 ${
              openSection === "content" ? "min-h-0 flex-1" : "shrink-0"
            }`}
          >
            {/* 6px padding + 28px trigger = the same 40px as every other container header. */}
            <TabsList
              onClick={() => setOpenSection("content")}
              className={`h-auto! w-full shrink-0 gap-1 rounded-none bg-transparent p-1.5 ${
                openSection === "content" ? "border-b border-border/50" : ""
              }`}
            >
              <TabsTrigger value="scope" className="h-7 flex-1">
                <FileText className="h-3.5 w-3.5" />
                Standard scope
              </TabsTrigger>
              <TabsTrigger value="questions" className="h-7 flex-1">
                <ListChecks className="h-3.5 w-3.5" />
                Questionnaire
                <span className="text-xs text-muted-foreground">{draft.questions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="rules" className="h-7 flex-1">
                <GitBranch className="h-3.5 w-3.5" />
                Rules
                <span className="text-xs text-muted-foreground">{draft.rules.length}</span>
              </TabsTrigger>

              <button
                onClick={e => { e.stopPropagation(); setOpenSection(openSection === "content" ? "details" : "content") }}
                aria-expanded={openSection === "content"}
                aria-label={openSection === "content" ? "Collapse document content" : "Expand document content"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${openSection === "content" ? "rotate-180" : ""}`} />
              </button>
            </TabsList>

            {openSection === "content" && (
              <>
            <TabsContent value="scope" className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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

            <TabsContent value="questions" className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
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

            <TabsContent value="rules" className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
              <RuleList trade={draft} onChange={v => patch({ rules: v })} />
            </TabsContent>
              </>
            )}
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
