"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { readPdfOutline } from "@/components/atlas/pdf-page"
import type { VinculoConfirmado } from "@/components/atlas/autolink-step"
import { local, type PlanoLocal } from "@/lib/offline/db"
import { chaves, comUrlLocal, guardarResposta, juntarResposta, lerResposta } from "@/lib/offline/dados-da-obra"
import {
  apagarMarca, apagarMidia, apagarPonto, criarMarca, criarPonto, escreverSimples, mudarMarca,
  mudarPonto, subirMidia, temPendencias,
} from "@/lib/offline/escrever"
import { pendenciasPorFolha, type PendenciaDaFolha } from "@/lib/offline/pendencias"
import { useLiveQuery } from "dexie-react-hooks"
import {
  atlasService, uploadToR2,
  type AtlasAnnotation, type AtlasDailyLog, type AtlasDocument,
  type AtlasDocCategory, type AtlasEvent, type AtlasJobsite, type AtlasLevel, type AtlasSheet,
  type AtlasStrokeGeometry, type AtlasVersion, type PunchFiltro,
  type AtlasMedia, type AtlasPunch, type AtlasPunchPoint, type AtlasPunchScope,
} from "@/services/atlas.service"

const KEY = {
  jobsites: ["atlas", "jobsites"] as const,
  jobsite: (id: string) => ["atlas", "jobsite", id] as const,
  access: (id: string) => ["atlas", "access", id] as const,
  documents: (id: string) => ["atlas", "documents", id] as const,
  jobsiteCategories: (id: string) => ["atlas", "jobsite-categories", id] as const,
  versions: (id: string) => ["atlas", "versions", id] as const,
  sheets: (id: string) => ["atlas", "sheets", id] as const,
  annotations: (id: string) => ["atlas", "annotations", id] as const,
  events: (id: string, sheetId?: string) => ["atlas", "events", id, sheetId ?? ""] as const,
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

/**
 * O cronograma ligado ao projeto. Só pergunta quem pode ver o Building
 * Schedule: para os outros a resposta não mudaria nada na tela.
 */
export function useAtlasJobsiteSchedule(id: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY.jobsite(id), "schedule"],
    queryFn: () => atlasService.jobsiteSchedule(id),
    enabled: !!id && enabled,
    staleTime: 1000 * 60 * 5,
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
    // Sempre fresco ao abrir: a lista guardada por cinco minutos mostrou pasta
    // apagada como se ainda existisse.
    staleTime: 0,
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

/** O que esta obra espera receber, e o quanto já chegou. */
export function useAtlasJobsiteCategories(jobsiteId: string) {
  return useQuery({
    queryKey: KEY.jobsiteCategories(jobsiteId),
    queryFn: () => atlasService.listJobsiteCategories(jobsiteId),
    enabled: !!jobsiteId,
  })
}

export function useSetDocumentTags(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, tags }: {
      documentId: string
      tags: { categoryId: number; subcategory: string }[]
    }) => atlasService.setDocumentTags(documentId, tags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.documents(jobsiteId) })
      qc.invalidateQueries({ queryKey: KEY.jobsiteCategories(jobsiteId) })
    },
  })
}

export function useRemoveCategorySlot(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (categoryId: number) => atlasService.removeCategorySlot(jobsiteId, categoryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas"] }),
  })
}

/** Sem rede neste instante. No servidor não há navegador, e lá sempre há rede. */
function semRede() {
  return typeof navigator !== "undefined" && !navigator.onLine
}

