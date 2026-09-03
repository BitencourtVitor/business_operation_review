import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

const base = "/api/v1/atlas"

export type AtlasLevel = "read" | "annotate" | "manage"

/** Uma obra do Forecast, candidata a virar obra do Atlas. */
export interface ForecastJobsite {
  forecastId: string
  client: string
  community: string
  type: string
  unit: string
  address: string
  status: string
  company: string
  imported: boolean
  name: string
}

export interface AtlasBlockedUser {
  userId: string
  name: string
  email: string
  /** De fora da Premium: não vê nada por padrão, e se convida obra a obra. */
  subcontractor: boolean
}

export interface AtlasJobsite {
  id: string
  name: string
  address: string
  client: string
  code: string
  status: "active" | "archived"
  /** Vocabulário do Forecast: lot, building, house. */
  /**
   * Prédio, casa ou painel. "lot" e "other" existiram no começo e não são mais
   * gravados; o tipo segue aberto porque obra antiga pode ter qualquer um deles,
   * e a tabela de rótulos cai em casa quando não reconhece.
   */
  kind: string
  community: string
  unit: string
  company: string
  /** Quantos andares o prédio tem — gera uma pasta de documento por andar. */
  floors: number
  /** Letras de unidade em uso — geram uma pasta por letra. */
  unitLabels: string[]
  forecastId: string | null
  catalogJobSiteId: number | null
  createdBy: string
  createdAt: string
  documents: number
  openEvents: number
  level: AtlasLevel | ""
}

/** Categoria de documento com o eixo pelo qual ela se divide. */
export interface AtlasDocCategory {
  id: number
  client: string
  buildType: string
  name: string
  /** none = uma pasta; floor = uma por andar; unit = uma por letra de unidade. */
  axis: "none" | "floor" | "unit"
  position: number
  /** true: toda obra do tipo nasce com a pasta. false: fica de sugestão. */
  defaultSlot: boolean
  /** Os valores de eixo que já viraram pasta em alguma obra. */
  subcategories: string[]
  /** As opções que a categoria admite no eixo — 1st…5th, C…M. */
  axisValues: string[]
  /**
   * Onde o nome de cada folha está impresso no PDF desta categoria, em fração
   * da página. O primeiro nível que devolver texto dá o nome.
   */
  naming?: { levels: { x0: number; y0: number; x1: number; y1: number; rotation: number }[] }
}

/**
 * Uma categoria grudada num documento.
 *
 * Categoria e subcategoria são etiquetas classificáveis, e não o lugar onde o
 * arquivo mora: um set que cobre o 3º e o 4º andar carrega as duas, em vez de
 * virar dois documentos.
 */
export interface AtlasDocTag {
  categoryId: number
  category: string
  /** O valor do eixo: o andar ("3rd"), a letra da unidade ("C"), ou vazio. */
  subcategory: string
  axis: "none" | "floor" | "unit"
}

/** Uma categoria que a obra espera receber, e quanto dela já chegou. */
export interface AtlasJobsiteCategory {
  categoryId: number
  name: string
  subcategory: string
  axis: "none" | "floor" | "unit"
  position: number
  /** Zero é a lacuna: a obra pediu e ninguém anexou. */
  documents: number
}

export interface AtlasDocument {
  id: string
  jobsiteId: string
  name: string
  discipline: string
  /** Nome da categoria na taxonomia do Atlas — "Trusses", "Wall Panels"… */
  category: string
  categoryId: number
  /** Valor do eixo: o andar ("3rd"), a letra da unidade ("C"), ou vazio. */
  subcategory: string
  /** Como o documento se classifica. Muitas por documento. */
  tags: AtlasDocTag[]
  createdBy: string
  createdAt: string
  versions: number
  latestVersionId: string
  latestRevision: string
  latestStatus: string
  sheets: number
  /** Quem subiu o set que vale, o cargo dessa pessoa, e quando. */
  uploadedBy: string
  uploadedRole: string
  uploadedAt: string
}

export interface AtlasUserJobsite {
  jobsiteId: string
  name: string
  community: string
  unit: string
  client: string
  kind: string
  status: string
  /** read | annotate | manage */
  level: string
  grantedAt: string
}

