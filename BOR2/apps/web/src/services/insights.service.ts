import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DestaqueItem {
  id:          string
  destaqueId:  string
  texto:       string
}

export interface Destaque {
  id:             string
  usuarioId:      string
  telaId:         string
  mes:            number
  ano:            number
  criadoEm:       string
  updatedAt:      string
  updatedById:    string
  criadoPorNome:  string
  editadoPorNome: string
  positivos:      DestaqueItem[]
  negativos:      DestaqueItem[]
}

export interface Oportunidade {
  id:             string
  usuarioId:      string
  telaId:         string
  mes:            number
  ano:            number
  titulo:         string
  criadoEm:       string
  updatedAt:      string
  updatedById:    string
  criadoPorNome:  string
  editadoPorNome: string
  desafios:       OportunidadeItem[]
  melhorias:      OportunidadeItem[]
}

export interface OportunidadeItem {
  id:             string
  oportunidadeId: string
  texto:          string
}

export interface Acao {
  id:          string
  planoId:     string
  titulo:      string
  responsavel: string
  status:      "pending" | "in_progress" | "done"
  dataLimite:  string | null
  criadoEm:    string
  updatedAt:   string
}

export interface PlanoDeAcao {
  id:             string
  usuarioId:      string
  telaId:         string
  titulo:         string
  descricao:      string
  dataInicio:     string | null
  dataFim:        string | null
  status:         string
  deletado:       boolean
  criadoEm:       string
  updatedAt:      string
  updatedById:    string
  criadoPorNome:  string
  editadoPorNome: string
  acoes:          Acao[]
}

// ── Input types ───────────────────────────────────────────────────────────────

export type DestaqueInput = {
  usuarioId: string
  telaId:    string
  mes:       number
  ano:       number
  positivos: { texto: string }[]
  negativos: { texto: string }[]
}

export type OportunidadeInput = {
  usuarioId: string
  telaId:    string
  mes:       number
  ano:       number
  titulo:    string
  desafios:  { texto: string }[]
  melhorias: { texto: string }[]
}

export type PlanoDeAcaoInput = {
  usuarioId:  string
  telaId:     string
  titulo:     string
  descricao:  string
  dataInicio: string | null
  dataFim:    string | null
  acoes:      { titulo: string; responsavel: string; status: string; dataLimite: string | null }[]
}

// ── Service ───────────────────────────────────────────────────────────────────

function q(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, String(v))
  }
  return p.toString() ? `?${p}` : ""
}

export const insightsService = {
  // Destaques
  listDestaques: (telaId: string, mes: number, ano: number, usuarioId?: string) =>
    api.get<Destaque[]>(`/api/v1/destaques${q({ telaId, mes, ano, usuarioId })}`, getToken()),
  createDestaque: (data: DestaqueInput) =>
    api.post<Destaque>("/api/v1/destaques", data, getToken()),
  updateDestaque: (id: string, data: DestaqueInput) =>
    api.put<Destaque>(`/api/v1/destaques/${id}`, data, getToken()),
  deleteDestaque: (id: string) =>
    api.delete<void>(`/api/v1/destaques/${id}`, getToken()),

  // Oportunidades
  listOportunidades: (telaId: string, mes: number, ano: number, usuarioId?: string) =>
    api.get<Oportunidade[]>(`/api/v1/oportunidades${q({ telaId, mes, ano, usuarioId })}`, getToken()),
  createOportunidade: (data: OportunidadeInput) =>
    api.post<Oportunidade>("/api/v1/oportunidades", data, getToken()),
  updateOportunidade: (id: string, data: OportunidadeInput) =>
    api.put<Oportunidade>(`/api/v1/oportunidades/${id}`, data, getToken()),
  deleteOportunidade: (id: string) =>
    api.delete<void>(`/api/v1/oportunidades/${id}`, getToken()),

  // Planos de Ação
  listPlanos: (telaId: string, usuarioId?: string) =>
    api.get<PlanoDeAcao[]>(`/api/v1/planos-de-acao${q({ telaId, usuarioId })}`, getToken()),
  createPlano: (data: PlanoDeAcaoInput) =>
    api.post<PlanoDeAcao>("/api/v1/planos-de-acao", data, getToken()),
  updatePlano: (id: string, data: PlanoDeAcaoInput) =>
    api.put<PlanoDeAcao>(`/api/v1/planos-de-acao/${id}`, data, getToken()),
  deletePlano: (id: string) =>
    api.delete<void>(`/api/v1/planos-de-acao/${id}`, getToken()),
}
