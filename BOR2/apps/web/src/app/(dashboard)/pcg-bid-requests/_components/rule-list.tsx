"use client"

import { useState } from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PickerSearchList } from "./picker-list"
import { DeleteButton } from "./delete-button"
import {
  QUESTION_TYPE_LABEL, RULE_ACTION_LABEL, RULE_OPERATOR_LABEL, SCOPE_SECTION_LABEL,
} from "../_lib/types"
import type {
  Question, QuestionType, RuleAction, RuleOperator, ScopeRule, ScopeSection, Trade,
} from "../_lib/types"
import { nextRuleId } from "../_lib/rules"

const ACTIONS: RuleAction[] = ["add", "remove", "replace"]
const SECTIONS: ScopeSection[] = ["workIncluded", "exclusions", "responsibilityMatrix"]

// What can be asked of an answer depends on how the answer is collected: a single
// choice is compared, a multiple choice is searched, free text has no fixed value.
const OPERATORS_BY_TYPE: Record<QuestionType, RuleOperator[]> = {
  yn:     ["equals", "answered", "not_answered"],
  select: ["equals", "answered", "not_answered"],
  multi:  ["includes", "answered", "not_answered"],
  text:   ["answered", "not_answered", "includes"],
}

function defaultRule(trade: Trade, question: Question): ScopeRule {
  const operator = OPERATORS_BY_TYPE[question.type][0]
  return {
    id: nextRuleId(trade),
    questionId: question.id,
    operator,
    value: operator === "equals" || operator === "includes" ? (question.options[0] ?? "") : "",
    action: "add",
    target: "exclusions",
    clauses: [""],
    replaces: "",
  }
}

