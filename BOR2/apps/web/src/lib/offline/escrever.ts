import { getQueryClient } from "@/lib/query-client"
import type {
  AtlasAnnotation, AtlasEvent, AtlasMedia, AtlasPunchPoint,
} from "@/services/atlas.service"
import { useAuthStore } from "@/store/auth.store"
import { local } from "./db"
import { chaves, lerResposta } from "./dados-da-obra"
import {
  ajustarLista, falhaDeRede, guardarChamada, guardarEnvio,
  reenviarPendencias, vaiParaFila, type Chamada,
} from "./pendencias"

/**
 * As escritas do Atlas, com e sem sinal.
 *
 * Cada função recebe o que fazer direto e o que guardar. Com sinal e fila vazia,
 * vai direto. Sem sinal, ou se a rede cair no meio, guarda na fila e aplica o
 * resultado nas listas do aparelho, para a tela mostrar na hora o que a pessoa
 * acabou de fazer. Ver `pendencias.ts`.
 */

const base = "/api/v1/atlas"

function eu() {
  const u = useAuthStore.getState().user as { id?: string; name?: string; role?: string } | null
  return { id: u?.id ?? "", name: u?.name ?? "", role: String(u?.role ?? "") }
}

/** As consultas voltam a ler, e sem rede leem o que acabou de ser gravado. */
function tocar() {
  void getQueryClient().invalidateQueries({ queryKey: ["atlas"] })
}

async function escrever<T>(
  obraId: string, alvo: string, direto: () => Promise<T>, chamada: Chamada, rotulo: string,
  otimista: () => Promise<T>,
): Promise<T> {
  if (!(await vaiParaFila())) {
    try {
      return await direto()
    } catch (e) {
      if (!falhaDeRede(e)) throw e
    }
  }
  await guardarChamada(obraId, alvo, chamada, rotulo)
  const r = await otimista()
  tocar()
  void reenviarPendencias()
  return r
}

/** Se há algo desta obra esperando para subir: a tela lê do aparelho até esvaziar. */
export async function temPendencias(obraId: string): Promise<boolean> {
  try {
    return (await local.fila.where("obraId").equals(obraId)
      .filter(f => f.estado === "pendente" && (f.kind === "api.call" || f.kind === "api.upload"))
      .count()) > 0
  } catch {
    return false
  }
}

// ── Pontos ────────────────────────────────────────────────────────────────────

export async function criarPonto(
  obraId: string, body: Partial<AtlasEvent>, direto: (b: Partial<AtlasEvent>) => Promise<{ id: string }>,
): Promise<{ id: string }> {
  const id = body.id || crypto.randomUUID()
  const corpo = { ...body, id }
  return escrever(obraId, id, () => direto(corpo),
    { metodo: "POST", caminho: `${base}/jobsites/${obraId}/events`, corpo }, "point created",
    async () => {
      const quem = eu()
      const agora = new Date().toISOString()
      const plano = body.sheetId ? await local.planos.get(body.sheetId) : undefined
      const pasta = plano ? await local.pastas.get(plano.pastaId) : undefined
      await ajustarLista<AtlasEvent>(chaves.events(obraId), obraId, l => [...l, {
        id, jobsiteId: obraId, sheetId: body.sheetId ?? null, kind: body.kind ?? "issue",
        title: body.title ?? "", body: body.body ?? "", status: "open", number: null,
        pageX: body.pageX ?? null, pageY: body.pageY ?? null, region: null,
        createdBy: quem.id, createdAt: agora, resolvedBy: null, resolvedAt: null, media: 0,
        createdByName: quem.name, createdByRole: quem.role,
      } as unknown as AtlasEvent])
      // Na lista do punch o ponto herda o escopo de um vizinho da mesma pasta:
      // é a pasta que decide em que rodada ele cai.
      const pontos = (await lerResposta<AtlasPunchPoint[]>(chaves.punchPoints(obraId))) ?? []
      const vizinho = pontos.find(p => p.documentId === plano?.pastaId)
      await ajustarLista<AtlasPunchPoint>(chaves.punchPoints(obraId), obraId, l => [...l, {
        id, number: null, title: body.title ?? "", body: body.body ?? "", status: "open",
        punchId: vizinho?.punchId ?? "", sheetId: body.sheetId ?? "",
        sheetNumber: plano?.sheetNumber ?? "", pageIndex: plano?.pageIndex ?? 0,
        documentId: plano?.pastaId ?? "", document: vizinho?.document ?? pasta?.name ?? "",
        category: vizinho?.category ?? pasta?.category ?? "",
        subcategory: vizinho?.subcategory ?? pasta?.subcategory ?? "",
        scopeKind: vizinho?.scopeKind ?? "", scopeValue: vizinho?.scopeValue ?? "",
        pageX: body.pageX ?? null, pageY: body.pageY ?? null,
        photos: 0, videos: 0, after: 0,
        createdBy: quem.id, createdName: quem.name, createdRole: quem.role, createdAt: agora,
        resolvedAt: "", resolvedName: "", resolvedRole: "",
      } as AtlasPunchPoint])
      return { id }
    })
}

