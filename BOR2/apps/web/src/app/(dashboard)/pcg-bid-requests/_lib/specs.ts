import { FORM_LAYOUT } from "./form-layout"
import { quantityKey } from "./types"
import type { ProjectTrade, Question, Trade } from "./types"

export type SpecRow = { questionId: string; label: string; value: string }
export type SpecGroup = { title: string; rows: SpecRow[] }

// What the sub actually answered, read back as a sentence instead of a form.
// The bid request prints every option with a box; the contract only carries what
// was chosen — an unticked box is not a term of the agreement.
function answerText(question: Question, answers: ProjectTrade["answers"]): string {
  const value = answers[question.id]
  const chosen = Array.isArray(value) ? value.join(", ") : (value ?? "").trim()
  if (!chosen) return ""

  const qty = answers[quantityKey(question.id)]
  if (question.needsQuantity && typeof qty === "string" && qty.trim()) {
    return `${chosen} (qty ${qty.trim()}${question.hint ? ` ${question.hint}` : ""})`
  }
  return chosen
}

// Grouped the way the bid form groups them, so the sub reads the contract in the
// same order they priced it. Trades with no printed layout fall back to one
// block, which is what the bid request does too.
export function resolveSpecs(trade: Trade, answers: ProjectTrade["answers"]): SpecGroup[] {
  const byId = new Map(trade.questions.map(q => [q.id, q]))
  const layout = FORM_LAYOUT[trade.name]

  const groups: { title: string; questions: Question[] }[] = layout
    ? layout.sections.map(s => ({
        title: s.title,
        questions: s.questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q),
      }))
    // No printed layout means no grouping to mirror: one untitled block, so the
    // contract does not print a heading that only repeats the section above it.
    : [{ title: "", questions: trade.questions }]

  // Questions outside the printed layout still belong in the contract: leaving a
  // priced answer out would make the paper narrower than the deal.
  const laidOut = new Set(groups.flatMap(g => g.questions.map(q => q.id)))
  const loose = trade.questions.filter(q => !laidOut.has(q.id))
  if (loose.length) groups.push({ title: "ADDITIONAL SPECIFICATIONS", questions: loose })

  return groups
    .map(g => ({
      title: g.title,
      rows: g.questions
        .map(q => ({ questionId: q.id, label: q.label, value: answerText(q, answers) }))
        .filter(r => r.value),
    }))
    .filter(g => g.rows.length > 0)
}
