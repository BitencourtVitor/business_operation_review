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
  /** O que a versão vigente pesa, somando as pranchas. */
  bytes: number
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
  /** O apelido da versão. Quem a identifica é a data e a hora. */
  name: string
  notes: string
  uploadedBy: string
  uploadedAt: string
  publishedAt: string | null
  sheets: number
  /** O que foi anexado à justificativa desta versão. */
  attachments: { id: string; fileName: string; contentType: string; byteSize: number }[]
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
  /** Desde quando esta prancha é a que vale, e o nome dado à troca. */
  revisedAt: string
  versionName: string
  /** Quantas revisões a página já teve. Um é a original. */
  revisions: number
  /**
   * A impressão digital da página: o texto e a geometria do desenho. É o que
   * separa "outra prancha com o mesmo nome" de "a mesma prancha de novo", e o
   * que a conferência de envio cruza com o nome para decidir o que oferecer.
   */
  textHash: string
  geomHash: string
}

/** Uma prancha que já ocupou esta página, ou a que ocupa agora. */
export interface AtlasSheetRevision {
  id: string
  pageIndex: number
  sheetNumber: string
  name: string
  notes: string
  revisedBy: string
  /** O cargo de quem revisou: na tela vira o crachá ao lado do nome. */
  revisedRole: string
  revisedAt: string
  /** Vazio na que está valendo. */
  supersededAt: string
  r2Key: string
  thumbKey: string
  byteSize: number
  annotations: number
  /** O que foi anexado à justificativa desta revisão. */
  attachments: { id: string; fileName: string; contentType: string; byteSize: number }[]
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
  /**
   * Dois estados, e não três. "answered" existia e nascia sozinho quando alguém
   * comentava; num punch list isso mentia, porque comentar não é resolver.
   * Saiu do banco na migração 000154.
   */
  status: "open" | "resolved"
  /**
   * O número do ponto, contínuo por obra. É por ele que o ponto é chamado no
   * canteiro e citado no relatório impresso, e é o que a colisão de
   * sincronização protege: ponto que colide é invalidado, nunca renumerado.
   */
  number: number | null
  pageX: number | null
  pageY: number | null
  region: unknown
  createdBy: string
  createdAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  replies: number
  media: number
  /** Quem abriu, com o cargo: na lista o crachá vem antes do nome. */
  createdByName: string
  createdByRole: string
  /** Quem marcou como resolvido, com o cargo. */
  resolvedByName: string
  resolvedByRole: string
  /** De que obra é, para a task se ler fora da sala dela. */
  jobsiteName: string
  jobsiteUnit: string
  /**
   * A que documento pertence a folha marcada. O evento guarda a folha e o ponto
   * nela, mas não o documento, e é o documento que a rota da prancha exige.
   */
  documentId: string
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
  /**
   * Em que momento do ciclo do ponto a imagem entra: `before` é a foto do
   * problema, `after` é a prova da correção.
   *
   * Não se infere da hora do upload, porque a hora não sabe: uma foto anexada
   * dias depois pode ser a do problema, refeita porque a primeira saiu tremida.
   * Quem sabe é quem anexa. Ponto com foto do antes só fecha quando ganha uma
   * do depois, e a trava disso está no banco.
   */
  phase: "before" | "after"
  /**
   * O que esta peça mostra, escrito por quem anexou.
   *
   * A solução de um ponto tem mais de uma peça, e cada uma documenta uma coisa:
   * a viga refeita, a ferragem trocada, a medida conferida. Legenda de uma linha
   * não dá conta, e é o título que encabeça o container no relatório.
   */
  title: string
  description: string
  /** O texto da descrição falada, quando esta mídia é áudio. */
  transcript: string
  /** Quem anexou, com o cargo: a solução costuma ser de outra pessoa. */
  uploadedByName: string
  uploadedByRole: string
}

/**
 * Uma passagem de verificação: um punch de verdade, com data e fim.
 *
 * Percorrer o primeiro andar em março e de novo em junho são duas passagens, e
 * não um monte só. É o que permite dizer o que foi levantado em cada uma e
 * fechar a primeira sem apagar o histórico.
 */