// A versão e as folhas como o aparelho as conhece, para a pasta que nunca foi
// aberta com rede. É o caso da pasta vizinha alcançada por um vínculo: o índice
// desceu, a prancha de destino desceu, e a tela que as abre não tinha de onde
// montar a lista. Só o que o leitor usa vem preenchido; o resto fica vazio.
function versaoLocal(documentId: string, planos: PlanoLocal[]): AtlasVersion[] {
  const atual = planos[0]
  if (!atual) return []
  return [{
    id: atual.versaoId, documentId, revision: "", r2Key: "", byteSize: 0,
    pageCount: planos.length, checksum: "", contentType: "application/pdf",
    status: "published", name: "", notes: "", uploadedBy: "", uploadedAt: "",
    publishedAt: null, sheets: planos.length, attachments: [],
    uploaderName: "", uploaderRole: "", scope: "full",
    gap: { kind: "first", compared: false, changed: [], removed: [] },
  }]
}

function folhasLocais(planos: PlanoLocal[]): AtlasSheet[] {
  return planos
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map(p => ({
      id: p.id, versionId: p.versaoId, pageIndex: p.pageIndex,
      sheetNumber: p.sheetNumber, discipline: "", level: "", title: p.title,
      // O caminho no aparelho faz as vezes da chave no bucket: é ele que diz
      // que a prancha existe e o cartão pode abrir. Folha sem arquivo fica
      // como está, que sem rede é o mesmo que folha ainda não cortada.
      revision: "", thumbKey: p.thumb ?? "", widthPt: p.widthPt || null, heightPt: p.heightPt || null,
      r2Key: p.arquivo ?? "", byteSize: p.bytes ?? 0, confidence: 1, needsReview: false,
      links: 0, highlights: 0, notes: 0, annotations: 0,
      revisedAt: "", versionName: "", revisions: 1, textHash: "", geomHash: "",
      scaleUnitsPerPt: p.scaleUnitsPerPt, scaleLabel: p.scaleLabel,
    }))
}

// As consultas do leitor rodam mesmo sem rede (`networkMode: "always"`). O
// padrão do TanStack pausa a consulta quando o navegador diz que não há sinal, e
// pausada ela nunca chega ao aparelho: a pasta baixada abria, mas a folha que
// não tinha sido vista com rede ficava sem lista e sem vínculo. Sem rede, o que
// já está no cache vale; faltando, monta-se do índice guardado.
export function useAtlasVersions(documentId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: KEY.versions(documentId),
    networkMode: "always",
    queryFn: async () => {
      if (semRede()) {
        const emCache = qc.getQueryData<AtlasVersion[]>(KEY.versions(documentId))
        if (emCache) return emCache
        const planos = await local.planos.where("pastaId").equals(documentId).toArray()
        if (!planos.length) throw new Error("offline")
        return versaoLocal(documentId, planos)
      }
      return atlasService.listVersions(documentId)
    },
    enabled: !!documentId,
    staleTime: 0,
  })
}

