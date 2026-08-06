import { useQuery } from "@tanstack/react-query"
import { absenceService } from "@/services/qbtime-absence.service"

export function useAttendance(company: string, week?: string) {
  return useQuery({
    queryKey: ["qbtime-attendance", company, week ?? "current"],
    queryFn:  () => absenceService.attendance(company, week),
    enabled:  !!company,
    staleTime: 60_000,
  })
}

export function useAbsences(company: string, days?: number) {
  return useQuery({
    queryKey: ["qbtime-absences", company, days ?? null],
    queryFn:  () => absenceService.get(company, days),
    enabled:  !!company,
    staleTime: 60_000,
  })
}
