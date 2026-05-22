import { useQuery } from "@tanstack/react-query"
import { periodReportService } from "@/services/qbtime-period-report.service"

export function usePayPeriods(company: string, enabled = true) {
  return useQuery({
    queryKey: ["qbtime-period-report", "periods", company],
    queryFn:  () => periodReportService.getPeriods(company),
    enabled:  enabled && !!company,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePeriodIntervals(
  company: string,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["qbtime-period-report", "intervals", company, startDate, endDate],
    queryFn:  () => periodReportService.getIntervals(company, startDate, endDate),
    enabled:  enabled && !!company && !!startDate && !!endDate,
    staleTime: 0,
  })
}

export function usePeriodAccounting(
  company: string,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["qbtime-period-report", "accounting", company, startDate, endDate],
    enabled:  enabled && !!company && !!startDate && !!endDate,
    queryFn:  () => periodReportService.getAccounting(company, startDate, endDate),
    staleTime: 0,
  })
}
