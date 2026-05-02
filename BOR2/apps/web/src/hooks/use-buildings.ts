import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  buildingsService,
  type ParsedScheduleStored,
} from "@/services/buildings.service"

// ─── Query Keys ───────────────────────────────────────────────────────────────

const KEYS = {
  list:        () => ["buildings"] as const,
  schedule:    (id: string) => ["buildings", id, "schedule"] as const,
  history:     (id: string) => ["buildings", id, "history"] as const,
  rowMeta:     (id: string) => ["buildings", id, "row-meta"] as const,
  rowComments: (id: string) => ["buildings", id, "row-comments"] as const,
  events:      (id: string) => ["buildings", id, "events"] as const,
  trades:      (id: string) => ["buildings", id, "trades"] as const,
  eventTypes:  () => ["buildings", "event-types"] as const,
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

export function useScheduleHistory(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.history(buildingId ?? ""),
    queryFn:  () => buildingsService.getScheduleHistory(buildingId!),
    enabled:  !!buildingId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useScheduleRowMeta(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.rowMeta(buildingId ?? ""),
    queryFn:  () => buildingsService.getScheduleRowMeta(buildingId!),
    enabled:  !!buildingId,
    staleTime: 1000 * 30,
  })
}

export function useAllRowComments(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.rowComments(buildingId ?? ""),
    queryFn:  () => buildingsService.getAllRowComments(buildingId!),
    enabled:  !!buildingId,
    staleTime: 1000 * 30,
  })
}

export function useEventTypes() {
  return useQuery({
    queryKey: KEYS.eventTypes(),
    queryFn:  () => buildingsService.listEventTypes(),
    staleTime: 1000 * 60 * 60, // catalog is rarely changed
  })
}

export function useBuildingEvents(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.events(buildingId ?? ""),
    queryFn:  () => buildingsService.getBuildingEvents(buildingId!),
    enabled:  !!buildingId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useTradeOwnership(buildingId: string | null) {
  return useQuery({
    queryKey: KEYS.trades(buildingId ?? ""),
    queryFn:  () => buildingsService.getTradeOwnership(buildingId!),
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
      qc.invalidateQueries({ queryKey: KEYS.history(buildingId) })
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
      qc.invalidateQueries({ queryKey: KEYS.history(id) })
    },
  })
}

export function useUpsertScheduleRowMeta(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      rowId, patch,
    }: {
      rowId: number | string
      patch: {
        status?:      string
        observation?: string
        real_start?:  string | null
        real_finish?: string | null
        is_finished?: boolean
      }
    }) =>
      buildingsService.upsertScheduleRowMeta(buildingId, rowId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rowMeta(buildingId) }),
  })
}

export function useAddRowComment(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      rowId, body, userName, userRole,
    }: {
      rowId:    number | string
      body:     string
      userName: string
      userRole: string
    }) =>
      buildingsService.addRowComment(buildingId, rowId, body, userName, userRole),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rowComments(buildingId) }),
  })
}

export function useEditRowComment(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      buildingsService.editRowComment(buildingId, commentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rowComments(buildingId) }),
  })
}

export function useDeleteRowComment(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      buildingsService.deleteRowComment(buildingId, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rowComments(buildingId) }),
  })
}

export function useAddBuildingEvent(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      event_type_id: number
      event_date:    string
      days_delayed:  number
      notes:         string
    }) =>
      buildingsService.addBuildingEvent(buildingId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.events(buildingId) })
      qc.invalidateQueries({ queryKey: KEYS.list() })
    },
  })
}

export function useDeleteBuildingEvent(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) =>
      buildingsService.deleteBuildingEvent(buildingId, eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.events(buildingId) })
      qc.invalidateQueries({ queryKey: KEYS.list() })
    },
  })
}

export function useUpsertTradeOwnership(buildingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (trades: { trade_name: string; is_ours: boolean }[]) =>
      buildingsService.upsertTradeOwnership(buildingId, trades),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.trades(buildingId) }),
  })
}
