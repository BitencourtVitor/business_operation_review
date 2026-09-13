import { api } from "@/lib/api"
import { getQueryClient } from "@/lib/query-client"
import { atlasService, uploadToR2 } from "@/services/atlas.service"
import { useAuthStore } from "@/store/auth.store"
import { local, proximaSeq, type EventoFila } from "./db"
import { chaves, guardarResposta, lerResposta } from "./dados-da-obra"
import { apagarArquivo, gravarArquivo, lerArquivo } from "./storage"

/**
 * O que se faz sem sinal, guardado para subir depois.
 *
 * Toda escrita do Atlas passa a ter dois caminhos que terminam no mesmo lugar.
 * Com sinal e fila vazia, a chamada vai direto, como sempre foi. Sem sinal, ou
 * com algo ainda esperando na fila, a chamada entra na fila do aparelho e a tela
 * recebe o resultado na hora, gravado nas mesmas respostas que ela lê sem rede.
 * Quando o sinal volta, a fila refaz as chamadas na ordem em que aconteceram,
 * pelas mesmas rotas de sempre.
 *
 * Refazer a chamada, e não traduzir para um evento próprio, é o que faz caber
 * tudo: ponto, condição, foto, vídeo, descrição, traço, vínculo, escala e rodada.
 * Cada rota já sabe validar e já sabe quem pode o quê, e nada disso precisa ser
 * reescrito para o caminho sem rede.
 *
 * O id de cada coisa criada nasce no aparelho. É o que torna o reenvio seguro:
 * o sinal cai depois de o servidor gravar e antes de a resposta chegar, a fila
 * manda de novo, e o servidor reconhece em vez de duplicar.
 */

export type Chamada = {
  metodo: "POST" | "PUT" | "PATCH" | "DELETE"
  caminho: string
  corpo?: unknown
}

export type Envio = {
  /** O id provisório da peça, que a tela usa até o servidor dar o definitivo. */
  idLocal: string
  eventId: string
  fase: "before" | "after"
  titulo: string
  descricao: string
  nome: string
  contentType: string
  bytes: number
}

function fusoAgora() {
  return -new Date().getTimezoneOffset()
}

/** Se a próxima escrita precisa ir para a fila. */
export async function vaiParaFila(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  try {
    const n = await local.fila.where("estado").anyOf("pendente", "enviando").count()
    // Com algo esperando, o novo entra atrás: mandar direto passaria na frente
    // de uma foto do ponto que ainda nem existe no servidor.
    return n > 0
  } catch {
    return false
  }
}

/** Erro de rede, e não resposta do servidor. */
export function falhaDeRede(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /failed to fetch|network|load failed/i.test(e.message))
}

async function entrar(obraId: string, kind: EventoFila["kind"], targetId: string,
  payload: Record<string, unknown>, arquivoLocal: string | null = null) {
  await local.fila.add({
    id: crypto.randomUUID(), obraId, kind, targetId, payload,
    deviceSeq: await proximaSeq(),
    occurredAt: new Date().toISOString(),
    occurredOffsetMinutes: fusoAgora(),
    estado: "pendente", motivo: "", bloqueadoPor: null,
    tentativas: 0, arquivoLocal,
  })
}

/** Guarda uma chamada para refazer com sinal. */
export async function guardarChamada(obraId: string, alvo: string, chamada: Chamada, rotulo: string) {
  await entrar(obraId, "api.call", alvo, { ...chamada, rotulo })
}

/**
 * Guarda uma foto ou vídeo para subir com sinal.
 *
 * O arquivo vai para o OPFS e fica registrado como mídia da obra com o id
 * provisório: a tela abre a foto do aparelho desde já, e depois de subir o
 * registro passa a apontar para o id que o servidor deu.
 */
export async function guardarEnvio(obraId: string, envio: Envio, arquivo: Blob): Promise<boolean> {
  const ext = envio.nome.includes(".") ? envio.nome.split(".").pop() : envio.contentType.split("/")[1] || "bin"
  const caminho = await gravarArquivo(obraId, `m-${envio.idLocal}.${ext}`, arquivo)
  if (!caminho) return false
  await local.midias.put({ id: envio.idLocal, obraId, arquivo: caminho, contentType: envio.contentType })
  await entrar(obraId, "api.upload", envio.eventId, envio as unknown as Record<string, unknown>, caminho)
  return true
}

/** Descrever uma peça que ainda não subiu muda o que vai subir com ela. */
export async function descreverEnvioPendente(idLocal: string, titulo: string, descricao: string): Promise<boolean> {
  const item = await local.fila.filter(f => f.kind === "api.upload" && f.payload.idLocal === idLocal).first()
  if (!item) return false
  await local.fila.update(item.id, { payload: { ...item.payload, titulo, descricao } })
  return true
}

