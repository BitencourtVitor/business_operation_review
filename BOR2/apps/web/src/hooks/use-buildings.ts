import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  buildingsService,
  type ParsedScheduleStored,
} from "@/services/buildings.service"

// ─── Query Keys ───────────────────────────────────────────────────────────────

const KEYS = {
  list:     () => ["buildings"] as const,
  schedule: (id: string) => ["buildings", id, "schedule"] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useBuildings() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn:  () => buildingsService.list(),
    staleTime: 1000 * 60 * 2,
  })
}

export function useBuildingSchedule(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.schedule(buildingId ?? ""),
    queryFn:  () => buildingsService.getSchedule(buildingId!),
    enabled:  !!buildingId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, address }: { name: string; address: string }) =>
      buildingsService.create(name, address),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  })
}

export function useUpdateBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, address }: { id: string; name: string; address: string }) =>
      buildingsService.update(id, name, address),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  })
}

export function useDeleteBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => buildingsService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  })
}

export function useUpsertSchedule(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      pdfFilename, projectStart, projectFinish, scheduleData,
    }: {
      pdfFilename:   string
      projectStart:  string | null
      projectFinish: string | null
      scheduleData:  ParsedScheduleStored
    }) =>
      buildingsService.upsertSchedule(
        buildingId, pdfFilename, projectStart, projectFinish, scheduleData,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() })
      qc.invalidateQueries({ queryKey: KEYS.schedule(buildingId) })
    },
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (buildingId: string) => buildingsService.deleteSchedule(buildingId),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.list() })
      qc.invalidateQueries({ queryKey: KEYS.schedule(id) })
    },
  })
}