export function useAtlasSheets(versionId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: KEY.sheets(versionId),
    networkMode: "always",
    queryFn: async () => {
      if (semRede()) {
        const emCache = qc.getQueryData<AtlasSheet[]>(KEY.sheets(versionId))
        if (emCache) return emCache
        const planos = await local.planos.filter(p => p.versaoId === versionId).toArray()
        if (!planos.length) throw new Error("offline")
        return folhasLocais(planos)
      }
      return atlasService.listSheets(versionId)
    },
    enabled: !!versionId,
    staleTime: 0,
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
 * O envio de uma revisão: abre a versão, sobe o arquivo direto no bucket e
 * confirma. E só.
 *
 * O que vinha depois (cortar em folhas, desenhar prévia, ler nome, calcular
 * impressão, gravar) saiu daqui e foi para o servidor (ATL-102): rodava na aba
 * de quem enviou, em sequência, e morria com ela. Confirmar dispara o
 * processamento lá; a página acompanha por `useIngestJob`.
 */
export function useUploadAtlasVersion(documentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, revision, name, notes, names, alvo, links, onProgress }: {
      file: File
      revision: string
      /**
       * As páginas do set atual que este arquivo substitui. Presente, o arquivo
       * não é o set: é só o trecho novo, e o resto vem da versão anterior.
       */
      alvo?: number[]
      /** O apelido desta versão, e o que mudou nela. */
      name?: string
      notes?: string
      /** O nome de cada página, quando a prévia do gabarito já os leu. */
      names?: Map<number, string>
      /** Os vínculos confirmados na etapa Links, que o servidor grava depois das folhas. */
      links?: VinculoConfirmado[]
      onProgress?: (step: "opening" | "uploading" | "confirming", detail?: string) => void
    }): Promise<{ versionId: string }> => {
      const contentType = file.type || "application/pdf"
      onProgress?.("opening")
      const ticket = await atlasService.openVersion(documentId, {
        revision, fileName: file.name, contentType, byteSize: file.size, name, notes,
      })
      onProgress?.("uploading", `0/${file.size}`)
      await uploadToR2(ticket.uploadUrl, file, contentType,
        (enviado, total) => onProgress?.("uploading", `${enviado}/${total}`))
      onProgress?.("confirming")
      let pageCount = 0
      try {
        pageCount = (await readPdfOutline(file)).pageCount
      } catch {
        // O servidor conta as páginas de qualquer jeito.
      }
      await atlasService.confirmVersion(ticket.versionId, {
        pageCount,
        fileName: file.name,
        alvo,
        links: links?.length ? links : undefined,
        names: names?.size
          ? Object.fromEntries([...names.entries()].map(([i, n]) => [String(i), n]))
          : undefined,
      })
      return { versionId: ticket.versionId }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.versions(documentId) })
      qc.invalidateQueries({ queryKey: ["atlas", "documents"] })
    },
  })
}

/**
 * O andamento do processamento no servidor, consultado a cada dois segundos
 * enquanto ele roda. A cada leitura as folhas e prévias são buscadas de novo,
 * que é o que faz os cartões irem aparecendo.
 */
export function useIngestJob(versionId: string) {
  const qc = useQueryClient()
  const feitas = useRef(-1)
  return useQuery({
    queryKey: ["atlas", "ingest", versionId],
    queryFn: async () => {
      const job = await atlasService.ingestStatus(versionId)
      if (job.done !== feitas.current || job.status === "done" || job.status === "failed") {
        feitas.current = job.done
        qc.invalidateQueries({ queryKey: KEY.sheets(versionId) })
        qc.invalidateQueries({ queryKey: ["atlas", "thumbs", versionId] })
      }
      return job
    },
    enabled: !!versionId,
    refetchInterval: q => {
      const s = q.state.data?.status
      return s === "queued" || s === "running" ? 2000 : false
    },
    staleTime: 0,
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
    // Sem rede, as marcações vêm do aparelho. Elas descem junto com a pasta, e
    // sem esta volta o vínculo simplesmente sumia no canteiro: a prancha abria
    // e o toque não levava a lugar nenhum, o que parece defeito e não falta de
    // sinal. Roda sem rede de propósito: pausada, a consulta nunca chegaria ao
    // aparelho, e a folha que não tinha sido aberta com sinal ficava sem nada.
    networkMode: "always",
    queryFn: async () => {
      const obra = (await local.planos.get(sheetId).catch(() => undefined))?.obraId
      if (!semRede() && !(obra && await temPendencias(obra))) {
        try {
          return await atlasService.listAnnotations(sheetId)
        } catch (erro) {
          const guardadas = await marcasDoAparelho(sheetId)
          if (!guardadas.length) throw erro
          return guardadas
        }
      }
      const guardadas = await marcasDoAparelho(sheetId)
      // Nada guardado: o erro mantém o que o cache já tinha, se tinha, em vez
      // de trocar o vínculo visto com rede por lista vazia.
      if (!guardadas.length) throw new Error("offline")
      return guardadas
    },
    enabled: !!sheetId,
  })
}

async function marcasDoAparelho(sheetId: string): Promise<AtlasAnnotation[]> {
  const guardadas = await local.marcas.where("planoId").equals(sheetId).toArray()
  return guardadas.map(m => ({
    id: m.id,
    sheetId: m.planoId,
    authorId: "",
    tool: m.tool,
    color: m.color,
    width: m.width,
    opacity: m.opacity,
    shared: m.shared,
    geometry: m.geometry,
    createdAt: m.createdAt,
  })) as AtlasAnnotation[]
}

