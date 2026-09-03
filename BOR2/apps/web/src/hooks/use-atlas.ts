"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { readPdfOutline } from "@/components/atlas/pdf-page"
import { splitAndUploadPlans, type PlanPart } from "@/components/atlas/plan-split"
import {
  atlasService, uploadToR2,
  type AtlasAnnotation, type AtlasDailyLog, type AtlasDocument,
  type AtlasDocCategory, type AtlasEvent, type AtlasJobsite, type AtlasLevel, type AtlasSheet,
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

/** As obras do Forecast que ainda podem virar obra do Atlas. */
export function useForecastJobsites(params?: { q?: string; company?: string; status?: string }) {
  return useQuery({
    queryKey: ["atlas", "forecast-jobsites", params?.q ?? "", params?.company ?? "", params?.status ?? ""],
    queryFn: () => atlasService.listForecastJobsites(params),
    staleTime: 60 * 1000,
  })
}

export function useImportAtlasJobsites() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (forecastIds: string[]) => atlasService.importJobsites(forecastIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.jobsites })
      qc.invalidateQueries({ queryKey: ["atlas", "forecast-jobsites"] })
    },
  })
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

export function useAtlasUserCompanies() {
  return useQuery({
    queryKey: ["atlas", "user-companies"],
    queryFn: atlasService.listUserCompanies,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSetAtlasUserCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, company }: { userId: string; company: string }) =>
      atlasService.setUserCompany(userId, company),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "user-companies"] }),
  })
}

export function useSetAtlasUserAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, level }: { userId: string; level: string }) =>
      atlasService.setAtlasUserAccess(userId, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "users"] }),
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

/**
 * O catálogo de documentos do Forecast, filtrado pelo cliente da obra.
 *
 * Mesma lista que o score de Fieldwire cobra — o Atlas não inventa taxonomia
 * própria, senão a empresa passa a ter duas respostas para "quais documentos
 * esta obra precisa ter".
 */
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

// As prévias da versão inteira, numa chamada só e guardadas por seis horas: a
// URL assinada dura mais que a sessão de leitura, e a lista as pede todas de uma
// vez porque é onde elas aparecem juntas.
export function useAtlasThumbs(versionId: string) {
  return useQuery({
    queryKey: ["atlas", "thumbs", versionId],
    queryFn: async () => {
      const rows = await atlasService.versionThumbs(versionId)
      return new Map(rows.map(r => [r.sheetId, r.url]))
    },
    enabled: !!versionId,
    staleTime: 30 * 60 * 1000,
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
    mutationFn: async ({ file, revision, notes, names, onProgress, onSheets, onPage }: {
      file: File
      revision: string
      notes?: string
      /** O nome de cada página, quando um gabarito já resolveu a nomenclatura. */
      names?: Map<number, string>
      onProgress?: (step: "opening" | "uploading" | "splitting" | "confirming", detail?: string) => void
      /** As folhas já existem no banco, ainda sem recorte: a página pode abrir. */
      onSheets?: (versionId: string, pageCount: number) => void
      /** Uma folha ficou pronta, com a prévia desenhada aqui mesmo. */
      onPage?: (pageIndex: number, preview: string) => void
    }) => {
      const contentType = file.type || "application/pdf"
      onProgress?.("opening")
      const ticket = await atlasService.openVersion(documentId, {
        revision, fileName: file.name, contentType, byteSize: file.size, notes,
      })
      onProgress?.("uploading")
      await uploadToR2(ticket.uploadUrl, file, contentType)

      onProgress?.("confirming")
      // A estrutura sai do próprio arquivo, no navegador: contagem de páginas e
      // tamanho da prancha. Uma linha de folha por página, sem número nem
      // disciplina — isso é leitura de carimbo (AT-12) e continua fora.
      let outline: { pageCount: number; width: number; height: number } | null = null
      try {
        outline = await readPdfOutline(file)
      } catch {
        // PDF que o pdf.js não abre não pode travar o upload: a versão fica
        // gravada e as folhas entram depois, pelo mesmo endpoint idempotente.
      }
      const confirmed = await atlasService.confirmVersion(ticket.versionId, {
        pageCount: outline?.pageCount ?? 0,
      })
      if (!outline) return confirmed

      // As folhas entram no banco antes do corte, com o nome que o gabarito já
      // leu e sem recorte nenhum. É o que permite fechar o modal aqui: a página
      // abre com os 97 quadros no lugar, e cada um se preenche quando a página
      // dele termina. Antes disto, quem subia um set ficava com o sistema
      // parado atrás de uma janela até o fim.
      await atlasService.replaceSheets(
        ticket.versionId,
        Array.from({ length: outline.pageCount }, (_, i) => ({
          pageIndex: i,
          widthPt: outline.width,
          heightPt: outline.height,
          r2Key: "",
          thumbKey: "",
          byteSize: 0,
          sheetNumber: names?.get(i) ?? "",
          needsReview: !names?.get(i),
        })),
      )
      onSheets?.(ticket.versionId, outline.pageCount)

      // Corte em um PDF por página, subindo cada um direto no bucket. É o que
      // faz abrir um plano custar 1,66 MB de mediana em vez dos 107 MB do set.
      onProgress?.("splitting", `0/${outline.pageCount}`)
      let parts: PlanPart[] = []
      try {
        parts = await splitAndUploadPlans(file, ticket.versionId, (done, count) => {
          onProgress?.("splitting", `${done}/${count}`)
        }, (part, preview) => onPage?.(part.pageIndex, preview))
      } catch {
        // Corte que falha não invalida a versão: o original está no bucket e as
        // folhas abrem por ele. O recorte pode ser refeito depois.
      }

      const byIndex = new Map(parts.map(p => [p.pageIndex, p]))
      await atlasService.replaceSheets(
        ticket.versionId,
        Array.from({ length: outline.pageCount }, (_, i) => ({
          pageIndex: i,
          widthPt: byIndex.get(i)?.widthPt ?? outline.width,
          heightPt: byIndex.get(i)?.heightPt ?? outline.height,
          r2Key: byIndex.get(i)?.r2Key ?? "",
          thumbKey: byIndex.get(i)?.thumbKey ?? "",
          byteSize: byIndex.get(i)?.byteSize ?? 0,
          // Nomeada pelo gabarito já entra conferida: o nome saiu do desenho, e
          // foi aprovado na prévia antes de o arquivo subir.
          sheetNumber: names?.get(i) ?? "",
          needsReview: !names?.get(i),
        })),
      )
      return confirmed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.versions(documentId) })
      qc.invalidateQueries({ queryKey: ["atlas", "documents"] })
    },
  })
}