export async function mudarPonto(
  obraId: string, eventId: string, patch: Record<string, unknown>, direto: () => Promise<unknown>,
) {
  return escrever(obraId, eventId, direto,
    { metodo: "PATCH", caminho: `${base}/events/${eventId}`, corpo: patch }, "point changed",
    async () => {
      const quem = eu()
      const agora = new Date().toISOString()
      const resolvido = patch.status === "resolved"
      const reaberto = patch.status === "open"
      await ajustarLista<AtlasEvent>(chaves.events(obraId), obraId, l => l.map(e => e.id !== eventId ? e : {
        ...e, ...patch,
        ...(resolvido ? { resolvedAt: agora, resolvedBy: quem.id } : {}),
        ...(reaberto ? { resolvedAt: null, resolvedBy: null } : {}),
      } as AtlasEvent))
      await ajustarLista<AtlasPunchPoint>(chaves.punchPoints(obraId), obraId, l => l.map(p => p.id !== eventId ? p : {
        ...p, ...(patch as Partial<AtlasPunchPoint>),
        ...(resolvido ? { resolvedAt: agora, resolvedName: quem.name, resolvedRole: quem.role } : {}),
        ...(reaberto ? { resolvedAt: "", resolvedName: "", resolvedRole: "" } : {}),
      }))
      return null
    })
}

export async function apagarPonto(obraId: string, eventId: string, direto: () => Promise<unknown>) {
  return escrever(obraId, eventId, direto,
    { metodo: "DELETE", caminho: `${base}/events/${eventId}` }, "point deleted",
    async () => {
      await ajustarLista<AtlasEvent>(chaves.events(obraId), obraId, l => l.filter(e => e.id !== eventId))
      await ajustarLista<AtlasPunchPoint>(chaves.punchPoints(obraId), obraId, l => l.filter(p => p.id !== eventId))
      return null
    })
}

// ── Fotos e vídeos ────────────────────────────────────────────────────────────

export async function subirMidia(
  obraId: string,
  args: { file: File; eventId?: string; phase?: "before" | "after"; title?: string; description?: string },
  direto: () => Promise<unknown>,
): Promise<unknown> {
  const semFila = !(await vaiParaFila())
  if (semFila || !args.eventId) {
    try {
      return await direto()
    } catch (e) {
      if (!falhaDeRede(e) || !args.eventId) throw e
    }
  }
  const eventId = args.eventId!
  const idLocal = crypto.randomUUID()
  const contentType = args.file.type || "application/octet-stream"
  const fase = args.phase ?? "before"
  const ok = await guardarEnvio(obraId, {
    idLocal, eventId, fase, titulo: args.title ?? "", descricao: args.description ?? "",
    nome: args.file.name, contentType, bytes: args.file.size,
  }, args.file)
  if (!ok) throw new Error("No room on this device to keep the photo until there is signal.")
  const quem = eu()
  const agora = new Date().toISOString()
  const video = contentType.startsWith("video/")
  await ajustarLista<AtlasMedia>(chaves.media(obraId, eventId), obraId, l => [...l, {
    id: idLocal, eventId, dailyLogId: null, kind: video ? "video" : "photo",
    fileName: args.file.name, contentType, byteSize: args.file.size, caption: "",
    uploadedBy: quem.id, uploadedAt: agora, album: "", takenAt: agora,
    url: URL.createObjectURL(args.file), phase: fase,
    title: args.title ?? "", description: args.description ?? "", transcript: "",
    uploadedByName: quem.name, uploadedByRole: quem.role,
  } as AtlasMedia])
  await ajustarLista<AtlasPunchPoint>(chaves.punchPoints(obraId), obraId, l => l.map(p => p.id !== eventId ? p : {
    ...p,
    photos: p.photos + (video ? 0 : 1),
    videos: p.videos + (video ? 1 : 0),
    after: p.after + (fase === "after" ? 1 : 0),
  }))
  tocar()
  void reenviarPendencias()
  return { id: idLocal }
}

