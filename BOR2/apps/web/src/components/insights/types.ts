'use client'

export interface InsightsPanelProps {
  open:     boolean
  onClose:  () => void
  pageKey:  string
  mes:      number
  ano:      number
  userId:   string
  canWrite: boolean
}

export type InsightsConfig = Omit<InsightsPanelProps, 'open' | 'onClose'>