export function useCreateAtlasAnnotation(sheetId: string) {
  const qc = useQueryClient()
  return useMutation({
    // Sem sinal o traço fica no aparelho e sobe depois. Ver lib/offline/escrever.
    mutationFn: (body: Partial<AtlasAnnotation>) =>
      criarMarca(sheetId, body, b => atlasService.createAnnotation(sheetId, b)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.annotations(sheetId) }),
  })
}

export function useUpdateAtlasAnnotation(sheetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, geometry }: { id: string; geometry: AtlasStrokeGeometry }) =>
      mudarMarca(sheetId, id, geometry, () => atlasService.updateAnnotation(id, geometry)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.annotations(sheetId) }),
  })
}

export function useDeleteAtlasAnnotation(sheetId: string) {
  const qc = useQueryClient()
  return useMutation({
    // Marca que o servidor não conhece já está apagada, e insistir nisso deixa
    // um fantasma na tela: some ao recarregar e volta a cada tentativa. É o que
    // acontece quando duas pessoas apagam a mesma coisa, ou quando a listagem
    // em memória é mais velha que o banco.
    mutationFn: async (annotationId: string) => {
      try {
        return await apagarMarca(sheetId, annotationId, () => atlasService.deleteAnnotation(annotationId))
      } catch (e) {
        if (e instanceof Error && /404|não encontrad|not found/i.test(e.message)) return null
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.annotations(sheetId) }),
  })
}

export function useAtlasEvents(jobsiteId: string, sheetId?: string) {
  return useQuery({
    queryKey: KEY.events(jobsiteId, sheetId),
    // Os pinos da prancha, com rede ou sem: sem rede vêm da lista da obra
    // guardada no aparelho, filtrada pela folha como o servidor filtraria.
    networkMode: "always",
    queryFn: async () => {
      if (semRede() || await temPendencias(jobsiteId)) {
        const todos = await lerResposta<AtlasEvent[]>(chaves.events(jobsiteId))
        if (!todos) throw new Error("offline")
        return sheetId ? todos.filter(e => e.sheetId === sheetId) : todos
      }
      const lista = await atlasService.listEvents(jobsiteId, sheetId)
      void juntarResposta(chaves.events(jobsiteId), jobsiteId, lista,
        e => !sheetId || e.sheetId === sheetId)
      return lista
    },
    enabled: !!jobsiteId,
  })
}

/**
 * O que cada folha da obra tem esperando sinal. Vivo: a fila do aparelho muda e
 * a tela acompanha, sem esperar consulta nenhuma ser invalidada.
 */
export function usePendenciasPorFolha(jobsiteId: string): Record<string, PendenciaDaFolha> {
  return useLiveQuery(
    () => (jobsiteId ? pendenciasPorFolha(jobsiteId) : Promise.resolve({})),
    [jobsiteId],
  ) ?? {}
}

export function useCreateAtlasEvent(jobsiteId: string, sheetId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AtlasEvent>) =>
      criarPonto(jobsiteId, body, b => atlasService.createEvent(jobsiteId, b)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.events(jobsiteId, sheetId) })
      qc.invalidateQueries({ queryKey: KEY.jobsite(jobsiteId) })
      tocarPunch(qc, jobsiteId)
    },
  })
}

export function useUpdateAtlasEvent(jobsiteId: string, sheetId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, patch }: { eventId: string; patch: Record<string, unknown> }) =>
      mudarPonto(jobsiteId, eventId, patch, () => atlasService.updateEvent(eventId, patch)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.events(jobsiteId, sheetId) })
      qc.invalidateQueries({ queryKey: KEY.jobsite(jobsiteId) })
      tocarPunch(qc, jobsiteId)
    },
  })
}