export interface AtlasPunch {
  id: string
  jobsiteId: string
  /** `subcategory` é o pavimento ou a unidade; `category` é a pasta sem eixo. */
  scopeKind: "subcategory" | "category"
  scopeValue: string
  name: string
  notes: string
  openedAt: string
  openedBy: string
  openedName: string
  closedAt: string
  closedBy: string
  open: number
  resolved: number
  total: number
}

/** Um escopo da obra, com a passagem aberta nele, se houver. */
export interface AtlasPunchScope {
  kind: "subcategory" | "category"
  value: string
  /** floor ou unit, quando o escopo é uma subcategoria. Vazio na categoria. */
  axis: string
  documents: number
  sheets: number
  /** De quais categorias são as pastas deste escopo. */
  folders: string[]
  punchId: string
  openedAt: string
  /** Quem abriu a passagem, e o cargo, para o crachá ao lado do título. */
  openedName: string
  openedRole: string
  open: number
  resolved: number
  total: number
  /** Quantas passagens já foram fechadas neste escopo. */
  closed: number
}

/** Um ponto do punch list, como a lista e o relatório o leem. */
export interface AtlasPunchPoint {
  id: string
  number: number | null
  title: string
  body: string
  status: string
  punchId: string
  sheetId: string
  sheetNumber: string
  pageIndex: number
  documentId: string
  document: string
  category: string
  subcategory: string
  scopeKind: string
  scopeValue: string
  pageX: number | null
  pageY: number | null
  photos: number
  videos: number
  audios: number
  /** Quantas peças documentam a solução. Zero é ponto sem prova do depois. */
  after: number
  comments: number
  createdName: string
  /** O cargo de quem levantou: na tela vira o crachá ao lado do nome. */
  createdRole: string
  createdAt: string
  resolvedAt: string
}

/** Uma peça de mídia de um ponto, já com endereço assinado. */
export interface AtlasPunchMedia {
  id: string
  eventId: string
  contentType: string
  phase: "before" | "after"
  title: string
  description: string
  caption: string
  transcript: string
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

  // Trocar uma prancha sem refazer o set: assina onde a nova vai, e só depois
  // que ela está no bucket é que ela passa a valer.
  openSheetRevision: (sheetId: string) =>
    api.post<{
      sheetId: string; r2Key: string; uploadUrl: string
      thumbKey: string; thumbUploadUrl: string
    }>(`${base}/sheets/${sheetId}/revisions`, {}, getToken()),
  commitSheetRevision: (sheetId: string, body: {
    sheetId: string; r2Key: string; thumbKey?: string; byteSize: number
    widthPt?: number; heightPt?: number; name?: string; notes?: string
  }) => api.put<{ sheetId: string }>(`${base}/sheets/${sheetId}/revisions`, body, getToken()),
  sheetHistory: (sheetId: string) =>
    api.get<AtlasSheetRevision[]>(`${base}/sheets/${sheetId}/history`, getToken())
      .then(r => r ?? []),

