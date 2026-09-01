"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  atlasService, uploadToR2,
  type AtlasAnnotation, type AtlasDailyLog, type AtlasDocument,
  type AtlasEvent, type AtlasJobsite, type AtlasLevel, type AtlasSheet,
} from "@/services/atlas.service"

const KEY = {
  jobsites: ["atlas", "jobsites"] as const,
  jobsite: (id: string) => ["atlas", "jobsite", id] as const,
  access: (id: string) => ["atlas", "access", id] as const,
  documents: (id: string) => ["atlas", "documents", id] as const,
  versions: (id: string) => ["atlas", "versions", id] as const,
  sheets: (id: string) => ["atlas", "sheets", id] as const,
  annotations: (id: string) => ["atlas", "annotations", id] as const,
  events: (id: string, sheetId?: string) => ["atlas", "events", id, sheetId ?? ""] as const,
  replies: (id: string) => ["atlas", "replies", id] as const,
  dailyLogs: (id: string) => ["atlas", "daily-logs", id] as const,
  media: (id: string) => ["atlas", "media", id] as const,
}

export function useAtlasJobsites() {
  return useQuery({ queryKey: KEY.jobsites, queryFn: atlasService.listJobsites })
}

export function useAtlasJobsite(id: string) {
  return useQuery({
    queryKey: KEY.jobsite(id),
    queryFn: () => atlasService.getJobsite(id),
    enabled: !!id,
  })
}

export function useCreateAtlasJobsite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasJobsite>) => atlasService.createJobsite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.jobsites }),
  })
}

export function useAtlasAccess(jobsiteId: string, enabled = true) {
  return useQuery({
    queryKey: KEY.access(jobsiteId),
    queryFn: () => atlasService.listAccess(jobsiteId),
    enabled: !!jobsiteId && enabled,
  })
}

export function useGrantAtlasAccess(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, level, expiresAt }: { userId: string; level: AtlasLevel; expiresAt?: string }) =>
      atlasService.grantAccess(jobsiteId, userId, level, expiresAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.access(jobsiteId) }),
  })
}

export function useRevokeAtlasAccess(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => atlasService.revokeAccess(jobsiteId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.access(jobsiteId) }),
  })
}

export function useAtlasDocuments(jobsiteId: string) {
  return useQuery({
    queryKey: KEY.documents(jobsiteId),
    queryFn: () => atlasService.listDocuments(jobsiteId),
    enabled: !!jobsiteId,
  })
}

export function useCreateAtlasDocument(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasDocument>) => atlasService.createDocument(jobsiteId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.documents(jobsiteId) }),
  })
}

export function useAtlasVersions(documentId: string) {
  return useQuery({
    queryKey: KEY.versions(documentId),
    queryFn: () => atlasService.listVersions(documentId),
    enabled: !!documentId,
  })
}

export function useAtlasSheets(versionId: string) {
  return useQuery({
    queryKey: KEY.sheets(versionId),
    queryFn: () => atlasService.listSheets(versionId),
    enabled: !!versionId,
  })
}

export function useUpdateAtlasSheet(versionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sheetId, patch }: { sheetId: string; patch: Partial<AtlasSheet> }) =>
      atlasService.updateSheet(sheetId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.sheets(versionId) }),
  })
}

/**
 * O ciclo inteiro de uma revisão nova: abre a versão, sobe o arquivo direto no
 * bucket e confirma.
 *
 * As três etapas ficam juntas porque separá-las convida ao estado órfão — uma
 * versão `pending` sem arquivo, que é exatamente o que o `status` da tabela
 * existe para tornar visível. `onProgress` recebe a etapa para a tela poder
 * dizer em qual delas está, já que a do meio pode levar minutos numa internet
 * de obra.
 */