export interface AtlasVersion {
  id: string
  documentId: string
  revision: string
  r2Key: string
  byteSize: number
  pageCount: number
  checksum: string
  contentType: string
  status: "pending" | "uploaded" | "published" | "failed"
  notes: string
  uploadedBy: string
  uploadedAt: string
  publishedAt: string | null
  sheets: number
}

export interface PlanUploadTicket {
  pageIndex: number
  r2Key: string
  uploadUrl: string
}

export interface AtlasSheet {
  id: string
  versionId: string
  pageIndex: number
  sheetNumber: string
  discipline: string
  level: string
  title: string
  revision: string
  thumbKey: string
  widthPt: number | null
  heightPt: number | null
  r2Key: string
  byteSize: number
  confidence: number
  needsReview: boolean
  /** O que existe sobre a folha, por tipo. Traço de caneta não se conta. */
  links: number
  highlights: number
  notes: number
  annotations: number
}

// Pontos normalizados (0..1) em relação à página, para o traço acompanhar
// qualquer zoom sem depender da resolução em que a folha foi renderizada.
export interface AtlasStrokeGeometry {
  /** Traço: a sequência de pontos em fração da página. */
  points?: [number, number][]
  /**
   * Vínculo: a área cercada na prancha, em fração da página, e o destino. O
   * destino chega depois da área, e até chegar o vínculo existe vazio.
   */
  x0?: number
  y0?: number
  x1?: number
  y1?: number
  target?: AtlasLinkTarget | null
}

/** Para onde um vínculo aponta. O nome viaja junto para a bolha na prancha
 *  poder dizer o destino sem buscar nada. */
export interface AtlasLinkTarget {
  documentId: string
  documentName: string
  sheetId: string
  sheetName: string
  pageIndex: number
}

export interface AtlasAnnotation {
  id: string
  sheetId: string
  authorId: string
  tool: "pen" | "highlighter" | "link"
  color: string
  width: number
  opacity: number
  /** Verdadeiro quando a equipe inteira vê o traço; falso deixa ele só com quem o fez. */
  shared: boolean
  geometry: AtlasStrokeGeometry
  createdAt: string
}

export interface AtlasEvent {
  id: string
  jobsiteId: string
  sheetId: string | null
  kind: "comment" | "issue" | "task" | "rfi"
  title: string
  body: string
  status: "open" | "answered" | "resolved"
  pageX: number | null
  pageY: number | null
  region: unknown
  createdBy: string
  createdAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  replies: number
  media: number
}

