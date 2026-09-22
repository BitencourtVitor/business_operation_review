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

export function useForecastObs(id: string, enabled = true) {
  return useQuery({
    queryKey: ["forecast", id, "obs"],
    queryFn: () => forecastService.listObs(id),
    enabled: !!id && enabled,
  })
}

/**
 * Publica um comentário e recarrega as duas telas que o mostram: a conversa no
 * painel e o cartão da obra, que passa a exibir o comentário mais recente.
 */
export function useAddForecastObs(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => forecastService.addObs(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["forecast", id, "obs"] })
      void qc.invalidateQueries({ queryKey: ["forecast"] })
    },
  })
}

/** Editar e apagar recarregam as mesmas duas telas que publicar. */
export function useEditForecastObs(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obsId, body }: { obsId: number; body: string }) =>
      forecastService.editObs(id, obsId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["forecast", id, "obs"] })
      void qc.invalidateQueries({ queryKey: ["forecast"] })
    },
  })
}

export function useRemoveForecastObs(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (obsId: number) => forecastService.removeObs(id, obsId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["forecast", id, "obs"] })
      void qc.invalidateQueries({ queryKey: ["forecast"] })
    },
  })
}

export function useForecastDateHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: ["forecast", id, "date-history"],
    queryFn: () => forecastService.listDateHistory(id),
    enabled: !!id && enabled,
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

export function useHVACActuals() {
  return useQuery({
    queryKey: ["forecast", "hvac-actuals"],
    queryFn: () => forecastService.listHVACActuals(),
  })
}

export function useSetHVACActual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, stage, actualStart, actualEnd, note }: {
      id: string
      stage: string
      actualStart: string | null
      actualEnd: string | null
      note: string
    }) => forecastService.setHVACActual(id, stage, { actualStart, actualEnd, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast", "hvac-actuals"] }),
  })
}

export function useUpdateHVACStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dates, note }: { id: string; dates: Record<string, string | null>; note: string }) =>
      forecastService.updateHVACStages(id, dates, note),
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

export function useTogglePermit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ permitId, status }: { permitId: number; status: string }) =>
      forecastService.togglePermit(permitId, status),
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