  listVersions: (documentId: string) =>
    api.get<AtlasVersion[]>(`${base}/documents/${documentId}/versions`, getToken()).then(r => r ?? []),
  openVersion: (documentId: string, body: {
    revision: string; fileName: string; contentType: string; byteSize: number
    name?: string; notes?: string
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

  /** Todas as folhas de uma versão de uma vez, para baixar a pasta sem 97 idas. */
  versionSheetUrls: (versionId: string) =>
    api.get<{ sheetId: string; url: string; whole: boolean; pageIndex: number }[]>(
      `${base}/versions/${versionId}/urls`, getToken(),
    ).then(r => r ?? []),

  sheetUrl: (sheetId: string) =>
    api.get<{ url: string; whole: boolean; pageIndex: number }>(
      `${base}/sheets/${sheetId}/url`, getToken()),

  updateSheet: (sheetId: string, patch: Record<string, unknown>) =>
    api.patch(`${base}/sheets/${sheetId}`, patch, getToken()),

  listAnnotations: (sheetId: string) =>
    api.get<AtlasAnnotation[]>(`${base}/sheets/${sheetId}/annotations`, getToken()).then(r => r ?? []),
  /** As marcações de todas as folhas de uma versão, para guardar sem rede. */
  versionAnnotations: (versionId: string) =>
    api.get<AtlasAnnotation[]>(`${base}/versions/${versionId}/annotations`, getToken())
      .then(r => r ?? []),
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
  // Apagar o note apaga a task: são a mesma linha, vista da prancha e da lista.
  deleteEvent: (eventId: string) =>
    api.delete(`${base}/events/${eventId}`, getToken()),
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
    eventId?: string; dailyLogId?: string
    /** A revisão que este arquivo justifica: a folha trocada, ou o set inteiro. */
    sheetId?: string; versionId?: string
    kind: string
    fileName: string; contentType: string; byteSize: number; caption?: string
    album?: string; takenAt?: string
    /** `before` (padrão) é a foto do problema; `after` é a prova da correção. */
    phase?: "before" | "after"
  }) => api.post<UploadTicket & { mediaId: string }>(
    `${base}/jobsites/${jobsiteId}/media`, body, getToken()),
  confirmMedia: (mediaId: string) =>
    api.post(`${base}/media/${mediaId}/confirm`, {}, getToken()),
  mediaUrl: (mediaId: string) =>
    api.get<{ url: string }>(`${base}/media/${mediaId}/url`, getToken()),

  // ── Offline ───────────────────────────────────────────────────────────────

  /**
   * Sobe a fila de campo num lote só.
   *
   * Um lote e não um por um porque a ordem importa e o servidor precisa vê-la
   * junta: em separado, o comentário pode chegar antes do ponto que ele comenta
   * num aparelho com mais de uma conexão, e o servidor recusaria um fato válido.
   */
  sync: (events: Array<{
    id: string; jobsiteId: string; kind: string; targetId: string
    payload: Record<string, unknown>
    deviceId: string; deviceSeq: number
    occurredAt: string; occurredOffsetMinutes: number
  }>) => api.post<Array<{ id: string; status: string; reason?: string; blockedBy?: string }>>(
    `${base}/sync`, { events }, getToken()),

  syncQueue: () => api.get<{
    items: Array<{ id: string; jobsiteId: string; jobsiteName: string; kind: string
      targetId: string; status: string; reason?: string; blockedBy?: string; occurredAt: string }>
    byJobsite: Record<string, Record<string, number>>
    total: number
  }>(`${base}/sync/queue`, getToken()),

  /** As pastas que este usuário mantém no aparelho, com a revisão dos dois lados. */
  offlineFolders: () => api.get<Array<{
    jobsiteId: string; jobsiteName: string
    documentId: string; documentName: string
    localRevision: number; serverRevision: number; stale: boolean
    selectedAt: string; lastAccessAt: string
  }>>(`${base}/offline/folders`, getToken()),

  /**
   * Marca a pasta como mantida offline, ou carimba o acesso.
   *
   * O mesmo verbo serve para as duas coisas de propósito: são a mesma afirmação,
   * "este aparelho tem esta pasta neste estado". `touch` sozinho é o que o app
   * manda ao abrir a pasta, para o relógio da expiração andar mesmo sem download.
   */
  setOfflineFolder: (documentId: string, body: { localRevision?: number; touch?: boolean }) =>
    api.put(`${base}/offline/folders/${documentId}`, body, getToken()),

  unsetOfflineFolder: (documentId: string) =>
    api.delete(`${base}/offline/folders/${documentId}`, getToken()),

  policy: () => api.get<Record<string, unknown>>(`${base}/policy`, getToken()),