/**
 * Apagar o note apaga a task.
 *
 * Note e task são a mesma linha vista de dois lugares: um pino sobre a prancha
 * e uma linha da lista. Soltar só o pino deixava de pé uma task que ninguém
 * mais conseguia localizar no desenho, porque a marca que dizia onde ela ficava
 * era justamente a que tinha sido apagada.
 */
export function useDeleteAtlasEvent(jobsiteId: string, sheetId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) =>
      apagarPonto(jobsiteId, eventId, () => atlasService.deleteEvent(eventId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
      qc.invalidateQueries({ queryKey: KEY.jobsite(jobsiteId) })
      if (sheetId) qc.invalidateQueries({ queryKey: KEY.events(jobsiteId, sheetId) })
      tocarPunch(qc, jobsiteId)

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
    // A mídia de um ponto, com rede ou sem. Sem rede a lista vem do aparelho e
    // cada foto aponta para o arquivo guardado, porque a URL assinada não abre.
    networkMode: "always",
    queryFn: async () => {
      const soDoEvento = !!filter?.eventId && !filter.dailyLogId && filter.album === undefined
      if (semRede() || (soDoEvento && await temPendencias(jobsiteId))) {
        if (!soDoEvento) throw new Error("offline")
        const guardada = await lerResposta<AtlasMedia[]>(chaves.media(jobsiteId, filter!.eventId!))
        if (!guardada) throw new Error("offline")
        return comUrlLocal(guardada)
      }
      const lista = await atlasService.listMedia(jobsiteId, filter)
      if (soDoEvento) void guardarResposta(chaves.media(jobsiteId, filter!.eventId!), jobsiteId, lista)
      return lista
    },
    enabled: !!jobsiteId,
  })
}

/** Mesmo ciclo do documento, para foto/áudio/vídeo do campo. */
export function useDeleteAtlasMedia(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mediaId, eventId }: { mediaId: string; eventId: string }) =>
      apagarMidia(jobsiteId, mediaId, eventId, () => atlasService.deleteMedia(mediaId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.media(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
      tocarPunch(qc, jobsiteId)
    },
  })
}

export function useUploadAtlasMedia(jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, eventId, dailyLogId, caption, album, phase, title, description }: {
      file: File; eventId?: string; dailyLogId?: string; caption?: string; album?: string
      phase?: "before" | "after"; title?: string; description?: string
    }) => subirMidia(jobsiteId, { file, eventId, phase, title, description }, async () => {
      const contentType = file.type || "application/octet-stream"
      const kind = contentType.startsWith("image/") ? "photo"
        : contentType.startsWith("video/") ? "video"
        : contentType.startsWith("audio/") ? "audio"
        : "file"
      const ticket = await atlasService.openMedia(jobsiteId, {
        eventId, dailyLogId, kind, fileName: file.name, contentType, byteSize: file.size, caption,
        album, phase, title, description,
        // A data do arquivo é o mais perto da hora da foto que dá para saber sem
        // ler EXIF; melhor que a hora do upload, que é sempre a da noite.
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
      })
      await uploadToR2(ticket.uploadUrl, file, contentType)
      return atlasService.confirmMedia(ticket.mediaId)
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.media(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "albums", jobsiteId] })
      qc.invalidateQueries({ queryKey: KEY.dailyLogs(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "events", jobsiteId] })
      tocarPunch(qc, jobsiteId)

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

// ─── Punch list ───────────────────────────────────────────────────────────────
//
// A verificação da obra, agora que ela é uma coisa e não um filtro. As chaves
// carregam o recorte inteiro porque é o recorte que define a lista: a mesma obra
// tem uma lista por escopo e outra por condição, e uma chave só faria a segunda
// sobrescrever a primeira no cache.

