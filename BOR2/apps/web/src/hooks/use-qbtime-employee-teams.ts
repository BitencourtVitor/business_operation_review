import { qbtimeEmployeeTeamService } from "@/services/qbtime.service"
import type { QBTimeEmployeeTeam } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useQBTimeEmployeeTeams(company?: string) {
  return useQuery({
    queryKey: ["qbtime-employee-teams", company],
    queryFn:  () => qbtimeEmployeeTeamService.list(company!),
    enabled:  !!company,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSetQBTimeEmployeeTeamOverride(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, teamName }: { id: string; teamName: string }) =>
      qbtimeEmployeeTeamService.setOverride(id, teamName),
    onSuccess: updated => {
      qc.setQueryData<QBTimeEmployeeTeam[]>(["qbtime-employee-teams", company], old =>
        (old ?? []).map(t => t.id === updated.id ? updated : t)
      )
    },
  })
}

export function useClearQBTimeEmployeeTeamOverride(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => qbtimeEmployeeTeamService.clearOverride(id),
    onSuccess: updated => {
      qc.setQueryData<QBTimeEmployeeTeam[]>(["qbtime-employee-teams", company], old =>
        (old ?? []).map(t => t.id === updated.id ? updated : t)
      )
    },
  })
}

export function useSyncQBTimeEmployeeTeams(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => qbtimeEmployeeTeamService.sync(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qbtime-employee-teams", company] }),
  })
}
