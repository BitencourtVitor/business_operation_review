import { qbtimeTeamService } from "@/services/qbtime.service"
import type { QBTimeTeam } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useQBTimeTeams(company?: string) {
  return useQuery({
    queryKey: ["qbtime-teams", company],
    queryFn:  () => qbtimeTeamService.list(company!),
    enabled:  !!company,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateQBTimeTeam(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; members: string[] }) =>
      qbtimeTeamService.create({ ...data, company }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["qbtime-teams", company] })
      const prev = qc.getQueryData<QBTimeTeam[]>(["qbtime-teams", company])
      qc.setQueryData<QBTimeTeam[]>(["qbtime-teams", company], old => [
        ...(old ?? []),
        { id: `tmp-${Date.now()}`, company, name: data.name, members: data.members, createdAt: new Date().toISOString() },
      ])
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["qbtime-teams", company], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["qbtime-teams", company] }),
  })
}

export function useUpdateQBTimeTeam(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, members }: { id: string; name: string; members: string[] }) =>
      qbtimeTeamService.update(id, { name, members }),
    // Optimistic update so the UI feels instant
    onMutate: async ({ id, name, members }) => {
      await qc.cancelQueries({ queryKey: ["qbtime-teams", company] })
      const prev = qc.getQueryData<QBTimeTeam[]>(["qbtime-teams", company])
      qc.setQueryData<QBTimeTeam[]>(["qbtime-teams", company], old =>
        (old ?? []).map(t => t.id === id ? { ...t, name, members } : t)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["qbtime-teams", company], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["qbtime-teams", company] }),
  })
}

export function useDeleteQBTimeTeam(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => qbtimeTeamService.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["qbtime-teams", company] }),
  })
}