  /**
   * Cria os vínculos automáticos de uma versão.
   *
   * O cliente manda todo o texto com posição; quem decide o que é referência é o
   * índice de títulos, que mora no servidor. Sem `apply`, devolve o que faria.
   */
  autolink: (versionId: string, body: {
    pages: Array<{ sheetId: string; tokens: unknown[]; noText: boolean }>
    minRefs?: number
    apply?: boolean
  }) => api.post<{
    dryRun: boolean
    destinos: number
    links: number
    forma: Record<string, number>
    paginas: Array<{ sheetId: string; refs: number; shape: string; spread: number; linked: number }>
  }>(`${base}/versions/${versionId}/autolink`, body, getToken()),

  /** Um vínculo proposto pela varredura, ainda sem nada gravado. */
  // (o tipo vive aqui porque a etapa de envio e a página do documento usam o mesmo)

  /**
   * Sugere os vínculos de um arquivo que ainda não subiu.
   *
   * O índice de destinos é a obra inteira, e não só o documento: o código citado
   * no desenho pode ser folha de outra pasta. As folhas que estão subindo entram
   * pelo número da página, porque ainda não têm identificador.
   */
  autolinkPreview: (jobsiteId: string, body: {
    local: Array<{ pageIndex: number; name: string }>
    pages: Array<{ pageIndex: number; tokens: unknown[]; noText: boolean }>
    minRefs?: number
    /** Procurar destino também nas outras pastas da obra. */
    otherFolders?: boolean
  }) => api.post<{
    destinos: number
    links: number
    paginas: AtlasAutolinkPage[]
  }>(`${base}/jobsites/${jobsiteId}/autolink/preview`, body, getToken()),

  /** Grava os vínculos confirmados, depois de as folhas existirem. */
  autolinkApply: (versionId: string, body: {
    links: Array<{
      pageIndex: number
      x0: number; y0: number; x1: number; y1: number
      text: string
      targetSheetId: string
      targetPageIndex: number
      targetName: string
    }>
  }) => api.post<{ links: number }>(
    `${base}/versions/${versionId}/autolink/apply`, body, getToken()),

  /** Herda as folhas não trocadas de uma revisão parcial. */
  inheritSheets: (versionId: string, body: { scope: "range" | "single"; pages: number[] }) =>
    api.post<{ herdadas: number; trocadas: number; total: number }>(
      `${base}/versions/${versionId}/inherit`, body, getToken()),

  versionDiff: (versionId: string) => api.get<{
    scope: string; scopePages: number[]; novas: number; herdadas: number; total: number
  }>(`${base}/versions/${versionId}/diff`, getToken()),

  /** Os pontos do punch list, por passagem, por escopo, ou a obra inteira. */
  punchList: (jobsiteId: string, params?: PunchFiltro) =>
    api.get<AtlasPunchPoint[]>(
      `${base}/jobsites/${jobsiteId}/punch-list${queryDoPunch(params)}`, getToken(),
    ).then(r => r ?? []),

  /** Toda a mídia dos pontos de um escopo, de uma vez. É o que o relatório lê. */
  punchMedia: (jobsiteId: string, params?: PunchFiltro) =>
    api.get<AtlasPunchMedia[]>(
      `${base}/jobsites/${jobsiteId}/punch-list/media${queryDoPunch(params)}`, getToken(),
    ).then(r => r ?? []),

  punchSummary: (jobsiteId: string) => api.get<{
    bySubcategory: Array<{
      scopeKind: string; scopeValue: string
      subcategory: string; category: string
      open: number; resolved: number; total: number
    }>
    jobsite: { open: number; resolved: number; total: number }
  }>(`${base}/jobsites/${jobsiteId}/punch-list/summary`, getToken()),

  /** Os escopos da obra, com a passagem aberta de cada um. */
  punchScopes: (jobsiteId: string) =>
    api.get<AtlasPunchScope[]>(`${base}/jobsites/${jobsiteId}/punch-list/scopes`, getToken())
      .then(r => r ?? []),

