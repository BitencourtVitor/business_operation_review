import { qbtimeDailyService } from "@/services/qbtime.service"
import type { QBTimeDailyReport } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useQBTimeDailyReports(company?: string) {
  return useQuery({
    queryKey: ["qbtime-daily", company],
    queryFn: () => qbtimeDailyService.list(company),
    enabled: !!company,
  })
}

export function useQBTimeDailyReport(id: string) {
  return useQuery({
    queryKey: ["qbtime-daily", "detail", id],
    queryFn: () => qbtimeDailyService.get(id),
    enabled: !!id,
  })
}

export function useSaveQBTimeDailyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Pick<QBTimeDailyReport, "company" | "date" | "fileName"> & {
      entries: QBTimeDailyReport["entries"]
    }) => qbtimeDailyService.create(data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["qbtime-daily", vars.company] })
    },
  })
}

export function useDeleteQBTimeDailyReport(company?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => qbtimeDailyService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qbtime-daily", company] })
    },
  })
}
