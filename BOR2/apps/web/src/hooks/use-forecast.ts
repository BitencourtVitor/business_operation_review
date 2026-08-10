import { forecastService } from "@/services/forecast.service"
import type { ForecastFilters, } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useForecast(filters?: Partial<ForecastFilters>) {
  return useQuery({
    queryKey: ["forecast", filters],
    queryFn: () => forecastService.list(filters),
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

export function useToggleFieldwire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fwId, status }: { fwId: number; status: string }) =>
      forecastService.toggleFieldwire(fwId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useToggleMachine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ machId, status }: { machId: number; status: string }) =>
      forecastService.toggleMachine(machId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useUpdateMachineUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ machId, unit }: { machId: number; unit: string }) =>
      forecastService.updateMachineUnit(machId, unit),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useToggleContractStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, status }: { stepId: number; status: boolean }) =>
      forecastService.toggleContractStep(stepId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useCreateContractStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, team, step }: { projectId: string; team: string; step: string }) =>
      forecastService.createContractStep(projectId, team, step),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useDeleteContractTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, team }: { projectId: string; team: string }) =>
      forecastService.deleteContractTeam(projectId, team),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}

export function useAddContractTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, team }: { projectId: string; team: string }) =>
      forecastService.addContractTeam(projectId, team),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast"] }),
  })
}