/** Mexe numa lista guardada, que é o que a tela lê sem rede. */
export async function ajustarLista<T>(chave: string, obraId: string, fn: (lista: T[]) => T[]) {
  const antes = (await lerResposta<T[]>(chave)) ?? []
  await guardarResposta(chave, obraId, fn(antes))
}

export { chaves }

let rodando = false

/**
 * Refaz na ordem o que ficou guardado.
 *
 * Para na primeira falha de rede, para não passar uma ação na frente de outra.
 * Resposta de recusa do servidor (permissão, ponto apagado por outra pessoa)
 * marca aquela ação como recusada, com o motivo, e prende as que dependem do
 * mesmo alvo, para a pessoa ver um problema e não quatro.
 */
export async function reenviarPendencias(): Promise<{ enviados: number; recusados: number }> {
  if (rodando || (typeof navigator !== "undefined" && !navigator.onLine)) return { enviados: 0, recusados: 0 }
  rodando = true
  let enviados = 0
  let recusados = 0
  // Id provisório da peça -> id que o servidor deu.
  const trocas = new Map<string, string>()
  const presos = new Set<string>()
  try {
    const itens = (await local.fila.where("estado").equals("pendente").sortBy("deviceSeq"))
      .filter(f => f.kind === "api.call" || f.kind === "api.upload")
    for (const item of itens) {
      if (presos.has(item.targetId)) {
        await local.fila.update(item.id, { estado: "bloqueado", motivo: "waiting on an earlier change that was refused" })
        continue
      }
      try {
        if (item.kind === "api.upload") {
          const e = item.payload as unknown as Envio & { mediaId?: string }
          const arquivo = item.arquivoLocal ? await lerArquivo(item.arquivoLocal) : null
          if (!arquivo) throw Object.assign(new Error("the file is no longer on this device"), { recusa: true })
          let mediaId = e.mediaId
          if (!mediaId) {
            const kind = e.contentType.startsWith("video/") ? "video" : "photo"
            const t = await atlasService.openMedia(item.obraId, {
              eventId: e.eventId, kind, fileName: e.nome, contentType: e.contentType,
              byteSize: e.bytes, phase: e.fase, title: e.titulo, description: e.descricao,
              takenAt: item.occurredAt,
            })
            await uploadToR2(t.uploadUrl, arquivo, e.contentType)
            mediaId = t.mediaId
            await local.fila.update(item.id, { payload: { ...item.payload, mediaId } })
          }
          await atlasService.confirmMedia(mediaId)
          trocas.set(e.idLocal, mediaId)
          // O arquivo continua no aparelho, agora com o id do servidor: é a
          // mesma foto, e baixá-la de novo seria gastar banda à toa.
          const m = await local.midias.get(e.idLocal)
          if (m) {
            await local.midias.put({ ...m, id: mediaId })
            await local.midias.delete(e.idLocal)
          }
        } else {
          const c = item.payload as unknown as Chamada
          let caminho = c.caminho
          for (const [de, para] of trocas) caminho = caminho.split(de).join(para)
          const corpo = c.corpo ?? {}
          try {
            if (c.metodo === "POST") await api.post(caminho, corpo, token())
            else if (c.metodo === "PUT") await api.put(caminho, corpo, token())
            else if (c.metodo === "PATCH") await api.patch(caminho, corpo, token())
            else await api.delete(caminho, token())
          } catch (erro) {
            // Apagar o que já não existe é apagar: outra pessoa chegou antes.
            const status = (erro as { statusCode?: number }).statusCode
            if (!(c.metodo === "DELETE" && status === 404)) throw erro
          }
        }
        await local.fila.delete(item.id)
        enviados++
      } catch (erro) {
        if (falhaDeRede(erro)) {
          await local.fila.update(item.id, { tentativas: item.tentativas + 1 })
          break
        }
        const motivo = erro instanceof Error ? erro.message : "the server refused this change"
        await local.fila.update(item.id, { estado: "recusado", motivo })
        presos.add(item.targetId)
        recusados++
      }
    }
  } finally {
    rodando = false
    if (enviados || recusados) {
      // A fila esvaziou em parte: as telas voltam a ler do servidor, que agora
      // tem o que estava só no aparelho.
      void getQueryClient().invalidateQueries({ queryKey: ["atlas"] })
    }
  }
  return { enviados, recusados }
}

function token() {
  return useAuthStore.getState().token ?? ""
}

/** Tira do aparelho o arquivo de uma pendência recusada que a pessoa descartou. */
export async function descartarPendencia(id: string) {
  const item = await local.fila.get(id)
  if (item?.arquivoLocal) await apagarArquivo(item.arquivoLocal)
  await local.fila.delete(id)
}