  punches: (jobsiteId: string, params?: { scope?: string; open?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.scope) q.set("scope", params.scope)
    if (params?.open) q.set("open", "1")
    const qs = q.toString()
    return api.get<AtlasPunch[]>(
      `${base}/jobsites/${jobsiteId}/punches${qs ? `?${qs}` : ""}`, getToken(),
    ).then(r => r ?? [])
  },
  openPunch: (jobsiteId: string, body: {
    scopeKind: "subcategory" | "category"; scopeValue: string; name?: string; notes?: string
  }) => api.post<AtlasPunch>(`${base}/jobsites/${jobsiteId}/punches`, body, getToken()),
  closePunch: (punchId: string) =>
    api.post<AtlasPunch>(`${base}/punches/${punchId}/close`, {}, getToken()),
  reopenPunch: (punchId: string) =>
    api.post<AtlasPunch>(`${base}/punches/${punchId}/reopen`, {}, getToken()),

  // ── A descrição falada ────────────────────────────────────────────────────

  /** Transcreve o áudio guardado. Devolve vazio quando não havia fala. */
  transcribeMedia: (mediaId: string) =>
    api.post<{ transcript: string }>(`${base}/media/${mediaId}/transcribe`, {}, getToken()),

  /**
   * Lê a transcrição e devolve tópicos curtos.
   *
   * Aceita um texto corrigido à mão: quem ouviu o áudio sabe mais que o modelo,
   * e a correção vira a base da leitura em vez de ser descartada.
   */
  mediaTopics: (mediaId: string, transcript?: string) =>
    api.post<{ transcript: string; topics: string }>(
      `${base}/media/${mediaId}/topics`, { transcript: transcript ?? "" }, getToken()),

  updateMedia: (mediaId: string, patch: {
    title?: string; description?: string; caption?: string
    transcript?: string; phase?: "before" | "after"; eventId?: string
  }) => api.patch(`${base}/media/${mediaId}`, patch, getToken()),
}

/** Os três jeitos de recortar o punch list, e o que eles têm em comum. */
export interface PunchFiltro {
  /** Uma passagem específica. É o filtro mais preciso: identidade, não texto. */
  punch?: string
  /** Um escopo, pegando a passagem aberta e as fechadas dele. */
  scope?: string
  status?: "open" | "resolved"
}

function queryDoPunch(params?: PunchFiltro): string {
  const q = new URLSearchParams()
  if (params?.punch) q.set("punch", params.punch)
  if (params?.scope) q.set("scope", params.scope)
  if (params?.status) q.set("status", params.status)
  const qs = q.toString()
  return qs ? `?${qs}` : ""
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
export async function uploadToR2(
  url: string, file: Blob, contentType: string,
  /** Quanto já foi pelo fio, em bytes. Um set de 100 MB leva minutos. */
  andamento?: (enviado: number, total: number) => void,
): Promise<void> {
  // XHR e não fetch só por isto: o fetch não conta o que já subiu, e sem essa
  // conta a tela fica parada durante o envio inteiro, sem jeito de saber se
  // está andando ou travou.
  if (!andamento || typeof XMLHttpRequest === "undefined") {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType || "application/octet-stream" },
      body: file,
    })
    if (!res.ok) throw new Error(`upload falhou (${res.status})`)
    return
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream")
    xhr.upload.onprogress = e => andamento(e.loaded, e.lengthComputable ? e.total : file.size)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`upload falhou (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("upload falhou"))
    xhr.send(file)
  })
}

/** Um vínculo proposto pela varredura automática, ainda sem nada gravado. */
export interface AtlasAutolinkSuggestion {
  /** O texto lido na prancha, como está escrito lá. */
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** Vazio quando o destino é folha do próprio arquivo que está subindo. */
  sheetId: string
  pageIndex: number
  sheetName: string
  documentId: string
  documentName: string
  category: string
  /** O destino mora em outra pasta da obra. */
  otherFolder: boolean
}

/** O que a varredura achou numa página. */
export interface AtlasAutolinkPage {
  pageIndex: number
  refs: number
  /** `referencing` cita outras, `terminal` não cita, `index` cita quase todas, `no-text` é rasterizada. */
  shape: string
  spread: number
  links: AtlasAutolinkSuggestion[]
}
