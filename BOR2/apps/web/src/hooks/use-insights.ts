import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  insightsService,
  type DestaqueInput,
  type OportunidadeInput,
  type PlanoDeAcaoInput,
} from "@/services/insights.service"

// ── Destaques ─────────────────────────────────────────────────────────────────

export function useDestaques(telaId: string, mes?: number, ano?: number, usuarioId?: string) {
  return useQuery({
    queryKey:  ["destaques", telaId, mes ?? 0, ano ?? 0, usuarioId],
    queryFn:   () => insightsService.listDestaques(telaId, mes ?? 0, ano ?? 0, usuarioId),
    enabled:   !!telaId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateDestaque() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DestaqueInput) => insightsService.createDestaque(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["destaques"] }),
  })
}

export function useUpdateDestaque() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DestaqueInput }) =>
      insightsService.updateDestaque(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["destaques"] }),
  })
}

export function useDeleteDestaque() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => insightsService.deleteDestaque(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["destaques"] }),
  })
}

// ── Oportunidades ─────────────────────────────────────────────────────────────

export function useOportunidades(telaId: string, mes?: number, ano?: number, usuarioId?: string) {
  return useQuery({
    queryKey:  ["oportunidades", telaId, mes ?? 0, ano ?? 0, usuarioId],
    queryFn:   () => insightsService.listOportunidades(telaId, mes ?? 0, ano ?? 0, usuarioId),
    enabled:   !!telaId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateOportunidade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: OportunidadeInput) => insightsService.createOportunidade(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  })
}

export function useUpdateOportunidade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: OportunidadeInput }) =>
      insightsService.updateOportunidade(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  })
}

export function useDeleteOportunidade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => insightsService.deleteOportunidade(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  })
}

// ── Planos de Ação ────────────────────────────────────────────────────────────

export function usePlanos(telaId: string, usuarioId?: string) {
  return useQuery({
    queryKey:  ["planos", telaId, usuarioId],
    queryFn:   () => insightsService.listPlanos(telaId, usuarioId),
    enabled:   !!telaId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreatePlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PlanoDeAcaoInput) => insightsService.createPlano(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["planos"] }),
  })
}

export function useUpdatePlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PlanoDeAcaoInput }) =>
      insightsService.updatePlano(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planos"] }),
  })
}

export function useDeletePlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => insightsService.deletePlano(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["planos"] }),
  })
}
