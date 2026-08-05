"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, CircleDot, Info, List, Tag, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DeleteButton } from "./delete-button"
import { QUESTION_TYPE_LABEL, TAG_LABEL } from "../_lib/types"
import type { Question, QuestionTag, QuestionType } from "../_lib/types"

const TYPES: QuestionType[] = ["select", "yn", "multi", "text"]
const TAGS = ["none", "all_projects", "optional"] as const

// A yes/no question can only answer from this set — the sub either does it, doesn't,
// or it is settled later. Free text there would make it something else entirely.
const YN_OPTIONS = ["Yes", "No", "To Be Defined"]

// Switching the answer type has to drag the options along, or a question ends up
// offering answers its own type can't produce.
function optionsForType(type: QuestionType, current: string[]): string[] {
  if (type === "text") return []
  if (type !== "yn") return current
  const kept = current.filter(o => YN_OPTIONS.includes(o))
  return kept.length ? kept : YN_OPTIONS
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>
}

function YesNoOptions({
  options, onChange,
}: {
  options: string[]
  onChange: (options: string[]) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 dark:bg-input/30">
      <List className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {YN_OPTIONS.map(opt => {
        const on = options.includes(opt)
        return (
          <button
            key={opt}
            aria-pressed={on}
            onClick={() => onChange(
              on ? options.filter(o => o !== opt) : YN_OPTIONS.filter(o => o === opt || options.includes(o))
            )}
            className={`flex h-6 items-center rounded-md border px-2 text-xs transition-colors ${
              on
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function OptionTags({
  options, onChange,
}: {
  options: string[]
  onChange: (options: string[]) => void
}) {
  const [pending, setPending] = useState("")

  function commit(value: string) {
    const next = value.trim()
    if (!next || options.includes(next)) return setPending("")
    onChange([...options, next])
    setPending("")
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
      <List className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      {options.map(opt => (
        <span
          key={opt}
          className="flex h-6 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-xs dark:bg-input/50"
        >
          {opt}
          <button
            onClick={() => onChange(options.filter(o => o !== opt))}
            aria-label={`Remove option ${opt}`}
            className="text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <input
        value={pending}
        onChange={e => setPending(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit(pending)
            return
          }
          // Backspace on an empty field eats the last tag — the usual chip behaviour.
          if (e.key === "Backspace" && !pending && options.length) {
            onChange(options.slice(0, -1))
          }
        }}
        onBlur={() => commit(pending)}
        placeholder={options.length ? "Add option" : "Type an option and press Enter"}
        className="h-6 min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

export function QuestionRow({
  question, index, isFirst, isLast, onChange, onMove, onRemove,
}: {
  question: Question
  index: number
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<Question>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const showOptions = question.type !== "text"

  return (
    // Level 3 of the nesting: panel → section (unfilled) → item (muted).
    <li className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/40 p-3">
      <div className="flex items-end gap-2">
        <span className="w-6 shrink-0 pb-1 text-right text-base font-semibold tabular-nums text-muted-foreground/60">
          {index + 1}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Question</FieldLabel>
          <Input
            value={question.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="Question / field label"
            className="text-sm"
          />
        </div>

        <div className="flex w-[165px] shrink-0 flex-col gap-1.5">
          <FieldLabel>Answer type</FieldLabel>
          <Select
            value={question.type}
            onValueChange={v => {
              if (!v) return
              const type = v as QuestionType
              onChange({ type, options: optionsForType(type, question.options) })
            }}
          >
            <SelectTrigger className="h-8 w-full">
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-left text-sm">{QUESTION_TYPE_LABEL[question.type]}</span>
            </SelectTrigger>
            <SelectContent>
              {TYPES.map(t => (
                <SelectItem key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex shrink-0 items-center pb-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Move up"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Move down"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <DeleteButton
            label="Remove question"
            confirm={question.label.trim().length > 0}
            onDelete={onRemove}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 pl-8">
        <div className="flex w-[155px] shrink-0 flex-col gap-1.5">
          <FieldLabel>Tag</FieldLabel>
          <Select
            value={question.tag ?? "none"}
            onValueChange={v => v && onChange({ tag: v === "none" ? null : (v as Exclude<QuestionTag, null>) })}
          >
            <SelectTrigger className="h-8 w-full">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-left text-sm">
                {question.tag ? TAG_LABEL[question.tag] : "No tag"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {TAGS.map(t => (
                <SelectItem key={t} value={t}>{t === "none" ? "No tag" : TAG_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <FieldLabel>Field note</FieldLabel>
          <div className="flex items-center gap-2 rounded-lg border border-input px-2.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={question.hint}
              onChange={e => onChange({ hint: e.target.value })}
              placeholder={showOptions ? "Note shown with the field" : "Placeholder / example"}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {showOptions && (
        <div className="flex flex-col gap-1.5 pl-8">
          <FieldLabel>{question.type === "yn" ? "Answers offered" : "Options"}</FieldLabel>
          {question.type === "yn"
            ? <YesNoOptions options={question.options} onChange={v => onChange({ options: v })} />
            : <OptionTags options={question.options} onChange={v => onChange({ options: v })} />}
        </div>
      )}
    </li>
  )
}
