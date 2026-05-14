import { useQuery } from "@tanstack/react-query"
import { weeklyReportService } from "@/services/qbtime-weekly-report.service"

export function useQBTimeWeeklyReport(company: string, date: string, enabled: boolean) {
  return useQuery({
    queryKey:  ["qbtime-weekly-report", company, date],
    queryFn:   () => weeklyReportService.get(company, date),
    enabled:   enabled && !!company && !!date,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