const PUNCH = {
  scopes: (id: string) => ["atlas", "punch-scopes", id] as const,
  points: (id: string, f?: PunchFiltro) =>
    ["atlas", "punch-points", id, f?.punch ?? "", f?.scope ?? "", f?.status ?? ""] as const,
  media: (id: string, f?: PunchFiltro) =>
    ["atlas", "punch-media", id, f?.punch ?? "", f?.scope ?? "", f?.status ?? ""] as const,
  list: (id: string) => ["atlas", "punches", id] as const,
}

/**
 * Mexeu num ponto, a verificação mudou.
 *
 * Encerrar um ponto muda a conta do bloco, apagar muda o total, e anexar a prova
 * do depois muda o aviso da lista. Sem esta invalidação o bloco continuava
 * dizendo "3 pendentes" depois de o terceiro ter sido encerrado, e bloco que
 * mente é pior que bloco que não existe.
 */
function tocarPunch(qc: ReturnType<typeof useQueryClient>, jobsiteId: string) {
  qc.invalidateQueries({ queryKey: PUNCH.scopes(jobsiteId) })
  qc.invalidateQueries({ queryKey: ["atlas", "punch-points", jobsiteId] })
  qc.invalidateQueries({ queryKey: ["atlas", "punch-media", jobsiteId] })
  qc.invalidateQueries({ queryKey: PUNCH.list(jobsiteId) })
}

export function useAtlasPunchScopes(jobsiteId: string) {
  return useQuery({
    queryKey: PUNCH.scopes(jobsiteId),
    networkMode: "always",
    queryFn: async () => {
      if (semRede()) {
        const guardados = await lerResposta<AtlasPunchScope[]>(chaves.punchScopes(jobsiteId))
        if (!guardados) throw new Error("offline")
        return guardados
      }
      const lista = await atlasService.punchScopes(jobsiteId)
      void guardarResposta(chaves.punchScopes(jobsiteId), jobsiteId, lista)
      return lista
    },
    enabled: !!jobsiteId,
  })
}

export function useAtlasPunchPoints(jobsiteId: string, filtro?: PunchFiltro, enabled = true) {
  return useQuery({
    queryKey: PUNCH.points(jobsiteId, filtro),
    // Sem rede, a lista da obra inteira guardada no aparelho, filtrada aqui do
    // jeito que o servidor filtra: passagem, escopo e condição.
    networkMode: "always",
    queryFn: async () => {
      if (semRede() || await temPendencias(jobsiteId)) {
        const todos = await lerResposta<AtlasPunchPoint[]>(chaves.punchPoints(jobsiteId))
        if (!todos) throw new Error("offline")
        return todos.filter(p =>
          (!filtro?.punch || p.punchId === filtro.punch)
          && (!filtro?.scope || p.scopeValue === filtro.scope)
          && (!filtro?.status || p.status === filtro.status))
      }
      const lista = await atlasService.punchList(jobsiteId, filtro)
      // Todo recorte visto com rede entra na lista guardada. Só o escopo inteiro
      // é recorte exato: aí o ponto que sumiu dele sai também.
      void juntarResposta(chaves.punchPoints(jobsiteId), jobsiteId, lista,
        !filtro?.punch && !filtro?.status
          ? (p => !filtro?.scope || p.scopeValue === filtro.scope)
          : undefined)
      return lista
    },
    enabled: !!jobsiteId && enabled,
  })
}

export function useAtlasPunchMedia(jobsiteId: string, filtro?: PunchFiltro, enabled = true) {
  return useQuery({
    queryKey: PUNCH.media(jobsiteId, filtro),
    queryFn: () => atlasService.punchMedia(jobsiteId, filtro),
    enabled: !!jobsiteId && enabled,
  })
}

export function useAtlasPunches(jobsiteId: string, params?: { scope?: string; open?: boolean }) {
  return useQuery({
    queryKey: [...PUNCH.list(jobsiteId), params?.scope ?? "", params?.open ? "abertas" : ""],
    networkMode: "always",
    queryFn: async () => {
      if (semRede()) {
        const todas = await lerResposta<AtlasPunch[]>(chaves.punches(jobsiteId))
        if (!todas) throw new Error("offline")
        return todas.filter(r =>
          (!params?.scope || r.scopeValue === params.scope)
          && (!params?.open || !r.closedAt))
      }
      const lista = await atlasService.punches(jobsiteId, params)
      void juntarResposta(chaves.punches(jobsiteId), jobsiteId, lista,
        !params?.open ? (r => !params?.scope || r.scopeValue === params.scope) : undefined)
      return lista
    },
    enabled: !!jobsiteId,
  })
}