export function useNotifyAtlasAccess(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => atlasService.notifyAccess(jobsiteId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "access", jobsiteId] }),
  })
}

export function useRenameAtlasSheets(versionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (names: { pageIndex: number; sheetNumber: string }[]) =>
      atlasService.renameSheets(versionId, names),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.sheets(versionId) }),
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

export function useAtlasAlbums(jobsiteId: string) {
  return useQuery({
    queryKey: ["atlas", "albums", jobsiteId],
    queryFn: () => atlasService.listAlbums(jobsiteId),
    enabled: !!jobsiteId,
  })
}

export function useAtlasMedia(
  jobsiteId: string,
  filter?: { eventId?: string; dailyLogId?: string; album?: string },
) {
  return useQuery({
    queryKey: [...KEY.media(jobsiteId), filter?.eventId ?? "", filter?.dailyLogId ?? "",
      filter?.album ?? "*"],
    queryFn: () => atlasService.listMedia(jobsiteId, filter),
    enabled: !!jobsiteId,
  })
}

/** Mesmo ciclo do documento, para foto/áudio/vídeo do campo. */
export function useUploadAtlasMedia(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, eventId, dailyLogId, caption, album }: {
      file: File; eventId?: string; dailyLogId?: string; caption?: string; album?: string
    }) => {
      const contentType = file.type || "application/octet-stream"
      const kind = contentType.startsWith("image/") ? "photo"
        : contentType.startsWith("video/") ? "video"
        : contentType.startsWith("audio/") ? "audio"
        : "file"
      const ticket = await atlasService.openMedia(jobsiteId, {
        eventId, dailyLogId, kind, fileName: file.name, contentType, byteSize: file.size, caption,
        album,
        // A data do arquivo é o mais perto da hora da foto que dá para saber sem
        // ler EXIF; melhor que a hora do upload, que é sempre a da noite.
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
      })
      await uploadToR2(ticket.uploadUrl, file, contentType)
      return atlasService.confirmMedia(ticket.mediaId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.media(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "albums", jobsiteId] })
      qc.invalidateQueries({ queryKey: KEY.dailyLogs(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
    },
  })
}

// ─── Taxonomia de documento ───────────────────────────────────────────────────

export function useAtlasUserJobsites(userId: string, enabled = true) {
  return useQuery({
    queryKey: ["atlas", "user-jobsites", userId],
    queryFn: () => atlasService.userJobsites(userId),
    enabled: !!userId && enabled,
  })
}

export function useAtlasDocCategories() {
  return useQuery({
    queryKey: ["atlas", "doc-categories"],
    queryFn: atlasService.listDocCategories,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateDocCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { client: string; buildType: string; name: string; axis: string; defaultSlot?: boolean; jobsiteId?: string }) =>
      atlasService.createDocCategory(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "doc-categories"] }),
  })
}

export function useUpdateDocCategory() {
  const qc = useQueryClient()
  return useMutation({
    // O corpo é parcial: gravar só o gabarito não pode exigir reenviar nome,
    // eixo e tipo de obra, que o backend preserva por COALESCE.
    mutationFn: ({ id, ...body }: { id: number } & Partial<Omit<AtlasDocCategory, "id" | "subcategories">>) =>
      atlasService.updateDocCategory(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "doc-categories"] }),
  })
}

export function useDeleteDocCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => atlasService.deleteDocCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "doc-categories"] }),
  })
}

// Acrescenta a esta obra as vagas de uma categoria que já existe na taxonomia.
export function useAddCategorySlot(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (categoryId: number) => atlasService.addCategorySlot(jobsiteId, categoryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas"] }),
  })
}

// Reaplica a taxonomia na obra depois que andares ou unidades mudam.
export function useRegenerateSlots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobsiteId: string) => atlasService.regenerateSlots(jobsiteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas"] }),
  })
}
