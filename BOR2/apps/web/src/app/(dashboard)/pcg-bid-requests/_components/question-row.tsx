"use client"

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { QUESTION_TYPE_LABEL, TAG_LABEL } from "../_lib/types"
import type { Question, QuestionTag, QuestionType } from "../_lib/types"

const TYPES: QuestionType[] = ["select", "yn", "multi", "text"]
const TAGS = ["none", "all_projects", "optional"] as const

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
    <li className="flex flex-col gap-2 rounded-lg border bg-card/50 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
        <Input
          value={question.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Question / field label"
          className="flex-1 text-sm"
        />
        <div className="flex shrink-0 items-center">
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
          <button
            onClick={onRemove}
            aria-label="Remove question"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pl-7">
        <Select value={question.type} onValueChange={v => v && onChange({ type: v as QuestionType })}>
          <SelectTrigger className="h-8 w-[150px]">
            <span className="flex-1 truncate text-left text-sm">{QUESTION_TYPE_LABEL[question.type]}</span>
          </SelectTrigger>
          <SelectContent>
            {TYPES.map(t => (
              <SelectItem key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={question.tag ?? "none"}
          onValueChange={v => v && onChange({ tag: v === "none" ? null : (v as Exclude<QuestionTag, null>) })}
        >
          <SelectTrigger className="h-8 w-[140px]">
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

        <Input
          value={question.hint}
          onChange={e => onChange({ hint: e.target.value })}
          placeholder={showOptions ? "Note shown with the field" : "Placeholder / example"}
          className="h-8 min-w-[180px] flex-1 text-sm"
        />
      </div>

      {showOptions && (
        <div className="pl-7">
          <Textarea
            value={question.options.join("\n")}
            onChange={e => onChange({ options: e.target.value.split("\n").map(o => o.trim()).filter(Boolean) })}
            rows={Math.min(Math.max(question.options.length, 2), 8)}
            placeholder="One option per line"
            className="min-h-0 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">One option per line</p>
        </div>
      )}
    </li>
  )
}
