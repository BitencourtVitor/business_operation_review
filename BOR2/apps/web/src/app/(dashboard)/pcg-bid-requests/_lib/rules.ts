import type { ProjectTrade, ScopeRule, ScopeSection, Trade } from "./types"

export type ResolvedScope = Record<ScopeSection, string[]>

function matches(rule: ScopeRule, answers: ProjectTrade["answers"]): boolean {
  const value = answers[rule.questionId]
  const filled = Array.isArray(value) ? value.length > 0 : !!(value && value.trim())

  switch (rule.operator) {
    case "answered":     return filled
    case "not_answered": return !filled
    case "includes":     return Array.isArray(value)
      ? value.includes(rule.value)
      : typeof value === "string" && value.toLowerCase().includes(rule.value.toLowerCase())
    case "equals":       return Array.isArray(value) ? value.length === 1 && value[0] === rule.value : value === rule.value
  }
}

// Baseline lists first, then every matching rule folded in — a document is the
// standard scope plus whatever the answers turned on or off.
export function resolveScope(trade: Trade, answers: ProjectTrade["answers"]): ResolvedScope {
  const scope: ResolvedScope = {
    workIncluded:         [...trade.workIncluded],
    exclusions:           [...trade.exclusions],
    responsibilityMatrix: [...trade.responsibilityMatrix],
  }

  for (const rule of trade.rules) {
    if (!matches(rule, answers)) continue

    if (rule.action !== "add" && rule.replaces.trim()) {
      scope[rule.target] = scope[rule.target].filter(c => c !== rule.replaces)
    }
    if (rule.action !== "remove") {
      scope[rule.target].push(...rule.clauses.filter(c => c.trim()))
    }
  }

  return scope
}

export function nextRuleId(trade: Trade): string {
  const used = new Set(trade.rules.map(r => r.id))
  let n = trade.rules.length + 1
  while (used.has(`r${n}`)) n++
  return `r${n}`
}
