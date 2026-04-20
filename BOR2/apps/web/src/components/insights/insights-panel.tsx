'use client'

import { useState, useCallback } from "react"
import { Lightbulb, Loader2, TrendingUp, ClipboardList, X } from "lucide-react"
import { useScreens } from "@/hooks/use-settings"
import { Section } from "./section"
import { HighlightsSection } from "./highlights-section"
import { OportunidadesSection } from "./opportunities-section"
import { ActionPlansSection } from "./action-plans-section"
import type { InsightsPanelProps, InsightsConfig } from "./types"

export type { InsightsPanelProps, InsightsConfig }

// ── Main panel ────────────────────────────────────────────────────────────────

export function InsightsPanel({ open, onClose, pageKey, mes, ano, userId, canWrite }: InsightsPanelProps) {
  const { data: screens = [], isLoading: screensLoading } = useScreens()
  const telaId = screens.find(s => s.description.toLowerCase() === pageKey.toLowerCase())?.id ?? ""

  const [activeSection, setActiveSection] = useState<"highlights" | "opportunities" | "plans" | null>("highlights")
  const toggle = (s: "highlights" | "opportunities" | "plans") => setActiveSection(v => v === s ? null : s)

  return (
    <div
      className={`flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-300 ease-in-out ${
        open ? 'ml-4 w-72 border-border opacity-100' : 'ml-0 w-0 border-transparent opacity-0'
      }`}
      style={{ backgroundColor: 'color-mix(in oklab, var(--color-card) 60%, transparent)' }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <Lightbulb className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-300" />
        <span className="text-sm font-semibold">Insights</span>
        <button
          onClick={onClose}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {screensLoading ? (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !telaId ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
            <Lightbulb className="h-6 w-6 opacity-20" />
            <p className="font-medium">Screen not configured</p>
            <p className="opacity-60">No insights screen registered for "{pageKey}"</p>
          </div>
        ) : (
          <>
            <Section title="Highlights" icon={TrendingUp} open={activeSection === "highlights"} onToggle={() => toggle("highlights")}>
              <HighlightsSection telaId={telaId} mes={mes} ano={ano} userId={userId} canWrite={canWrite} />
            </Section>
            <Section title="Opportunities" icon={Lightbulb} open={activeSection === "opportunities"} onToggle={() => toggle("opportunities")}>
              <OportunidadesSection telaId={telaId} mes={mes} ano={ano} userId={userId} canWrite={canWrite} />
            </Section>
            <Section title="Action Plans" icon={ClipboardList} open={activeSection === "plans"} onToggle={() => toggle("plans")}>
              <ActionPlansSection telaId={telaId} userId={userId} canWrite={canWrite} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

// ── useInsights ───────────────────────────────────────────────────────────────

export function useInsights(config: InsightsConfig) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen(v => !v), [])
  const close  = useCallback(() => setOpen(false),   [])

  const triggerButton = (
    <button
      onClick={toggle}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
        open
          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:border-yellow-400/50 dark:bg-yellow-400/10 dark:text-yellow-300"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Lightbulb className="h-3.5 w-3.5" />
      Insights
    </button>
  )

  const panel = (
    <InsightsPanel {...config} open={open} onClose={close} />
  )

  return { open, triggerButton, panel }
}