// Abrir, fechar e reabrir mexem na mesma coisa vista em três telas: a lista de
// escopos, a de passagens e a de pontos. Por isso invalidam o ramo inteiro do
// punch em vez de uma consulta só.
function useMexerNoPunch<T>(fn: (arg: T) => Promise<unknown>, jobsiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PUNCH.scopes(jobsiteId) })
      qc.invalidateQueries({ queryKey: PUNCH.list(jobsiteId) })
      qc.invalidateQueries({ queryKey: ["atlas", "punch-points", jobsiteId] })
    },
  })
}

export function useOpenAtlasPunch(jobsiteId: string) {
  return useMexerNoPunch<{
    scopeKind: "subcategory" | "category"; scopeValue: string; name?: string; notes?: string
  }>(body => escreverSimples(jobsiteId, body.scopeValue,
    { metodo: "POST", caminho: `/api/v1/atlas/jobsites/${jobsiteId}/punches`, corpo: body }, "round opened",
    () => atlasService.openPunch(jobsiteId, body)), jobsiteId)
}

export function useCloseAtlasPunch(jobsiteId: string) {
  return useMexerNoPunch<string>(id => escreverSimples(jobsiteId, id,
    { metodo: "POST", caminho: `/api/v1/atlas/punches/${id}/close` }, "round signed off",
    () => atlasService.closePunch(id)), jobsiteId)
}

export function useReopenAtlasPunch(jobsiteId: string) {
  return useMexerNoPunch<string>(id => escreverSimples(jobsiteId, id,
    { metodo: "POST", caminho: `/api/v1/atlas/punches/${id}/reopen` }, "round reopened",
    () => atlasService.reopenPunch(id)), jobsiteId)
}

// ─── A descrição falada ───────────────────────────────────────────────────────

/**
 * Sobe a gravação, transcreve e lê em tópicos, nessa ordem.
 *
 * As três etapas numa mutação só porque para quem grava é um gesto só, e o que
 * ela precisa ver é em que pé está. O `andamento` é o que a tela usa para dizer
 * "sending", "transcribing" e "reading", em vez de girar uma roda por quarenta
 * segundos sem explicar o que está acontecendo.
 *
 * O ponto ainda não existe neste momento, e é de propósito: a gravação sobe sem
 * dono e é adotada quando o ponto é salvo. Esperar o ponto para só então subir
 * faria a pessoa olhar a tela parada depois de escrever o título.
 */
export function useAtlasDictation(jobsiteId: string) {
  return useMutation({
    mutationFn: async ({ audio, eventId, andamento }: {
      audio: Blob
      eventId?: string
      andamento?: (passo: "sending" | "transcribing" | "reading") => void
    }) => {
      andamento?.("sending")
      const nome = `note-${Date.now()}.wav`
      const ticket = await atlasService.openMedia(jobsiteId, {
        eventId, kind: "audio", fileName: nome,
        contentType: "audio/wav", byteSize: audio.size,
      })
      await uploadToR2(ticket.uploadUrl, audio, "audio/wav")
      await atlasService.confirmMedia(ticket.mediaId)

      andamento?.("transcribing")
      const { transcript } = await atlasService.transcribeMedia(ticket.mediaId)
      if (!transcript.trim()) {
        return { mediaId: ticket.mediaId, transcript: "", topics: "" }
      }

      andamento?.("reading")
      const { topics } = await atlasService.mediaTopics(ticket.mediaId)
      return { mediaId: ticket.mediaId, transcript, topics }
    },
  })
}