export interface AtlasReply {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface AtlasDailyLog {
  id: string
  jobsiteId: string
  logDate: string
  weather: string
  temperature: number | null
  crewSize: number | null
  summary: string
  createdBy: string
  createdAt: string
  media: number
}

export interface AtlasAlbum {
  album: string
  count: number
  first: string
  last: string
}

export interface AtlasMedia {
  id: string
  eventId: string | null
  dailyLogId: string | null
  kind: "photo" | "audio" | "video" | "file"
  fileName: string
  contentType: string
  byteSize: number
  caption: string
  uploadedBy: string
  uploadedAt: string
  album: string
  takenAt: string
  url: string
}

export interface AtlasUser {
  id: string
  name: string
  email: string
  role: string
  level: string
  jobsites: number
  /** Entra por ser dev, não por concessão. */
  byRole: boolean
}

export interface AtlasAccess {
  userId: string
  userName: string
  userEmail: string
  level: AtlasLevel
  grantedBy: string
  grantedAt: string
  expiresAt: string | null
  revokedAt: string | null
  /** Quando o convite saiu. Nulo: nunca avisado. */
  notifiedAt: string | null
}

interface UploadTicket {
  uploadUrl: string
  r2Key: string
  expiresIn: number
}

export const atlasService = {
  listForecastJobsites: (params?: { q?: string; company?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set("q", params.q)
    if (params?.company) qs.set("company", params.company)
    if (params?.status) qs.set("status", params.status)
    const suffix = qs.toString() ? `?${qs}` : ""
    return api.get<ForecastJobsite[]>(`${base}/forecast-jobsites${suffix}`, getToken())
      .then(r => r ?? [])
  },
  importJobsites: (forecastIds: string[]) =>
    api.post<{ imported: number; skipped: number }>(
      `${base}/jobsites/import`, { forecastIds }, getToken()),

  listJobsites: () => api.get<AtlasJobsite[]>(`${base}/jobsites`, getToken()).then(r => r ?? []),
  getJobsite: (id: string) => api.get<AtlasJobsite>(`${base}/jobsites/${id}`, getToken()),
  createJobsite: (body: Partial<AtlasJobsite>) =>
    api.post<{ id: string }>(`${base}/jobsites`, body, getToken()),
  updateJobsite: (id: string, patch: Partial<AtlasJobsite>) =>
    api.patch(`${base}/jobsites/${id}`, patch, getToken()),

  setAtlasUserAccess: (userId: string, level: string) =>
    api.patch(`${base}/users/${userId}`, { level }, getToken()),
  listUserCompanies: () =>
    api.get<Record<string, string>>(`${base}/user-companies`, getToken()).then(r => r ?? {}),
  setUserCompany: (userId: string, company: string) =>
    api.patch(`${base}/users/${userId}`, { company }, getToken()),

  // Quem NÃO vê o projeto. O padrão do Atlas é ver, então o que se guarda é a
  // exceção, e a lista vai inteira no PUT para não divergir do que a tela mostra.
  // Quem pode ser ocultado: só quem entra no Atlas pela chave de permissão.
  listBlockableUsers: () =>
    api.get<AtlasBlockedUser[]>(`${base}/blockable-users`, getToken()).then(r => r ?? []),
  listBlocked: (jobsiteId: string) =>
    api.get<AtlasBlockedUser[]>(`${base}/jobsites/${jobsiteId}/blocked`, getToken()).then(r => r ?? []),
  setBlocked: (jobsiteId: string, userIds: string[]) =>
    api.put(`${base}/jobsites/${jobsiteId}/blocked`, { userIds }, getToken()),

  listAccess: (jobsiteId: string) =>
    api.get<AtlasAccess[]>(`${base}/jobsites/${jobsiteId}/access`, getToken()).then(r => r ?? []),
  grantAccess: (jobsiteId: string, userId: string, level: AtlasLevel, expiresAt?: string) =>
    api.put(`${base}/jobsites/${jobsiteId}/access/${userId}`, { level, expiresAt }, getToken()),
  // Avisar é gesto à parte de conceder: sai quando o responsável decidir, e a
  // data volta para a tela poder dizer que já foi.
  notifyAccess: (jobsiteId: string, userId: string) =>
    api.post<{ notifiedAt: string; email: string }>(
      `${base}/jobsites/${jobsiteId}/access/${userId}/notify`, {}, getToken(),
    ),

  revokeAccess: (jobsiteId: string, userId: string) =>
    api.delete(`${base}/jobsites/${jobsiteId}/access/${userId}`, getToken()),

  listDocCategories: () =>
    api.get<AtlasDocCategory[]>(`${base}/doc-categories`, getToken()).then(r => r ?? []),
  createDocCategory: (body: { client: string; buildType: string; name: string; axis: string; defaultSlot?: boolean; jobsiteId?: string }) =>
    api.post<{ id: number }>(`${base}/doc-categories`, body, getToken()),
  // Parcial: o backend preserva por COALESCE o que não vier, então gravar só o
  // gabarito não exige reenviar nome, eixo e tipo de obra.
  updateDocCategory: (id: number, body: Partial<Omit<AtlasDocCategory, "id" | "subcategories">>) =>
    api.patch(`${base}/doc-categories/${id}`, body, getToken()),
  deleteDocCategory: (id: number) =>
    api.delete(`${base}/doc-categories/${id}`, getToken()),
  addCategorySlot: (jobsiteId: string, categoryId: number) =>
    api.post<{ created: number }>(`${base}/jobsites/${jobsiteId}/slots/${categoryId}`, {}, getToken()),
  removeCategorySlot: (jobsiteId: string, categoryId: number) =>
    api.delete(`${base}/jobsites/${jobsiteId}/slots/${categoryId}`, getToken()),
  regenerateSlots: (jobsiteId: string) =>
    api.post<{ created: number }>(`${base}/jobsites/${jobsiteId}/slots`, {}, getToken()),
  listJobsiteCategories: (jobsiteId: string) =>
    api.get<AtlasJobsiteCategory[]>(`${base}/jobsites/${jobsiteId}/categories`, getToken())
      .then(r => r ?? []),

  listDocuments: (jobsiteId: string) =>
    api.get<AtlasDocument[]>(`${base}/jobsites/${jobsiteId}/documents`, getToken()).then(r => r ?? []),
  createDocument: (jobsiteId: string, body: Partial<AtlasDocument>) =>
    api.post<{ id: string }>(`${base}/jobsites/${jobsiteId}/documents`, body, getToken()),
  updateDocument: (documentId: string, patch: Record<string, unknown>) =>
    api.patch(`${base}/documents/${documentId}`, patch, getToken()),
  // O conjunto inteiro de uma vez: desmarcar uma etiqueta é mandar a lista sem
  // ela, e não existe pedido de "remova esta".
  setDocumentTags: (documentId: string, tags: { categoryId: number; subcategory: string }[]) =>
    api.put(`${base}/documents/${documentId}/tags`, { tags }, getToken()),

  listVersions: (documentId: string) =>
    api.get<AtlasVersion[]>(`${base}/documents/${documentId}/versions`, getToken()).then(r => r ?? []),
  openVersion: (documentId: string, body: {
    revision: string; fileName: string; contentType: string; byteSize: number; notes?: string
  }) => api.post<UploadTicket & { versionId: string }>(
    `${base}/documents/${documentId}/versions`, body, getToken()),
  confirmVersion: (versionId: string, body: { checksum?: string; pageCount?: number }) =>
    api.post<{ id: string; byteSize: number }>(`${base}/versions/${versionId}/confirm`, body, getToken()),
  publishVersion: (versionId: string) =>
    api.post(`${base}/versions/${versionId}/publish`, {}, getToken()),
  versionDownloadUrl: (versionId: string) =>
    api.get<{ url: string }>(`${base}/versions/${versionId}/download`, getToken()),

  // As obras compartilhadas com uma pessoa. É a resposta a "o que ele vê", que
  // só o subcontratado obriga a perguntar: os outros veem tudo.
  userJobsites: (userId: string) =>
    api.get<AtlasUserJobsite[]>(`${base}/users/${userId}/jobsites`, getToken()).then(r => r ?? []),

  listSheets: (versionId: string) =>
    api.get<AtlasSheet[]>(`${base}/versions/${versionId}/sheets`, getToken()).then(r => r ?? []),
  replaceSheets: (versionId: string, sheets: Partial<AtlasSheet>[]) =>
    api.put(`${base}/versions/${versionId}/sheets`, { sheets }, getToken()),
  // Aplica o gabarito às folhas que já existem. Uma chamada, não uma por
  // folha: um relatório de produção tem 97.
  renameSheets: (versionId: string, names: { pageIndex: number; sheetNumber: string }[]) =>
    api.put(`${base}/versions/${versionId}/names`, { names }, getToken()),

  planUploadUrls: (versionId: string, pageIndexes: number[]) =>
    api.post<PlanUploadTicket[]>(
      `${base}/versions/${versionId}/plan-uploads`, { pageIndexes }, getToken(),
    ).then(r => r ?? []),
  thumbUploadUrls: (versionId: string, pageIndexes: number[]) =>
    api.post<PlanUploadTicket[]>(
      `${base}/versions/${versionId}/thumb-uploads`, { pageIndexes }, getToken(),
    ).then(r => r ?? []),
  versionThumbs: (versionId: string) =>
    api.get<{ sheetId: string; url: string }[]>(
      `${base}/versions/${versionId}/thumbs`, getToken(),
    ).then(r => r ?? []),

  sheetUrl: (sheetId: string) =>
    api.get<{ url: string; whole: boolean; pageIndex: number }>(
      `${base}/sheets/${sheetId}/url`, getToken()),

  updateSheet: (sheetId: string, patch: Record<string, unknown>) =>
    api.patch(`${base}/sheets/${sheetId}`, patch, getToken()),

  listAnnotations: (sheetId: string) =>
    api.get<AtlasAnnotation[]>(`${base}/sheets/${sheetId}/annotations`, getToken()).then(r => r ?? []),
  createAnnotation: (sheetId: string, body: Partial<AtlasAnnotation>) =>
    api.post(`${base}/sheets/${sheetId}/annotations`, body, getToken()),
  updateAnnotation: (id: string, geometry: AtlasStrokeGeometry) =>
    api.patch(`${base}/annotations/${id}`, { geometry }, getToken()),
  deleteAnnotation: (annotationId: string) =>
    api.delete(`${base}/annotations/${annotationId}`, getToken()),

  listEvents: (jobsiteId: string, sheetId?: string) =>
    api.get<AtlasEvent[]>(
      `${base}/jobsites/${jobsiteId}/events${sheetId ? `?sheetId=${sheetId}` : ""}`,
      getToken(),
    ).then(r => r ?? []),
  createEvent: (jobsiteId: string, body: Partial<AtlasEvent>) =>
    api.post<{ id: string }>(`${base}/jobsites/${jobsiteId}/events`, body, getToken()),
  updateEvent: (eventId: string, patch: Record<string, unknown>) =>
    api.patch(`${base}/events/${eventId}`, patch, getToken()),
  listReplies: (eventId: string) =>
    api.get<AtlasReply[]>(`${base}/events/${eventId}/replies`, getToken()).then(r => r ?? []),
  createReply: (eventId: string, body: string) =>
    api.post(`${base}/events/${eventId}/replies`, { body }, getToken()),

  listDailyLogs: (jobsiteId: string, range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams()
    if (range?.from) qs.set("from", range.from)
    if (range?.to) qs.set("to", range.to)
    const suffix = qs.toString() ? `?${qs}` : ""
    return api.get<AtlasDailyLog[]>(
      `${base}/jobsites/${jobsiteId}/daily-logs${suffix}`, getToken(),
    ).then(r => r ?? [])
  },
  createDailyLog: (jobsiteId: string, body: Partial<AtlasDailyLog>) =>
    api.post<{ id: string }>(`${base}/jobsites/${jobsiteId}/daily-logs`, body, getToken()),
  updateDailyLog: (logId: string, patch: Record<string, unknown>) =>
    api.patch(`${base}/daily-logs/${logId}`, patch, getToken()),

  listAlbums: (jobsiteId: string) =>
    api.get<AtlasAlbum[]>(`${base}/jobsites/${jobsiteId}/albums`, getToken()).then(r => r ?? []),

  listMedia: (jobsiteId: string, filter?: { eventId?: string; dailyLogId?: string; album?: string }) => {
    const qs = new URLSearchParams()
    if (filter?.eventId) qs.set("eventId", filter.eventId)
    if (filter?.dailyLogId) qs.set("dailyLogId", filter.dailyLogId)
    if (filter?.album !== undefined) qs.set("album", filter.album)
    const suffix = qs.toString() ? `?${qs}` : ""
    return api.get<AtlasMedia[]>(`${base}/jobsites/${jobsiteId}/media${suffix}`, getToken())
      .then(r => r ?? [])
  },
  openMedia: (jobsiteId: string, body: {
    eventId?: string; dailyLogId?: string; kind: string
    fileName: string; contentType: string; byteSize: number; caption?: string
    album?: string; takenAt?: string
  }) => api.post<UploadTicket & { mediaId: string }>(
    `${base}/jobsites/${jobsiteId}/media`, body, getToken()),
  confirmMedia: (mediaId: string) =>
    api.post(`${base}/media/${mediaId}/confirm`, {}, getToken()),
}

/**
 * Sobe o arquivo direto no R2 pela URL assinada.
 *
 * O arquivo não passa pela API de propósito (AT-9): um set de plantas de 112 MB
 * atravessando o serviço Go seria banda e memória jogadas fora. Por isso este
 * `fetch` é o único do app que não usa o cliente `api` — ele fala com o bucket,
 * não com o backend, e mandar o header de Authorization aqui invalidaria a
 * assinatura.
 */
export async function uploadToR2(url: string, file: File, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: file,
  })
  if (!res.ok) {
    throw new Error(`upload falhou (${res.status})`)
  }
}