export function useUploadAtlasVersion(documentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, revision, notes, onProgress }: {
      file: File
      revision: string
      notes?: string
      onProgress?: (step: "opening" | "uploading" | "confirming") => void
    }) => {
      const contentType = file.type || "application/pdf"
      onProgress?.("opening")
      const ticket = await atlasService.openVersion(documentId, {
        revision, fileName: file.name, contentType, byteSize: file.size, notes,
      })
      onProgress?.("uploading")
      await uploadToR2(ticket.uploadUrl, file, contentType)
      onProgress?.("confirming")
      return atlasService.confirmVersion(ticket.versionId, {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.versions(documentId) })
      qc.invalidateQueries({ queryKey: ["atlas", "documents"] })
    },
  })
}

export function usePublishAtlasVersion(documentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => atlasService.publishVersion(versionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.versions(documentId) }),
  })
}

export function useAtlasAnnotations(sheetId: string) {
  return useQuery({
    queryKey: KEY.annotations(sheetId),
    queryFn: () => atlasService.listAnnotations(sheetId),
    enabled: !!sheetId,
  })
}

export function useCreateAtlasAnnotation(sheetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasAnnotation>) => atlasService.createAnnotation(sheetId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.annotations(sheetId) }),
  })
}

export function useDeleteAtlasAnnotation(sheetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (annotationId: string) => atlasService.deleteAnnotation(annotationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.annotations(sheetId) }),
  })
}

export function useAtlasEvents(jobsiteId: string, sheetId?: string) {
  return useQuery({
    queryKey: KEY.events(jobsiteId, sheetId),
    queryFn: () => atlasService.listEvents(jobsiteId, sheetId),
    enabled: !!jobsiteId,
  })
}

export function useCreateAtlasEvent(jobsiteId: string, sheetId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasEvent>) => atlasService.createEvent(jobsiteId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.events(jobsiteId, sheetId) })
      qc.invalidateQueries({ queryKey: KEY.jobsite(jobsiteId) })
    },
  })
}

export function useUpdateAtlasEvent(jobsiteId: string, sheetId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, patch }: { eventId: string; patch: Record<string, unknown> }) =>
      atlasService.updateEvent(eventId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.events(jobsiteId, sheetId) })
      qc.invalidateQueries({ queryKey: KEY.jobsite(jobsiteId) })
    },
  })
}

export function useAtlasReplies(eventId: string) {
  return useQuery({
    queryKey: KEY.replies(eventId),
    queryFn: () => atlasService.listReplies(eventId),
    enabled: !!eventId,
  })
}

export function useCreateAtlasReply(eventId: string, jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => atlasService.createReply(eventId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.replies(eventId) })
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
    },
  })
}

export function useAtlasDailyLogs(jobsiteId: string) {
  return useQuery({
    queryKey: KEY.dailyLogs(jobsiteId),
    queryFn: () => atlasService.listDailyLogs(jobsiteId),
    enabled: !!jobsiteId,
  })
}

export function useCreateAtlasDailyLog(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasDailyLog>) => atlasService.createDailyLog(jobsiteId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.dailyLogs(jobsiteId) }),
  })
}

export function useAtlasMedia(jobsiteId: string, filter?: { eventId?: string; dailyLogId?: string }) {
  return useQuery({
    queryKey: [...KEY.media(jobsiteId), filter?.eventId ?? "", filter?.dailyLogId ?? ""],
    queryFn: () => atlasService.listMedia(jobsiteId, filter),
    enabled: !!jobsiteId,
  })
}

/** Mesmo ciclo do documento, para foto/áudio/vídeo do campo. */
export function useUploadAtlasMedia(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, eventId, dailyLogId, caption }: {
      file: File; eventId?: string; dailyLogId?: string; caption?: string
    }) => {
      const contentType = file.type || "application/octet-stream"
      const kind = contentType.startsWith("image/") ? "photo"
        : contentType.startsWith("video/") ? "video"
        : contentType.startsWith("audio/") ? "audio"
        : "file"
      const ticket = await atlasService.openMedia(jobsiteId, {
        eventId, dailyLogId, kind, fileName: file.name, contentType, byteSize: file.size, caption,
      })
      await uploadToR2(ticket.uploadUrl, file, contentType)
      return atlasService.confirmMedia(ticket.mediaId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.media(jobsiteId) })
      qc.invalidateQueries({ queryKey: KEY.dailyLogs(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
    },
  })
}