// Same shell as the question picker: a clause list is long prose, and a plain
// select gives no way to find the one you mean.
function ClausePicker({
  clauses, value, section, onPick,
}: {
  clauses: string[]
  value: string
  section: string
  onPick: (clause: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50">
        <span className={`min-w-0 flex-1 truncate text-left ${value ? "" : "text-muted-foreground"}`}>
          {value || `Pick the ${section.toLowerCase()} clause it takes out`}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent side="bottom" align="start" className="w-(--anchor-width) gap-0 p-0">
        <PickerSearchList
          options={clauses.map(c => ({ value: c, label: c }))}
          selected={value}
          placeholder={`Search ${section.toLowerCase()}…`}
          emptyLabel="No standard clause in this section."
          onPick={c => { onPick(c); setOpen(false) }}
        />
      </PopoverContent>
    </Popover>
  )
}

function summarize(rule: ScopeRule, question: Question): string {
  const condition = rule.operator === "answered" || rule.operator === "not_answered"
    ? `this ${RULE_OPERATOR_LABEL[rule.operator]}`
    : `the answer ${RULE_OPERATOR_LABEL[rule.operator]} "${rule.value || "…"}"`

  const section = SCOPE_SECTION_LABEL[rule.target]
  const count = rule.clauses.filter(c => c.trim()).length

  const effect =
    rule.action === "remove" ? `drops 1 clause from ${section}`
    : rule.action === "replace" ? `swaps 1 clause in ${section} for ${count}`
    : `adds ${count} ${count === 1 ? "clause" : "clauses"} to ${section}`

  return `When ${condition}, ${question.label || "this question"} ${effect}.`
}

function RuleRow({
  rule, index, question, trade, onChange, onRemove,
}: {
  rule: ScopeRule
  index: number
  question: Question
  trade: Trade
  onChange: (patch: Partial<ScopeRule>) => void
  onRemove: () => void
}) {
  const operators = OPERATORS_BY_TYPE[question.type]
  const needsValue = rule.operator === "equals" || rule.operator === "includes"
  const needsClauses = rule.action !== "remove"
  const needsTarget = rule.action !== "add"
  const baseline = trade[rule.target]

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}.</span>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">When the answer</span>

          <Select value={rule.operator} onValueChange={v => v && onChange({ operator: v as RuleOperator })}>
            <SelectTrigger className="h-8 w-[145px]">
              <span className="flex-1 truncate text-left text-sm">{RULE_OPERATOR_LABEL[rule.operator]}</span>
            </SelectTrigger>
            <SelectContent>
              {operators.map(op => (
                <SelectItem key={op} value={op}>{RULE_OPERATOR_LABEL[op]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {needsValue && (
            question.options.length > 0 ? (
              <Select value={rule.value} onValueChange={v => v && onChange({ value: v })}>
                <SelectTrigger className="h-8 w-[170px]">
                  <span className="flex-1 truncate text-left text-sm">{rule.value || "Pick an answer"}</span>
                </SelectTrigger>
                <SelectContent>
                  {question.options.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={rule.value}
                onChange={e => onChange({ value: e.target.value })}
                placeholder="Text to look for"
                className="h-8 w-[170px] text-sm"
              />
            )
          )}
        </div>

        <div className="mt-1 shrink-0">
          <DeleteButton
            label={`Remove rule ${index + 1}`}
            confirm={rule.clauses.some(c => c.trim()) || !!rule.replaces}
            onDelete={onRemove}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-7">
        <span className="text-xs text-muted-foreground">Then</span>

        <Select value={rule.action} onValueChange={v => v && onChange({ action: v as RuleAction })}>
          <SelectTrigger className="h-8 w-[160px]">
            <span className="flex-1 truncate text-left text-sm">{RULE_ACTION_LABEL[rule.action]}</span>
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map(a => (
              <SelectItem key={a} value={a}>{RULE_ACTION_LABEL[a]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">in</span>

        <Select value={rule.target} onValueChange={v => v && onChange({ target: v as ScopeSection, replaces: "" })}>
          <SelectTrigger className="h-8 w-[180px]">
            <span className="flex-1 truncate text-left text-sm">{SCOPE_SECTION_LABEL[rule.target]}</span>
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map(s => (
              <SelectItem key={s} value={s}>{SCOPE_SECTION_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsTarget && (
        <div className="pl-7">
          {baseline.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {SCOPE_SECTION_LABEL[rule.target]} has no standard clause to take out.
            </p>
          ) : (
            <ClausePicker
              clauses={baseline}
              value={rule.replaces}
              section={SCOPE_SECTION_LABEL[rule.target]}
              onPick={v => onChange({ replaces: v })}
            />
          )}
        </div>
      )}

      {needsClauses && (
        <div className="flex flex-col gap-2 pl-7">
          {rule.clauses.map((clause, i) => (
            <div
              key={i}
              className="relative flex items-stretch rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30"
            >
              <span className="flex w-8 shrink-0 items-start justify-end pr-1 pt-2 text-xs tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <textarea
                value={clause}
                onChange={e => onChange({ clauses: rule.clauses.map((c, idx) => (idx === i ? e.target.value : c)) })}
                rows={2}
                placeholder="Clause printed in the document"
                className="min-w-0 flex-1 resize-y bg-transparent py-1.5 pr-9 text-sm outline-none"
              />
              <DeleteButton
                // The last clause has nothing to delete into — the field stays and
                // only its text goes.
                label={rule.clauses.length > 1 ? `Remove clause ${i + 1}` : "Clear this clause"}
                mode={rule.clauses.length > 1 ? "delete" : "clear"}
                confirm={clause.trim().length > 0}
                floating
                onDelete={() => onChange({
                  clauses: rule.clauses.length > 1
                    ? rule.clauses.filter((_, idx) => idx !== i)
                    : [""],
                })}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onChange({ clauses: [...rule.clauses, ""] })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add clause
          </Button>
        </div>
      )}

      <p className="pl-7 text-[11px] text-muted-foreground">{summarize(rule, question)}</p>
    </li>
  )
}

function QuestionPicker({
  questions, label, onPick,
}: {
  questions: Question[]
  label: string
  onPick: (question: Question) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="self-start"
        render={<Button variant="outline" size="sm" />}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[320px] gap-0 p-0">
        <PickerSearchList
          options={questions.map(q => ({
            value: q.id,
            label: q.label || q.id,
            hint: QUESTION_TYPE_LABEL[q.type],
          }))}
          placeholder="Search questions…"
          emptyLabel="No question left to rule on."
          onPick={id => {
            const question = questions.find(q => q.id === id)
            if (question) onPick(question)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function RuleList({
  trade, onChange,
}: {
  trade: Trade
  onChange: (rules: ScopeRule[]) => void
}) {
  // Rules belong to the question that triggers them — grouping follows the
  // questionnaire's own order so the two screens read the same way.
  const groups = trade.questions
    .map((question, i) => ({
      question,
      number: i + 1,
      rules: trade.rules.filter(r => r.questionId === question.id),
    }))
    .filter(g => g.rules.length > 0)

  const orphans = trade.rules.filter(r => !trade.questions.some(q => q.id === r.questionId))
  const untouched = trade.questions.filter(q => !trade.rules.some(r => r.questionId === q.id))

  function patchRule(id: string, patch: Partial<ScopeRule>) {
    onChange(trade.rules.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No rule yet — the standard scope goes out unchanged, whatever the answers.
        </p>
      ) : (
        groups.map(({ question, number, rules }) => (
          <div
            key={question.id}
            className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/60"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
              <span className="shrink-0 text-base font-semibold tabular-nums text-muted-foreground/60">{number}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                {question.label || question.id}
              </span>
              <span className="shrink-0 text-xs leading-none text-muted-foreground">
                {QUESTION_TYPE_LABEL[question.type]}
              </span>
              <span className="shrink-0 text-xs leading-none text-muted-foreground">{rules.length}</span>
            </div>

            <div className="flex flex-col gap-2 p-4">
              <ol className="flex flex-col gap-2">
                {rules.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={i}
                    question={question}
                    trade={trade}
                    onChange={patch => patchRule(rule.id, patch)}
                    onRemove={() => onChange(trade.rules.filter(r => r.id !== rule.id))}
                  />
                ))}
              </ol>

              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => onChange([...trade.rules, defaultRule(trade, question)])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add rule
              </Button>
            </div>
          </div>
        ))
      )}

      {orphans.length > 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {orphans.length} rule{orphans.length > 1 ? "s" : ""} point at a question that no longer exists and will never fire.
        </p>
      )}

      {untouched.length > 0 && (
        <QuestionPicker
          questions={untouched}
          label="Rule on another question"
          onPick={question => onChange([...trade.rules, defaultRule(trade, question)])}
        />
      )}
    </div>
  )
}