// ── Traços, marca-texto e vínculos ────────────────────────────────────────────

async function obraDaFolha(sheetId: string): Promise<string> {
  const doIndice = (await local.planos.get(sheetId).catch(() => undefined))?.obraId
  if (doIndice) return doIndice
  // Folha de obra que não foi mantida no aparelho: a obra é a da tela aberta,
  // que está no endereço. A fila precisa dela para agrupar o que sobe.
  const m = typeof location !== "undefined" ? location.pathname.match(/\/atlas\/([0-9a-f-]{36})/) : null
  return m?.[1] ?? ""
}

export async function criarMarca(
  sheetId: string, body: Partial<AtlasAnnotation>, direto: (b: Partial<AtlasAnnotation>) => Promise<unknown>,
) {
  const id = body.id || crypto.randomUUID()
  const corpo = { ...body, id }
  const obraId = await obraDaFolha(sheetId)
  if (!obraId) return direto(corpo)
  return escrever(obraId, id, () => direto(corpo),
    { metodo: "POST", caminho: `${base}/sheets/${sheetId}/annotations`, corpo }, "annotation created",
    async () => {
      const plano = await local.planos.get(sheetId)
      await local.marcas.put({
        id, planoId: sheetId, obraId, pastaId: plano?.pastaId ?? "",
        tool: body.tool ?? "pen", color: body.color ?? "#ef4444", width: body.width ?? 2,
        opacity: body.opacity ?? 1, shared: !!body.shared,
        geometry: (body.geometry ?? {}) as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
        destinoPlanoId: (body.geometry as { target?: { sheetId?: string } } | undefined)?.target?.sheetId ?? "",
      })
      return { id }
    })
}

export async function mudarMarca(sheetId: string, id: string, geometry: unknown, direto: () => Promise<unknown>) {
  const obraId = await obraDaFolha(sheetId)
  // Com sinal o traço guardado no aparelho também anda, senão sem rede ele
  // voltaria para onde estava.
  const diretoELocal = async () => {
    const r = await direto()
    await local.marcas.update(id, { geometry: geometry as Record<string, unknown> }).catch(() => 0)
    return r
  }
  if (!obraId) return diretoELocal()
  return escrever(obraId, id, diretoELocal,
    { metodo: "PATCH", caminho: `${base}/annotations/${id}`, corpo: { geometry } }, "annotation changed",
    async () => {
      await local.marcas.update(id, { geometry: geometry as Record<string, unknown> })
      return null
    })
}

export async function apagarMarca(sheetId: string, id: string, direto: () => Promise<unknown>) {
  const obraId = await obraDaFolha(sheetId)
  // Apagado com sinal sai também do aparelho: sem rede ele reapareceria.
  const diretoELocal = async () => {
    const r = await direto()
    await local.marcas.delete(id).catch(() => undefined)
    return r
  }
  if (!obraId) return diretoELocal()
  return escrever(obraId, id, diretoELocal,
    { metodo: "DELETE", caminho: `${base}/annotations/${id}` }, "annotation deleted",
    async () => {
      await local.marcas.delete(id)
      return null
    })
}

// ── O resto: escala e rodadas ─────────────────────────────────────────────────

/** Uma escrita sem efeito local além do que a tela já guarda por conta própria. */
export async function escreverSimples(
  obraId: string, alvo: string, chamada: Chamada, rotulo: string, direto: () => Promise<unknown>,
) {
  return escrever(obraId, alvo, direto, chamada, rotulo, async () => null)
}

export async function obraDoPlano(sheetId: string) {
  return obraDaFolha(sheetId)
}
