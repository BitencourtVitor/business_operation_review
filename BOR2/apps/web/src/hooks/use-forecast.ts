import { forecastService } from "@/services/forecast.service"
import type { ForecastFilters, ForecastProject } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MOCK_FORECAST_PROJECTS } from "@/lib/mock-data"

export function useForecast(filters?: Partial<ForecastFilters>) {
  return useQuery({
    queryKey: ["forecast", filters],
    queryFn: async () => {
      try {
        const data = await forecastService.list(filters)
        return data && data.length > 0 ? data : MOCK_FORECAST_PROJECTS
      } catch {
        return MOCK_FORECAST_PROJECTS
      }
    },
  })
}

export function useForecastProject(id: string) {
  return useQuery({
    queryKey: ["forecast", id],
    queryFn: () => forecastService.get(id),
    enabled: !!id,
  })
}

export function useCreateForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: forecastService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useUpdateForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof forecastService.update>[1] }) =>
      forecastService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useDeleteForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: forecastService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}
