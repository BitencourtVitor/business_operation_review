import { useQuery } from "@tanstack/react-query"
import { absenceService } from "@/services/qbtime-absence.service"

export function useAbsences(company: string, days?: number) {
  return useQuery({
    queryKey: ["qbtime-absences", company, days ?? null],
    queryFn:  () => absenceService.get(company, days),
    enabled:  !!company,
    staleTime: 60_000,
  })
}
