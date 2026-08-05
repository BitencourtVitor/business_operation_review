"use client"

import { Check, Loader2, Minus, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { isAnswered } from "../_lib/projects-store"
import { quantityKey } from "../_lib/types"
import type { SaveState } from "../_lib/use-async-save"
import type { Question, ProjectTrade } from "../_lib/types"

function QuantityStepper({
  value, unit, onChange,
}: {
  value: string
  unit: string
  onChange: (value: string) => void
}) {
  // The question is only asked after a Yes, so one is the floor — zero would
  // contradict the answer above it.
  const current = Number.parseInt(value, 10)
  const n = Number.isNaN(current) ? 1 : Math.max(1, current)

  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-8 items-center rounded-lg border border-input dark:bg-input/30">
        <button
          onClick={() => onChange(String(Math.max(1, n - 1)))}
          disabled={n <= 1}
          aria-label="Decrease quantity"
          className="flex h-full w-7 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          value={value || String(n)}
          onChange={e => {
            const digits = e.target.value.replace(/\D/g, "")
            onChange(digits === "" || digits === "0" ? "1" : digits)
          }}
          inputMode="numeric"
          className="h-full w-10 bg-transparent text-center text-sm tabular-nums outline-none"
        />
        <button
          onClick={() => onChange(String(n + 1))}
          aria-label="Increase quantity"
          className="flex h-full w-7 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </span>
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </span>
  )
}

export function QuestionnaireForm({
  questions, answers, saveStateOf, onChange,
}: {
  questions: Question[]
  answers: ProjectTrade["answers"]
  saveStateOf: (questionId: string) => SaveState
  onChange: (questionId: string, value: string | string[]) => void
}) {
  if (questions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        This trade has no questions. Add them in the trade catalog.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {questions.map((q, i) => {
        const value = answers[q.id]
        const done = isAnswered(value)
        const saving = saveStateOf(q.id) === "saving"

        return (
          <li
            key={q.id}
            // Answered shows in the border and the check — tinting the whole card
            // as well turns a long questionnaire into a wall of green.
            className={`rounded-lg border bg-muted/40 p-3 transition-colors ${
              done ? "border-emerald-500/40" : "border-dashed"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`w-6 shrink-0 text-center text-base font-semibold tabular-nums ${
                done ? "text-emerald-500/70" : "text-muted-foreground/50"
              }`}>
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{q.label}</p>
                    {q.hint && <p className="mt-0.5 text-xs text-muted-foreground">{q.hint}</p>}
                  </div>
                  {/* "All projects" is noise — it applies to nearly every question. */}
                  {q.tag === "optional" && (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      Optional
                    </Badge>
                  )}
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {saving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      : done && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                  </span>
                </div>

                <div className={`mt-2 transition-opacity ${saving ? "opacity-60" : ""}`}>
                  {q.type === "text" ? (
                    <Input
                      value={typeof value === "string" ? value : ""}
                      onChange={e => onChange(q.id, e.target.value)}
                      placeholder={q.hint || "Answer"}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {q.options.map(opt => {
                        const list = Array.isArray(value) ? value : []
                        const on = q.type === "multi" ? list.includes(opt) : value === opt
                        return (
                          <button
                            key={opt}
                            aria-pressed={on}
                            onClick={() => {
                              if (q.type === "multi") {
                                onChange(q.id, on ? list.filter(o => o !== opt) : [...list, opt])
                                return
                              }
                              onChange(q.id, on ? "" : opt)
                              // Saying Yes to "Bathroom mirrors" means at least one —
                              // seed the count so it never reads as zero.
                              if (q.needsQuantity && !on && /^yes/i.test(opt) && !isAnswered(answers[quantityKey(q.id)])) {
                                onChange(quantityKey(q.id), "1")
                              }
                            }}
                            className={`flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors ${
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input text-muted-foreground hover:bg-accent hover:text-foreground dark:bg-input/30"
                            }`}
                          >
                            {opt}
                          </button>
                        )
                      })}

                      {/* The source form asked "qty: ___" alongside the yes/no —
                          only worth asking once the answer is affirmative. */}
                      {q.needsQuantity && typeof value === "string" && /^yes/i.test(value) && (
                        <>
                          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
                          <QuantityStepper
                            value={typeof answers[quantityKey(q.id)] === "string" ? (answers[quantityKey(q.id)] as string) : ""}
                            unit={q.hint}
                            onChange={v => onChange(quantityKey(q.id), v)}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
