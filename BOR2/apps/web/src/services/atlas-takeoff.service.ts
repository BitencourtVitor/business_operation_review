import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

const base = "/api/v1/atlas"

export type TakeoffLevel = "base" | "set" | "project"
export type TakeoffTermKind = "abbreviation" | "symbol" | "tag"

/** Um verbete do dicionário do Takeoff (ATL-103). */
export interface TakeoffTerm {
  id: string
  level: TakeoffLevel
  documentId: string | null
  kind: TakeoffTermKind
  code: string
  meaning: string
  attrs: Record<string, unknown>
  source: "seed" | "extracted" | "manual"
  sheetId: string | null
  versionId: string | null
  updatedAt: string
}

export interface TakeoffExtraction {
  state: "running" | "done" | "failed"
  versionId: string
  startedAt: string
  error?: string
  counts?: Record<string, number>
}

export interface TakeoffDictionary {
  terms: TakeoffTerm[]
  extraction: TakeoffExtraction | null
}

/** Texto do PDF dentro de um recorte, com a caixa numa grade de 0 a 1000. */
export interface TakeoffAIText {
  text: string
  box: [number, number, number, number]
}

export interface TakeoffAIElement {
  kind: string
  tag: string
  label: string
  box: [number, number, number, number]
  units: number
  substrate: string
  confidence: number
  review: boolean
  reason: string
}

export interface TakeoffAILine {
  kind: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface TakeoffAIUsage {
  input: number
  output: number
  thoughts: number
  costUsd: number
}

export interface TakeoffAIResult {
  elements: TakeoffAIElement[]
  lines: TakeoffAILine[]
  model: string
  usage: TakeoffAIUsage
}

export const takeoffService = {
  dictionary: (documentId: string) =>
    api.get<TakeoffDictionary>(`${base}/documents/${documentId}/takeoff/dictionary`, getToken()),

  extract: (documentId: string, versionId: string) =>
    api.post<TakeoffExtraction>(`${base}/documents/${documentId}/takeoff/dictionary/extract`, { versionId }, getToken()),

  createTerm: (documentId: string, body: {
    level: "set" | "project"; kind: TakeoffTermKind; code: string; meaning: string; attrs?: Record<string, unknown>
  }) => api.post<{ id: string }>(`${base}/documents/${documentId}/takeoff/terms`, body, getToken()),

  updateTerm: (termId: string, body: { meaning?: string; attrs?: Record<string, unknown>; measured?: boolean }) =>
    api.patch<{ id: string }>(`${base}/takeoff/terms/${termId}`, body, getToken()),

  deleteTerm: (termId: string) =>
    api.delete<{ id: string }>(`${base}/takeoff/terms/${termId}`, getToken()),

  readTile: (sheetId: string, body: {
    image: string; mime: string; texts: TakeoffAIText[]; widthIn: number; heightIn: number
  }) => api.post<TakeoffAIResult>(`${base}/sheets/${sheetId}/takeoff/ai`, body, getToken()),
}
